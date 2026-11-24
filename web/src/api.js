// Camada de dados: Supabase (auth, banco, tempo real, arquivos). Sem servidor próprio.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from './config.js';
import { S, set } from './store.js';
import { sounds } from './sounds.js';
import * as rtc from './rtc.js';
import { toast, markRead, notifyDesktop, go } from './actions.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'perfumolandia-auth' },
  realtime: { params: { eventsPerSecond: 40 } },
});

/** id desta aba/dispositivo (identifica o participante na chamada) */
export const clientId = (crypto.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, '').slice(0, 16);

const must = ({ data, error }) => {
  if (error) throw new Error(translate(error.message));
  return data;
};
function translate(m = '') {
  if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
  if (/User already registered/i.test(m)) return 'Esse usuário já existe.';
  if (/duplicate key.*username/i.test(m)) return 'Esse nome de usuário já existe.';
  if (/relations_pair/i.test(m)) return 'Já existe um pedido ou amizade com essa pessoa.';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit/i.test(m)) return 'Muitas tentativas. Espere um pouco.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem internet ou servidor fora do ar.';
  return m;
}

// ---------- normalização ----------
export const mapUser = (p) => ({
  id: p.id, username: p.username, displayName: p.display_name, avatar: p.avatar_url, color: p.color,
  chosenStatus: p.status, customStatus: p.custom_status, bio: p.bio,
});
export const mapMsg = (m) => ({
  id: m.id, channelId: m.channel_id, authorId: m.author_id, content: m.content, attachments: m.attachments || [],
  replyTo: m.reply_to, reactions: m.reactions || {}, createdAt: Date.parse(m.created_at), editedAt: m.edited_at ? Date.parse(m.edited_at) : null,
});
const mapRel = (r) => ({ id: r.id, from: r.from_id, to: r.to_id, status: r.status });
const mapDm = (d) => ({ id: d.id, members: [d.user_a, d.user_b] });
const mapServer = (s, members = [], channels = []) => ({
  id: s.id, name: s.name, icon: s.icon_url, ownerId: s.owner_id, invite: s.invite, members,
  channels: channels.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)).map((c) => ({ id: c.id, name: c.name, type: c.type, position: c.position, created_at: c.created_at })),
});

// ---------- autenticação ----------
const emailOf = (u) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
const validUser = (u) => /^[a-z0-9_.]{3,20}$/.test(u);

export async function register({ username, password, displayName, code }) {
  const u = username.trim().toLowerCase();
  if (!validUser(u)) throw new Error('Usuário: 3 a 20 caracteres (letras minúsculas, números, _ ou .).');
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const okCode = must(await sb.rpc('check_invite', { code }));
  if (!okCode) throw new Error('Código de convite incorreto.');
  const { error } = await sb.auth.signUp({ email: emailOf(u), password });
  if (error && !/already registered/i.test(error.message)) throw new Error(translate(error.message));
  if (error) {
    // conta já existe: só continua se a senha bater (ex.: cadastro anterior interrompido)
    const r = await sb.auth.signInWithPassword({ email: emailOf(u), password });
    if (r.error) throw new Error('Esse usuário já existe.');
  }
  must(await sb.rpc('create_profile', { p_username: u, p_display_name: displayName || u, p_code: code }));
  await start();
}

export async function login({ username, password }) {
  must(await sb.auth.signInWithPassword({ email: emailOf(username), password }));
  await start();
}

export async function logout() {
  rtc.leave(true);
  await teardown();
  await sb.auth.signOut().catch(() => {});
  set((s) => { s.me = null; s.ready = false; s.authed = false; });
}

export async function changePassword(password) {
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  must(await sb.auth.updateUser({ password }));
}

// ---------- carga inicial ----------
let started = false;
export async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { set((s) => { s.authed = false; s.booting = false; }); return; }
  const uid = session.user.id;
  const me = must(await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  if (!me) {
    // conta criada mas sem perfil (convite errado em cadastro anterior)
    set((s) => { s.authed = false; s.booting = false; s.needsProfile = true; });
    return;
  }
  await loadAll(uid);
  if (!started) { started = true; subscribeRealtime(uid); }
  set((s) => { s.authed = true; s.booting = false; s.ready = true; s.needsProfile = false; });
  handleDeepLink();
}

async function loadAll(uid) {
  const [profiles, relations, servers, members, channels, dms, last, code] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('relations').select('*'),
    sb.from('servers').select('*'),
    sb.from('server_members').select('server_id,user_id'),
    sb.from('channels').select('*'),
    sb.from('dms').select('*'),
    sb.rpc('last_messages'),
    sb.rpc('get_invite_code'),
  ].map((p) => p.then(must)));
  const users = Object.fromEntries(profiles.map((p) => [p.id, mapUser(p)]));
  const svs = {};
  for (const s of servers) {
    svs[s.id] = mapServer(s, members.filter((m) => m.server_id === s.id).map((m) => m.user_id), channels.filter((c) => c.server_id === s.id));
  }
  set((s) => {
    s.uid = uid;
    s.users = users;
    s.me = users[uid];
    s.relations = Object.fromEntries(relations.map((r) => [r.id, mapRel(r)]));
    s.servers = svs;
    s.dms = Object.fromEntries(dms.map((d) => [d.id, mapDm(d)]));
    s.lastIds = Object.fromEntries(last.filter((x) => x.message_id).map((x) => [x.channel_id, x.message_id]));
    s.inviteCode = code;
    s.messages = {};
  });
}

async function refreshServer(id) {
  const [srv, members, channels] = await Promise.all([
    sb.from('servers').select('*').eq('id', id).maybeSingle(),
    sb.from('server_members').select('server_id,user_id').eq('server_id', id),
    sb.from('channels').select('*').eq('server_id', id),
  ]);
  if (!srv.data) {
    set((s) => { const n = { ...s.servers }; delete n[id]; s.servers = n; });
    if (S.view.serverId === id) go(null);
    return;
  }
  set((s) => { s.servers = { ...s.servers, [id]: mapServer(srv.data, (members.data || []).map((m) => m.user_id), channels.data || []) }; });
}

// ---------- tempo real ----------
let dbChan, globalChan, roomChan;
const typingTimers = {};

function subscribeRealtime(uid) {
  dbChan = sb.channel('db-' + clientId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onMessageChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ({ new: p, eventType }) => {
      if (eventType === 'DELETE') return;
      set((s) => {
        s.users = { ...s.users, [p.id]: mapUser(p) };
        if (p.id === s.uid) s.me = s.users[p.id];
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relations' }, ({ new: r, old, eventType }) => set((s) => {
      const n = { ...s.relations };
      if (eventType === 'DELETE') delete n[old.id]; else n[r.id] = mapRel(r);
      s.relations = n;
    }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dms' }, ({ new: d, eventType }) => {
      if (eventType !== 'DELETE') set((s) => { s.dms = { ...s.dms, [d.id]: mapDm(d) }; });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, ({ new: n, old, eventType }) => {
      const id = eventType === 'DELETE' ? old.id : n.id;
      if (eventType === 'DELETE') {
        set((s) => { const x = { ...s.servers }; delete x[id]; s.servers = x; });
        if (S.view.serverId === id) go(null);
      } else refreshServer(id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, ({ new: n, old, eventType }) => {
      const sid = (eventType === 'DELETE' ? old : n).server_id;
      const user = (eventType === 'DELETE' ? old : n).user_id;
      if (eventType === 'DELETE' && user === uid) {
        set((s) => { const x = { ...s.servers }; delete x[sid]; s.servers = x; });
        if (S.view.serverId === sid) go(null);
        return;
      }
      if (sid) refreshServer(sid);
      else for (const id of Object.keys(S.servers)) refreshServer(id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, ({ new: n, old, eventType }) => {
      const sid = eventType === 'DELETE' ? Object.values(S.servers).find((sv) => sv.channels.some((c) => c.id === old.id))?.id : n.server_id;
      if (sid) refreshServer(sid);
    })
    .subscribe((st) => {
      if (st === 'SUBSCRIBED' && S.ready) loadAll(uid).catch(() => {}); // reconectou: recarrega
    });

  globalChan = sb.channel('global', { config: { presence: { key: clientId }, broadcast: { self: false } } })
    .on('presence', { event: 'sync' }, onPresenceSync)
    .on('broadcast', { event: 'ev' }, ({ payload }) => onEvent(payload))
    .subscribe(async (st) => {
      set((s) => { s.connected = st === 'SUBSCRIBED'; });
      if (st === 'SUBSCRIBED') await trackPresence();
    });

  addEventListener('online', () => set((s) => { s.connected = true; }));
  addEventListener('offline', () => set((s) => { s.connected = false; }));
}

async function teardown() {
  for (const c of [dbChan, globalChan, roomChan]) if (c) await sb.removeChannel(c).catch(() => {});
  dbChan = globalChan = roomChan = null;
  started = false;
}

function onMessageChange({ eventType, new: row, old }) {
  if (eventType === 'DELETE') {
    set((s) => {
      for (const [cid, box] of Object.entries(s.messages)) {
        if (box.list.some((m) => m.id === old.id)) s.messages = { ...s.messages, [cid]: { ...box, list: box.list.filter((m) => m.id !== old.id) } };
      }
    });
    return;
  }
  const m = mapMsg(row);
  if (eventType === 'UPDATE') {
    set((s) => {
      const box = s.messages[m.channelId];
      if (box) s.messages = { ...s.messages, [m.channelId]: { ...box, list: box.list.map((x) => (x.id === m.id ? m : x)) } };
    });
    return;
  }
  set((s) => {
    const box = s.messages[m.channelId];
    if (box && !box.list.some((x) => x.id === m.id)) s.messages = { ...s.messages, [m.channelId]: { ...box, list: [...box.list, m] } };
    s.lastIds = { ...s.lastIds, [m.channelId]: m.id };
    const t = s.typing[m.channelId];
    if (t?.[m.authorId]) { const n = { ...t }; delete n[m.authorId]; s.typing = { ...s.typing, [m.channelId]: n }; }
  });
  const mine = m.authorId === S.uid;
  const viewing = S.view.channelId === m.channelId && document.visibilityState === 'visible';
  if (mine || viewing) return markRead(m.channelId);
  const isDM = !!S.dms[m.channelId];
  const mentioned = m.content.includes('@' + S.me.username) || m.content.includes('@todos');
  if (S.me.chosenStatus !== 'dnd' && (isDM || mentioned)) {
    sounds.message();
    notifyDesktop(m);
  }
}

// ---------- presença (online + quem está em qual chamada) ----------
let myVoice = { room: null, state: null };
async function trackPresence() {
  if (!globalChan) return;
  await globalChan.track({
    uid: S.uid,
    status: S.me?.chosenStatus || 'online',
    room: myVoice.room,
    state: myVoice.state,
    at: Date.now(),
  }).catch(() => {});
}
export function setVoicePresence(room, state) {
  myVoice = { room, state };
  return trackPresence();
}
export const refreshPresence = trackPresence;

function onPresenceSync() {
  const all = globalChan.presenceState(); // { clientId: [meta, ...] }
  const online = {};
  const voice = {};
  const rank = { online: 3, dnd: 2, idle: 1, invisible: 0 };
  for (const [sid, metas] of Object.entries(all)) {
    const meta = metas[metas.length - 1];
    if (!meta?.uid) continue;
    const st = meta.status === 'invisible' ? 'offline' : meta.status;
    if (st !== 'offline' && (!online[meta.uid] || rank[st] > rank[online[meta.uid]])) online[meta.uid] = st;
    if (meta.room) (voice[meta.room] ||= []).push({ sid, userId: meta.uid, state: meta.state || {}, joinedAt: meta.at });
  }
  for (const list of Object.values(voice)) list.sort((a, b) => a.joinedAt - b.joinedAt);
  const prevVoice = S.voice;
  set((s) => { s.online = online; s.voice = voice; });
  for (const room of new Set([...Object.keys(prevVoice), ...Object.keys(voice)])) {
    rtc.onVoiceUpdate(room, voice[room] || []);
    if (S.outgoing?.dmId === room && (voice[room] || []).some((p) => p.userId !== S.uid)) {
      sounds.stopRing();
      set((s) => { s.outgoing = null; });
    }
  }
}

// ---------- eventos efêmeros (digitando, ligações) ----------
export function sendEvent(payload) {
  return globalChan?.send({ type: 'broadcast', event: 'ev', payload: { ...payload, from: S.uid } });
}
function onEvent(e) {
  if (e.to && e.to !== S.uid) return;
  switch (e.type) {
    case 'typing': {
      if (!canSee(e.channelId)) return;
      set((s) => { s.typing = { ...s.typing, [e.channelId]: { ...s.typing[e.channelId], [e.from]: Date.now() } }; });
      const k = e.channelId + e.from;
      clearTimeout(typingTimers[k]);
      typingTimers[k] = setTimeout(() => set((s) => {
        const n = { ...s.typing[e.channelId] };
        delete n[e.from];
        s.typing = { ...s.typing, [e.channelId]: n };
      }), 6000);
      break;
    }
    case 'ring':
      if (!S.dms[e.dmId] || S.call?.roomId === e.dmId || S.me.chosenStatus === 'dnd') return;
      set((s) => { s.incoming = { dmId: e.dmId, from: e.from }; });
      sounds.ring(false);
      notifyDesktop({ call: true, authorId: e.from, channelId: e.dmId });
      break;
    case 'ring-cancel':
      if (S.incoming?.dmId !== e.dmId) return;
      sounds.stopRing();
      set((s) => { s.incoming = null; });
      break;
    case 'ring-decline':
      if (e.from === S.uid && S.incoming?.dmId === e.dmId) { sounds.stopRing(); set((s) => { s.incoming = null; }); return; }
      if (S.outgoing?.dmId !== e.dmId) return;
      sounds.stopRing();
      set((s) => { s.outgoing = null; });
      toast(`${S.users[e.from]?.displayName || 'A pessoa'} recusou a chamada.`);
      break;
  }
}
const canSee = (cid) => !!S.dms[cid] || Object.values(S.servers).some((sv) => sv.channels.some((c) => c.id === cid));

let lastTyping = 0;
export function sendTyping(channelId) {
  if (Date.now() - lastTyping < 3500) return;
  lastTyping = Date.now();
  sendEvent({ type: 'typing', channelId });
}

// ---------- sinalização WebRTC (por sala) ----------
let pendingCands = {};
let candTimer = null;
export async function joinRoomChannel(roomId, handlers) {
  if (roomChan) await sb.removeChannel(roomChan).catch(() => {});
  roomChan = sb.channel('room:' + roomId, { config: { broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: 'sig' }, ({ payload }) => { if (payload.to === clientId) handlers.signal(payload); })
    .on('broadcast', { event: 'watch' }, ({ payload }) => { if (payload.to === clientId) handlers.watch(payload); });
  await new Promise((res) => roomChan.subscribe((st) => { if (st === 'SUBSCRIBED') res(); }));
}
export async function leaveRoomChannel() {
  clearTimeout(candTimer);
  pendingCands = {};
  if (roomChan) await sb.removeChannel(roomChan).catch(() => {});
  roomChan = null;
}
/** envia SDP na hora; candidatos ICE em lotes (economiza eventos do plano grátis) */
export function sendSignal(to, data) {
  if (!roomChan) return;
  if (data.candidate) {
    (pendingCands[to] ||= []).push(data.candidate);
    if (!candTimer) candTimer = setTimeout(flushCands, 180);
    return;
  }
  flushCands();
  roomChan.send({ type: 'broadcast', event: 'sig', payload: { to, from: clientId, data } });
}
function flushCands() {
  clearTimeout(candTimer);
  candTimer = null;
  for (const [to, list] of Object.entries(pendingCands)) {
    roomChan?.send({ type: 'broadcast', event: 'sig', payload: { to, from: clientId, data: { candidates: list } } });
  }
  pendingCands = {};
}
export function sendWatch(to, watch) {
  roomChan?.send({ type: 'broadcast', event: 'watch', payload: { to, from: clientId, watch } });
}

// ---------- operações ----------
export async function fetchMessages(cid, beforeTs) {
  let q = sb.from('messages').select('*').eq('channel_id', cid).order('created_at', { ascending: false }).limit(50);
  if (beforeTs) q = q.lt('created_at', new Date(beforeTs).toISOString());
  return must(await q).reverse().map(mapMsg);
}
export async function insertMessage(row) {
  return mapMsg(must(await sb.from('messages').insert({
    channel_id: row.channelId, content: row.content, attachments: row.attachments, reply_to: row.replyTo,
  }).select().single()));
}
export const editMessage = async (id, content) => must(await sb.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', id));
export const deleteMessage = async (id) => must(await sb.from('messages').delete().eq('id', id));
export const toggleReaction = async (id, emoji) => must(await sb.rpc('toggle_reaction', { mid: id, emoji }));

export async function updateProfile(patch) {
  const row = {};
  if ('displayName' in patch) row.display_name = patch.displayName.trim().slice(0, 32) || S.me.username;
  if ('avatar' in patch) row.avatar_url = patch.avatar;
  if ('status' in patch) row.status = patch.status;
  if ('customStatus' in patch) row.custom_status = patch.customStatus.slice(0, 80);
  if ('bio' in patch) row.bio = patch.bio.slice(0, 190);
  if ('color' in patch) row.color = patch.color;
  const p = must(await sb.from('profiles').update(row).eq('id', S.uid).select().single());
  set((s) => { s.users = { ...s.users, [p.id]: mapUser(p) }; s.me = s.users[p.id]; });
  if ('status' in patch) trackPresence();
}

export async function friendRequest(username) {
  const name = username.trim().toLowerCase().replace(/^@/, '');
  const target = must(await sb.from('profiles').select('id').eq('username', name).maybeSingle());
  if (!target) throw new Error('Ninguém com esse usuário. Confira o nome.');
  if (target.id === S.uid) throw new Error('Você não pode adicionar a si mesmo.');
  const ex = Object.values(S.relations).find((r) => (r.from === S.uid && r.to === target.id) || (r.to === S.uid && r.from === target.id));
  if (ex?.status === 'accepted') throw new Error('Vocês já são amigos.');
  if (ex?.from === S.uid) throw new Error('Pedido já enviado.');
  if (ex) return acceptFriend(ex.id);
  const r = must(await sb.from('relations').insert({ from_id: S.uid, to_id: target.id }).select().single());
  set((s) => { s.relations = { ...s.relations, [r.id]: mapRel(r) }; });
}
export async function acceptFriend(id) {
  const r = must(await sb.from('relations').update({ status: 'accepted' }).eq('id', id).select().single());
  set((s) => { s.relations = { ...s.relations, [r.id]: mapRel(r) }; });
}
export async function removeFriend(id) {
  must(await sb.from('relations').delete().eq('id', id));
  set((s) => { const n = { ...s.relations }; delete n[id]; s.relations = n; });
}

export async function openDmRow(userId) {
  const d = mapDm(must(await sb.rpc('open_dm', { other: userId })));
  set((s) => { s.dms = { ...s.dms, [d.id]: d }; });
  return d;
}

export async function createServer(name, icon) {
  const s = must(await sb.from('servers').insert({ name: name.trim().slice(0, 48), icon_url: icon || null }).select().single());
  await refreshServer(s.id);
  return s.id;
}
export async function joinServer(code) {
  const id = must(await sb.rpc('join_server', { code }));
  await refreshServer(id);
  return id;
}
export async function updateServer(id, patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name.trim().slice(0, 48);
  if ('icon' in patch) row.icon_url = patch.icon;
  if (patch.resetInvite) row.invite = Math.random().toString(36).slice(2, 8).toUpperCase();
  must(await sb.from('servers').update(row).eq('id', id));
  await refreshServer(id);
}
export async function deleteServer(id) {
  must(await sb.from('servers').delete().eq('id', id));
  set((s) => { const x = { ...s.servers }; delete x[id]; s.servers = x; });
}
export async function leaveServer(id) {
  must(await sb.from('server_members').delete().eq('server_id', id).eq('user_id', S.uid));
  set((s) => { const x = { ...s.servers }; delete x[id]; s.servers = x; });
}
export async function kickMember(serverId, userId) {
  must(await sb.from('server_members').delete().eq('server_id', serverId).eq('user_id', userId));
  await refreshServer(serverId);
}
const chanName = (name, type) => (type === 'text'
  ? name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '')
  : name.trim()).slice(0, 40);
export async function createChannel(serverId, name, type) {
  const n = chanName(name, type);
  if (!n) throw new Error('Nome inválido.');
  const pos = Math.max(0, ...(S.servers[serverId]?.channels || []).map((c) => c.position + 1));
  const c = must(await sb.from('channels').insert({ server_id: serverId, name: n, type, position: pos }).select().single());
  await refreshServer(serverId);
  return c.id;
}
export async function renameChannel(id, name, type, serverId) {
  must(await sb.from('channels').update({ name: chanName(name, type) }).eq('id', id));
  await refreshServer(serverId);
}
export async function deleteChannel(id, serverId) {
  must(await sb.from('channels').delete().eq('id', id));
  await refreshServer(serverId);
}

/** envia arquivos ao Storage com barra de progresso */
export async function uploadFiles(files, onProgress) {
  const { data: { session } } = await sb.auth.getSession();
  const out = [];
  const total = [...files].reduce((a, f) => a + f.size, 0) || 1;
  let done = 0;
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) throw new Error(`"${f.name}" passa de 50 MB.`);
    const safe = f.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${S.uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-${safe}`;
    await new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', `${SUPABASE_URL}/storage/v1/object/uploads/${path}`);
      x.setRequestHeader('Authorization', 'Bearer ' + session.access_token);
      x.setRequestHeader('apikey', SUPABASE_KEY);
      x.setRequestHeader('Content-Type', f.type || 'application/octet-stream');
      x.setRequestHeader('cache-control', '31536000');
      x.upload.onprogress = (e) => onProgress?.((done + e.loaded) / total);
      x.onload = () => (x.status < 300 ? resolve() : reject(new Error('Falha no envio de ' + f.name)));
      x.onerror = () => reject(new Error('Falha no envio de ' + f.name));
      x.send(f);
    });
    done += f.size;
    out.push({ url: sb.storage.from('uploads').getPublicUrl(path).data.publicUrl, name: f.name.slice(0, 120), size: f.size, type: f.type });
  }
  return out;
}

function handleDeepLink() {
  const q = new URLSearchParams(location.search);
  const c = q.get('c') || q.get('call');
  if (!c) return;
  history.replaceState(null, '', location.pathname);
  if (S.dms[c]) {
    go(null, c);
    if (q.get('call')) rtc.join(c);
  } else {
    const sv = Object.values(S.servers).find((x) => x.channels.some((ch) => ch.id === c));
    if (sv) go(sv.id, c);
  }
}

sb.auth.onAuthStateChange((ev) => {
  if (ev === 'SIGNED_OUT') set((s) => { s.authed = false; s.ready = false; });
});
