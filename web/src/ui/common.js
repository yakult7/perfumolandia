import { html, useRef, useEffect, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import { closeModal, statusOf } from '../actions.js';
import { optimizeImage } from '../media.js';
import { decoSvg, hasDeco } from '../decoart.js';

export const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function Avatar({ id, size = 36, status = false, ring = false, user: u0, deco: decoOverride }) {
  const u = useS((s) => u0 || s.users[id]);
  const st = useS((s) => (status ? statusOf(s, id) : null));
  const speaking = useS((s) => (ring ? !!s.speaking[id] : false));
  const name = u?.displayName || '?';
  const deco = decoOverride !== undefined ? decoOverride : u?.decoration;
  return html`
    <span class=${cx('avatar', speaking && 'speaking')} style=${`--s:${size}px;--c:${u?.color || '#7c5cff'}`}>
      ${u?.avatar ? html`<img src=${u.avatar} alt="" loading="lazy" draggable="false" />` : html`<b>${initials(name)}</b>`}
      ${status ? html`<i class=${'dot st-' + st} title=${STATUS_LABEL[st]}></i>` : null}
      ${deco && size >= 24 && hasDeco(deco) ? html`<span class="deco" dangerouslySetInnerHTML=${{ __html: decoSvg(deco) }}></span>` : null}
    </span>`;
}
export const STATUS_LABEL = { online: 'Online', idle: 'Ausente', dnd: 'Não perturbe', invisible: 'Invisível', offline: 'Offline' };

/** linha curta de status: "Jogando X" (com ícone do jogo) ou o texto de sempre */
const hideImg = (e) => { e.target.style.display = 'none'; };
export function Activity({ id, fallback }) {
  const g = useS((s) => s.games[id] || null);
  const m = useS((s) => s.musics[id] || null);
  if (!g && m) return html`<span class="act-line music">${m.art ? html`<img src=${m.art} alt="" class="act-ico" onError=${hideImg} />` : html`<${Icon} n="music" s=${12} />`}<span class="act-txt">Ouvindo <b>${m.title}</b></span></span>`;
  if (!g) return fallback;
  return html`<span class="act-line">${g.img ? html`<img src=${g.img} alt="" class=${cx('act-ico', g.wide && 'wide')} onError=${hideImg} />` : html`<${Icon} n="game" s=${12} />`}<span class="act-txt">Jogando <b>${g.name}</b></span></span>`;
}

/** cartão "Jogando agora" do perfil: capa do jogo, nome e há quanto tempo */
export function GameCard({ id }) {
  const g = useS((s) => s.games[id] || null);
  const m = useS((s) => s.musics[id] || null);
  useNow(30000);
  const music = m ? html`
    <div class="pcard-section"><small>Ouvindo no ${m.app || 'Spotify'}</small>
      <div class="game-card music">
        ${m.art ? html`<img src=${m.art} alt="" onError=${hideImg} />` : html`<span class="game-ph"><${Icon} n="music" s=${22} /></span>`}
        <div><b>${m.title}</b><span class="muted">${m.artist}</span></div>
      </div>
    </div>` : null;
  if (!g) return music;
  const min = Math.max(0, Math.floor((Date.now() - (g.since || Date.now())) / 60000));
  const tempo = min < 1 ? 'agora mesmo' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)} h ${min % 60} min`;
  return html`
    <div class="pcard-section"><small>Jogando agora</small>
      <div class=${cx('game-card', g.wide && 'wide')}>
        ${g.img ? html`<img src=${g.img} alt="" onError=${hideImg} />` : html`<span class="game-ph"><${Icon} n="game" s=${22} /></span>`}
        <div><b>${g.name}</b><span class="muted">${tempo}</span></div>
      </div>
    </div>${music}`;
}

/** botão de vidro redondo/pílula */
export const GBtn = ({ icon, label, onClick, active, danger, class: c = '', title, size = 17, children, ...rest }) => html`
  <button type="button" class=${cx('gbtn', active && 'active', danger && 'danger', c)} title=${title || label} aria-label=${title || label} onClick=${onClick} ...${rest}>
    ${icon ? html`<${Icon} n=${icon} s=${size} />` : null}${label && !c.includes('icon-only') ? html`<span>${label}</span>` : null}${children}
  </button>`;

export function Video({ stream, mirror, contain, muted = true, class: c = '', onDbl }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== stream) v.srcObject = stream || null;
    v?.play?.().catch(() => {});
  }, [stream]);
  return html`<video ref=${ref} class=${cx('vid', mirror && 'mirror', contain && 'contain', c)} autoplay playsinline muted=${muted} onDblClick=${onDbl}></video>`;
}

export function Modal({ title, children, wide, onClose = closeModal, class: c = '', footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return html`
    <div class="modal-wrap" onPointerDown=${(e) => e.target === e.currentTarget && onClose()}>
      <div class=${cx('modal sheet pop', wide && 'wide', c)} role="dialog" aria-modal="true" aria-label=${title}>
        <header class="modal-head">
          <h2>${title}</h2>
          <button type="button" class="gbtn icon-only sm" aria-label="Fechar" onClick=${onClose}><${Icon} n="x" s=${15} /></button>
        </header>
        <div class="modal-body">${children}</div>
        ${footer ? html`<footer class="modal-foot">${footer}</footer>` : null}
      </div>
    </div>`;
}

/** campo de senha com botão de mostrar/esconder */
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return html`
    <span class="pw-wrap">
      <input ...${props} type=${show ? 'text' : 'password'} />
      <button type="button" class="pw-eye" aria-label=${show ? 'Esconder senha' : 'Mostrar senha'} title=${show ? 'Esconder senha' : 'Mostrar senha'}
        onClick=${() => setShow(!show)}><${Icon} n=${show ? 'eyeOff' : 'eye'} s=${17} /></button>
    </span>`;
}

/** avatar de grupo: ícone próprio ou dois avatares sobrepostos */
export function GroupAvatar({ g, size = 36 }) {
  const ids = g.members.filter((m) => m !== S.uid).slice(0, 2);
  if (g.icon) return html`<span class="group-av img" style=${`--s:${size}px`}><img src=${g.icon} alt="" /></span>`;
  return html`<span class="group-av" style=${`--s:${size}px`}>${ids.map((id) => html`<${Avatar} key=${id} id=${id} size=${Math.round(size * 0.68)} />`)}</span>`;
}

export const Field = ({ label, hint, children }) => html`
  <label class="field"><span class="field-label">${label}</span>${children}${hint ? html`<small class="field-hint">${hint}</small>` : null}</label>`;

export function Toasts() {
  const toasts = useS((s) => s.ui.toasts);
  return html`<div class="toasts" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} class=${cx('toast lg pop', t.kind)}>${t.text}</div>`)}</div>`;
}

export const Spinner = ({ s = 20 }) => html`<span class="spinner" style=${`--s:${s}px`}></span>`;

/** escolhe arquivo de imagem e devolve File */
export function pickFile(accept = 'image/*', multiple = false) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => res(multiple ? [...i.files] : i.files[0] || null);
    i.click();
  });
}

/** reduz imagem (avatar/ícone) para no máx. N px, em webp */
/** reduz e converte para WebP (GIF vira WebP animado) */
export const shrinkImage = (file, max = 512) => optimizeImage(file, { max, quality: 0.86 });

export const Empty = ({ icon = 'sparkles', title, text, children }) => html`
  <div class="empty"><div class="empty-ic"><${Icon} n=${icon} s=${28} /></div><h3>${title}</h3>${text ? html`<p>${text}</p>` : null}${children}</div>`;

export function useNow(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
export const fmtDur = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
