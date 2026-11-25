// Ponte segura entre o app web e o Windows.
const { contextBridge, ipcRenderer } = require('electron');

let pttCb = null;
ipcRenderer.on('ptt', (e, down) => pttCb?.(down));
let gameCb = null;
const sysCbs = new Map();
let musicCb = null;
let rcStopCb = null;
ipcRenderer.on('rc-stop', () => rcStopCb?.());
ipcRenderer.on('music', (e, m) => musicCb?.(m));
let inviteCb = null;
ipcRenderer.on('invite', (e, code) => inviteCb?.(code));
ipcRenderer.on('sysaudio', (e, key, buf) => sysCbs.get(key)?.(buf));
ipcRenderer.on('game', (e, g) => gameCb?.(g));

contextBridge.exposeInMainWorld('perfumolandiaDesktop', {
  platform: process.platform,
  getSources: () => ipcRenderer.invoke('screen:sources'),
  selectSource: (id, audio) => ipcRenderer.invoke('screen:select', id, audio),
  notify: (n) => ipcRenderer.send('notify', { title: String(n.title || ''), body: String(n.body || '') }),
  setPttKey: (code) => ipcRenderer.send('ptt:key', String(code || '')),
  attention: () => ipcRenderer.send('attention'),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (on) => ipcRenderer.invoke('autostart:set', !!on),
  version: () => ipcRenderer.invoke('app:version'),
  onPtt: (cb) => { pttCb = cb; },
  getGame: () => ipcRenderer.invoke('game:get'),
  getInvite: () => ipcRenderer.invoke('invite:get'),
  onInvite: (cb) => { inviteCb = cb; },
  // key: 'screen' | 'music'; spec: { source } (tela/janela) ou { pid } (só aquele programa)
  startSysAudio: (key, spec, cb) => { sysCbs.set(key, cb); return ipcRenderer.invoke('sysaudio:start', String(key), { source: String(spec?.source || ''), pid: Number(spec?.pid) || 0 }); },
  stopSysAudio: (key) => { sysCbs.delete(key); return ipcRenderer.invoke('sysaudio:stop', String(key)); },
  getMusic: () => ipcRenderer.invoke('music:get'),
  onMusic: (cb) => { musicCb = cb; },
  // controle remoto: só usado depois que você aceita o pedido
  rcStart: () => ipcRenderer.invoke('rc:start'),
  rcInput: (m) => ipcRenderer.send('rc:input', m),
  rcStop: () => ipcRenderer.invoke('rc:stop'),
  onRcStop: (cb) => { rcStopCb = cb; },
  onGame: (cb) => { gameCb = cb; },
});
