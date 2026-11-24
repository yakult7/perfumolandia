// Ponte segura entre o app web e o Windows.
const { contextBridge, ipcRenderer } = require('electron');

let pttCb = null;
ipcRenderer.on('ptt', (e, down) => pttCb?.(down));
let gameCb = null;
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
  onGame: (cb) => { gameCb = cb; },
});
