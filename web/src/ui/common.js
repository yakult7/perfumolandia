import { html, useRef, useEffect, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import { closeModal, statusOf } from '../actions.js';

export const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function Avatar({ id, size = 40, status = false, ring = false, user: u0 }) {
  const u = useS((s) => u0 || s.users[id]);
  const st = useS((s) => (status ? statusOf(s, id) : null));
  const speaking = useS((s) => (ring ? !!s.speaking[id] : false));
  const name = u?.displayName || '?';
  return html`
    <span class=${cx('avatar', speaking && 'speaking')} style=${`--s:${size}px;--c:${u?.color || '#7c5cff'}`}>
      ${u?.avatar ? html`<img src=${u.avatar} alt="" loading="lazy" draggable="false" />` : html`<b>${initials(name)}</b>`}
      ${status ? html`<i class=${'dot st-' + st} title=${STATUS_LABEL[st]}></i>` : null}
    </span>`;
}
export const STATUS_LABEL = { online: 'Online', idle: 'Ausente', dnd: 'Não perturbe', invisible: 'Invisível', offline: 'Offline' };

/** botão de vidro redondo/pílula */
export const GBtn = ({ icon, label, onClick, active, danger, class: c = '', title, size = 20, children, ...rest }) => html`
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
      <div class=${cx('modal pop', wide && 'wide', c)} role="dialog" aria-modal="true" aria-label=${title}>
        <header class="modal-head">
          <h2>${title}</h2>
          <button type="button" class="gbtn icon-only sm" aria-label="Fechar" onClick=${onClose}><${Icon} n="x" s=${18} /></button>
        </header>
        <div class="modal-body">${children}</div>
        ${footer ? html`<footer class="modal-foot">${footer}</footer>` : null}
      </div>
    </div>`;
}

export const Field = ({ label, hint, children }) => html`
  <label class="field"><span class="field-label">${label}</span>${children}${hint ? html`<small class="field-hint">${hint}</small>` : null}</label>`;

export function Toasts() {
  const toasts = useS((s) => s.ui.toasts);
  return html`<div class="toasts" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} class=${cx('toast glass pop', t.kind)}>${t.text}</div>`)}</div>`;
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
export async function shrinkImage(file, max = 512) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.9));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
}

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
