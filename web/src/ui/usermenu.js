// Menu de usuário (botão direito e "⋯"), no estilo do Discord.
// Apelido, nota, silenciar, ignorar e bloquear ficam salvos neste aparelho (só você vê).
import { html } from '../lib.js';
import { S, setSettings } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { openMenu, openModal, openDM, callDM, run, toast, go, sendMessage } from '../actions.js';
import { inviteLink, SITE_URL } from '../config.js';
import { requestControl } from '../remote.js';
import { openProfile } from './popover.js';

const I = (n) => html`<${Icon} n=${n} s=${16} />`;
const copy = (t, what) => navigator.clipboard?.writeText(t).then(() => toast(`${what} copiado.`));
const toggle = (key, uid, on) => setSettings({ [key]: { ...(S.settings[key] || {}), [uid]: on || undefined } });

export const isBlocked = (uid) => !!S.settings.blocked?.[uid];
export const isIgnored = (uid) => !!(S.settings.ignored?.[uid] || S.settings.blocked?.[uid]);
export const isMuted = (uid) => !!S.settings.mutedUsers?.[uid];
/** nome mostrado: apelido que você deu, senão o nome da pessoa */
export const nameOf = (uid, fallback) => S.settings.nicknames?.[uid] || S.users[uid]?.displayName || fallback || 'Alguém';

export function userMenu(e, uid, { dmId, anchor = false } = {}) {
  const u = S.users[uid];
  if (!u) return;
  const me = uid === S.uid;
  const rel = Object.values(S.relations).find((r) => (r.from === uid && r.to === S.uid) || (r.to === uid && r.from === S.uid));
  const friend = rel?.status === 'accepted';
  const pending = rel && !friend;
  const items = [
    { header: nameOf(uid) },
    { label: 'Perfil', icon: I('user'), onClick: () => openProfile(uid, e) },
  ];
  if (!me) {
    items.push(
      { label: 'Mensagem', icon: I('message'), onClick: () => openDM(uid) },
      { label: 'Iniciar chamada', icon: I('phone'), onClick: async () => { const dm = await openDM(uid); callDM(dm.id); } },
    );
    if (friend && S.pcs[uid]) items.push({ label: 'Controlar PC', icon: I('remote'), onClick: () => requestControl(uid) });
    items.push(
      { sep: true },
      { label: S.settings.notes?.[uid] ? 'Editar nota' : 'Adicionar nota', icon: I('edit'), onClick: () => openModal('prompt', {
        title: `Nota sobre ${u.displayName}`, label: 'Nota (só você vê)', value: S.settings.notes?.[uid] || '', multiline: true, max: 256,
        onSave: (v) => setSettings({ notes: { ...(S.settings.notes || {}), [uid]: v.trim() || undefined } }) }) },
      { label: 'Apelido de amigo', icon: I('tag'), onClick: () => openModal('prompt', {
        title: `Apelido para ${u.displayName}`, label: 'Apelido (só você vê)', value: S.settings.nicknames?.[uid] || '', max: 32, placeholder: u.displayName,
        onSave: (v) => setSettings({ nicknames: { ...(S.settings.nicknames || {}), [uid]: v.trim() || undefined } }) }) },
    );
    if (dmId && S.dms[dmId]) items.push({ label: 'Fechar conversa', icon: I('x'), onClick: () => { setSettings({ hiddenDms: { ...(S.settings.hiddenDms || {}), [dmId]: Date.now() } }); if (S.view.channelId === dmId) go(null, null); } });
    const servers = Object.values(S.servers);
    if (servers.length) items.push({ label: 'Convidar para servidor', icon: I('userPlus'), onClick: () => openModal('inviteTo', { uid }) });
    items.push(
      { label: 'Compartilhar perfil', icon: I('share'), onClick: () => copy(`${u.displayName} (@${u.username}) na Perfumolandia — ${SITE_URL}`, 'Perfil') },
      { label: 'Adquira este visual', icon: I('palette'), onClick: () => run(api.updateProfile({
        color: u.color, accent: u.accent || u.color, decoration: u.decoration || null, effect: u.effect || null, frame: u.frame || null, nameplate: u.nameplate || null,
        items: [...new Set([...(S.me.items || []), ...[u.decoration && 'deco:' + u.decoration, u.effect && 'fx:' + u.effect, u.frame && 'frame:' + u.frame, u.nameplate && 'plate:' + u.nameplate].filter(Boolean)])],
      }), 'Visual copiado para o seu perfil!').catch(() => {}) },
      { sep: true },
      { label: isMuted(uid) ? 'Reativar notificações' : 'Silenciar', icon: I(isMuted(uid) ? 'bell' : 'bellOff'), onClick: () => toggle('mutedUsers', uid, !isMuted(uid)) },
      { label: S.settings.ignored?.[uid] ? 'Deixar de ignorar' : 'Ignorar', icon: I('eyeOff'), onClick: () => toggle('ignored', uid, !S.settings.ignored?.[uid]) },
    );
    if (friend) items.push({ label: 'Desfazer amizade', danger: true, icon: I('userMinus'), onClick: () => openModal('confirm', { title: 'Desfazer amizade', text: `Remover ${u.displayName} dos seus amigos?`, cta: 'Desfazer amizade', action: () => run(api.removeFriend(rel.id), 'Amizade desfeita.') }) });
    if (pending) items.push({ label: 'Cancelar pedido de amizade', danger: true, icon: I('userMinus'), onClick: () => run(api.removeFriend(rel.id)) });
    items.push(isBlocked(uid)
      ? { label: 'Desbloquear', icon: I('lock'), onClick: () => api.setBlocked(uid, false) }
      : { label: 'Bloquear', danger: true, icon: I('lock'), onClick: () => openModal('confirm', {
        title: `Bloquear ${u.displayName}?`, text: 'As mensagens da pessoa não chegam mais para você, ligações e pedidos são ignorados e a amizade é desfeita. Ela também deixa de ver sua foto, sua bio e se você está online.', cta: 'Bloquear',
        action: () => { api.setBlocked(uid, true); if (rel) api.removeFriend(rel.id).catch(() => {}); toast(`${u.displayName} foi bloqueado.`); } }) });
  }
  items.push(
    { sep: true },
    { label: 'Copiar nome de usuário', icon: I('copy'), onClick: () => copy('@' + u.username, 'Nome de usuário') },
    { label: 'Copiar ID do usuário', icon: I('id'), onClick: () => copy(uid, 'ID') },
  );
  if (dmId) items.push({ label: 'Copiar ID do canal', icon: I('id'), onClick: () => copy(dmId, 'ID do canal') });
  openMenu(e, items, { anchor });
}

/** convite para servidor direto na conversa com a pessoa */
export async function inviteToServer(uid, serverId) {
  const sv = S.servers[serverId];
  if (!sv) return;
  const dm = await openDM(uid);
  sendMessage(dm.id, inviteLink(sv.invite));
}
