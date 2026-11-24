import { html, useState, cx } from '../lib.js';
import { useS, S, set } from '../store.js';
import { Icon } from '../icons.js';
import { GlassBar } from '../glass.js';
import * as api from '../api.js';
import { openDM, callDM, run, safe, isUnread, statusOf, dmPartner, openModal, openMenu, go, toast } from '../actions.js';
import { Avatar, GBtn, Empty, STATUS_LABEL } from './common.js';

export function Friends({ mobile }) {
  const tab = useS((s) => s.view.homeTab);
  const rels = useS((s) => s.relations);
  const online = useS((s) => s.online);
  const pendingIn = Object.values(rels).filter((r) => r.status === 'pending' && r.to === S.uid);
  const setTab = (t) => set((s) => { s.view = { ...s.view, homeTab: t }; });
  const friends = Object.values(rels).filter((r) => r.status === 'accepted');
  const fid = (r) => (r.from === S.uid ? r.to : r.from);
  const list = tab === 'online' ? friends.filter((r) => online[fid(r)]) : tab === 'all' ? friends : tab === 'pending' ? Object.values(rels).filter((r) => r.status === 'pending') : [];
  const items = [
    { key: 'online', label: 'Online' },
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendentes', badge: pendingIn.length || null },
    { key: 'add', label: 'Adicionar', class: 'add' },
  ];
  return html`
    <div class="friends">
      <header class=${cx('top glass', mobile && 'mob-head')}>
        ${mobile ? html`<h1>Amigos</h1>` : html`<div class="top-title"><${Icon} n="users" s=${20} /><b>Amigos</b></div>`}
        <${GlassBar} items=${items} value=${tab} onChange=${setTab} class="seg-bar" itemClass="seg-item" />
      </header>
      <div class="friends-body">
        ${tab === 'add' ? html`<${AddFriend} />` : list.length
          ? html`<div class="flist">
              <div class="flist-head">${{ online: 'Online', all: 'Todos os amigos', pending: 'Pendentes' }[tab]} — ${list.length}</div>
              ${list.sort((a, b) => (S.users[fid(a)]?.displayName || '').localeCompare(S.users[fid(b)]?.displayName || '')).map((r) => html`<${FriendRow} key=${r.id} r=${r} />`)}
            </div>`
          : html`<${Empty} icon=${tab === 'pending' ? 'bell' : 'users'}
              title=${tab === 'online' ? 'Ninguém online agora' : tab === 'pending' ? 'Nenhum pedido pendente' : 'Sem amigos ainda'}
              text=${tab === 'pending' ? 'Pedidos de amizade aparecem aqui.' : 'Adicione seus amigos pelo nome de usuário.'}>
              <button class="gbtn primary" onClick=${() => setTab('add')}><${Icon} n="userPlus" s=${18} /> Adicionar amigo</button>
            <//>`}
      </div>
    </div>`;
}

function FriendRow({ r }) {
  const other = r.from === S.uid ? r.to : r.from;
  const u = useS((s) => s.users[other]);
  const st = useS((s) => statusOf(s, other));
  if (!u) return null;
  const incoming = r.status === 'pending' && r.to === S.uid;
  const outgoing = r.status === 'pending' && r.from === S.uid;
  const call = async () => { const dm = await openDM(other); callDM(dm.id); };
  return html`
    <div class="frow" onClick=${() => r.status === 'accepted' && openDM(other)}>
      <${Avatar} id=${other} size=${42} status />
      <div class="frow-name">
        <b>${u.displayName}</b>
        <small>${incoming ? 'Quer ser seu amigo' : outgoing ? 'Pedido enviado' : u.customStatus || STATUS_LABEL[st]} · @${u.username}</small>
      </div>
      <div class="frow-actions" onClick=${(e) => e.stopPropagation()}>
        ${incoming ? html`
          <${GBtn} icon="check" title="Aceitar" class="icon-only sm ok" onClick=${() => run(api.acceptFriend(r.id), 'Agora vocês são amigos!')} size=${18} />
          <${GBtn} icon="x" title="Recusar" class="icon-only sm" onClick=${() => safe(api.removeFriend(r.id))} size=${18} />` : null}
        ${outgoing ? html`<${GBtn} icon="x" title="Cancelar pedido" class="icon-only sm" onClick=${() => safe(api.removeFriend(r.id))} size=${18} />` : null}
        ${r.status === 'accepted' ? html`
          <${GBtn} icon="message" title="Mensagem" class="icon-only sm" onClick=${() => openDM(other)} size=${18} />
          <${GBtn} icon="phone" title="Ligar" class="icon-only sm" onClick=${call} size=${18} />
          <${GBtn} icon="more" title="Mais" class="icon-only sm" size=${18} onClick=${(e) => openMenu(e, [
            { label: 'Ver perfil', icon: html`<${Icon} n="user" s=${18} />`, onClick: () => openModal('profile', { id: other }) },
            { sep: true },
            { label: 'Desfazer amizade', danger: true, icon: html`<${Icon} n="trash" s=${18} />`, onClick: () => openModal('confirm', { title: 'Desfazer amizade', text: `Remover ${u.displayName} dos amigos?`, action: () => run(api.removeFriend(r.id)) }) },
          ], { anchor: true })} />` : null}
      </div>
    </div>`;
}

function AddFriend() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const me = useS((s) => s.me);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await run(api.friendRequest(name), 'Pedido enviado!'); setName(''); } catch {} finally { setBusy(false); }
  };
  return html`
    <div class="addfriend">
      <h3>Adicionar amigo</h3>
      <p class="muted">Digite o nome de usuário. O seu é <button class="chip" onClick=${() => navigator.clipboard?.writeText(me.username).then(() => toast('Copiado.'))}>@${me.username} <${Icon} n="copy" s=${13} /></button></p>
      <form class="addfriend-form glass" onSubmit=${submit}>
        <input value=${name} onInput=${(e) => setName(e.target.value)} placeholder="usuario_do_amigo" autocapitalize="none" spellcheck="false" />
        <button class="gbtn primary" disabled=${busy || !name.trim()}>Enviar pedido</button>
      </form>
      <div class="invite-card">
        <${Icon} n="sparkles" s=${20} />
        <div><b>Chamando alguém novo?</b><p class="muted">Mande o link do app e o código de convite <code>${S.inviteCode}</code>. Sem o código não dá para criar conta.</p></div>
      </div>
    </div>`;
}

export function DMList() {
  const dms = useS((s) => s.dms);
  const last = useS((s) => s.lastIds);
  const cur = useS((s) => s.view.channelId);
  const voice = useS((s) => s.voice);
  // conversas com mensagem mais recente primeiro (ids do Postgres não ordenam por tempo, então usa o cache local)
  const list = Object.values(dms).filter((d) => S.users[d.members.find((m) => m !== S.uid)]);
  list.sort((a, b) => (S.messages[b.id]?.list.at(-1)?.createdAt || (last[b.id] ? 1 : 0)) - (S.messages[a.id]?.list.at(-1)?.createdAt || (last[a.id] ? 1 : 0)));
  return html`
    <div class="dmlist">
      <button class=${cx('ch big', !cur && 'on')} onClick=${() => { set((s) => { s.view = { serverId: null, channelId: null, homeTab: s.view.homeTab === 'add' ? 'online' : s.view.homeTab }; s.ui = { ...s.ui, tab: 'friends', pane: 'list', stage: false }; }); }}>
        <${Icon} n="users" s=${20} /><span>Amigos</span>
      </button>
      <div class="ch-group-head"><span>Mensagens diretas</span></div>
      ${list.length ? list.map((d) => html`<${DMRow} key=${d.id} d=${d} on=${cur === d.id} inCall=${!!voice[d.id]?.length} />`)
        : html`<p class="muted small pad">Abra uma conversa pela lista de amigos.</p>`}
    </div>`;
}

function DMRow({ d, on, inCall }) {
  const other = d.members.find((m) => m !== S.uid);
  const u = useS((s) => s.users[other]);
  const unread = useS((s) => isUnread(s, d.id));
  const st = useS((s) => statusOf(s, other));
  return html`
    <button class=${cx('dm', on && 'on', unread && 'unread')} onClick=${() => { set((s) => { s.ui = { ...s.ui, stage: false }; }); go(null, d.id); }}>
      <${Avatar} id=${other} size=${36} status />
      <span class="dm-name"><b>${u?.displayName}</b><small>${inCall ? '📞 Em chamada' : u?.customStatus || STATUS_LABEL[st]}</small></span>
      ${unread ? html`<i class="pill-dot"></i>` : null}
    </button>`;
}
