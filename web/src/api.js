// Camada de dados: Supabase (auth, banco, tempo real, arquivos). Sem servidor próprio.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from './config.js';
import { S, set, setSettings } from './store.js';
import { sounds } from './sounds.js';
import * as rtc from './rtc.js';
import { toast, markRead, notifyDesktop, go } from './actions.js';
import { optimizeImage } from './media.js';
import { setShopItems } from './shopimg.js';

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
  if (/rate limit|only request this after/i.test(m)) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (/email.*already.*(registered|exists)|already been registered/i.test(m)) return 'Esse email já está em uso em outra conta.';
  if (/sending.*email|send.*email|smtp/i.test(m)) return 'Não deu para enviar o email agora. Tente de novo mais tarde.';
  if (/Token has expired|otp.*(expired|invalid)|invalid.*token/i.test(m)) return 'Código errado ou vencido. Confira ou peça outro.';
  if (/Unable to validate email|invalid format|valid email|Email address .* is invalid/i.test(m)) return 'Esse email não foi aceito. Confira e tente de novo.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem internet ou servidor fora do ar.';
  return m;
}

// ---------- normalização ----------
export const mapUser = (p) => ({
  id: p.id, username: p.username, displayName: p.display_name, avatar: p.avatar_url, color: p.color,
  chosenStatus: p.status, customStatus: p.custom_status, bio: p.bio,
  banner: p.banner_url || null, accent: p.accent_color || null, pronouns: p.pronouns || '', createdAt: Date.parse(p.created_at),
  decoration: p.decoration || null, effect: p.profile_effect || null, frame: p.profile_frame || null, nameplate: p.nameplate || null, items: p.items || [],
});
const mapGroup = (g, members = []) => ({ id: g.id, name: g.name, icon: g.icon_url, ownerId: g.owner_id, members });
export const mapMsg = (m) => ({
  id: m.id, channelId: m.channel_id, authorId: m.author_id, content: m.content, attachments: m.attachments || [],
  replyTo: m.reply_to, reactions: m.reactions || {}, createdAt: Date.parse(m.created_at), editedAt: m.edited_at ? Date.parse(m.edited_at) : null,
  type: m.type || 'text', meta: m.meta || {}, blocked: !!m.blocked,
});
/** quem me bloqueou: não vejo foto, bio, banner nem status da pessoa */
const hide = (u) => (u && S.blockedBy[u.id] ? { ...u, avatar: null, bio: '', banner: null, customStatus: '', pronouns: '', accent: null, decoration: null, effect: null, frame: null, nameplate: null } : u);
const mapRel = (r) => ({ id: r.id, from: r.from_id, to: r.to_id, status: r.status, createdAt: r.created_at ? Date.parse(r.created_at) : null });
const mapDm = (d) => ({ id: d.id, members: [d.user_a, d.user_b] });
const mapServer = (s, members = [], channels = []) => ({
  id: s.id, name: s.name, icon: s.icon_url, ownerId: s.owner_id, invite: s.invite, members,
  channels: channels.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)).map((c) => ({ id: c.id, name: c.name, type: c.type, position: c.position, created_at: c.created_at })),
});

// ---------- autenticação ----------
const emailOf = (u) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
const validUser = (u) => /^[a-z0-9_.]{3,20}$/.test(u);

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

export async function register({ username, email, password, password2, displayName }) {
  const u = username.trim().toLowerCase();
  if (!validUser(u)) throw new Error('Usuário: 3 a 20 caracteres (letras minúsculas, números, _ ou .).');
  if (!validEmail(email || '')) throw new Error('Digite um email válido.');
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  if (password !== password2) throw new Error('As senhas não são iguais.');
  const { error } = await sb.auth.signUp({ email: emailOf(u), password });
  if (error && !/already registered/i.test(error.message)) throw new Error(translate(error.message));
  if (error) {
    // conta já existe: só continua se a senha bater (ex.: cadastro anterior interrompido)
    const r = await sb.auth.signInWithPassword({ email: emailOf(u), password });
    if (r.error) throw new Error('Esse usuário já existe.');
  }
  must(await sb.rpc('create_profile', { p_username: u, p_display_name: displayName || u }));
  // manda o código para o email; se falhar, o app pede de novo depois
  await requestEmail(email).catch((x) => set((s) => { s.emailError = x.message; }));
  await start();
}

/** entra com usuário ou email */
export async function login({ username, password }) {
  const id = username.trim();
  let email = id.includes('@') ? id.toLowerCase() : null;
  if (!email) {
    // contas com email de verdade: o servidor só devolve o email se a senha estiver certa
    const r = await sb.rpc('login_email', { p_username: id, p_password: password });
    if (r.error && /tentativas/i.test(r.error.message)) throw new Error(r.error.message);
    email = r.data || emailOf(id);
  }
  must(await sb.auth.signInWithPassword({ email, password }));
  await start();
}

// ---------- email da conta (com código de confirmação) ----------
const fakeEmail = (e) => !e || e.endsWith('@' + EMAIL_DOMAIN);
/** confere se a conta ainda não tem email confirmado (contas antigas) */
export async function checkEmail() {
  let u = (await sb.auth.getUser()).data?.user;
  if (!u) return;
  // entrou pelo link do email (em vez do código): marca como confirmado
  if (u.app_metadata?.email_pending && (await sb.rpc('finish_email_change')).data) u = (await sb.auth.getUser()).data?.user || u;
  const pending = !fakeEmail(u.email) && !!u.app_metadata?.email_pending;
  set((s) => { s.needsEmail = fakeEmail(u.email) || pending; s.emailPending = pending ? u.email : null; s.myEmail = fakeEmail(u.email) ? null : u.email; });
}
/** coloca o email na conta (ainda sem confirmar) e o Supabase manda o código para ele */
export async function requestEmail(email) {
  const e = email.trim().toLowerCase();
  if (!validEmail(e)) throw new Error('Digite um email válido.');
  if (e !== S.emailPending) must(await sb.rpc('start_email_change', { p_email: e }));
  set((s) => { s.emailPending = e; s.emailError = null; });
  must(await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } }));
}
const tokenOf = (code) => {
  const token = String(code || '').replace(/\D/g, '');
  if (token.length < 6) throw new Error('O código tem 6 números.');
  return token;
};
/** confere o código do email novo (não fecha a tela: quem chama roda checkEmail depois da animação) */
export async function verifyEmail(code) {
  const email = S.emailPending;
  if (!email) throw new Error('Digite seu email primeiro.');
  must(await sb.auth.verifyOtp({ email, token: tokenOf(code), type: 'email' }));
  must(await sb.rpc('finish_email_change'));
  await sb.auth.refreshSession().catch(() => {});
}

/** trocar o email pelas configurações: conta sem email confirmado usa o caminho acima; com email, o Supabase manda o código para o novo */
export async function changeEmail(email) {
  const e = email.trim().toLowerCase();
  if (!validEmail(e)) throw new Error('Digite um email válido.');
  if (e === S.myEmail) throw new Error('Esse já é o seu email.');
  if (!S.myEmail || S.emailPending) { await requestEmail(e); return 'email'; }
  must(await sb.auth.updateUser({ email: e }));
  return 'email_change';
}
export async function verifyEmailChange(email, code, mode) {
  if (mode === 'email') return verifyEmail(code);
  must(await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: tokenOf(code), type: 'email_change' }));
  await sb.auth.refreshSession().catch(() => {});
}

// ---------- senha ----------
/** "Esqueceu sua senha?": manda o código para o email (se a conta existir; não conta se existe ou não) */
export async function sendRecovery(email) {
  const e = email.trim().toLowerCase();
  if (!validEmail(e)) throw new Error('Digite o email da sua conta.');
  must(await sb.auth.resetPasswordForEmail(e));
}
export async function verifyRecovery(email, code) {
  must(await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: tokenOf(code), type: 'recovery' }));
}
/** depois do código de recuperação: grava a senha nova e entra */
export async function finishRecovery(password) {
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  must(await sb.auth.updateUser({ password }));
  await start();
}

export async function logout() {
  await rtc.leave(true);
  await teardown();
  await sb.auth.signOut().catch(() => {});
  // recarrega limpo: evita canais de tempo real antigos interferindo na próxima conta
  location.reload();
}

export async function changePassword(current, password) {
  if (password.length < 6) throw new Error('A senha nova precisa ter pelo menos 6 caracteres.');
  if (current === password) throw new Error('A senha nova é igual à atual.');
  // confere a senha atual entrando de novo com ela
  const { data } = await sb.auth.getUser();
  const r = await sb.auth.signInWithPassword({ email: data?.user?.email, password: current });
  if (r.error) throw new Error(/Invalid login/i.test(r.error.message) ? 'A senha atual está errada.' : translate(r.error.message));
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
  checkEmail().catch(() => {});
  import('./push.js').then((p) => p.initPush((dmId) => go(null, dmId))).catch(() => {});
}

async function loadAll(uid) {
  await loadBlocks(uid);
  await loadShop(uid);
  const [profiles, relations, servers, members, channels, dms, last, groups, gmembers] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('relations').select('*'),
    sb.from('servers').select('*'),
    sb.from('server_members').select('server_id,user_id'),
    sb.from('channels').select('*'),
    sb.from('dms').select('*'),
    sb.rpc('last_messages'),
    sb.from('groups').select('*'),
    sb.from('group_members').select('group_id,user_id'),
  ].map((p) => p.then(must)));
  const users = Object.fromEntries(profiles.map((p) => [p.id, hide(mapUser(p))]));
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
    s.lastAt = Object.fromEntries(last.filter((x) => x.created_at).map((x) => [x.channel_id, Date.parse(x.created_at)]));
    s.groups = Object.fromEntries(groups.map((g) => [g.id, mapGroup(g, gmembers.filter((m) => m.group_id === g.id).map((m) => m.user_id))]));
    s.messages = {};
  });
}

// ---------- loja com imagens ----------
async function loadShop(uid) {
  const [items, adm] = await Promise.all([
    sb.from('shop_items').select('*'),
    sb.from('app_admins').select('user_id').eq('user_id', uid),
  ]);
  if (items.error) return; // tabela ainda não criada
  setShopItems(items.data);
  set((s) => { s.shopImgs = items.data; s.shopAdmin = !!adm.data?.length; });
}
export const refreshShop = () => loadShop(S.uid);
/** só para quem é admin da loja (o banco confere) */
export async function saveShopItem(row) {
  must(await sb.from('shop_items').upsert(row));
  await loadShop(S.uid);
}
export async function deleteShopItem(id) {
  must(await sb.from('shop_items').delete().eq('id', id));
  await loadShop(S.uid);
}

// ---------- bloqueios (guardados no servidor) ----------
async function loadBlocks(uid) {
  const { data, error } = await sb.from('blocks').select('blocker,blocked');
  if (error) return; // tabela ainda não criada: fica só no aparelho, como antes
  const mine = {}, by = {};
  for (const b of data) { if (b.blocker === uid) mine[b.blocked] = true; else if (b.blocked === uid) by[b.blocker] = true; }
  // bloqueios antigos (só neste aparelho) sobem para o servidor uma vez; depois o servidor manda
  if (!S.settings.blocksSynced) {
    const local = Object.keys(S.settings.blocked || {}).filter((id) => S.settings.blocked[id] && !mine[id] && id !== uid && !by[id]);
    for (const id of local) { mine[id] = true; sb.from('blocks').insert({ blocked: id }).then(() => {}); }
  }
  const changed = Object.keys({ ...by, ...S.blockedBy }).filter((id) => !!by[id] !== !!S.blockedBy[id]);
  set((s) => { s.blockedBy = by; });
  setSettings({ blocked: mine, blocksSynced: true });
  // quem me bloqueou/desbloqueou agora: refaz o perfil com ou sem as informações
  if (changed.length && S.ready) {
    const { data: ps } = await sb.from('profiles').select('*').in('id', changed);
    if (ps) set((s) => { const n = { ...s.users }; for (const p of ps) n[p.id] = hide(mapUser(p)); s.users = n; });
    onPresenceSync();
  }
}
export async function setBlocked(uid, on) {
  setSettings({ blocked: { ...(S.settings.blocked || {}), [uid]: on || undefined } });
  const r = on ? await sb.from('blocks').insert({ blocked: uid }) : await sb.from('blocks').delete().eq('blocker', S.uid).eq('blocked', uid);
  if (r.error && !/duplicate/i.test(r.error.message)) console.warn('bloqueio', r.error.message);
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

export async function refreshGroup(id) {
  const [g, m] = await Promise.all([
    sb.from('groups').select('*').eq('id', id).maybeSingle(),
    sb.from('group_members').select('group_id,user_id').eq('group_id', id),
  ]);
  if (!g.data || !(m.data || []).some((x) => x.user_id === S.uid)) {
    set((s) => { const n = { ...s.groups }; delete n[id]; s.groups = n; });
    if (S.view.channelId === id) go(null);
    return;
  }
  set((s) => { s.groups = { ...s.groups, [id]: mapGroup(g.data, m.data.map((x) => x.user_id)) }; });
}

// ---------- tempo real ----------
let dbChan, globalChan, roomChan;
const typingTimers = {};

function subscribeRealtime(uid) {
  makeDb(uid);
  makeGlobal();
  // vigia: se algum canal cair (rede, servidor), recria sozinho
  clearInterval(watchTimer);
  watchTimer = setInterval(() => {
    if (!started) return;
    const live = sb.getChannels();
    const dead = (c) => !c || !live.includes(c) || ['closed', 'errored'].includes(c.state);
    if (dead(globalChan)) { set((s) => { s.connected = false; }); makeGlobal(); }
    if (dead(dbChan)) makeDb(uid);
    if (roomInfo && dead(roomChan)) joinRoomChannel(roomInfo.id, roomInfo.handlers).catch(() => {});
    // se eu não estou no canal de presença (envio falhou, servidor reiniciou...), me anuncio de novo
    if (globalChan?.state === 'joined' && !tracking) {
      const mine = globalChan.presenceState()?.[clientId];
      if (!mine?.length) { if (++missingTicks >= 2) { missingTicks = 0; console.warn('presença: não estou no canal, anunciando de novo'); trackPresence(); } }
      else missingTicks = 0;
    }
  }, 2500);
}
let watchTimer = 0;
let missingTicks = 0;
let roomInfo = null;

function makeDb(uid) {
  if (dbChan) sb.removeChannel(dbChan).catch(() => {});
  dbChan = sb.channel('db-' + clientId + '-' + Date.now().toString(36))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onMessageChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ({ new: p, eventType }) => {
      if (eventType === 'DELETE') return;
      set((s) => {
        s.users = { ...s.users, [p.id]: hide(mapUser(p)) };
        if (p.id === s.uid) s.me = s.users[p.id];
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, () => loadBlocks(uid).catch(() => {}))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_items' }, () => loadShop(uid).catch(() => {}))
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, ({ new: n, old, eventType }) => {
      const id = eventType === 'DELETE' ? old.id : n.id;
      if (eventType === 'DELETE') {
        set((s) => { const x = { ...s.groups }; delete x[id]; s.groups = x; });
        if (S.view.channelId === id) go(null);
      } else refreshGroup(id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, ({ new: n, old, eventType }) => {
      const row = eventType === 'DELETE' ? old : n;
      if (row?.group_id) refreshGroup(row.group_id);
      else for (const id of Object.keys(S.groups)) refreshGroup(id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, ({ new: n, old, eventType }) => {
      const sid = eventType === 'DELETE' ? Object.values(S.servers).find((sv) => sv.channels.some((c) => c.id === old.id))?.id : n.server_id;
      if (sid) refreshServer(sid);
    })
    .subscribe((st) => {
      if (st === 'SUBSCRIBED' && S.ready) loadAll(uid).catch(() => {}); // reconectou: recarrega
    });
}

function makeGlobal() {
  const old = globalChan;
  globalChan = null;
  if (old) sb.removeChannel(old).catch(() => {});
  const g = sb.channel('global', { config: { presence: { key: clientId }, broadcast: { self: false } } })
    .on('presence', { event: 'sync' }, () => { if (globalChan === g) onPresenceSync(); })
    .on('broadcast', { event: 'ev' }, ({ payload }) => { if (globalChan === g) onEvent(payload); });
  globalChan = g;
  g.subscribe(async (st) => {
    if (globalChan !== g) return; // canal antigo (ex.: depois de sair e entrar de novo)
    set((s) => { s.connected = st === 'SUBSCRIBED'; });
    if (st === 'SUBSCRIBED') await trackPresence();
  });
}
addEventListener('online', () => set((s) => { s.connected = true; }));
addEventListener('offline', () => set((s) => { s.connected = false; }));

async function teardown() {
  clearInterval(watchTimer);
  started = false;
  roomInfo = null;
  for (const c of [dbChan, globalChan, roomChan]) if (c) await sb.removeChannel(c).catch(() => {});
  dbChan = globalChan = roomChan = null;
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
    s.lastAt = { ...s.lastAt, [m.channelId]: m.createdAt || Date.now() };
    const t = s.typing[m.channelId];
    if (t?.[m.authorId]) { const n = { ...t }; delete n[m.authorId]; s.typing = { ...s.typing, [m.channelId]: n }; }
  });
  const mine = m.authorId === S.uid;
  const viewing = S.view.channelId === m.channelId && document.visibilityState === 'visible';
  if (mine || viewing) return markRead(m.channelId);
  if (m.type === 'call') return; // a chamada já toca o próprio som
  if (S.settings.mutedUsers?.[m.authorId] || S.settings.blocked?.[m.authorId] || S.settings.ignored?.[m.authorId]) return;
  const isDM = !!S.dms[m.channelId] || !!S.groups[m.channelId];
  const mentioned = m.content.includes('@' + S.me.username) || m.content.includes('@todos');
  if (S.me.chosenStatus !== 'dnd' && (isDM || mentioned)) {
    sounds.message();
    notifyDesktop(m);
  }
}

// ---------- presença (online + quem está em qual chamada) ----------
let myVoice = { room: null, state: null };
// presença: uma atualização por vez (duas ao mesmo tempo derrubavam o canal) e sempre a mais recente
let tracking = null, trackAgain = false;
async function trackPresence() {
  if (tracking) { trackAgain = true; return tracking; }
  const job = (async () => {
    // espera um ciclo: sem isso, se o canal ainda não conectou, a função terminava "na hora",
    // o finally rodava ANTES da atribuição abaixo e a trava ficava presa para sempre (app offline para os outros)
    await null;
    try {
    do {
      trackAgain = false;
      const ch = globalChan;
      if (!ch || ch.state !== 'joined') break;
      await Promise.race([
        ch.track({ uid: S.uid, status: S.me?.chosenStatus || 'online', room: myVoice.room, state: myVoice.state, at: Date.now(), pc: !!window.perfumolandiaDesktop?.rcStart, game: S.settings.shareGame !== false && S.me?.chosenStatus !== 'invisible' ? S.myGame : null, music: S.settings.shareGame !== false && S.me?.chosenStatus !== 'invisible' && S.myMusic ? { title: S.myMusic.title, artist: S.myMusic.artist, art: S.myMusic.art, app: S.myMusic.app } : null }).catch(() => {}),
        new Promise((r) => setTimeout(r, 6000)),
      ]);
    } while (trackAgain);
    } catch (e) {
      console.warn('presença: falha ao anunciar', e);
    } finally {
      if (tracking === job) tracking = null;
    }
  })();
  tracking = job;
  return job;
}
export function setVoicePresence(room, state) {
  myVoice = { room, state };
  return trackPresence();
}
export const refreshPresence = trackPresence;
/** música tocando no Spotify (app do Windows): "Ouvindo ..." e o botão de compartilhar na chamada */
export function setMyMusic(m) {
  set((s) => { s.myMusic = m ? { title: m.title, artist: m.artist, art: m.art || null, app: m.app || 'Spotify', pid: m.pid, since: Date.now() } : null; });
  if (!m) rtc.stopMusic?.(); else rtc.refreshMusic?.();
  logActivity('music', m);
  return trackPresence();
}
/** jogo aberto agora (app do Windows): aparece como "Jogando ..." para os amigos */
export function setMyGame(g) {
  set((s) => { s.myGame = g ? { name: g.name, img: g.img || null, wide: !!g.wide, since: Date.now() } : null; });
  logActivity('game', g);
  return trackPresence();
}

// ---------- atividade recente (aparece no perfil completo para os amigos) ----------
const actOpen = { game: null, music: null };
const actWait = { game: 0, music: 0 };
function logActivity(kind, item) {
  const key = item ? (kind === 'game' ? item.name : `${item.title}|${item.artist}`) : null;
  if (actOpen[kind]?.key === key) return;
  clearTimeout(actWait[kind]);
  const cur = actOpen[kind];
  if (cur) { actOpen[kind] = null; sb.from('activity_log').update({ ended_at: new Date().toISOString() }).eq('id', cur.id).then(() => {}); }
  if (!item || !S.uid || S.settings.shareGame === false || S.me?.chosenStatus === 'invisible') return;
  // música só entra se tocar pelo menos 20 s (pular faixa não enche o histórico)
  actWait[kind] = setTimeout(() => {
    const id = crypto.randomUUID();
    actOpen[kind] = { id, key };
    const row = kind === 'game'
      ? { id, kind, name: String(item.name).slice(0, 200), detail: '', img: item.img || null, wide: !!item.wide }
      : { id, kind, name: String(item.title).slice(0, 200), detail: String(item.artist || '').slice(0, 200), img: item.art || null };
    sb.from('activity_log').insert(row).then(({ error }) => { if (error) actOpen[kind] = null; });
  }, kind === 'music' ? 20000 : 0);
}
export async function recentActivity(uid) {
  const { data } = await sb.from('activity_log').select('id,kind,name,detail,img,wide,started_at,ended_at')
    .eq('user_id', uid).order('started_at', { ascending: false }).limit(20);
  return data || [];
}

function onPresenceSync() {
  if (!globalChan) return;
  const all = globalChan.presenceState(); // { clientId: [meta, ...] }
  const online = {};
  const voice = {};
  const games = {};
  const musics = {};
  const pcs = {};
  const rank = { online: 3, dnd: 2, idle: 1, invisible: 0 };
  for (const [sid, metas] of Object.entries(all)) {
    const meta = metas[metas.length - 1];
    if (!meta?.uid || S.blockedBy[meta.uid]) continue; // quem me bloqueou aparece offline
    const st = meta.status === 'invisible' ? 'offline' : meta.status;
    if (st !== 'offline' && (!online[meta.uid] || rank[st] > rank[online[meta.uid]])) online[meta.uid] = st;
    if (meta.game?.name && st !== 'offline') games[meta.uid] = meta.game;
    if (meta.music?.title && st !== 'offline') musics[meta.uid] = meta.music;
    if (meta.pc && st !== 'offline') pcs[meta.uid] = true;
    if (meta.room) (voice[meta.room] ||= []).push({ sid, userId: meta.uid, state: meta.state || {}, joinedAt: meta.at });
  }
  for (const list of Object.values(voice)) list.sort((a, b) => a.joinedAt - b.joinedAt);
  const prevVoice = S.voice;
  set((s) => { s.online = online; s.voice = voice; s.games = games; s.musics = musics; s.pcs = pcs; });
  for (const room of new Set([...Object.keys(prevVoice), ...Object.keys(voice)])) {
    rtc.onVoiceUpdate(room, voice[room] || []);
    if (S.outgoing?.dmId === room && (voice[room] || []).some((p) => p.userId !== S.uid)) {
      sounds.stopRing();
      if (S.outgoing.msgId) setCallStatus(S.outgoing.msgId, 'answered');
      set((s) => { s.outgoing = null; });
    }
  }
}

// ---------- eventos efêmeros (digitando, ligações) ----------
export function sendEvent(payload) {
  return globalChan?.send({ type: 'broadcast', event: 'ev', payload: { ...payload, from: S.uid } });
}
function onEvent(e) {
  if (e.to && (Array.isArray(e.to) ? !e.to.includes(S.uid) : e.to !== S.uid)) return;
  if (String(e.type).startsWith('rc-')) { import('./remote.js').then((m) => m.onRemoteEvent(e)); return; }
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
      if (S.settings.blocked?.[e.from]) return;
      if ((!S.dms[e.dmId] && !S.groups[e.dmId]) || S.call?.roomId === e.dmId || S.me.chosenStatus === 'dnd') return;
      if (S.incoming?.dmId === e.dmId) return; // já está tocando (o toque é reenviado a cada 8s)
      set((s) => { s.incoming = { dmId: e.dmId, from: e.from, msgId: e.msgId || null }; });
      sounds.ring(false);
      window.perfumolandiaDesktop?.attention?.();
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
const canSee = (cid) => !!S.dms[cid] || !!S.groups[cid] || Object.values(S.servers).some((sv) => sv.channels.some((c) => c.id === cid));

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
  roomInfo = { id: roomId, handlers };
  const old = roomChan;
  roomChan = null;
  if (old) await sb.removeChannel(old).catch(() => {});
  const ch = sb.channel('room:' + roomId, { config: { broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: 'sig' }, ({ payload }) => { if (payload.to === clientId) handlers.signal(payload); })
    .on('broadcast', { event: 'watch' }, ({ payload }) => { if (payload.to === clientId) handlers.watch(payload); })
    .on('broadcast', { event: 'nsig' }, ({ payload }) => { if (payload.to === clientId) handlers.nsignal(payload); });
  roomChan = ch;
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('tempo esgotado')), 15000);
    ch.subscribe((st) => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(); } });
  });
}
export async function leaveRoomChannel() {
  roomInfo = null;
  clearTimeout(candTimer);
  pendingCands = {};
  const old = roomChan;
  roomChan = null;
  if (old) await sb.removeChannel(old).catch(() => {});
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
/** sinalização da tela nativa do celular (conexão separada, sem lote) */
export function sendNativeSignal(to, data) {
  roomChan?.send({ type: 'broadcast', event: 'nsig', payload: { to, from: clientId, data } });
}
export function sendWatch(to, watch, q = null) {
  roomChan?.send({ type: 'broadcast', event: 'watch', payload: { to, from: clientId, watch, q } });
}

// ---------- operações ----------
export async function fetchMessages(cid, beforeTs) {
  let q = sb.from('messages').select('*').eq('channel_id', cid).order('created_at', { ascending: false }).limit(50);
  if (beforeTs) q = q.lt('created_at', new Date(beforeTs).toISOString());
  return must(await q).reverse().map(mapMsg);
}
export async function insertMessage(row) {
  return mapMsg(must(await sb.from('messages').insert({
    channel_id: row.channelId, content: row.content || '', attachments: row.attachments || [], reply_to: row.replyTo || null,
    ...(row.type ? { type: row.type, meta: row.meta || {} } : {}),
  }).select().single()));
}
/** registro de chamada no chat */
export const insertCallLog = (channelId) => insertMessage({ channelId, type: 'call', meta: { status: 'ringing', by: S.uid, startedAt: Date.now() } });
export const setCallStatus = (mid, status) => sb.rpc('set_call_status', { mid, p_status: status }).then(({ error }) => { if (error) console.warn('status da chamada', error.message); });
export async function latestCallLog(channelId) {
  const box = S.messages[channelId]?.list;
  const local = box && [...box].reverse().find((m) => m.type === 'call');
  if (local) return local;
  const { data } = await sb.from('messages').select('*').eq('channel_id', channelId).eq('type', 'call').order('created_at', { ascending: false }).limit(1);
  return data?.[0] ? mapMsg(data[0]) : null;
}
export const editMessage = async (id, content) => must(await sb.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', id));
/** some com a mensagem bloqueada (5 min depois de enviada) */
export function dropBlockedMessage(m) {
  set((s) => {
    const box = s.messages[m.channelId];
    if (box) s.messages = { ...s.messages, [m.channelId]: { ...box, list: box.list.filter((x) => x.id !== m.id) } };
  });
  sb.from('messages').delete().eq('id', m.id).then(() => {});
}
export const deleteMessage = async (id) => must(await sb.from('messages').delete().eq('id', id));
export const toggleReaction = async (id, emoji) => must(await sb.rpc('toggle_reaction', { mid: id, emoji }));

export async function updateProfile(patch) {
  const row = {};
  if ('displayName' in patch) row.display_name = patch.displayName.trim().slice(0, 32) || S.me.username;
  if ('avatar' in patch) row.avatar_url = patch.avatar;
  if ('status' in patch) row.status = patch.status;
  if ('customStatus' in patch) row.custom_status = patch.customStatus.slice(0, 80);
  if ('bio' in patch) row.bio = patch.bio.slice(0, 400);
  if ('color' in patch) row.color = patch.color;
  if ('accent' in patch) row.accent_color = patch.accent;
  if ('banner' in patch) row.banner_url = patch.banner;
  if ('pronouns' in patch) row.pronouns = patch.pronouns.slice(0, 40);
  if ('decoration' in patch) row.decoration = patch.decoration;
  if ('effect' in patch) row.profile_effect = patch.effect;
  if ('frame' in patch) row.profile_frame = patch.frame;
  if ('nameplate' in patch) row.nameplate = patch.nameplate;
  if ('items' in patch) row.items = [...new Set(patch.items)];
  const res = await sb.from('profiles').update(row).eq('id', S.uid).select().single();
  if (res.error && /decoration|profile_effect|profile_frame|nameplate|items/.test(res.error.message)) throw new Error('A loja ainda não foi ativada no banco de dados.');
  const p = must(res);
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

// grupos
export async function createGroup(name, memberIds) {
  const id = must(await sb.rpc('create_group', { p_name: (name || '').trim().slice(0, 48), p_members: memberIds }));
  await refreshGroup(id);
  return id;
}
export async function addGroupMembers(id, memberIds) {
  must(await sb.rpc('add_group_members', { gid: id, p_members: memberIds }));
  await refreshGroup(id);
}
export async function updateGroup(id, patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name.trim().slice(0, 48);
  if ('icon' in patch) row.icon_url = patch.icon;
  must(await sb.from('groups').update(row).eq('id', id));
  await refreshGroup(id);
}
export async function leaveGroup(id) {
  const g = S.groups[id];
  if (g?.ownerId === S.uid && g.members.length <= 1) must(await sb.from('groups').delete().eq('id', id));
  else must(await sb.from('group_members').delete().eq('group_id', id).eq('user_id', S.uid));
  set((s) => { const n = { ...s.groups }; delete n[id]; s.groups = n; });
}
export async function kickFromGroup(id, userId) {
  must(await sb.from('group_members').delete().eq('group_id', id).eq('user_id', userId));
  await refreshGroup(id);
}

export async function createServer(name, icon) {
  const s = must(await sb.from('servers').insert({ name: name.trim().slice(0, 48), icon_url: icon || null }).select().single());
  await refreshServer(s.id);
  return s.id;
}
/** aceita o código (K7Q2XA) ou o link inteiro do convite */
export const parseInvite = (text) => {
  const t = String(text || '').trim();
  const m = /convite[/=]([A-Za-z0-9]{4,12})/i.exec(t);
  return (m ? m[1] : t).toUpperCase();
};
export async function joinServer(code) {
  const id = must(await sb.rpc('join_server', { code: parseInvite(code) }));
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
export async function uploadFiles(files, onProgress, { max = 2560, raw = false } = {}) {
  const { data: { session } } = await sb.auth.getSession();
  // imagens viram WebP antes de subir (economiza espaço e dados); raw = sobe como está (artes animadas da loja)
  if (!raw) files = await Promise.all([...files].map((f) => (/^image\//.test(f.type) && !/webp$/.test(f.name) ? optimizeImage(f, { max }) : f)));
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
  if (S.dms[c] || S.groups[c]) {
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
