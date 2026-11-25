// Perfil em "popover": abre colado no avatar/nome que você clicou (como no Discord),
// e o painel de perfil na lateral da conversa.
import { html, useState, useRef, useLayoutEffect, useEffect, cx } from '../lib.js';
import { useS, S, setUI } from '../store.js';
import { Icon } from '../icons.js';
import { openDM, callDM, openModal, statusOf, sendMessage, go } from '../actions.js';
import { ProfileCard } from './profile.js';
import { userMenu } from './usermenu.js';
import { requestControl } from '../remote.js';

/** abre o cartão do usuário ao lado do elemento clicado */
export function openProfile(uid, e) {
  const el = e?.currentTarget?.getBoundingClientRect ? e.currentTarget : e?.target?.closest?.('button,[data-uid],.avatar') || null;
  const r = el?.getBoundingClientRect?.() || { left: innerWidth / 2 - 150, right: innerWidth / 2 - 150, top: 120, bottom: 120, width: 0 };
  setUI({ popover: { uid, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, key: Math.random() }, menu: null });
}
export const closeProfile = () => setUI({ popover: null });

export function ProfilePopover() {
  const pop = useS((s) => s.ui.popover);
  const ref = useRef();
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!pop || !ref.current) return;
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    const { rect } = pop;
    const gap = 12;
    // à direita do que foi clicado; se não couber, à esquerda; nunca sai da tela
    let x = rect.right + gap;
    if (x + w > innerWidth - 8) x = rect.left - w - gap;
    if (x < 8) x = Math.min(innerWidth - w - 8, Math.max(8, rect.left));
    let y = Math.min(rect.top - 20, innerHeight - h - 12);
    y = Math.max(12 + (ref.current.querySelector('.framed') ? 40 : 0), y);
    setPos({ x, y });
  }, [pop?.key]);
  useEffect(() => {
    if (!pop) return;
    const down = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest('.menu,.modal-wrap')) closeProfile(); };
    const key = (e) => e.key === 'Escape' && closeProfile();
    setTimeout(() => addEventListener('pointerdown', down, true));
    addEventListener('keydown', key);
    return () => { removeEventListener('pointerdown', down, true); removeEventListener('keydown', key); };
  }, [pop?.key]);
  if (!pop) return null;
  return html`
    <div ref=${ref} class="ppop pop" style=${pos ? `left:${pos.x}px;top:${pos.y}px` : 'visibility:hidden;left:0;top:0'}>
      <${UserCard} uid=${pop.uid} compact />
    </div>`;
}

/** cartão completo do usuário com ações (popover e painel lateral) */
export function UserCard({ uid, compact, panel }) {
  const u = useS((s) => s.users[uid]);
  const st = useS((s) => statusOf(s, uid));
  const pc = useS((s) => !!s.pcs[uid]);
  const note = useS((s) => s.settings.notes?.[uid] || '');
  const nick = useS((s) => s.settings.nicknames?.[uid] || '');
  const rel = useS((s) => Object.values(s.relations).find((r) => (r.from === uid && r.to === s.uid) || (r.to === uid && r.from === s.uid)));
  const [msg, setMsg] = useState('');
  if (!u) return null;
  const me = uid === S.uid;
  const friend = rel?.status === 'accepted';
  const send = async () => {
    const t = msg.trim();
    if (!t) return;
    setMsg('');
    const dm = await openDM(uid);
    sendMessage(dm.id, t);
    closeProfile();
  };
  const mutual = Object.values(S.servers).filter((sv) => sv.members?.includes(uid));
  return html`
    <div class=${cx('ucard', panel && 'panel-card')}>
      <${ProfileCard} u=${nick ? { ...u, displayName: nick, realName: u.displayName } : u} status=${st}>
        ${note ? html`<div class="pcard-section"><small>Nota</small><span class="pcard-note">${note}</span></div>` : null}
        ${mutual.length && !me ? html`<div class="pcard-section"><small>Servidores em comum · ${mutual.length}</small>
          <div class="mutual">${mutual.slice(0, 6).map((sv) => html`<button key=${sv.id} class="mutual-sv" title=${sv.name} onClick=${() => { closeProfile(); go(sv.id); }}>${sv.icon ? html`<img src=${sv.icon} alt="" />` : sv.name.slice(0, 2)}</button>`)}</div></div>` : null}
        <div class="ucard-actions">
          ${me ? html`<button class="gbtn sm primary" onClick=${() => { closeProfile(); openModal('settings', { tab: 'account' }); }}><${Icon} n="edit" s=${14} /> Editar perfil</button>`
            : html`
              ${friend ? html`<button class="gbtn sm icon-only" title="Ligar" onClick=${async () => { closeProfile(); const dm = await openDM(uid); callDM(dm.id); }}><${Icon} n="phone" s=${15} /></button>` : null}
              ${friend && pc ? html`<button class="gbtn sm icon-only" title="Controlar PC" onClick=${() => { closeProfile(); requestControl(uid); }}><${Icon} n="remote" s=${15} /></button>` : null}
              ${!compact ? html`<button class="gbtn sm icon-only" title="Ver perfil completo" onClick=${() => { closeProfile(); openModal('profile', { id: uid }); }}><${Icon} n="maximize" s=${15} /></button>` : null}`}
          <button class="gbtn sm icon-only" title="Mais" onClick=${(e) => userMenu(e, uid, { anchor: true })}><${Icon} n="more" s=${16} /></button>
        </div>
      <//>
      ${!me && compact ? html`
        <form class="ucard-msg" onSubmit=${(e) => { e.preventDefault(); send(); }}>
          <input value=${msg} onInput=${(e) => setMsg(e.target.value)} placeholder=${`Conversar com @${u.username}`} />
          <button class="gbtn sm icon-only" disabled=${!msg.trim()} title="Enviar"><${Icon} n="send" s=${14} /></button>
        </form>` : null}
      ${compact ? html`<button class="ucard-full" onClick=${() => { closeProfile(); openModal('profile', { id: uid }); }}>Ver perfil completo</button>` : null}
    </div>`;
}
