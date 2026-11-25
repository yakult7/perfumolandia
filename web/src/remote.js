// Controle remoto entre amigos (estilo AnyDesk).
// Quem quer ajudar PEDE; o dono do PC (app do Windows) vê o pedido e ACEITA ou recusa.
// Aceitando: a tela principal vai por WebRTC e o mouse/teclado voltam por um canal de dados.
// O dono vê uma faixa vermelha o tempo todo e encerra pelo botão ou Ctrl+Alt+F12.
import { S, set } from './store.js';
import * as api from './api.js';
import { toast } from './actions.js';
import { sounds } from './sounds.js';
import { TURN } from './config.js';

const ICE = () => [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...(TURN ? [TURN] : [])];
let pc = null, dc = null, stream = null, askTimer = 0;
const desk = () => window.perfumolandiaDesktop;
const setRemote = (r) => set((s) => { s.remote = r; });
const isFriend = (uid) => Object.values(S.relations).some((r) => r.status === 'accepted' && ((r.from === uid && r.to === S.uid) || (r.to === uid && r.from === S.uid)));

/** o amigo pode ser controlado? (está no app do Windows) */
export const canControl = (uid) => !!S.pcs?.[uid] && isFriend(uid);

// ---------- quem pede ----------
export function requestControl(uid) {
  if (S.remote) return toast('Já existe um acesso remoto aberto.');
  const id = Math.random().toString(36).slice(2, 10);
  setRemote({ role: 'viewer', peer: uid, id, state: 'asking' });
  api.sendEvent({ type: 'rc-req', to: uid, id });
  clearTimeout(askTimer);
  askTimer = setTimeout(() => { if (S.remote?.id === id && S.remote.state === 'asking') { end(false); toast('Sem resposta ao pedido de acesso.'); } }, 45000);
}

// ---------- dono do PC ----------
export async function acceptControl() {
  const inc = S.rcIncoming;
  if (!inc) return;
  set((s) => { s.rcIncoming = null; });
  sounds.stopRing();
  const d = desk();
  const info = await d?.rcStart?.();
  if (!info?.sourceId) { api.sendEvent({ type: 'rc-deny', to: inc.from, id: inc.id, why: 'erro' }); return toast('Não deu para liberar o controle neste PC.', 'err'); }
  try {
    await d.selectSource(info.sourceId, false);
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: false });
  } catch {
    d.rcStop();
    api.sendEvent({ type: 'rc-deny', to: inc.from, id: inc.id, why: 'erro' });
    return;
  }
  const v = stream.getVideoTracks()[0];
  v.contentHint = 'detail';
  v.addEventListener('ended', () => stopControl());
  setRemote({ role: 'host', peer: inc.from, id: inc.id, state: 'connecting' });
  pc = newPc(inc.from, inc.id);
  pc.addTransceiver(v, { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: 8_000_000, maxFramerate: 30 }] });
  dc = pc.createDataChannel('input', { ordered: true });
  dc.onmessage = (e) => { try { d.rcInput(JSON.parse(e.data)); } catch {} };
  dc.onopen = () => S.remote && setRemote({ ...S.remote, state: 'live' });
  await pc.setLocalDescription();
  api.sendEvent({ type: 'rc-sig', to: inc.from, id: inc.id, description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  d.onRcStop?.(() => stopControl());
}
export function declineControl() {
  const inc = S.rcIncoming;
  if (!inc) return;
  sounds.stopRing();
  set((s) => { s.rcIncoming = null; });
  api.sendEvent({ type: 'rc-deny', to: inc.from, id: inc.id });
}

function newPc(peer, id) {
  const p = new RTCPeerConnection({ iceServers: ICE() });
  p.onicecandidate = ({ candidate }) => candidate && api.sendEvent({ type: 'rc-sig', to: peer, id, candidate: candidate.toJSON() });
  p.onconnectionstatechange = () => { if (['failed', 'closed'].includes(p.connectionState) && pc === p) { toast('O acesso remoto caiu.'); end(false); } };
  return p;
}

/** encerra dos dois lados */
export function stopControl() { end(true); }
function end(notify) {
  const r = S.remote;
  clearTimeout(askTimer);
  if (notify && r) api.sendEvent({ type: 'rc-end', to: r.peer, id: r.id });
  if (r?.role === 'host') desk()?.rcStop?.();
  try { dc?.close(); } catch {}
  try { pc?.close(); } catch {}
  stream?.getTracks().forEach((t) => t.stop());
  pc = dc = stream = null;
  setRemote(null);
}

/** viewer: manda um comando (mouse/teclado) para o PC do amigo */
export function sendInput(m) {
  if (dc?.readyState === 'open') dc.send(JSON.stringify(m));
}
export const remoteStream = () => stream;

// ---------- sinais (chegam pelo canal global) ----------
export async function onRemoteEvent(e) {
  const r = S.remote;
  switch (e.type) {
    case 'rc-req':
      // celular/navegador da mesma conta ficam quietos: só o app do Windows pode aceitar
      // (antes o celular respondia "indisponível" e cancelava o pedido antes do PC aceitar)
      if (!desk()?.rcStart || !isFriend(e.from) || S.settings.blocked?.[e.from]) return;
      if (S.remote || S.rcIncoming) return api.sendEvent({ type: 'rc-deny', to: e.from, id: e.id, why: 'ocupado' });
      set((s) => { s.rcIncoming = { from: e.from, id: e.id }; });
      sounds.ring(false);
      desk()?.attention?.();
      setTimeout(() => { if (S.rcIncoming?.id === e.id) { declineControl(); } }, 40000);
      break;
    case 'rc-deny':
      if (r?.id !== e.id) return;
      end(false);
      toast(e.why === 'indisponivel' ? 'Seu amigo precisa estar no app do Windows para liberar o acesso.' : e.why === 'ocupado' ? 'Seu amigo já está em outro acesso remoto.' : `${S.users[e.from]?.displayName || 'Seu amigo'} não liberou o acesso.`);
      break;
    case 'rc-end':
      if (r?.id === e.id) { end(false); toast('Acesso remoto encerrado.'); }
      if (S.rcIncoming?.id === e.id) { sounds.stopRing(); set((s) => { s.rcIncoming = null; }); }
      break;
    case 'rc-sig': {
      if (r?.id !== e.id || e.from !== r.peer) return;
      if (e.description?.type === 'offer' && r.role === 'viewer') {
        clearTimeout(askTimer);
        pc = newPc(r.peer, r.id);
        pc.ontrack = (ev) => { stream = ev.streams[0] || new MediaStream([ev.track]); setRemote({ ...S.remote, state: 'live', v: Date.now() }); };
        pc.ondatachannel = (ev) => { dc = ev.channel; };
        setRemote({ ...r, state: 'connecting' });
        await pc.setRemoteDescription(e.description);
        await pc.setLocalDescription();
        api.sendEvent({ type: 'rc-sig', to: r.peer, id: r.id, description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      } else if (e.description?.type === 'answer' && r.role === 'host') {
        await pc?.setRemoteDescription(e.description);
      } else if (e.candidate) {
        await pc?.addIceCandidate(e.candidate).catch(() => {});
      }
      break;
    }
  }
}
