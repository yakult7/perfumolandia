// Motor de chamadas: WebRTC em malha (cada um conecta direto com cada um).
// Voz e câmera vão para todos. A tela só é enviada para quem clica em "Assistir" (economiza upload em 4K).
import { S, set, setUI, setSettings } from './store.js';
import * as api from './api.js';
import { startSysAudio } from './sysaudio.js';
import { sounds, audioCtx } from './sounds.js';
import { toast, cancelOutgoing, closeCallLog } from './actions.js';
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
const local = { mic: null, cam: null, screen: null, screenOpts: null, native: null };
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
  if (local.native) m[local.native.streamId] = 'screen';
  if (local.music) m[local.music.id] = 'music';
  return m;
}
function myState() {
  const c = S.call;
  const sharing = !!local.screen || !!local.native;
  return {
    muted: !!c.muted, deafened: !!c.deafened, camera: !!local.cam, screen: sharing,
    streams: streamsMap(), screenLabel: sharing ? c.screenLabel : null,
    viewers: sharing ? [...new Set([...peers.values()].filter((p) => p.wantsScreen).map((p) => p.userId))] : [],
    music: local.music && S.myMusic ? { title: S.myMusic.title, artist: S.myMusic.artist, art: S.myMusic.art } : null,
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
  const k = groupScale();
  if (trackKind === 'audio') return [{ maxBitrate: kind === 'screen' || kind === 'music' ? 192000 : Math.max(32000, Math.round(96000 * k)), priority: 'high', networkPriority: 'high' }];
  if (kind === 'cam') {
    const q = CAM[S.settings.camQuality] || CAM['720p'];
    return [{ maxBitrate: Math.round(q.kbps * 1000 * k), maxFramerate: q.fps, scaleResolutionDownBy: k < 1 ? Math.min(3, 1 / Math.sqrt(k)) : 1 }];
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
    // quem tem o id menor começa a conversa (só um lado manda a primeira oferta: sem colisão e metade das mensagens)
    this.initiator = !this.polite;
    this.pid = Math.random().toString(36).slice(2, 10); // id desta conexão (muda quando ela é refeita)
    this.remotePid = null;
    this.talked = false; // já recebeu algo do outro lado
    this.born = Date.now();
    this.badSince = 0;
    this.missingSince = 0;
    this.iceWait = [];
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
    pc.onnegotiationneeded = () => {
      // quem não inicia espera a primeira oferta do outro lado (depois renegocia normalmente)
      if (!this.initiator && !this.talked) return;
      this.negotiate();
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.sig({ candidate: candidate.toJSON() });
    pc.ontrack = (e) => this.onTrack(e);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.badSince = 0;
      else if (['failed', 'disconnected'].includes(pc.connectionState) && !this.badSince) this.badSince = Date.now();
      bump();
    };
    if (local.mic) this.send('mic', local.mic);
    else pc.addTransceiver('audio', { direction: 'recvonly' }); // sem microfone: ainda assim negocia para ouvir os outros
    if (local.cam) this.send('cam', local.cam);
    if (local.screen && this.wantsScreen) this.send('screen', local.screen);
    if (local.music) this.send('music', local.music);
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
  /** quem assiste avisou o tamanho da tela dele e se a janela está escondida:
   *  manda só a resolução que ele consegue mostrar (4K para monitor 1080p vira 1080p) e quase nenhum quadro se escondida */
  applyScreenHint() {
    const q = this.screenHint;
    const t = (this.tx.screen || []).find((x) => x.sender.track?.kind === 'video');
    if (!q || !t || !local.screenOpts) return;
    const src = t.sender.track.getSettings();
    const scale = Math.max(1, (src.height || 1080) / Math.max(360, q.h || 1080));
    const fps = q.hidden ? 2 : local.screenOpts.q.fps;
    const kbps = Math.round(local.screenOpts.q.kbps / (scale * scale) * (q.hidden ? 0.15 : 1));
    const prm = t.sender.getParameters();
    if (!prm.encodings?.length) return;
    prm.encodings[0].scaleResolutionDownBy = scale;
    prm.encodings[0].maxFramerate = fps;
    prm.encodings[0].maxBitrate = Math.max(300, kbps) * 1000;
    t.sender.setParameters(prm).catch(() => {});
  }
  replace(kind, track) {
    for (const t of this.tx[kind] || []) if (t.sender.track?.kind === track.kind || !t.sender.track) t.sender.replaceTrack(track).catch(() => {});
  }
  sig(data) { api.sendSignal(this.sid, { ...data, pid: this.pid }); }
  async negotiate() {
    const pc = this.pc;
    try {
      this.makingOffer = true;
      await pc.setLocalDescription();
      this.sig({ description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } catch (e) { console.warn('negociação', e); } finally { this.makingOffer = false; }
  }
  /** tenho áudio/vídeo que ainda não foi combinado com o outro lado (ex.: respondi a primeira oferta e o meu microfone ficou de fora) */
  pendingSend() {
    return this.pc.getTransceivers().some((t) => t.sender.track && !t.stopped && !['sendonly', 'sendrecv'].includes(t.currentDirection));
  }
  onSignal(data) {
    this.queue = this.queue.then(() => this.handle(data)).catch((e) => console.warn('sinal', e));
  }
  async handle({ description, candidate, candidates }) {
    const pc = this.pc;
    if (description || candidate || candidates) this.talked = true;
    if (description) {
      // resposta que chegou atrasada/duplicada (não estou esperando resposta): ignora
      if (description.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
      const ready = !this.makingOffer && (pc.signalingState === 'stable' || this.srdAnswerPending);
      const collision = description.type === 'offer' && !ready;
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      this.srdAnswerPending = description.type === 'answer';
      await pc.setRemoteDescription({ type: description.type, sdp: mungeRemote(description.sdp) });
      this.srdAnswerPending = false;
      // candidatos que chegaram antes da descrição
      for (const c of this.iceWait.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        this.sig({ description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        // o navegador não avisa de novo que precisa negociar: se meu som ficou de fora, ofereço agora
        if (pc.signalingState === 'stable' && this.pendingSend()) this.negotiate();
      }
      return;
    }
    for (const c of candidates || (candidate ? [candidate] : [])) {
      if (!pc.remoteDescription) { if (!this.ignoreOffer) this.iceWait.push(c); continue; }
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
    if (kind === 'screen' && this.nativeRx?.stream) return this.nativeRx.stream;
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
    if (hasRtpLevels) startLevels();
    else watchLevel(stream.id, this.userId, stream, () => { const k = this.kindOf(stream.id); return k !== 'screen' && k !== 'music'; });
  }
  detachAudio(id) {
    const el = this.audio.get(id);
    if (el) { el.srcObject = null; el.remove(); }
    unboost(el);
    this.audio.delete(id);
    unwatchLevel(id);
  }
  closeNativeRx() {
    try { this.nativeRx?.pc.close(); } catch {}
    this.nativeRx = null;
  }
  close() {
    for (const id of [...this.audio.keys()]) this.detachAudio(id);
    this.closeNativeRx();
    try { this.pc.close(); } catch {}
  }
}

// ---------- tela nativa do celular (conexão separada) ----------
async function onNativeSignal({ from, data }) {
  try {
    if (data.dir === 'v2s') {
      // eu transmito do celular; quem assiste respondeu
      const plugin = local.native?.plugin;
      if (!plugin) return;
      if (data.description) await plugin.answer({ peerId: from, sdp: data.description.sdp });
      if (data.candidate) await plugin.addIce({ peerId: from, candidate: data.candidate });
      return;
    }
    // eu assisto a tela de um celular
    const peer = peers.get(from);
    if (!peer) return;
    if (data.description?.type === 'offer') {
      peer.closeNativeRx();
      const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });
      peer.nativeRx = { pc, stream: null };
      pc.ontrack = (e) => { if (peer.nativeRx?.pc === pc) { peer.nativeRx.stream = e.streams[0] || new MediaStream([e.track]); bump(); } };
      pc.onicecandidate = ({ candidate }) => candidate && api.sendNativeSignal(from, { dir: 'v2s', candidate: candidate.toJSON() });
      await pc.setRemoteDescription(data.description);
      await pc.setLocalDescription();
      api.sendNativeSignal(from, { dir: 'v2s', description: { type: 'answer', sdp: pc.localDescription.sdp } });
    } else if (data.candidate && peer.nativeRx) {
      await peer.nativeRx.pc.addIceCandidate(data.candidate).catch(() => {});
    }
  } catch (e) { console.warn('tela nativa', e); }
}

async function nativeOffer(sid) {
  const n = local.native;
  if (!n) return;
  try {
    const o = await n.plugin.offer({ peerId: sid });
    api.sendNativeSignal(sid, { dir: 's2v', description: { type: 'offer', sdp: o.sdp } });
  } catch (e) { console.warn('oferta nativa', e); }
}

export async function startNativeScreen(plugin, opts = {}) {
  if (!S.call || local.native) return;
  let r;
  try {
    r = await plugin.start({ iceServers: iceServers(), fps: 30, maxKbps: 8000, audio: !!opts.audio });
  } catch (e) {
    toast(e.message || 'Não foi possível transmitir a tela.', 'err');
    return;
  }
  const subs = [
    await plugin.addListener('ice', ({ peerId, candidate }) => api.sendNativeSignal(peerId, { dir: 's2v', candidate })),
    await plugin.addListener('stopped', () => stopNativeScreen(plugin, true)),
  ];
  local.native = { plugin, streamId: r.streamId, subs };
  const { nativeScreen } = await import('./native.js');
  nativeScreen.active = true;
  patchCall({ screenLabel: `${r.width}×${r.height} · celular` });
  publish();
  sounds.streamStart();
  for (const p of peers.values()) if (p.wantsScreen) nativeOffer(p.sid);
}

export async function stopNativeScreen(plugin, alreadyStopped = false) {
  const n = local.native;
  if (!n) return;
  local.native = null;
  for (const s of n.subs) s?.remove?.();
  if (!alreadyStopped) await (plugin || n.plugin).stop().catch(() => {});
  const { nativeScreen } = await import('./native.js');
  nativeScreen.active = false;
  patchCall({ screenLabel: null });
  publish();
}

// ---------- volume / saída ----------
export function applyVolumes() {
  const st = S.settings;
  for (const p of peers.values()) {
    for (const [id, el] of p.audio) {
      const kind = p.kindOf(id);
      const v = kind === 'screen' ? st.streamVolumes[p.userId] ?? 1 : kind === 'music' ? (st.musicMuted ? 0 : st.musicVolume ?? 0.6) : st.userVolumes[p.userId] ?? 1;
      const muted = !!S.call?.deafened || (kind === 'screen' && !S.call?.watching?.[p.sid]);
      if (v > 1 && boost(el, v, muted)) {
        // acima de 100%: o som sai amplificado pelo Web Audio; o elemento fica mudo só para manter o áudio chegando
        el.volume = 1;
        el.muted = true;
      } else {
        unboost(el);
        el.volume = Math.max(0, Math.min(1, v));
        el.muted = muted;
      }
      if (el.setSinkId && st.outputDevice && st.outputDevice !== 'default') el.setSinkId(st.outputDevice).catch(() => {});
    }
  }
  const ctx = boosts.size && audioCtx();
  if (ctx?.setSinkId) ctx.setSinkId(st.outputDevice && st.outputDevice !== 'default' ? st.outputDevice : '').catch(() => {});
}
// volume acima de 100% (até 200%): elemento de áudio não passa de 1, então usa um ganho do Web Audio
const boosts = new Map();
function boost(el, v, muted) {
  try {
    let b = boosts.get(el);
    if (!b) {
      const ctx = audioCtx();
      if (ctx.state !== 'running') return false;
      const src = ctx.createMediaStreamSource(el.srcObject);
      const gain = ctx.createGain();
      src.connect(gain).connect(ctx.destination);
      b = { src, gain };
      boosts.set(el, b);
    }
    b.gain.gain.value = muted ? 0 : Math.min(2, v);
    return true;
  } catch { return false; }
}
function unboost(el) {
  const b = el && boosts.get(el);
  if (!b) return;
  try { b.src.disconnect(); b.gain.disconnect(); } catch {}
  boosts.delete(el);
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
    an.fftSize = 2048; // ~43 ms de áudio por leitura (antes 10 ms: pegava o silêncio entre as sílabas)
    src.connect(an);
    levels.set(key, { an, src, uid, filter, data: new Float32Array(an.fftSize) });
  } catch {}
  startLevels();
}
const startLevels = () => { if (!levelTimer) levelTimer = setInterval(tickLevels, 80); };
// nível de áudio que o próprio WebRTC mede em cada pacote recebido (preciso e sem custo extra)
const hasRtpLevels = typeof RTCRtpReceiver !== 'undefined' && 'getSynchronizationSources' in RTCRtpReceiver.prototype;
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
    if (rms > 0.011) speakingHold[l.uid] = now;
  }
  if (hasRtpLevels) {
    for (const p of peers.values()) {
      for (const r of p.pc.getReceivers()) {
        if (r.track?.kind !== 'audio' || r.track.readyState !== 'live') continue;
        // só a voz (não o som da tela nem a música compartilhada)
        const stream = [...p.remote.values()].find((st) => st.getAudioTracks().includes(r.track));
        const kind = stream ? p.kindOf(stream.id) : 'mic';
        if (kind === 'screen' || kind === 'music') continue;
        const lvl = r.getSynchronizationSources()[0]?.audioLevel;
        if (lvl > 0.012) speakingHold[p.userId] = now;
      }
    }
  }
  for (const [uid, t] of Object.entries(speakingHold)) if (now - t < 420) speaking[uid] = true;
  const prev = S.speaking;
  const changed = Object.keys(speaking).length !== Object.keys(prev).length || Object.keys(speaking).some((k) => !prev[k]);
  if (changed) set((s) => { s.speaking = speaking; });
}

// ---------- microfone ----------
/** microfone com os ajustes do usuário. Supressão "inteligente" = RNNoise (a do navegador fica desligada para não brigar) */
export async function getMic() {
  const st = S.settings;
  const mode = st.noiseMode || 'smart';
  const base = { echoCancellation: st.echoCancellation, noiseSuppression: mode === 'basic', autoGainControl: st.autoGain, channelCount: 1, sampleRate: 48000 };
  let raw;
  try {
    raw = await navigator.mediaDevices.getUserMedia({ audio: { ...base, ...(st.inputDevice !== 'default' ? { deviceId: { exact: st.inputDevice } } : {}) } });
  } catch (e) {
    if (st.inputDevice !== 'default' && e.name === 'OverconstrainedError') raw = await navigator.mediaDevices.getUserMedia({ audio: base });
    else throw e;
  }
  if (mode !== 'smart') return withMicGain(raw);
  try {
    const { denoise } = await import('./noise.js');
    return withMicGain(await denoise(raw));
  } catch (e) {
    console.warn('RNNoise indisponível, usando o microfone direto', e);
    return withMicGain(raw);
  }
}
// volume do microfone (0–200%): ganho do Web Audio entre o microfone e o que é enviado
const micGains = new Set();
let micReloading = false;
function withMicGain(stream) {
  if ((S.settings.micVolume ?? 1) === 1) return stream;
  try {
    const ctx = audioCtx();
    if (ctx.state !== 'running') return stream; // áudio do navegador ainda bloqueado: manda o microfone direto
    const src = ctx.createMediaStreamSource(stream);
    const g = ctx.createGain();
    g.gain.value = S.settings.micVolume ?? 1;
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 1;
    src.connect(g).connect(dest);
    micGains.add(g);
    const out = dest.stream;
    out.cleanup = () => {
      try { src.disconnect(); g.disconnect(); } catch {}
      micGains.delete(g);
      if (stream.cleanup) stream.cleanup();
      else stream.getTracks().forEach((t) => t.stop());
    };
    return out;
  } catch { return stream; }
}
export function setMicVolume(v) {
  const was = S.settings.micVolume ?? 1;
  setSettings({ micVolume: v });
  for (const g of micGains) g.gain.value = v;
  // saiu de 100% e o microfone da chamada ainda vai direto: refaz com o ganho
  if (v !== 1 && was === 1 && !micGains.size && !micReloading) { micReloading = true; reloadMic().finally(() => { micReloading = false; }); }
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
      signal: routeSignal,
      watch: onWatch,
      nsignal: onNativeSignal,
    });
  } catch {
    toast('Não foi possível conectar à chamada.', 'err');
    return leave(true);
  }
  await publish();
  patchCall({ connecting: false });
  clearInterval(healTimer);
  healTimer = setInterval(heal, 2000);
  sounds.join();
  onVoiceUpdate(roomId, S.voice[roomId] || []);
}

// entrega o sinal para a conexão certa; se o outro lado refez a conexão (id novo), refaz a nossa também
function routeSignal(m) {
  let p = peers.get(m.from);
  if (!p) return queueEarly(m);
  const d = m.data || {};
  if (d.hello) {
    // o outro lado está sem conexão (ou sem o meu som) há um tempo: quem inicia refaz
    if (p.initiator && (d.nomedia || p.pc.connectionState !== 'connected')) resetPeer(m.from);
    return;
  }
  if (d.pid) {
    if (!p.remotePid) p.remotePid = d.pid;
    else if (d.pid !== p.remotePid) {
      if (d.description?.type !== 'offer') return; // resto de uma conexão antiga
      p = resetPeer(m.from);
      p.remotePid = d.pid;
    }
  }
  p.onSignal(d);
}
function resetPeer(sid) {
  const old = peers.get(sid);
  if (!old) return null;
  old.close();
  const n = new Peer(sid, old.userId);
  n.state = old.state;
  n.wantsScreen = old.wantsScreen;
  n.screenHint = old.screenHint;
  n.resets = (old.resets || 0) + 1; // refez várias vezes seguidas: espera mais antes da próxima (rede/PC lento)
  peers.set(sid, n);
  bump();
  return n;
}
// vigia das conexões: refaz a que caiu ou nunca conectou (antes ficava "sem ouvir" para sempre)
let healTimer = null;
function heal() {
  if (!S.call) return;
  onVoiceUpdate(S.call.roomId, S.voice[S.call.roomId] || []); // confere quem sumiu da presença (prazo de espera)
  const now = Date.now();
  for (const [sid, p] of peers) {
    const st = p.pc.connectionState;
    if (st === 'connected') { if (now - p.born > 30000) p.resets = 0; checkMedia(sid, p, now); continue; }
    const age = now - p.born;
    const bad = p.badSince ? now - p.badSince : 0;
    const slow = Math.min(4, 1 + (p.resets || 0) * 0.75);
    if (p.initiator) {
      if (st === 'closed' || st === 'failed' || bad > 8000 * slow || age > 20000 * slow) resetPeer(sid);
    } else if (st === 'closed' || bad > 12000 * slow || age > 26000 * slow) {
      p.born = now; p.badSince = 0;
      api.sendSignal(sid, { hello: true, pid: p.pid });
    }
  }
}

/** conectado mas o som do outro não chega (ele tem microfone): a conexão ficou capenga, refaz */
async function checkMedia(sid, p, now) {
  const hasMic = Object.values(p.state?.streams || {}).includes('mic');
  if (!hasMic || now - p.born < 10000) { p.silentSince = 0; return; }
  let bytes = 0;
  try { (await p.pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') bytes += r.bytesReceived || 0; }); } catch { return; }
  if (bytes > (p.lastBytes || 0)) { p.lastBytes = bytes; p.silentSince = 0; return; }
  if (!p.silentSince) { p.silentSince = now; return; }
  if (now - p.silentSince < 8000 || peers.get(sid) !== p) return;
  p.silentSince = 0;
  if (p.initiator) resetPeer(sid);
  else { p.born = now; api.sendSignal(sid, { hello: true, nomedia: true, pid: p.pid }); }
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
  const roomId = S.call.roomId;
  const alone = !(S.voice[roomId] || []).some((p) => p.sid !== api.clientId);
  if (S.outgoing?.dmId === roomId) cancelOutgoing();
  else if (alone) closeCallLog(roomId);
  // se o outro saiu ao mesmo tempo, a presença demora um pouco: confere de novo
  else setTimeout(() => { if (!(S.voice[roomId] || []).length && S.call?.roomId !== roomId) closeCallLog(roomId); }, 5000);
  if (local.native) await stopNativeScreen();
  clearInterval(healTimer); healTimer = null;
  for (const p of peers.values()) p.close();
  peers.clear();
  early.clear();
  lastCount = 0;
  stopLocal('mic'); stopLocal('cam'); local.sysAudio?.stop(); local.sysAudio = null; stopLocal('screen'); stopMusic(true);
  for (const k of [...levels.keys()]) unwatchLevel(k);
  clearInterval(levelTimer); levelTimer = null;
  set((s) => { s.call = null; s.speaking = {}; s.ui = { ...s.ui, theater: null, callExpanded: false, callCollapsed: false }; });
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  api.setVoicePresence(null, null); // não espera: sair da chamada é imediato
  await api.leaveRoomChannel();
  if (!silent) sounds.leave();
}

function stopLocal(kind) {
  const s = local[kind];
  if (!s) return;
  s.getTracks().forEach((t) => t.stop());
  s.cleanup?.();
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
      const waiting = early.get(p.sid) || [];
      early.delete(p.sid);
      for (const d of waiting) routeSignal({ from: p.sid, data: d });
      if (settled) sounds.peerJoin();
    }
    peer.missingSince = 0;
    const wasSharing = !!peer.state?.screen;
    peer.state = p.state || {};
    // alguém começou/parou de transmitir: som (como no Discord)
    if (settled && !wasSharing && peer.state.screen) sounds.streamStart();
    if (settled && wasSharing && !peer.state.screen) sounds.streamStop();
    if (!peer.state.screen && watching[p.sid]) watching = { ...watching, [p.sid]: false };
  }
  // sumiu da presença: espera um pouco antes de desligar (a presença pisca quando a rede oscila
  // e desligar na hora deixava a conexão do outro lado "pendurada", um sem ouvir o outro)
  const now = Date.now();
  for (const [sid, peer] of peers) {
    if (seen.has(sid)) continue;
    if (!peer.missingSince) peer.missingSince = now;
    if (now - peer.missingSince < GRACE && peer.pc.connectionState !== 'closed') { seen.add(sid); continue; }
    peer.close();
    peers.delete(sid);
    sounds.peerLeave();
    if (watching[sid]) watching = { ...watching, [sid]: false };
  }
  const f = S.call.focus;
  const focus = f && typeof f === 'object' && !seen.has(f.sid) && f.sid !== api.clientId ? null : f;
  if (watching !== S.call.watching || focus !== f) patchCall({ watching, focus });
  if (peers.size !== lastCount) { lastCount = peers.size; tuneGroup(); }
  applyVolumes();
}
const GRACE = 10000;
let lastCount = 0;
/** chamada grande: cada um manda áudio/câmera para todos (malha), então baixa o peso conforme cresce */
function groupScale() {
  const n = peers.size + 1;
  return n <= 4 ? 1 : n <= 8 ? 0.6 : n <= 12 ? 0.4 : 0.25;
}
function tuneGroup() {
  const k = groupScale();
  for (const p of peers.values()) {
    for (const kind of ['mic', 'cam']) {
      for (const t of p.tx[kind] || []) {
        const prm = t.sender.getParameters();
        if (!prm.encodings?.length) continue;
        const base = encodings(kind, t.sender.track?.kind || 'audio')[0];
        prm.encodings[0].maxBitrate = base.maxBitrate;
        if (base.scaleResolutionDownBy) prm.encodings[0].scaleResolutionDownBy = base.scaleResolutionDownBy;
        t.sender.setParameters(prm).catch(() => {});
      }
    }
  }
}

function onWatch({ from, watch, q }) {
  const p = peers.get(from);
  if (!p) { pendingWatch.set(from, watch); return; }
  if (q) { p.screenHint = q; p.applyScreenHint(); }
  if (p.wantsScreen === watch) return; // só a dica de qualidade mudou
  p.wantsScreen = watch;
  if (local.screen || local.native) { if (watch) sounds.viewerJoin(); else sounds.viewerLeave(); setTimeout(publish, 0); }
  if (local.native) {
    if (watch) nativeOffer(from); else local.native.plugin.closePeer({ peerId: from }).catch(() => {});
    return;
  }
  if (!local.screen) return;
  if (watch) { p.send('screen', local.screen); p.applyScreenHint(); } else p.unsend('screen');
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
  // no app do Windows o som vem do audiocap.exe (sem as vozes da chamada); o Electron captura só o vídeo
  const nativeAudio = !!(opts.audio && window.perfumolandiaDesktop?.startSysAudio);
  if (opts.sourceId && window.perfumolandiaDesktop?.selectSource) await window.perfumolandiaDesktop.selectSource(opts.sourceId, opts.audio && !nativeAudio);
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { max: q.w }, height: { max: q.h }, frameRate: { ideal: q.fps, max: q.fps } },
      // restrictOwnAudio: não captura as vozes da própria chamada (evita eco para quem assiste)
      audio: opts.audio && !nativeAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true, suppressLocalAudioPlayback: false } : false,
      systemAudio: opts.audio ? 'include' : 'exclude',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  } catch (e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast('Não foi possível capturar a tela: ' + e.message, 'err');
    return;
  }
  if (nativeAudio) {
    const sa = await startSysAudio('screen', { source: opts.sourceId });
    if (sa) { stream.addTrack(sa.track); local.sysAudio = sa; } else toast('Não deu para capturar o som do PC; a tela vai sem som.');
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
  local.sysAudio?.stop();
  local.sysAudio = null;
  stopLocal('screen');
  local.screenOpts = null;
  patchCall({ screenLabel: null, focus: S.call?.focus?.sid === api.clientId ? null : S.call?.focus });
  if (!silent) publish();
}

// ---------- música do Spotify na chamada (entra como um "participante" que toca a música) ----------
export async function startMusic() {
  if (!S.call || local.music) return;
  const pid = S.myMusic?.pid;
  if (!pid) { toast('Abra uma música no Spotify do PC para compartilhar.'); return; }
  const sa = await startSysAudio('music', { pid });
  if (!sa) { toast('Não deu para pegar o som do Spotify.', 'err'); return; }
  local.music = new MediaStream([sa.track]);
  local.musicCap = sa;
  for (const p of peers.values()) p.send('music', local.music);
  patchCall({ music: true });
  publish();
  sounds.streamStart();
}
export function stopMusic(silent) {
  if (!local.music) return;
  for (const p of peers.values()) p.unsend('music');
  local.musicCap?.stop();
  local.musicCap = null;
  local.music = null;
  if (S.call) patchCall({ music: false });
  if (!silent) publish();
}
export const isSharingMusic = () => !!local.music;
/** música trocou no Spotify: atualiza o que os outros veem (o som já segue sozinho) */
export const refreshMusic = () => { if (local.music) publish(); };

/** tamanho da minha tela e se a janela está escondida (quem transmite ajusta a qualidade só para mim) */
const viewHint = () => ({ h: Math.round((window.screen?.height || 1080) * (window.devicePixelRatio || 1)), hidden: document.hidden });
document.addEventListener('visibilitychange', () => {
  for (const [sid, on] of Object.entries(S.call?.watching || {})) if (on) api.sendWatch(sid, true, viewHint());
});
export function watch(sid, on) {
  if (!S.call) return;
  patchCall({ watching: { ...S.call.watching, [sid]: on }, focus: on ? { sid, kind: 'screen' } : S.call.focus?.sid === sid ? null : S.call.focus });
  if (!on) peers.get(sid)?.closeNativeRx();
  api.sendWatch(sid, on, on ? viewHint() : null);
  if (on) sounds.viewerJoin();
  applyVolumes();
}
export const setFocus = (focus) => patchCall({ focus });

/** reaplica dispositivos/ajustes de áudio durante a chamada */
export async function reloadMic() {
  if (!S.call || !local.mic) return;
  try {
    const m = await getMic();
    const track = m.getAudioTracks()[0];
    const prev = local.mic;
    unwatchLevel(prev.id);
    prev.getTracks().forEach((t) => t.stop());
    prev.cleanup?.();
    local.mic = m;
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
export const myViewers = () => [...new Set([...peers.values()].filter((p) => p.wantsScreen).map((p) => p.userId))];
export const isSharing = () => !!local.screen || !!local.native;
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
