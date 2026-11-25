import { useReducer, useRef, useEffect } from './lib.js';

const load = (k, d) => {
  try { const v = JSON.parse(localStorage.getItem('rs.' + k)); return v ?? d; } catch { return d; }
};
export const persist = (k, v) => { try { localStorage.setItem('rs.' + k, JSON.stringify(v)); } catch {} };

export const DEFAULT_SETTINGS = {
  inputDevice: 'default', outputDevice: 'default', videoDevice: 'default',
  noiseSuppression: true, noiseMode: 'smart', echoCancellation: true, autoGain: true,
  inputMode: 'voice', pttKey: 'KeyV', pttLabel: 'V',
  camQuality: '720p',
  screenQuality: '4k60', screenPriority: 'resolution', screenAudio: true, codec: 'auto',
  perfMode: false, sounds: true, showStats: false, shareGame: true, musicVolume: 0.6, musicMuted: false,
  theme: 'system', accent: '#0a84ff', wallpaper: 'aurora', wallpaperColors: ['#3b5bff', '#a04dff', '#00c2c7'], wallpaperImage: null, glassStyle: 'clear',
  callHeight: 340,
  appTheme: 'default', appColors: ['#5e5ce6', '#ff375f', '#0a84ff'], appAngle: 135, appIntensity: 0.6,
  userVolumes: {}, streamVolumes: {},
};

export const S = {
  booting: true, authed: false, needsProfile: false, uid: null, inviteCode: null,
  me: null, ready: false, connected: false,
  users: {}, lastAt: {}, online: {}, games: {}, myGame: null, musics: {}, myMusic: null, pcs: {}, remote: null, rcIncoming: null, relations: {}, servers: {}, dms: {}, groups: {}, messages: {},
  lastIds: {}, readIds: load('readIds', {}), voice: {}, typing: {}, speaking: {},
  view: { serverId: null, channelId: null, homeTab: 'online' },
  lastChannel: load('lastChannel', {}),
  call: null,
  incoming: null, outgoing: null,
  ui: { modal: null, menu: null, toasts: [], pane: 'list', tab: 'home', showMembers: true, callOpen: true },
  settings: { ...DEFAULT_SETTINGS, ...load('settings', {}) },
};

const subs = new Set();
let queued = false;
export function set(fn) {
  fn(S);
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; for (const f of subs) f(); });
}
export const subscribe = (f) => (subs.add(f), () => subs.delete(f));

function shallowEq(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

/** Lê uma fatia do estado e re-renderiza só quando ela muda (comparação rasa). */
export function useS(sel) {
  const [, force] = useReducer((c) => c + 1, 0);
  const r = useRef();
  r.sel = sel;
  r.val = sel(S);
  useEffect(() => {
    const check = () => { if (!shallowEq(r.sel(S), r.val)) force(); };
    const off = subscribe(check);
    check(); // o estado pode ter mudado entre o render e a inscrição
    return off;
  }, []);
  return r.val;
}

export function setSettings(patch) {
  set((s) => { s.settings = { ...s.settings, ...patch }; });
  persist('settings', S.settings);
}
export const setUI = (patch) => set((s) => { s.ui = { ...s.ui, ...patch }; });
