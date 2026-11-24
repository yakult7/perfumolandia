import { S, set, setUI, persist } from './store.js';
import * as api from './api.js';
import * as rtc from './rtc.js';
import { sounds } from './sounds.js';

let toastId = 0;
export function toast(text, kind = '') {
  const id = ++toastId;
  set((s) => { s.ui = { ...s.ui, toasts: [...s.ui.toasts, { id, text, kind }].slice(-4) }; });
  setTimeout(() => set((s) => { s.ui = { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) }; }), 3800);
}
/** executa uma promessa mostrando erro (e mensagem de sucesso opcional) */
export const run = (p, ok) => p.then((r) => { if (ok) toast(ok); return r; }).catch((e) => { toast(e.message, 'err'); throw e; });
export const safe = (p, ok) => run(p, ok).catch(() => null);

export const statusOf = (s, uid) => s.online[uid] || 'offline';

export const openModal = (name, props = {}) => setUI({ modal: { name, ...props }, menu: null });
export const closeModal = () => setUI({ modal: null });
/** items: [{label, icon, danger, onClick} | {sep:true}] */
export const openMenu = (e, items, opts = {}) => {
  e.preventDefault?.();
  e.stopPropagation?.();
  const r = e.currentTarget?.getBoundingClientRect?.();
  const useAnchor = opts.anchor && r;
  setUI({
    menu: {
      x: useAnchor ? r.left : e.clientX ?? r?.left ?? 0,
      y: useAnchor ? r.bottom + 8 : e.clientY ?? r?.bottom ?? 0,
      above: useAnchor ? r.top - 8 : null,
      items,
      key: Math.random(),
    },
  });
};
export const closeMenu = () => setUI({ menu: null });

export function go(serverId, channelId) {
  if (serverId && !channelId) {
    const sv = S.servers[serverId];
    const last = S.lastChannel[serverId];
    channelId = sv?.channels.find((c) => c.id === last && c.type === 'text')?.id || sv?.channels.find((c) => c.type === 'text')?.id || null;
  }
  set((s) => {
    s.view = { ...s.view, serverId, channelId };
    if (serverId && channelId) { s.lastChannel = { ...s.lastChannel, [serverId]: channelId }; persist('lastChannel', s.lastChannel); }
    s.ui = { ...s.ui, pane: channelId ? 'chat' : 'list', tab: serverId ? 'home' : channelId ? 'dms' : s.ui.tab };
  });
  if (channelId) {
    markRead(channelId);
    loadMessages(channelId);
  }
}
export const goHome = (tab) => set((s) => {
  s.view = { serverId: null, channelId: null, homeTab: tab || s.view.homeTab };
  s.ui = { ...s.ui, pane: 'list' };
});
export const back = () => setUI({ pane: 'list' });

export function markRead(cid) {
  const last = S.lastIds[cid];
  if (!last || S.readIds[cid] === last) return;
  set((s) => { s.readIds = { ...s.readIds, [cid]: last }; });
  persist('readIds', S.readIds);
}
export const isUnread = (s, cid) => !!s.lastIds[cid] && s.readIds[cid] !== s.lastIds[cid] && s.view.channelId !== cid;

export async function loadMessages(cid, older = false) {
  const box = S.messages[cid];
  if (!older && box) return;
  if (older && (!box || !box.hasMore || box.loading)) return;
  set((s) => { s.messages = { ...s.messages, [cid]: { list: [], hasMore: true, ...box, loading: true } }; });
  try {
    const list = await api.fetchMessages(cid, older ? box.list.find((m) => !m.pending)?.createdAt : null);
    set((s) => {
      const cur = s.messages[cid]?.list || [];
      const merged = older ? [...list, ...cur] : [...list, ...cur.filter((m) => !list.some((x) => x.id === m.id))];
      s.messages = { ...s.messages, [cid]: { list: merged, hasMore: list.length === 50, loading: false } };
    });
  } catch (e) {
    set((s) => { s.messages = { ...s.messages, [cid]: { list: s.messages[cid]?.list || [], hasMore: false, loading: false } }; });
    toast(e.message, 'err');
  }
}

export async function sendMessage(cid, content, attachments = [], replyTo = null) {
  const nonce = 'tmp-' + Date.now() + Math.random();
  const pending = { id: nonce, channelId: cid, authorId: S.uid, content, attachments, replyTo, reactions: {}, createdAt: Date.now(), pending: true };
  const patch = (fn) => set((s) => {
    const box = s.messages[cid] || { list: [], hasMore: false };
    s.messages = { ...s.messages, [cid]: { ...box, list: fn(box.list) } };
  });
  patch((l) => [...l, pending]);
  try {
    const msg = await api.insertMessage({ channelId: cid, content, attachments, replyTo });
    patch((l) => {
      const out = l.filter((m) => m.id !== nonce);
      return out.some((m) => m.id === msg.id) ? out : [...out, msg];
    });
    set((s) => { s.lastIds = { ...s.lastIds, [cid]: msg.id }; });
    markRead(cid);
  } catch (e) {
    patch((l) => l.map((m) => (m.id === nonce ? { ...m, pending: false, failed: true } : m)));
    toast(e.message, 'err');
  }
}

export async function openDM(userId) {
  const dm = await run(api.openDmRow(userId));
  go(null, dm.id);
  return dm;
}

export async function callDM(dmId) {
  await rtc.join(dmId);
  const others = (S.voice[dmId] || []).filter((p) => p.userId !== S.uid);
  if (others.length) return;
  const to = roomMembers(dmId).filter((m) => m !== S.uid);
  set((s) => { s.outgoing = { dmId, msgId: null }; });
  sounds.ring(true);
  // registro "fulano iniciou uma chamada" no chat
  const log = await api.insertCallLog(dmId).catch(() => null);
  if (S.outgoing?.dmId === dmId) set((s) => { s.outgoing = { ...s.outgoing, msgId: log?.id || null }; });
  const ring = () => api.sendEvent({ type: 'ring', dmId, to, msgId: log?.id || null });
  ring();
  // reenvia o toque a cada 8s (caso a pessoa abra o app depois)
  const again = setInterval(() => {
    if (S.outgoing?.dmId !== dmId) return clearInterval(again);
    ring();
  }, 8000);
  setTimeout(() => {
    if (S.outgoing?.dmId !== dmId) return;
    cancelOutgoing();
    toast('Ninguém atendeu.');
  }, 45000);
}
/** para de chamar; se ninguém atendeu, vira "chamada perdida" */
export function cancelOutgoing() {
  const o = S.outgoing;
  if (!o) return;
  const to = roomMembers(o.dmId).filter((m) => m !== S.uid);
  api.sendEvent({ type: 'ring-cancel', dmId: o.dmId, to });
  if (o.msgId) api.setCallStatus(o.msgId, 'missed');
  sounds.stopRing();
  set((s) => { s.outgoing = null; });
}
export async function acceptCall() {
  const inc = S.incoming;
  if (!inc) return;
  sounds.stopRing();
  set((s) => { s.incoming = null; });
  go(null, inc.dmId);
  await rtc.join(inc.dmId);
  if (inc.msgId) api.setCallStatus(inc.msgId, 'answered');
  setUI({ callOpen: true });
}
export function declineCall() {
  const inc = S.incoming;
  if (!inc) return;
  sounds.stopRing();
  set((s) => { s.incoming = null; });
  // em grupo, recusar não encerra a chamada dos outros
  if (inc.msgId && S.dms[inc.dmId]) api.setCallStatus(inc.msgId, 'declined');
  api.sendEvent({ type: 'ring-decline', dmId: inc.dmId, to: inc.from });
}
/** chamada direta/grupo ficou vazia: fecha o registro com a duração */
export async function closeCallLog(roomId) {
  if (!S.dms[roomId] && !S.groups[roomId]) return;
  const log = await api.latestCallLog(roomId).catch(() => null);
  if (!log) return;
  const st = log.meta?.status || 'ringing';
  if (st === 'answered') api.setCallStatus(log.id, 'ended');
  else if (st === 'ringing') api.setCallStatus(log.id, 'missed');
}

export const dmPartner = (dm) => S.users[dm.members.find((m) => m !== S.uid)] || { displayName: 'Desconhecido', username: '?' };
export const userName = (id) => S.users[id]?.displayName || 'Alguém';
export const roomMembers = (roomId) => S.dms[roomId]?.members || S.groups[roomId]?.members || [];
export const groupName = (g) => g.name || g.members.filter((m) => m !== S.uid).map((m) => S.users[m]?.displayName || '?').join(', ') || 'Grupo';
export const roomName = (roomId) => {
  if (S.dms[roomId]) return dmPartner(S.dms[roomId]).displayName;
  if (S.groups[roomId]) return groupName(S.groups[roomId]);
  for (const sv of Object.values(S.servers)) {
    const c = sv.channels.find((x) => x.id === roomId);
    if (c) return c.name;
  }
  return 'Chamada';
};
export const serverOfRoom = (roomId) => Object.values(S.servers).find((sv) => sv.channels.some((c) => c.id === roomId)) || null;

export function notifyDesktop(m) {
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  if (window.perfumolandiaDesktop?.notify) {
    const u = S.users[m.authorId];
    window.perfumolandiaDesktop.notify({
      title: m.call ? `${u?.displayName} está te ligando` : u?.displayName || 'Perfumolandia',
      body: m.call ? 'Clique para abrir' : (m.content || 'Anexo').slice(0, 140),
    });
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const u = S.users[m.authorId];
  try {
    const n = new Notification(m.call ? `📞 ${u?.displayName} está te ligando` : u?.displayName || 'Perfumolandia', {
      body: m.call ? 'Clique para abrir' : (m.content || '📎 Anexo').slice(0, 140),
      icon: u?.avatar || './icons/icon-192.png',
      tag: m.channelId,
      silent: true,
    });
    n.onclick = () => { window.focus(); go(serverOfRoom(m.channelId)?.id || null, m.channelId); n.close(); };
  } catch {}
}

export async function enableNotifications() {
  if (!('Notification' in window)) throw new Error('Este aparelho não suporta notificações aqui. No iPhone, instale o app na Tela de Início primeiro.');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Permissão de notificação negada.');
}
