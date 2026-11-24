// Motor de chamadas: WebRTC em malha (cada um conecta direto com cada um).
// Voz e câmera vão para todos. A tela só é enviada para quem clica em "Assistir" (economiza upload em 4K).
import { S, set, setUI } from './store.js';
import * as api from './api.js';
import { sounds, audioCtx } from './sounds.js';
import { toast } from './actions.js';
import { TURN } from './config.js';

export const QUALITY = {
  '4k60': { w: 3840, h: 2160, fps: 60, kbps: 30000, label: '4K · 60 fps' },
  '4k30': { w: 3840, h: 2160, fps: 30, kbps: 18000, label: '4K · 30 fps' },
  '1440p60': { w: 2560, h: 1440, fps: 60, kbps: 16000, label: '1440p · 60 fps' },
  '1080p60': { w: 1920, h: 1080, fps: 60, kbps: 9000, label: '1080p · 60 fps' },
  '720p30': { w: 1280, h: 720, fps: 30, kbps: 3500, label: '720p · 30 fps' },
};
export const CAM = {
  '1080p': { w: 1920, h: 1080, fps: 30, kbps: 3500 },
  '720p': { w: 1280, h: 720, fps: 30, kbps: 1800 },
  '480p': { w: 854, h: 480, fps: 30, kbps: 800 },
};

const iceServers = () => [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...(TURN ? [TURN] : [])];
const local = { mic: null, cam: null, screen: null, screenOpts: null };
const peers = new Map(); // sid -> Peer
const pendingWatch = new Map();
let pttDown = false;

const patchCall = (p) => set((s) => { if (s.call) s.call = { ...s.call, ...p, v: (s.call.v || 0) + 1 }; });
const bump = () => patchCall({});

// ---------- estado publicado (presença) ----------
function streamsMap() {
  const m = {};
  if (local.mic) m[local.mic.id] = 'mic';
  if (local.cam) m[local.cam.id] = 'cam';
  if (local.screen) m[local.screen.id] = 'screen';
  return m;
}
function myState() {
  const c = S.call;
  return {
    muted: !!c.muted, deafened: !!c.deafened, camera: !!local.cam, screen: !!local.screen,
    streams: streamsMap(), screenLabel: local.screen ? c.screenLabel : null,
  };
}
const publish = () => S.call && api.setVoicePresence(S.call.roomId, myState());

// ---------- codec e SDP ----------
// Automático = H.264: no Windows sai pela placa de vídeo (NVENC/AMF/QuickSync, testado com NVIDIA)
// e todo aparelho decodifica, inclusive iPhone. Sem placa compatível, o Chrome cai para software sozinho.
function preferCodec(t) {
  const want = (S.settings.codec === 'auto' ? 'video/H264' : S.settings.codec).toLowerCase();
  const caps = RTCRtpReceiver.getCapabilities?.('video')?.codecs;
  if (!caps || !t.setCodecPreferences) return;
  const first = caps.filter((c) => c.mimeType.toLowerCase() === want);
  if (!first.length) return;
  try { t.setCodecPreferences([...first, ...caps.filter((c) => !first.includes(c))]); } catch {}
}

/** ajusta a descrição remota: áudio estéreo de alta qualidade e bitrate de vídeo alto liberado */
function mungeRemote(sdp) {
  const lines = sdp.split('\r\n');
  const opus = new Set(), video = new Set(), hasFmtp = new Set();
  for (const l of lines) {
    let m = l.match(/^a=rtpmap:(\d+) opus\//i);
    if (m) opus.add(m[1]);
    m = l.match(/^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i);
    if (m) video.add(m[1]);
    m = l.match(/^a=fmtp:(\d+) /);
    if (m) hasFmtp.add(m[1]);
  }
  const VIDEO_PARAMS = 'x-google-max-bitrate=50000;x-google-start-bitrate=5000';
  const out = [];
  for (const l of lines) {
    const f = l.match(/^a=fmtp:(\d+) (.*)$/);
    if (f && opus.has(f[1]) && !/stereo=1/.test(f[2])) { out.push(`a=fmtp:${f[1]} ${f[2]};stereo=1;sprop-stereo=1;maxaveragebitrate=256000`); continue; }
    if (f && video.has(f[1]) && !/x-google-max-bitrate/.test(f[2])) { out.push(`a=fmtp:${f[1]} ${f[2]};${VIDEO_PARAMS}`); continue; }
    out.push(l);
    const r = l.match(/^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i);
    if (r && !hasFmtp.has(r[1])) out.push(`a=fmtp:${r[1]} ${VIDEO_PARAMS}`);
  }
  return out.join('\r\n');
}

function encodings(kind, trackKind) {
  if (trackKind === 'audio') return [{ maxBitrate: kind === 'screen' ? 192000 : 64000, priority: 'high', networkPriority: 'high' }];
  if (kind === 'cam') {
    const q = CAM[S.settings.camQuality] || CAM['720p'];
    return [{ maxBitrate: q.kbps * 1000, maxFramerate: q.fps }];
  }
  const q = local.screenOpts.q;
  return [{ maxBitrate: q.kbps * 1000, maxFramerate: q.fps, scaleResolutionDownBy: 1, priority: 'high', networkPriority: 'high' }];
}

// ---------- par (uma conexão com cada participante) ----------
class Peer {
  constructor(sid, userId) {
    this.sid = sid;
    this.userId = userId;
    this.polite = api.clientId > sid;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.srdAnswerPending = false;
    this.tx = {};
    this.remote = new Map();
    this.audio = new Map();
    this.state = {};
    this.wantsScreen = !!pendingWatch.get(sid);
    pendingWatch.delete(sid);
    this.queue = Promise.resolve();
    const pc = (this.pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' }));
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        api.sendSignal(sid, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      } catch (e) { console.warn('negociação', e); } finally { this.makingOffer = false; }
    };
    pc.onicecandidate = ({ candidate }) => candidate && api.sendSignal(sid, { candidate: candidate.toJSON() });
    pc.ontrack = (e) => this.onTrack(e);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce?.();
      bump();
    };
    if (local.mic) this.send('mic', local.mic);
    if (local.cam) this.send('cam', local.cam);
    if (local.screen && this.wantsScreen) this.send('screen', local.screen);
    if (S.call?.watching?.[sid]) api.sendWatch(sid, true);
  }
  send(kind, stream) {
    this.unsend(kind);
    this.tx[kind] = stream.getTracks().map((track) => {
      const t = this.pc.addTransceiver(track, { direction: 'sendonly', streams: [stream], sendEncodings: encodings(kind, track.kind) });
      if (track.kind === 'video') preferCodec(t);
      return t;
    });
  }
  unsend(kind) {
    for (const t of this.tx[kind] || []) {
      try { t.sender.replaceTrack(null); } catch {}
      try { if (t.stop) t.stop(); else this.pc.removeTrack(t.sender); } catch {}
    }
    delete this.tx[kind];
  }
  replace(kind, track) {
    for (const t of this.tx[kind] || []) if (t.sender.track?.kind === track.kind || !t.sender.track) t.sender.replaceTrack(track).catch(() => {});
  }
  onSignal(data) {
    this.queue = this.queue.then(() => this.handle(data)).catch((e) => console.warn('sinal', e));
  }
  async handle({ description, candidate, candidates }) {
    const pc = this.pc;
    if (description) {
      const ready = !this.makingOffer && (pc.signalingState === 'stable' || this.srdAnswerPending);
      const collision = description.type === 'offer' && !ready;
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      this.srdAnswerPending = description.type === 'answer';
      await pc.setRemoteDescription({ type: description.type, sdp: mungeRemote(description.sdp) });
      this.srdAnswerPending = false;
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        api.sendSignal(this.sid, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      }
      return;
    }
    for (const c of candidates || (candidate ? [candidate] : [])) {
      try { await pc.addIceCandidate(c); } catch (e) { if (!this.ignoreOffer) console.warn('ice', e); }
    }
  }
  onTrack(e) {
    const stream = e.streams[0] || new MediaStream([e.track]);
    this.remote.set(stream.id, stream);
    if (e.track.kind === 'audio') this.attachAudio(stream);
    e.track.addEventListener('ended', bump);
    e.track.addEventListener('unmute', bump);
    stream.addEventListener('removetrack', () => {
      if (!stream.getTracks().length) { this.remote.delete(stream.id); this.detachAudio(stream.id); }
      bump();
    });
    bump();
  }
  kindOf(streamId) { return this.state?.streams?.[streamId]; }
  getStream(kind) {
    for (const [id, k] of Object.entries(this.state?.streams || {})) {
      if (k === kind && this.remote.has(id)) return this.remote.get(id);
    }
    return null;
  }
  attachAudio(stream) {
    if (this.audio.has(stream.id)) return;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.playsInline = true;
    el.srcObject = stream;
    document.getElementById('audio-sink').appendChild(el);
    this.audio.set(stream.id, el);
    applyVolumes();
    el.play().catch(() => setUI({ audioBlocked: true }));
    watchLevel(stream.id, this.userId, stream, () => this.kindOf(stream.id) !== 'screen');
  }
  detachAudio(id) {
    const el = this.audio.get(id);
    if (el) { el.srcObject = null; el.remove(); }
    this.audio.delete(id);
    unwatchLevel(id);
  }
  close() {
    for (const id of [...this.audio.keys()]) this.detachAudio(id);
    try { this.pc.close(); } catch {}
  }
}

// ---------- volume / saída ----------
export function applyVolumes() {
  const st = S.settings;
  for (const p of peers.values()) {
    for (const [id, el] of p.audio) {
      const kind = p.kindOf(id);
      const v = kind === 'screen' ? st.streamVolumes[p.userId] ?? 1 : st.userVolumes[p.userId] ?? 1;
      el.volume = Math.max(0, Math.min(1, v));
      el.muted = !!S.call?.deafened || (kind === 'screen' && !S.call?.watching?.[p.sid]);
      if (el.setSinkId && st.outputDevice && st.outputDevice !== 'default') el.setSinkId(st.outputDevice).catch(() => {});
    }
  }
}
export function unlockAudio() {
  for (const p of peers.values()) for (const el of p.audio.values()) el.play().catch(() => {});
  audioCtx();
  setUI({ audioBlocked: false });
}

// ---------- quem está falando ----------
const levels = new Map();
let levelTimer = null;
const speakingHold = {};
function watchLevel(key, uid, stream, filter = () => true) {
  try {
    const ctx = audioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    levels.set(key, { an, src, uid, filter, data: new Float32Array(an.fftSize) });
  } catch {}
  if (!levelTimer) levelTimer = setInterval(tickLevels, 110);
}
function unwatchLevel(key) {
  const l = levels.get(key);
  if (l) { try { l.src.disconnect(); } catch {} }
  levels.delete(key);
}
function tickLevels() {
  const now = Date.now();
  const speaking = {};
  for (const l of levels.values()) {
    if (!l.filter()) continue;
    l.an.getFloatTimeDomainData(l.data);
    let sum = 0;
    for (let i = 0; i < l.data.length; i++) sum += l.data[i] * l.data[i];
    const rms = Math.sqrt(sum / l.data.length);
    if (rms > 0.018) speakingHold[l.uid] = now;
  }
  for (const [uid, t] of Object.entries(speakingHold)) if (now - t < 320) speaking[uid] = true;
  const prev = S.speaking;
  const changed = Object.keys(speaking).length !== Object.keys(prev).length || Object.keys(speaking).some((k) => !prev[k]);
  if (changed) set((s) => { s.speaking = speaking; });
}

// ---------- microfone ----------
async function getMic() {
  const st = S.settings;
  const base = { echoCancellation: st.echoCancellation, noiseSuppression: st.noiseSuppression, autoGainControl: st.autoGain, channelCount: 1 };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { ...base, ...(st.inputDevice !== 'default' ? { deviceId: { exact: st.inputDevice } } : {}) } });
  } catch (e) {
    if (st.inputDevice !== 'default' && e.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ audio: base });
    throw e;
  }
}
function micShouldBeOn() {
  const c = S.call;
  if (!c || c.muted || c.deafened) return false;
  return S.settings.inputMode !== 'ptt' || pttDown;
}
function applyMic() {
  const on = micShouldBeOn();
  local.mic?.getAudioTracks().forEach((t) => { t.enabled = on; });
  if (local.mic) {
    if (on && !levels.has(local.mic.id)) watchLevel(local.mic.id, S.uid, local.mic, micShouldBeOn);
  }
}

// push-to-talk (com o app em foco; no PC o atalho global vem do Electron)
const isTyping = (e) => /^(INPUT|TEXTAREA)$/.test(e.target?.tagName) || e.target?.isContentEditable;
addEventListener('keydown', (e) => {
  if (S.settings.inputMode !== 'ptt' || e.code !== S.settings.pttKey || isTyping(e) || e.repeat) return;
  pttDown = true; applyMic(); setUI({ ptt: true });
});
addEventListener('keyup', (e) => {
  if (e.code !== S.settings.pttKey) return;
  pttDown = false; applyMic(); setUI({ ptt: false });
});
addEventListener('blur', () => { if (pttDown) { pttDown = false; applyMic(); setUI({ ptt: false }); } });
window.perfumolandiaDesktop?.onPtt?.((down) => { pttDown = down; applyMic(); setUI({ ptt: down }); });

// ---------- entrar / sair ----------
export async function join(roomId) {
  if (S.call?.roomId === roomId) { setUI({ callOpen: true }); return; }
  if (S.call) await leave(true);
  set((s) => {
    s.call = { roomId, joinedAt: Date.now(), muted: false, deafened: false, watching: {}, focus: null, connecting: true, facing: 'user', v: 0 };
    s.ui = { ...s.ui, callOpen: true };
  });
  try {
    local.mic = await getMic();
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Permita o microfone para falar na chamada.' : 'Microfone indisponível.', 'err');
    patchCall({ muted: true });
  }
  applyMic();
  try {
    await api.joinRoomChannel(roomId, {
      signal: (m) => { const p = peers.get(m.from); if (p) p.onSignal(m.data); else queueEarly(m); },
      watch: onWatch,
    });
  } catch {
    toast('Não foi possível conectar à chamada.', 'err');
    return leave(true);
  }
  await publish();
  patchCall({ connecting: false });
  sounds.join();
  onVoiceUpdate(roomId, S.voice[roomId] || []);
}

// sinais que chegam antes de sabermos do participante (presença atrasada)
const early = new Map();
function queueEarly(m) {
  if (!early.has(m.from)) early.set(m.from, []);
  early.get(m.from).push(m.data);
  setTimeout(() => early.delete(m.from), 15000);
}

export async function leave(silent = false) {
  if (!S.call) return;
  for (const p of peers.values()) p.close();
  peers.clear();
  early.clear();
  stopLocal('mic'); stopLocal('cam'); stopLocal('screen');
  for (const k of [...levels.keys()]) unwatchLevel(k);
  clearInterval(levelTimer); levelTimer = null;
  set((s) => { s.call = null; s.speaking = {}; });
  await api.setVoicePresence(null, null);
  await api.leaveRoomChannel();
  if (!silent) sounds.leave();
}

function stopLocal(kind) {
  const s = local[kind];
  if (!s) return;
  s.getTracks().forEach((t) => t.stop());
  unwatchLevel(s.id);
  local[kind] = null;
}

export function onVoiceUpdate(roomId, parts) {
  if (!S.call || roomId !== S.call.roomId) return;
  const others = parts.filter((p) => p.sid !== api.clientId);
  const seen = new Set();
  const settled = Date.now() - S.call.joinedAt > 2000;
  let watching = S.call.watching;
  for (const p of others) {
    seen.add(p.sid);
    let peer = peers.get(p.sid);
    if (!peer) {
      peer = new Peer(p.sid, p.userId);
      peers.set(p.sid, peer);
      for (const d of early.get(p.sid) || []) peer.onSignal(d);
      early.delete(p.sid);
      if (settled) sounds.peerJoin();
    }
    peer.state = p.state || {};
    if (!peer.state.screen && watching[p.sid]) watching = { ...watching, [p.sid]: false };
  }
  for (const [sid, peer] of peers) {
    if (seen.has(sid)) continue;
    peer.close();
    peers.delete(sid);
    sounds.peerLeave();
    if (watching[sid]) watching = { ...watching, [sid]: false };
  }
  patchCall({ watching, focus: S.call.focus && !seen.has(S.call.focus.sid) && S.call.focus.sid !== api.clientId ? null : S.call.focus });
  applyVolumes();
}

function onWatch({ from, watch }) {
  const p = peers.get(from);
  if (!p) { pendingWatch.set(from, watch); return; }
  p.wantsScreen = watch;
  if (!local.screen) return;
  if (watch) p.send('screen', local.screen); else p.unsend('screen');
}

// ---------- controles ----------
export function toggleMute() {
  if (!S.call) return;
  if (!local.mic) {
    getMic().then((m) => { local.mic = m; for (const p of peers.values()) p.send('mic', m); patchCall({ muted: false, deafened: false }); applyMic(); publish(); })
      .catch(() => toast('Microfone indisponível.', 'err'));
    return;
  }
  const muted = !S.call.muted;
  patchCall({ muted, deafened: muted ? S.call.deafened : false });
  muted ? sounds.mute() : sounds.unmute();
  applyMic(); applyVolumes(); publish();
}
export function toggleDeafen() {
  if (!S.call) return;
  const deafened = !S.call.deafened;
  patchCall({ deafened, muted: deafened ? true : false });
  deafened ? sounds.mute() : sounds.unmute();
  applyMic(); applyVolumes(); publish();
}

async function getCam(facing) {
  const st = S.settings;
  const q = CAM[st.camQuality] || CAM['720p'];
  const video = { width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } };
  if (st.videoDevice !== 'default' && !facing) video.deviceId = { exact: st.videoDevice };
  else video.facingMode = facing || 'user';
  return navigator.mediaDevices.getUserMedia({ video });
}
export async function toggleCamera() {
  if (!S.call) return;
  if (local.cam) {
    for (const p of peers.values()) p.unsend('cam');
    stopLocal('cam');
    publish(); bump();
    return;
  }
  try {
    local.cam = await getCam(S.call.facing === 'environment' ? 'environment' : null);
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Permita a câmera para ligar o vídeo.' : 'Câmera indisponível.', 'err');
    return;
  }
  for (const p of peers.values()) p.send('cam', local.cam);
  publish(); bump();
}
/** troca câmera frontal/traseira mantendo o mesmo stream (sem renegociar) */
export async function flipCamera() {
  if (!local.cam) return;
  const facing = S.call.facing === 'user' ? 'environment' : 'user';
  try {
    const n = await getCam(facing);
    const track = n.getVideoTracks()[0];
    const old = local.cam.getVideoTracks()[0];
    local.cam.removeTrack(old); old.stop();
    local.cam.addTrack(track);
    for (const p of peers.values()) p.replace('cam', track);
    patchCall({ facing });
  } catch { toast('Não deu para trocar a câmera.', 'err'); }
}

export async function startScreen(opts) {
  if (!S.call) return;
  const q = QUALITY[opts.quality] || QUALITY['4k60'];
  if (local.screen) stopScreen(true);
  if (opts.sourceId && window.perfumolandiaDesktop?.selectSource) await window.perfumolandiaDesktop.selectSource(opts.sourceId, opts.audio);
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { max: q.w }, height: { max: q.h }, frameRate: { ideal: q.fps, max: q.fps } },
      // restrictOwnAudio: não captura as vozes da própria chamada (evita eco para quem assiste)
      audio: opts.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true, suppressLocalAudioPlayback: false } : false,
      systemAudio: opts.audio ? 'include' : 'exclude',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  } catch (e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast('Não foi possível capturar a tela: ' + e.message, 'err');
    return;
  }
  const v = stream.getVideoTracks()[0];
  v.contentHint = opts.priority === 'fps' ? 'motion' : 'detail';
  v.addEventListener('ended', () => stopScreen());
  local.screen = stream;
  local.screenOpts = { ...opts, q };
  const st = v.getSettings();
  const label = `${st.width}×${st.height} · ${Math.round(st.frameRate || q.fps)} fps`;
  patchCall({ screenLabel: label, focus: { sid: api.clientId, kind: 'screen' } });
  if (opts.quality.startsWith('4k') && st.width && st.width < 3800) {
    toast(`Sua tela é ${st.width}×${st.height}. Para 4K de verdade, o monitor precisa ser 4K.`);
  }
  for (const p of peers.values()) if (p.wantsScreen) p.send('screen', stream);
  publish();
  sounds.streamStart();
}
export function stopScreen(silent) {
  if (!local.screen) return;
  for (const p of peers.values()) p.unsend('screen');
  stopLocal('screen');
  local.screenOpts = null;
  patchCall({ screenLabel: null, focus: S.call?.focus?.sid === api.clientId ? null : S.call?.focus });
  if (!silent) publish();
}

export function watch(sid, on) {
  if (!S.call) return;
  patchCall({ watching: { ...S.call.watching, [sid]: on }, focus: on ? { sid, kind: 'screen' } : S.call.focus?.sid === sid ? null : S.call.focus });
  api.sendWatch(sid, on);
  applyVolumes();
}
export const setFocus = (focus) => patchCall({ focus });

/** reaplica dispositivos/ajustes de áudio durante a chamada */
export async function reloadMic() {
  if (!S.call || !local.mic) return;
  try {
    const m = await getMic();
    const track = m.getAudioTracks()[0];
    const old = local.mic.getAudioTracks()[0];
    unwatchLevel(local.mic.id);
    local.mic.removeTrack(old); old.stop();
    local.mic.addTrack(track);
    for (const p of peers.values()) p.replace('mic', track);
    applyMic();
  } catch { toast('Não deu para trocar o microfone.', 'err'); }
}

// ---------- consultas para a interface ----------
export const localStream = (kind) => local[kind];
export const peerOf = (sid) => peers.get(sid);
export function remoteStream(sid, kind) {
  return peers.get(sid)?.getStream(kind) || null;
}
export const connectionOf = (sid) => peers.get(sid)?.pc.connectionState || 'new';
export const isSharing = () => !!local.screen;
export const hasCam = () => !!local.cam;

const prevBytes = new Map();
/** estatísticas de vídeo (resolução, fps, bitrate, codec) de um stream */
export async function videoStats(sid, kind) {
  const outbound = sid === api.clientId;
  const list = outbound ? [...peers.values()].filter((p) => p.tx[kind]) : [peers.get(sid)].filter(Boolean);
  for (const p of list) {
    const stats = await p.pc.getStats();
    let found = null;
    const codecs = {};
    stats.forEach((r) => { if (r.type === 'codec') codecs[r.id] = r.mimeType; });
    const trackId = outbound ? local[kind]?.getVideoTracks()[0]?.id : p.getStream(kind)?.getVideoTracks()[0]?.id;
    stats.forEach((r) => {
      if (r.kind !== 'video') return;
      if (outbound && r.type === 'outbound-rtp' && (!r.mediaSourceId || stats.get(r.mediaSourceId)?.trackIdentifier === trackId)) found = r;
      if (!outbound && r.type === 'inbound-rtp' && r.trackIdentifier === trackId) found = r;
    });
    if (!found) continue;
    const bytes = outbound ? found.bytesSent : found.bytesReceived;
    const key = sid + kind + p.sid;
    const prev = prevBytes.get(key);
    prevBytes.set(key, { bytes, t: found.timestamp });
    const kbps = prev ? Math.round(((bytes - prev.bytes) * 8) / (found.timestamp - prev.t)) : 0;
    return {
      w: found.frameWidth, h: found.frameHeight, fps: Math.round(found.framesPerSecond || 0), kbps,
      codec: (codecs[found.codecId] || '').replace('video/', ''),
      encoder: found.encoderImplementation || found.decoderImplementation || '',
      limit: found.qualityLimitationReason && found.qualityLimitationReason !== 'none' ? found.qualityLimitationReason : '',
    };
  }
  return null;
}
