// Perfumolandia para Windows (Electron).
// Carrega o app web embutido (pasta dist) via protocolo seguro app://, sem servidor local.
const { app, BrowserWindow, session, desktopCapturer, ipcMain, protocol, net, Tray, Menu, nativeImage, shell, Notification } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { checkBeforeStart, backgroundChecks } = require('./updater.js');
const { watchGames } = require('./games.js');

const DEV_URL = process.env.PERFUMO_DEV_URL; // ex.: http://localhost:5173 durante o desenvolvimento
const PROFILE = process.env.PERFUMO_PROFILE; // permite abrir 2 contas no mesmo PC (testes)

if (PROFILE) app.setPath('userData', path.join(app.getPath('appData'), 'Perfumolandia-' + PROFILE));
if (process.env.PERFUMO_FAKE_MEDIA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}
// sons (toque de chamada) tocam sem precisar clicar antes
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// chamada não pode engasgar quando a janela está minimizada ou atrás do jogo
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!PROFILE && !app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('com.perfumolandia.app');

let win = null;
let tray = null;
let quitting = false;
let pendingSource = null;
let currentGame = null;
const ICON = path.join(__dirname, 'icon.png');

function createWindow({ startHidden = false, onShown } = {}) {
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 940, minHeight: 600,
    backgroundColor: '#07070c',
    title: 'Perfumolandia',
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#d9d8ea', height: 34 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
      spellcheck: true,
    },
  });
  // PERFUMO_HIDDEN: testes automáticos abrem fora da área visível, sem foco e sem barra de tarefas
  if (process.env.PERFUMO_HIDDEN) {
    win.setSkipTaskbar(true);
    win.setPosition(-5000, 0);
    win.once('ready-to-show', () => win.showInactive());
  } else if (!startHidden) win.once('ready-to-show', () => { win.show(); onShown?.(); });
  else win.once('ready-to-show', () => onShown?.());
  win.loadURL(DEV_URL ? DEV_URL + '/app/' : 'app://perfumolandia/app/index.html');

  // links externos abrem no navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(DEV_URL && url.startsWith(DEV_URL))) { e.preventDefault(); shell.openExternal(url); }
  });
  // fechar = esconder na bandeja (a chamada continua)
  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Perfumolandia');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Perfumolandia', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { win.isVisible() && win.isFocused() ? win.hide() : (win.show(), win.focus()); });
}

// links perfumolandia://convite/CODIGO (botão "Abrir no app do PC" da página de convite)
let pendingInvite = null;
const inviteFrom = (argv) => { const a = (argv || []).find((x) => /^perfumolandia:\/\//i.test(x)); return a ? /convite\/([A-Za-z0-9]{4,12})/i.exec(a)?.[1] || null : null; };
function deliverInvite(code) {
  if (!code) return;
  if (win && !win.webContents.isLoading()) win.webContents.send('invite', code);
  else pendingInvite = code;
}
pendingInvite = inviteFrom(process.argv);
if (app.isPackaged && !PROFILE) app.setAsDefaultProtocolClient('perfumolandia');
ipcMain.handle('invite:get', () => { const c = pendingInvite; pendingInvite = null; return c; });

app.on('second-instance', (e, argv) => {
  if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
  deliverInvite(inviteFrom(argv));
});
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  // serve os arquivos do app web
  const root = path.join(__dirname, 'dist');
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    let file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return new Response('proibido', { status: 403 });
    if (!path.extname(file)) file = path.join(root, pathname.startsWith('/app') ? 'app/index.html' : 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });

  const ses = session.defaultSession;
  const ALLOWED = new Set(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'pointerLock']);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(ALLOWED.has(perm)));
  ses.setPermissionCheckHandler((wc, perm) => ALLOWED.has(perm));

  // compartilhamento de tela: o app mostra o seletor bonito e avisa qual fonte usar
  ses.setDisplayMediaRequestHandler(async (req, cb) => {
    // com o som nativo (audiocap.exe) o app pede só o vídeo aqui
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const src = sources.find((s) => s.id === pendingSource?.id) || sources.find((s) => s.id.startsWith('screen')) || sources[0];
      const wantAudio = req.audioRequested !== false && (pendingSource ? pendingSource.audio : true);
      cb({ video: src, ...(wantAudio && process.platform === 'win32' ? { audio: 'loopback' } : {}) });
    } catch {
      cb({});
    } finally {
      pendingSource = null;
    }
  });

  ipcMain.handle('screen:sources', async () => {
    const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 384, height: 216 }, fetchWindowIcons: true });
    return list
      .filter((s) => !/^Perfumolandia$/.test(s.name))
      .map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null }));
  });
  ipcMain.handle('screen:select', (e, id, audio) => { pendingSource = { id, audio: !!audio }; });
  // chamada recebendo: pisca na barra de tarefas e mostra a janela se estiver escondida na bandeja
  ipcMain.on('attention', () => {
    if (!win) return;
    if (!win.isVisible()) win.showInactive();
    if (!win.isFocused()) win.flashFrame(true);
  });
  ipcMain.on('notify', (e, n) => {
    if (!Notification.isSupported()) return;
    const x = new Notification({ title: n.title, body: n.body, icon: ICON, silent: true });
    x.on('click', () => { win.show(); win.focus(); });
    x.show();
  });

  setupAutostart();
  // ao abrir: procura atualização antes (iniciando com o Windows, procura em silêncio)
  const autostarted = process.argv.includes('--autostart');
  checkBeforeStart({ icon: ICON, silent: autostarted || !!process.env.PERFUMO_HIDDEN }).then(({ result, splash }) => {
    if (result === 'installing') { quitting = true; return; }
    createWindow({ startHidden: autostarted, onShown: () => splash?.destroy() });
    if (autostarted) splash?.destroy();
    if (!process.env.PERFUMO_HIDDEN) createTray();
    setupGlobalPtt();
    backgroundChecks();
    // status "Jogando ...": manda o jogo aberto para o app web
    watchGames(app, (g) => { currentGame = g; win?.webContents.send('game', g); });
  });
});

// ---------- iniciar com o Windows (ligado por padrão na primeira vez) ----------
function setupAutostart() {
  if (!app.isPackaged || process.env.PERFUMO_HIDDEN) return;
  const flag = path.join(app.getPath('userData'), 'autostart-configurado');
  if (!fs.existsSync(flag)) {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--autostart'] });
    fs.writeFileSync(flag, '1');
  }
}
ipcMain.handle('autostart:get', () => (app.isPackaged ? app.getLoginItemSettings({ args: ['--autostart'] }).openAtLogin : false));
ipcMain.handle('autostart:set', (e, on) => {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!on, args: ['--autostart'] });
  return !!on;
});
ipcMain.handle('app:version', () => app.getVersion());

// ---------- som do PC na transmissão SEM as vozes da chamada ----------
// audiocap.exe usa o loopback por processo do Windows: na tela inteira pega tudo menos o Perfumolandia;
// numa janela pega só o som do programa dela (como o Discord).
let sysCap = null;
function stopSysAudio() {
  if (!sysCap) return;
  try { sysCap.stdin.end(); } catch {}
  const p = sysCap; sysCap = null;
  setTimeout(() => { try { p.kill(); } catch {} }, 1500);
}
ipcMain.handle('sysaudio:start', (e, sourceId) => {
  stopSysAudio();
  if (process.platform !== 'win32') return false;
  const exe = app.isPackaged ? path.join(process.resourcesPath, 'audiocap.exe') : path.join(__dirname, 'audiocap.exe');
  if (!fs.existsSync(exe)) return false;
  const hwnd = /^window:(\d+):/.exec(sourceId || '')?.[1];
  const args = hwnd ? ['w' + hwnd, 'include'] : [String(process.pid)];
  return new Promise((resolve) => {
    const p = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    sysCap = p;
    let rest = null, started = false;
    p.stdout.on('data', (chunk) => {
      if (!started) { started = true; resolve(true); }
      // manda só quadros inteiros (4 bytes: 2 canais × 16 bits)
      if (rest) { chunk = Buffer.concat([rest, chunk]); rest = null; }
      const cut = chunk.length - (chunk.length % 4);
      if (cut < chunk.length) rest = chunk.subarray(cut);
      if (cut && sysCap === p) e.sender.send('sysaudio', chunk.subarray(0, cut));
    });
    p.stderr.on('data', (d) => console.warn('audiocap:', String(d).trim()));
    p.on('error', () => resolve(false));
    p.on('exit', () => { if (!started) resolve(false); if (sysCap === p) sysCap = null; });
    setTimeout(() => { if (!started) { resolve(false); stopSysAudio(); } }, 4000);
  });
});
ipcMain.handle('sysaudio:stop', () => stopSysAudio());
app.on('will-quit', stopSysAudio);
ipcMain.handle('game:get', () => currentGame);

app.on('window-all-closed', () => {});

// ---------- aperte-para-falar global (funciona com o jogo em foco) ----------
let pttKeycode = null;
function setupGlobalPtt() {
  let hook;
  try { ({ uIOhook: hook } = require('uiohook-napi')); } catch { return; }
  const { codeToUiohook } = require('./keymap.js');
  let down = false;
  hook.on('keydown', (e) => {
    if (pttKeycode != null && e.keycode === pttKeycode && !down) { down = true; win?.webContents.send('ptt', true); }
  });
  hook.on('keyup', (e) => {
    if (pttKeycode != null && e.keycode === pttKeycode && down) { down = false; win?.webContents.send('ptt', false); }
  });
  ipcMain.on('ptt:key', (e, code) => { pttKeycode = codeToUiohook(code); });
  try { hook.start(); } catch {}
  app.on('will-quit', () => { try { hook.stop(); } catch {} });
}
