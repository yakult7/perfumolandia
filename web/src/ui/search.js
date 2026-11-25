// Busca rápida (Ctrl+K), como o "Encontre ou comece uma conversa" do Discord:
// amigos/pessoas, conversas/grupos/canais e mensagens (no servidor, só onde você tem acesso).
import { html, useState, useEffect, useRef, cx, timeAgo } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import { sb } from '../api.js';
import { closeModal, go, openDM, roomName } from '../actions.js';
import { Avatar } from './common.js';
import { nameOf } from './usermenu.js';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** destaca o termo no trecho da mensagem */
function snippet(text, q) {
  const n = norm(text), i = n.indexOf(norm(q));
  if (i < 0) return esc(text.slice(0, 120));
  const a = Math.max(0, i - 40), b = Math.min(text.length, i + q.length + 70);
  return (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, b)) + (b < text.length ? '…' : '');
}

export function SearchModal() {
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState(null); // null = ainda não buscou
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const users = useS((s) => s.users);
  const rels = useS((s) => s.relations);
  const dms = useS((s) => s.dms);
  const groups = useS((s) => s.groups);
  const servers = useS((s) => s.servers);

  useEffect(() => { input.current?.focus(); }, []);
  // mensagens: busca no servidor depois que para de digitar
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setMsgs(null); return; }
    let live = true;
    const id = setTimeout(async () => {
      const { data } = await sb.from('messages').select('id,channel_id,author_id,content,created_at')
        .ilike('content', `%${t.replace(/[%_\\]/g, (c) => '\\' + c)}%`).eq('type', 'text')
        .order('created_at', { ascending: false }).limit(25);
      if (live) setMsgs(data || []);
    }, 280);
    return () => { live = false; clearTimeout(id); };
  }, [q]);

  const t = norm(q.trim());
  const friendIds = new Set(Object.values(rels).filter((r) => r.status === 'accepted').map((r) => (r.from === S.uid ? r.to : r.from)));
  const dmWith = new Set(Object.values(dms).map((d) => d.members.find((m) => m !== S.uid)));
  const people = Object.values(users)
    .filter((u) => u.id !== S.uid && (friendIds.has(u.id) || dmWith.has(u.id)) && !S.settings.blocked?.[u.id])
    .filter((u) => !t || norm(nameOf(u.id, u.displayName) + ' ' + u.username + ' ' + u.displayName).includes(t))
    .sort((a, b) => (friendIds.has(b.id) - friendIds.has(a.id)) || nameOf(a.id).localeCompare(nameOf(b.id)))
    .slice(0, t ? 8 : 6);
  const rooms = t ? [
    ...Object.values(groups).map((g) => ({ id: g.id, name: roomName(g.id), sub: `Grupo · ${g.members.length} membros`, icon: 'users', go: () => go(null, g.id) })),
    ...Object.values(servers).flatMap((sv) => sv.channels.filter((c) => c.type === 'text').map((c) => ({ id: c.id, name: c.name, sub: sv.name, icon: 'hash', go: () => go(sv.id, c.id) }))),
  ].filter((r) => norm(r.name + ' ' + r.sub).includes(t)).slice(0, 6) : [];
  const openRoom = (cid) => {
    if (S.dms[cid] || S.groups[cid]) return go(null, cid);
    const sv = Object.values(S.servers).find((x) => x.channels.some((c) => c.id === cid));
    if (sv) go(sv.id, cid);
  };
  const msgItems = (msgs || []).filter((m) => !S.settings.blocked?.[m.author_id]);

  // lista plana para navegar com as setas
  const items = [
    ...people.map((u) => ({ key: 'u' + u.id, run: () => openDM(u.id) })),
    ...rooms.map((r) => ({ key: 'r' + r.id, run: r.go })),
    ...msgItems.map((m) => ({ key: 'm' + m.id, run: () => openRoom(m.channel_id) })),
  ];
  const pick = (i) => { const it = items[i]; if (!it) return; closeModal(); it.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(items.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') closeModal();
  };
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { document.querySelector('.qs-item.on')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  let n = -1;
  const row = (key, content, run) => { n++; const i = n; return html`<button key=${key} class=${cx('qs-item', sel === i && 'on')} onMouseMove=${() => sel !== i && setSel(i)} onClick=${() => pick(i)}>${content}</button>`; };

  return html`
    <div class="modal-wrap qs-wrap" onPointerDown=${(e) => e.target === e.currentTarget && closeModal()}>
      <div class="qs sheet pop" role="dialog" aria-label="Buscar">
        <label class="qs-bar"><${Icon} n="search" s=${18} />
          <input ref=${input} placeholder="Buscar amigos, conversas ou mensagens" value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKey} />
          ${q ? html`<button class="qs-clear" onClick=${() => { setQ(''); input.current?.focus(); }} aria-label="Limpar"><${Icon} n="x" s=${14} /></button>` : html`<kbd class="qs-kbd">Esc</kbd>`}
        </label>
        <div class="qs-list">
          ${people.length ? html`<span class="qs-title">${t ? 'Pessoas' : 'Amigos'}</span>` : null}
          ${people.map((u) => row('u' + u.id, html`
            <${Avatar} id=${u.id} size=${32} status />
            <span class="qs-main"><b>${nameOf(u.id, u.displayName)}</b><small>@${u.username}${friendIds.has(u.id) ? '' : ' · conversa'}</small></span>
            <span class="qs-hint">Conversar <${Icon} n="right" s=${13} /></span>`))}
          ${rooms.length ? html`<span class="qs-title">Conversas e canais</span>` : null}
          ${rooms.map((r) => row('r' + r.id, html`
            <span class="qs-ic"><${Icon} n=${r.icon} s=${16} /></span>
            <span class="qs-main"><b>${r.name}</b><small>${r.sub}</small></span>`))}
          ${q.trim().length >= 2 ? html`<span class="qs-title">Mensagens${msgs === null ? ' · buscando…' : ''}</span>` : null}
          ${msgItems.map((m) => row('m' + m.id, html`
            <${Avatar} id=${m.author_id} size=${32} />
            <span class="qs-main"><b>${nameOf(m.author_id, users[m.author_id]?.displayName)} <i class="qs-where">em ${roomName(m.channel_id)} · ${timeAgo(Date.parse(m.created_at))}</i></b>
              <small class="qs-snip" dangerouslySetInnerHTML=${{ __html: snippet(m.content, q.trim()) }}></small></span>`))}
          ${q.trim().length >= 2 && msgs && !msgItems.length && !people.length && !rooms.length ? html`<p class="qs-empty">Nada encontrado para "${q.trim()}".</p>` : null}
          ${!q ? html`<p class="qs-tip">Dica: aperte <kbd>Ctrl</kbd> + <kbd>K</kbd> em qualquer lugar para abrir a busca.</p>` : null}
        </div>
      </div>
    </div>`;
}
