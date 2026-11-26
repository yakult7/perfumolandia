// Perfil completo (como no Discord): cartão do perfil à esquerda e, à direita,
// abas de Atividade, Amigos em comum e Servidores em comum.
import { html, useState, useEffect, cx } from '../lib.js';
import { useS, S, setSettings } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { closeModal, openModal, openDM, callDM, run, statusOf, go, roomName } from '../actions.js';
import { requestControl } from '../remote.js';
import { Avatar, useNow } from './common.js';
import { ProfileCard } from './profile.js';
import { userMenu, nameOf } from './usermenu.js';

const SINCE = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};

export function FullProfile({ id }) {
  const u = useS((s) => s.users[id]);
  const st = useS((s) => statusOf(s, id));
  const rel = useS((s) => Object.values(s.relations).find((r) => (r.from === id && r.to === s.uid) || (r.to === id && r.from === s.uid)));
  const pc = useS((s) => !!s.pcs[id]);
  const servers = useS((s) => s.servers);
  const note = useS((s) => s.settings.notes?.[id] || '');
  const [tab, setTab] = useState('activity');
  const [mutual, setMutual] = useState(null);
  const me = id === S.uid;

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && closeModal();
    addEventListener('keydown', k);
    if (!me) api.sb.rpc('mutual_friends', { other: id }).then(({ data }) => setMutual((data || []).map((x) => (typeof x === 'string' ? x : Object.values(x)[0])).filter((x) => S.users[x])));
    else setMutual([]);
    return () => removeEventListener('keydown', k);
  }, [id]);
  if (!u) return null;

  const sharedServers = me ? [] : Object.values(servers).filter((sv) => sv.members.includes(id));
  const friend = rel?.status === 'accepted';
  const actions = me ? html`
      <button class="gbtn sm primary" onClick=${() => openModal('settings', { tab: 'account' })}><${Icon} n="edit" s=${14} /> Editar perfil</button>`
    : html`
      ${friend ? html`
        <button class="gbtn sm primary" onClick=${() => { closeModal(); openDM(id); }}><${Icon} n="message" s=${14} /> Mensagem</button>
        <button class="gbtn sm icon-only" title="Ligar" onClick=${async () => { closeModal(); const dm = await openDM(id); callDM(dm.id); }}><${Icon} n="phone" s=${15} /></button>
        ${pc ? html`<button class="gbtn sm icon-only" title="Controlar o PC (ele precisa permitir)" onClick=${() => { closeModal(); requestControl(id); }}><${Icon} n="remote" s=${15} /></button>` : null}`
        : rel ? html`<span class="muted small">Pedido de amizade pendente</span>`
        : html`<button class="gbtn sm primary" onClick=${() => run(api.friendRequest(u.username), 'Pedido enviado!')}><${Icon} n="userPlus" s=${14} /> Adicionar amigo</button>`}
      <button class="gbtn sm icon-only" title="Mais" onClick=${(e) => userMenu(e, id, { anchor: true })}><${Icon} n="more" s=${15} /></button>`;

  const tabs = [
    { key: 'activity', label: 'Atividade' },
    ...(!me ? [
      { key: 'friends', label: mutual === null || !mutual.length ? (mutual ? 'Sem amigos em comum' : 'Amigos em comum') : `${mutual.length} ${mutual.length === 1 ? 'amigo' : 'amigos'} em comum` },
      { key: 'servers', label: `${sharedServers.length ? sharedServers.length : 'Sem'} ${sharedServers.length === 1 ? 'servidor' : 'servidores'} em comum` },
    ] : []),
  ];

  return html`
    <div class="modal-wrap fp-wrap" onPointerDown=${(e) => e.target === e.currentTarget && closeModal()}>
      <div class="fp sheet pop" role="dialog" aria-label=${'Perfil de ' + u.displayName}>
        <button class="fp-close" onClick=${closeModal} aria-label="Fechar"><${Icon} n="x" s=${16} /></button>
        <div class="fp-left">
          <${ProfileCard} u=${u} status=${st}>${actions}<//>
          ${friend && rel.createdAt ? html`<div class="fp-sec"><small>Amigos desde</small><span>${SINCE(rel.createdAt)}</span></div>` : null}
          ${!me ? html`
            <div class="fp-sec"><small>Nota (visível apenas para você)</small>
              <textarea class="fp-note" rows="2" maxlength="256" placeholder="Clique para adicionar uma nota" value=${note}
                onChange=${(e) => setSettings({ notes: { ...(S.settings.notes || {}), [id]: e.target.value.trim() || undefined } })}></textarea></div>` : null}
        </div>
        <div class="fp-right">
          <nav class="fp-tabs">
            ${tabs.map((t) => html`<button key=${t.key} class=${cx('fp-tab', tab === t.key && 'on')} onClick=${() => setTab(t.key)}>${t.label}</button>`)}
          </nav>
          <div class="fp-content">
            ${tab === 'activity' ? html`<${Activity} id=${id} />` : null}
            ${tab === 'friends' ? (mutual === null ? html`<p class="fp-empty">Carregando…</p>`
              : !mutual.length ? html`<p class="fp-empty">Nenhum amigo em comum.</p>`
              : mutual.map((f) => html`
                <button key=${f} class="fp-row" onClick=${() => openModal('profile', { id: f })}>
                  <${Avatar} id=${f} size=${36} status />
                  <span class="fp-row-main"><b>${nameOf(f, S.users[f]?.displayName)}</b><small>@${S.users[f]?.username}</small></span>
                  <${Icon} n="right" s=${15} />
                </button>`)) : null}
            ${tab === 'servers' ? (!sharedServers.length ? html`<p class="fp-empty">Nenhum servidor em comum.</p>`
              : sharedServers.map((sv) => html`
                <button key=${sv.id} class="fp-row" onClick=${() => { closeModal(); go(sv.id); }}>
                  <span class="fp-sv">${sv.icon ? html`<img src=${sv.icon} alt="" />` : sv.name.slice(0, 2).toUpperCase()}</span>
                  <span class="fp-row-main"><b>${sv.name}</b><small>${sv.members.length} membros</small></span>
                  <${Icon} n="right" s=${15} />
                </button>`)) : null}
          </div>
        </div>
      </div>
    </div>`;
}

/** aba Atividade: jogo (com o tempo correndo), música e chamada de agora */
function Activity({ id }) {
  const g = useS((s) => s.games[id] || null);
  const m = useS((s) => s.musics[id] || null);
  const voice = useS((s) => s.voice);
  useNow(1000);
  const call = Object.entries(voice).find(([, parts]) => parts.some((p) => p.userId === id));
  const [recent, setRecent] = useState(null);
  useEffect(() => { api.recentActivity(id).then(setRecent).catch(() => setRecent([])); }, [id, g?.name, m?.title]);
  // o que está acontecendo agora não repete na lista de recentes
  const past = (recent || []).filter((r) => !(r.kind === 'game' && g && r.name === g.name && !r.ended_at) && !(r.kind === 'music' && m && r.name === m.title && !r.ended_at));
  const now = !!(g || m || call);
  return html`
    ${now ? html`<span class="fp-title">Atividade atual</span>` : null}
    ${g ? html`
      <div class="fp-act">
        <small>Jogando</small>
        <div class="fp-act-body">
          ${g.img ? html`<img class=${cx('fp-art', g.wide && 'wide')} src=${g.img} alt="" />` : html`<span class="fp-art ph"><${Icon} n="game" s=${26} /></span>`}
          <div><b>${g.name}</b>${g.server ? html`<span>${g.server}</span>` : null}
            ${g.since ? html`<span class="fp-timer"><${Icon} n="game" s=${13} /> ${clock(Date.now() - g.since)}</span>` : null}</div>
        </div>
      </div>` : null}
    ${m ? html`
      <div class="fp-act">
        <small>Ouvindo no ${m.app || 'Spotify'}</small>
        <div class="fp-act-body">
          ${m.art ? html`<img class="fp-art" src=${m.art} alt="" />` : html`<span class="fp-art ph"><${Icon} n="music" s=${26} /></span>`}
          <div><b>${m.title}</b><span>${m.artist}</span></div>
        </div>
      </div>` : null}
    ${call ? html`
      <div class="fp-act">
        <small>Em uma chamada</small>
        <div class="fp-act-body">
          <span class="fp-art ph"><${Icon} n="phone" s=${24} /></span>
          <div><b>${roomName(call[0])}</b><span>${call[1].length} ${call[1].length === 1 ? 'pessoa' : 'pessoas'}</span></div>
        </div>
      </div>` : null}
    ${past.length ? html`<span class="fp-title" style=${now ? 'margin-top:8px' : ''}>Atividade recente</span>
      ${past.map((r) => html`
        <div class="fp-recent" key=${r.id}>
          ${r.img ? html`<img class=${cx('fp-rart', r.wide && 'wide')} src=${r.img} alt="" />` : html`<span class="fp-rart ph"><${Icon} n=${r.kind === 'game' ? 'game' : 'music'} s=${20} /></span>`}
          <div class="fp-recent-main"><b>${r.name}</b>
            ${r.detail ? html`<span>${r.detail}</span>` : null}
            <small><${Icon} n=${r.kind === 'game' ? 'game' : 'music'} s=${12} /> ${ago(Date.parse(r.ended_at || r.started_at))}
              ${r.kind === 'game' && r.ended_at ? html` · <${Icon} n="clock" s=${12} /> ${dur(Date.parse(r.ended_at) - Date.parse(r.started_at))}` : null}</small></div>
        </div>`)}` : null}
    ${!now && recent && !past.length ? html`<p class="fp-empty"><${Icon} n="game" s=${26} /><br />Nenhuma atividade ainda.<br /><small>Jogos e músicas do app do Windows aparecem aqui.</small></p>` : null}`;
}
/** "agora", "5 min atrás", "8h atrás", "3d atrás", "2 sem." */
const ago = (ts) => {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d atrás`;
  return `Há ${Math.floor(d / 7)} sem.`;
};
const dur = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ''}`; };
