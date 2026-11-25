// Atualização automática: ao abrir, procura versão nova; se tiver, baixa e instala antes de abrir o app.
// Os arquivos ficam na Release mais recente do GitHub (latest.yml + instalador).
const { BrowserWindow, app, Notification } = require('electron');
const path = require('node:path');

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch {}

function splashWindow(icon) {
  const w = new BrowserWindow({
    width: 320, height: 360, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#0b0b12', show: false, icon, skipTaskbar: false, center: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  w.loadFile(path.join(__dirname, 'splash.html'));
  w.once('ready-to-show', () => w.show());
  return w;
}

/**
 * Resolve com { result: 'start' | 'installing', splash }.
 * silent = true quando o Windows abre o app ao ligar (sem janelinha de atualização).
 */
function checkBeforeStart({ icon, silent }) {
  if (!app.isPackaged || !autoUpdater) return Promise.resolve({ result: 'start', splash: null });
  const splash = silent ? null : splashWindow(icon);
  const status = (text, pct = null) => splash?.webContents.executeJavaScript(`setStatus(${JSON.stringify(text)}, ${pct})`).catch(() => {});
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ result, splash });
    };
    // sem internet ou GitHub lento: não segura o usuário
    const timer = setTimeout(() => finish('start'), 9000);
    autoUpdater.once('update-not-available', () => finish('start'));
    autoUpdater.once('error', () => finish('start'));
    autoUpdater.once('update-available', (info) => { clearTimeout(timer); status(`Baixando a versão ${info.version}…`, 0); });
    autoUpdater.on('download-progress', (p) => status('Baixando atualização…', Math.round(p.percent)));
    autoUpdater.once('update-downloaded', () => {
      status('Instalando…', 100);
      finish('installing');
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 700);
    });
    status('Procurando atualizações…');
    autoUpdater.checkForUpdates().catch(() => finish('start'));
  });
}

/** com o app aberto (ex.: ligado o dia todo), procura de novo de tempos em tempos e instala ao fechar */
/** com o app aberto: procura a cada 30 min; baixada, avisa o app (botão "Reiniciar") e instala sozinha ao fechar */
let readyVersion = null;
function backgroundChecks(onReady) {
  if (!app.isPackaged || !autoUpdater) return;
  autoUpdater.removeAllListeners();
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => { readyVersion = info.version; onReady?.(info.version); });
  // procura 1 min depois de abrir, a cada 10 min e sempre que você volta para a janela (no máximo 1x a cada 2 min)
  let lastCheck = 0;
  const check = () => {
    if (readyVersion || Date.now() - lastCheck < 2 * 60 * 1000) return;
    lastCheck = Date.now();
    autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(check, 60 * 1000);
  setInterval(check, 10 * 60 * 1000);
  app.on('browser-window-focus', check);
}
const updateReady = () => readyVersion;
const installNow = () => { if (readyVersion && autoUpdater) autoUpdater.quitAndInstall(true, true); };

module.exports = { checkBeforeStart, backgroundChecks, updateReady, installNow };
