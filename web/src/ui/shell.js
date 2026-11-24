import { html, useMedia, cx, useEffect } from '../lib.js';
import { useS, S, setUI, set } from '../store.js';
import { Icon } from '../icons.js';
import { GlassBar, GlassMenu } from '../glass.js';
import * as rtc from '../rtc.js';
import * as api from '../api.js';
import {
  go, goHome, openModal, openMenu, closeMenu, isUnread, statusOf, dmPartner, roomName, serverOfRoom, safe, run, toast,
} from '../actions.js';
import { Avatar, GBtn, Toasts, STATUS_LABEL, useNow, fmtDur, initials } from './common.js';
import { Chat } from './chat.js';
import { CallStage, MiniCall, Theater } from './call.js';
import { Friends, DMList } from './home.js';
import { Modals, IncomingCall, InstallBanner } from './modals.js';
import { MePage } from './settings.js';
import logo from '../logo.png';

export function Shell() {
  const mobile = useMedia('(max-width: 899px)');
  const menu = useS((s) => s.ui.menu);
  const audioBlocked = useS((s) => s.ui.audioBlocked);
  return html`
    ${mobile ? html`<${MobileShell} />` : html`<${DesktopShell} />`}
    <${Theater} />
    <${Modals} />
    <${IncomingCall} />
    ${menu ? html`<${GlassMenu} key=${menu.key} menu=${menu} onClose=${closeMenu} />` : null}
    ${audioBlocked ? html`<button class="gbtn primary audio-unlock" onClick=${rtc.unlockAudio}><${Icon} n="volume" /> Toque para ativar o som da chamada</button>` : null}
    <${Toasts} />
    <${InstallBanner} />`;
}

// ===================== desktop =====================
function DesktopShell() {
  const view = useS((s) => s.view);
  const stage = useS((s) => s.ui.stage && !!s.call);
  const showMembers = useS((s) => s.ui.showMembers);
  const isServerText = useS((s) => !!s.view.serverId && !!s.view.channelId);
  const groupId = useS((s) => (s.groups[s.view.channelId] ? s.view.channelId : null));
  const connected = useS((s) => s.connected);
  return html`
    <div class="shell desk">
      ${!connected ? html`<div class="offline-pill lg">Reconectando…</div>` : null}
      <${ServerRail} />
      <aside class="side panel material">
        ${view.serverId ? html`<${ServerSidebar} id=${view.serverId} />` : html`<${HomeSidebar} />`}
        <${VoiceDock} />
        <${UserBar} />
      </aside>
      <main class="main panel surface">
        ${stage ? html`<${CallStage} />` : view.channelId ? html`<${Chat} key=${view.channelId} cid=${view.channelId} />` : html`<${Friends} />`}
      </main>
      ${!stage && showMembers && isServerText ? html`<${Members} ids=${S.servers[view.serverId]?.members || []} ownerId=${S.servers[view.serverId]?.ownerId} />` : null}
      ${!stage && showMembers && groupId ? html`<${Members} ids=${S.groups[groupId].members} ownerId=${S.groups[groupId].ownerId} />` : null}
    </div>`;
}

export function ServerRail({ vertical = true, browseOnly = false }) {
  const servers = useS((s) => s.servers);
  const sid = useS((s) => s.view.serverId);
  const unread = useS((s) => Object.fromEntries(Object.values(s.servers).map((sv) => [sv.id, sv.channels.some((c) => c.type === 'text' && isUnread(s, c.id))])));
  const dmUnread = useS((s) => [...Object.keys(s.dms), ...Object.keys(s.groups)].filter((id) => isUnread(s, id)).length);
  const pending = useS((s) => Object.values(s.relations).filter((r) => r.status === 'pending' && r.to === s.uid).length);
  const voiceIn = useS((s) => (s.call ? serverOfRoom(s.call.roomId)?.id : null));
  const list = Object.values(servers).sort((a, b) => a.name.localeCompare(b.name));
  const items = [
    {
      key: 'home', title: 'Conversas e amigos', badge: dmUnread + pending || null,
      render: () => html`<span class="rail-ic home"><img src=${logo} alt="" /></span>`,
    },
    ...list.map((sv) => ({
      key: sv.id, title: sv.name, class: cx(unread[sv.id] && 'unread', voiceIn === sv.id && 'invoice'),
      render: () => html`<span class="rail-ic">${sv.icon ? html`<img src=${sv.icon} alt="" />` : html`<b>${initials(sv.name)}</b>`}</span>`,
      onContext: (e) => serverMenu(e, sv),
    })),
  ];
  return html`
    <nav class="rail">
      <${GlassBar} axis=${vertical ? 'y' : 'x'} dragFrom=${vertical ? 'lens' : 'any'} items=${items} value=${sid || 'home'}
        onChange=${(k) => (browseOnly
          ? set((s) => { s.view = { ...s.view, serverId: k === 'home' ? null : k }; })
          : k === 'home' ? goHome() : go(k))} class="rail-bar" itemClass="rail-item" />
      <button class="gbtn icon-only rail-add" title="Criar ou entrar em servidor" onClick=${() => openModal('addServer')}><${Icon} n="plus" s=${19} /></button>
    </nav>`;
}

export function serverMenu(e, sv) {
  const owner = sv.ownerId === S.uid;
  openMenu(e, [
    { label: 'Convidar amigos', icon: html`<${Icon} n="userPlus" s=${18} />`, onClick: () => openModal('invite', { id: sv.id }) },
    { label: 'Criar canal', icon: html`<${Icon} n="plus" s=${18} />`, onClick: () => openModal('createChannel', { serverId: sv.id }) },
    ...(owner ? [{ label: 'Configurações do servidor', icon: html`<${Icon} n="settings" s=${18} />`, onClick: () => openModal('serverSettings', { id: sv.id }) }] : []),
    { label: 'Marcar tudo como lido', icon: html`<${Icon} n="check" s=${18} />`, onClick: () => sv.channels.forEach((c) => import('../actions.js').then((a) => a.markRead(c.id))) },
    { sep: true },
    owner
      ? { label: 'Excluir servidor', danger: true, icon: html`<${Icon} n="trash" s=${18} />`, onClick: () => openModal('confirm', { title: 'Excluir servidor', text: `Excluir "${sv.name}" e todas as mensagens? Não dá para desfazer.`, action: () => run(api.deleteServer(sv.id), 'Servidor excluído.').then(() => goHome()) }) }
      : { label: 'Sair do servidor', danger: true, icon: html`<${Icon} n="logout" s=${18} />`, onClick: () => openModal('confirm', { title: 'Sair do servidor', text: `Sair de "${sv.name}"?`, action: () => run(api.leaveServer(sv.id)).then(() => goHome()) }) },
  ], { anchor: e.type !== 'contextmenu' });
}

function ServerSidebar({ id }) {
  const sv = useS((s) => s.servers[id]);
  if (!sv) return null;
  return html`
    <header class="side-head lg" onClick=${(e) => serverMenu(e, sv)} role="button" tabindex="0">
      <h2>${sv.name}</h2><${Icon} n="down" s=${18} />
    </header>
    <div class="side-scroll">
      <${ChannelGroup} sv=${sv} type="text" title="Canais de texto" />
      <${ChannelGroup} sv=${sv} type="voice" title="Canais de voz" />
    </div>`;
}

function ChannelGroup({ sv, type, title }) {
  const chans = sv.channels.filter((c) => c.type === type);
  return html`
    <div class="ch-group">
      <div class="ch-group-head">
        <span>${title}</span>
        <button class="mini-btn" title="Criar canal" onClick=${() => openModal('createChannel', { serverId: sv.id, type })}><${Icon} n="plus" s=${16} /></button>
      </div>
      ${chans.map((c) => (type === 'text' ? html`<${TextChannel} key=${c.id} c=${c} sv=${sv} />` : html`<${VoiceChannel} key=${c.id} c=${c} sv=${sv} />`))}
    </div>`;
}

function channelMenu(e, c, sv) {
  openMenu(e, [
    { label: 'Renomear', icon: html`<${Icon} n="edit" s=${18} />`, onClick: () => openModal('renameChannel', { c, serverId: sv.id }) },
    { label: 'Copiar link', icon: html`<${Icon} n="link" s=${18} />`, onClick: () => navigator.clipboard?.writeText(location.origin + location.pathname + '?c=' + c.id).then(() => toast('Link copiado.')) },
    { sep: true },
    { label: 'Excluir canal', danger: true, icon: html`<${Icon} n="trash" s=${18} />`, onClick: () => openModal('confirm', { title: 'Excluir canal', text: `Excluir "${c.name}"? As mensagens somem junto.`, action: () => run(api.deleteChannel(c.id, sv.id)) }) },
  ]);
}

function TextChannel({ c, sv }) {
  const active = useS((s) => s.view.channelId === c.id && !s.ui.stage);
  const unread = useS((s) => isUnread(s, c.id));
  return html`
    <button class=${cx('ch', active && 'on', unread && 'unread')} onClick=${() => { setUI({ stage: false }); go(sv.id, c.id); }}
      onContextMenu=${(e) => channelMenu(e, c, sv)}>
      <${Icon} n="hash" s=${18} /><span>${c.name}</span>
    </button>`;
}

function VoiceChannel({ c, sv }) {
  const parts = useS((s) => s.voice[c.id] || []);
  const mine = useS((s) => s.call?.roomId === c.id);
  const onClick = async () => {
    if (!mine) await rtc.join(c.id);
    setUI({ stage: true, callOpen: true });
  };
  return html`
    <div class="vch">
      <button class=${cx('ch voice', mine && 'on')} onClick=${onClick} onContextMenu=${(e) => channelMenu(e, c, sv)}>
        <${Icon} n="volume" s=${18} /><span>${c.name}</span>${parts.length ? html`<em class="count">${parts.length}</em>` : null}
      </button>
      ${parts.length ? html`<ul class="vch-users">${parts.map((p) => html`<${VoiceUser} key=${p.sid} p=${p} />`)}</ul>` : null}
    </div>`;
}

function VoiceUser({ p }) {
  const u = useS((s) => s.users[p.userId]);
  const st = p.state || {};
  return html`
    <li>
      <${Avatar} id=${p.userId} size=${24} ring />
      <span>${u?.displayName}</span>
      <i class="vu-icons">
        ${st.screen ? html`<b class="live">AO VIVO</b>` : null}
        ${st.camera ? html`<${Icon} n="video" s=${14} />` : null}
        ${st.deafened ? html`<${Icon} n="headphonesOff" s=${14} />` : st.muted ? html`<${Icon} n="micOff" s=${14} />` : null}
      </i>
    </li>`;
}

function HomeSidebar() {
  return html`
    <header class="side-head lg static"><h2>Conversas</h2>
      <span class="side-head-btns">
        <button class="mini-btn" title="Novo grupo" onClick=${() => openModal('createGroup')}><${Icon} n="group" s=${16} /></button>
        <button class="mini-btn" title="Adicionar amigo" onClick=${() => goHome('add')}><${Icon} n="userPlus" s=${16} /></button>
      </span>
    </header>
    <div class="side-scroll"><${DMList} /></div>`;
}

export function UserBar() {
  const me = useS((s) => s.me);
  const st = useS((s) => (s.connected ? s.me?.chosenStatus : 'offline'));
  const call = useS((s) => (s.call ? { muted: s.call.muted, deafened: s.call.deafened } : null));
  if (!me) return null;
  return html`
    <div class="userbar lg">
      <button class="me" onClick=${(e) => statusMenu(e)}>
        <${Avatar} id=${me.id} size=${32} status ring />
        <span class="me-names"><b>${me.displayName}</b><small>${me.customStatus || STATUS_LABEL[st === 'invisible' ? 'invisible' : st] || '@' + me.username}</small></span>
      </button>
      <${GBtn} icon=${call?.muted ? 'micOff' : 'mic'} title=${call ? (call.muted ? 'Ativar microfone' : 'Silenciar') : 'Microfone (entre numa chamada)'}
        class=${cx('icon-only sm', call?.muted && 'off')} onClick=${rtc.toggleMute} disabled=${!call} size=${15} />
      <${GBtn} icon=${call?.deafened ? 'headphonesOff' : 'headphones'} title=${call?.deafened ? 'Ativar áudio' : 'Ensurdecer'}
        class=${cx('icon-only sm', call?.deafened && 'off')} onClick=${rtc.toggleDeafen} disabled=${!call} size=${15} />
      <${GBtn} icon="settings" title="Configurações" class="icon-only sm" onClick=${() => openModal('settings')} size=${15} />
    </div>`;
}

export function statusMenu(e) {
  const item = (st) => ({
    label: STATUS_LABEL[st], checked: S.me.chosenStatus === st,
    icon: html`<i class=${'dot inline st-' + (st === 'invisible' ? 'offline' : st)}></i>`,
    onClick: () => safe(api.updateProfile({ status: st })),
  });
  openMenu(e, [
    { header: S.me.displayName + ' · @' + S.me.username },
    item('online'), item('idle'), item('dnd'), item('invisible'),
    { sep: true },
    { label: 'Editar perfil', icon: html`<${Icon} n="user" s=${16} />`, onClick: () => openModal('settings', { tab: 'account' }) },
    { label: 'Copiar usuário', icon: html`<${Icon} n="copy" s=${16} />`, onClick: () => navigator.clipboard?.writeText(S.me.username).then(() => toast('Usuário copiado.')) },
  ], { anchor: true });
}

function VoiceDock() {
  const call = useS((s) => s.call && { roomId: s.call.roomId, connecting: s.call.connecting, joinedAt: s.call.joinedAt });
  const cam = useS((s) => s.call && rtc.hasCam() && s.call.v);
  const share = useS((s) => s.call && rtc.isSharing() && s.call.v);
  useNow(1000);
  if (!call) return null;
  const sv = serverOfRoom(call.roomId);
  return html`
    <div class="voicedock lg">
      <button class="vd-info" onClick=${() => { if (sv) go(sv.id); else go(null, call.roomId); setUI({ stage: !!sv, callOpen: true }); }}>
        <b class=${call.connecting ? 'connecting' : 'ok'}><${Icon} n="signal" s=${13} /> ${call.connecting ? 'Conectando…' : 'Voz conectada'}</b>
        <small>${roomName(call.roomId)}${sv ? ' / ' + sv.name : ''} · ${fmtDur(Date.now() - call.joinedAt)}</small>
      </button>
      <div class="vd-btns">
        <${GBtn} icon=${cam ? 'video' : 'videoOff'} title="Câmera" class=${cx('icon-only sm', cam && 'on')} onClick=${rtc.toggleCamera} size=${15} />
        <${GBtn} icon="screen" title="Transmitir tela" class=${cx('icon-only sm', share && 'on')} onClick=${() => (share ? rtc.stopScreen() : openModal('screenShare'))} size=${15} />
        <${GBtn} icon="hangup" title="Desconectar" class="icon-only sm danger" onClick=${() => rtc.leave()} size=${15} />
      </div>
    </div>`;
}

function Members({ ids, ownerId }) {
  const rows = useS((s) => ids.map((uid) => ({ uid, st: statusOf(s, uid), name: s.users[uid]?.displayName || '' })));
  const on = rows.filter((r) => r.st !== 'offline').sort((a, b) => a.name.localeCompare(b.name));
  const off = rows.filter((r) => r.st === 'offline').sort((a, b) => a.name.localeCompare(b.name));
  const Row = (r) => html`
    <button key=${r.uid} class=${cx('member', r.st === 'offline' && 'dim')} onClick=${(e) => openModal('profile', { id: r.uid })}>
      <${Avatar} id=${r.uid} size=${30} status />
      <span>${r.name}${ownerId === r.uid ? html` <${Icon} n="crown" s=${13} class="crown" />` : null}</span>
    </button>`;
  return html`
    <aside class="members panel material">
      <div class="side-scroll">
        <div class="mem-head">Online — ${on.length}</div>${on.map(Row)}
        ${off.length ? html`<div class="mem-head">Offline — ${off.length}</div>${off.map(Row)}` : null}
      </div>
    </aside>`;
}

// ===================== mobile =====================
function MobileShell() {
  const pane = useS((s) => s.ui.pane);
  const tab = useS((s) => s.ui.tab);
  const view = useS((s) => s.view);
  const callOpen = useS((s) => !!s.call && s.ui.callOpen);
  const hasCall = useS((s) => !!s.call);
  const dmUnread = useS((s) => [...Object.keys(s.dms), ...Object.keys(s.groups)].filter((id) => isUnread(s, id)).length);
  const pending = useS((s) => Object.values(s.relations).filter((r) => r.status === 'pending' && r.to === s.uid).length);
  const connected = useS((s) => s.connected);
  const inChat = pane === 'chat' && view.channelId;

  useEffect(() => {
    // botão "voltar" do Android / gesto: volta da conversa para a lista
    const onPop = () => { if (S.ui.callOpen && S.call) setUI({ callOpen: false }); else if (S.ui.pane === 'chat') setUI({ pane: 'list' }); };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { if (inChat || callOpen) history.pushState({ p: 1 }, ''); }, [inChat, callOpen]);

  const tabs = [
    { key: 'home', render: (a) => html`<${Icon} n="home" s=${21} /><small>Servidores</small>` },
    { key: 'dms', render: () => html`<${Icon} n="message" s=${21} /><small>Conversas</small>`, badge: dmUnread || null },
    { key: 'friends', render: () => html`<${Icon} n="users" s=${21} /><small>Amigos</small>`, badge: pending || null },
    { key: 'me', render: () => html`<${Avatar} id=${S.uid} size=${24} status /><small>Você</small>` },
  ];
  return html`
    <div class=${cx('shell mob', inChat && 'in-chat')}>
      ${!connected ? html`<div class="offline-pill lg">Reconectando…</div>` : null}
      <section class="mob-list" aria-hidden=${inChat}>
        ${tab === 'home' ? html`<${MobileServers} />` : null}
        ${tab === 'dms' ? html`<div class="mob-page"><div class="mob-title"><h1>Conversas</h1><button class="gbtn icon-only" title="Novo grupo" onClick=${() => openModal('createGroup')}><${Icon} n="group" s=${17} /></button></div><div class="side-scroll"><${DMList} /></div></div>` : null}
        ${tab === 'friends' ? html`<div class="mob-page"><${Friends} mobile /></div>` : null}
        ${tab === 'me' ? html`<div class="mob-page"><${MePage} /></div>` : null}
        <${GlassBar} items=${tabs} value=${tab} onChange=${(k) => setUI({ tab: k })} class="tabbar" itemClass="tab" />
      </section>
      <section class="mob-chat">${inChat ? html`<${Chat} key=${view.channelId} cid=${view.channelId} mobile />` : null}</section>
      ${hasCall && !callOpen ? html`<${MiniCall} />` : null}
      ${callOpen ? html`<div class="mob-call"><${CallStage} mobile /></div>` : null}
    </div>`;
}

function MobileServers() {
  const sid = useS((s) => s.view.serverId);
  return html`
    <div class="mob-servers">
      <${ServerRail} browseOnly />
      <div class="mob-side material">
        ${sid ? html`<${ServerSidebar} id=${sid} />` : html`<${HomeSidebar} />`}
        <${VoiceDock} />
      </div>
    </div>`;
}
