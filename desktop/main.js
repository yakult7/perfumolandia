// Perfumolandia para Windows (Electron).
// Carrega o app web embutido (pasta dist) via protocolo seguro app://, sem servidor local.
const { app, BrowserWindow, session, desktopCapturer, ipcMain, protocol, net, Tray, Menu, nativeImage, shell, Notification, screen, globalShortcut } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { checkBeforeStart, backgroundChecks, updateReady, installNow } = require('./updater.js');
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
// (sem 'disable-backgrounding-occluded-windows': coberta pelo jogo ou minimizada, a janela para de ser desenhada; a chamada continua)

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
let currentMusic = null;
// .ico com todos os tamanhos (16→256): nítido na barra de tarefas, bandeja e Alt+Tab
const ICON = path.join(__dirname, process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'icon.ico')) ? 'icon.ico' : 'icon.png');

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
  tray = new Tray(ICON.endsWith('.ico') ? ICON : nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
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
    backgroundChecks((v) => win?.webContents.send('update-ready', v));
    // status "Jogando ...": manda o jogo aberto para o app web
    watchGames(app, (g) => { currentGame = g; win?.webContents.send('game', g); }, (m) => { currentMusic = m; win?.webContents.send('music', m); });
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
ipcMain.handle('update:get', () => updateReady());
ipcMain.handle('update:install', () => { quitting = true; installNow(); });
// PC sem aceleração de vídeo (o Windows desenha tudo na CPU): o app liga o modo leve sozinho
ipcMain.handle('gpu:status', () => { try { return app.getGPUFeatureStatus(); } catch { return null; } });
// painel "Uso agora" nos Ajustes: CPU de cada processo do app (em % do computador inteiro)
ipcMain.handle('app:metrics', () => {
  const cores = require('node:os').cpus().length;
  const list = app.getAppMetrics().map((p) => ({ pid: p.pid, type: p.type, name: p.serviceName || p.name || '', cpu: (p.cpu?.percentCPUUsage || 0) / cores }));
  let gpu = true;
  try { gpu = /^enabled/.test(app.getGPUFeatureStatus().gpu_compositing || ''); } catch {}
  return { cores, gpu, list };
});

// ---------- captura de som por programa (audiocap.exe, loopback por processo do Windows) ----------
// 'screen': tela inteira = tudo menos o Perfumolandia; janela = só o programa dela (como o Discord).
// 'music': só o Spotify, para tocar a música na chamada.
const caps = new Map(); // chave -> processo
function stopSysAudio(key) {
  for (const k of key ? [key] : [...caps.keys()]) {
    const p = caps.get(k);
    if (!p) continue;
    caps.delete(k);
    try { p.stdin.end(); } catch {}
    setTimeout(() => { try { p.kill(); } catch {} }, 1500);
  }
}
ipcMain.handle('sysaudio:start', (e, key, spec) => {
  key = String(key || 'screen');
  stopSysAudio(key);
  if (process.platform !== 'win32') return false;
  const exe = app.isPackaged ? path.join(process.resourcesPath, 'audiocap.exe') : path.join(__dirname, 'audiocap.exe');
  if (!fs.existsSync(exe)) return false;
  let args;
  if (spec?.pid) args = [String(spec.pid | 0), 'include'];
  else {
    const hwnd = /^window:(\d+):/.exec(spec?.source || '')?.[1];
    args = hwnd ? ['w' + hwnd, 'include'] : [String(process.pid)];
  }
  return new Promise((resolve) => {
    const p = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    caps.set(key, p);
    let rest = null, started = false;
    p.stdout.on('data', (chunk) => {
      if (!started) { started = true; resolve(true); }
      // manda só quadros inteiros (4 bytes: 2 canais × 16 bits)
      if (rest) { chunk = Buffer.concat([rest, chunk]); rest = null; }
      const cut = chunk.length - (chunk.length % 4);
      if (cut < chunk.length) rest = chunk.subarray(cut);
      if (cut && caps.get(key) === p && !e.sender.isDestroyed()) e.sender.send('sysaudio', key, chunk.subarray(0, cut));
    });
    p.stderr.on('data', (d) => console.warn('audiocap:', String(d).trim()));
    p.on('error', () => resolve(false));
    p.on('exit', () => { if (!started) resolve(false); if (caps.get(key) === p) caps.delete(key); });
    setTimeout(() => { if (!started) { resolve(false); stopSysAudio(key); } }, 4000);
  });
});
ipcMain.handle('sysaudio:stop', (e, key) => stopSysAudio(key ? String(key) : undefined));
app.on('will-quit', () => stopSysAudio());
ipcMain.handle('game:get', () => currentGame);

// ---------- controle remoto (estilo AnyDesk) ----------
// Só começa depois que o dono do PC aceita o pedido no app. inputctl.exe aplica mouse e teclado;
// Ctrl+Alt+F12 encerra na hora, mesmo com outra janela em foco.
let rc = null;
function stopRemote() {
  if (!rc) return;
  try { rc.proc.stdin.end(); } catch {}
  const p = rc.proc;
  setTimeout(() => { try { p.kill(); } catch {} }, 800);
  try { globalShortcut.unregister('Control+Alt+F12'); } catch {}
  rc = null;
}
ipcMain.handle('rc:start', async (e) => {
  stopRemote();
  if (process.platform !== 'win32') return null;
  const exe = app.isPackaged ? path.join(process.resourcesPath, 'inputctl.exe') : path.join(__dirname, 'inputctl.exe');
  if (!fs.existsSync(exe)) return null;
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  const proc = spawn(exe, [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
  proc.on('exit', () => { if (rc?.proc === proc) rc = null; });
  rc = { proc, display };
  try { globalShortcut.register('Control+Alt+F12', () => { e.sender.send('rc-stop'); stopRemote(); }); } catch {}
  return { sourceId: src?.id || null };
});
const { codeToUiohook } = require('./keymap.js');
ipcMain.on('rc:input', (e, m) => {
  if (!rc || !m) return;
  const w = (line) => { try { rc.proc.stdin.write(line + '\n'); } catch {} };
  const { bounds, scaleFactor: sf } = rc.display;
  const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  switch (m.t) {
    case 'm': w(`m ${Math.round((bounds.x + clamp(m.x) * bounds.width) * sf)} ${Math.round((bounds.y + clamp(m.y) * bounds.height) * sf)}`); break;
    case 'd': case 'u': w(`${m.t} ${[0, 1, 2].includes(m.b) ? m.b : 0}`); break;
    case 'w': w(`w ${Math.max(-1200, Math.min(1200, Math.round(m.d) || 0))}`); break;
    case 'h': w(`h ${Math.max(-1200, Math.min(1200, Math.round(m.d) || 0))}`); break;
    case 'k': {
      const kc = codeToUiohook(String(m.code || ''));
      if (kc == null) return;
      w(`k ${kc & 0xff} ${kc > 0xff ? 1 : 0} ${m.down ? 1 : 0}`);
      break;
    }
  }
});
ipcMain.handle('rc:stop', () => stopRemote());
// tela cheia da janela (acesso remoto: a tela do amigo inteira, sem a barra de tarefas cobrindo)
ipcMain.handle('win:fullscreen', (e, on) => { if (win) win.setFullScreen(!!on); return !!on; });
app.on('will-quit', stopRemote);
ipcMain.handle('music:get', () => currentMusic);

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
