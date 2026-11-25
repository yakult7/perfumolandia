// Liquid Glass no estilo iOS 26 / macOS Tahoe.
// - Todo elemento com a classe "lg" ganha refração real das bordas (lente convexa) + leve aberração cromática.
//   Funciona em Chromium (app do Windows, Android, Chrome/Edge). No Safari cai para vidro fosco com o mesmo brilho.
// - Lente arrastável com física de mola nas barras de abas, trilho de servidores e menus.
import { html, useRef, useEffect, useLayoutEffect, useState, cx } from './lib.js';
import { S } from './store.js';

// ---------- mola ----------
class Spring {
  constructor(x, k = 520, c = 32) { this.x = x; this.v = 0; this.t = x; this.k = k; this.c = c; }
  step(dt) {
    const a = this.k * (this.t - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    if (Math.abs(this.t - this.x) < 0.15 && Math.abs(this.v) < 4) { this.x = this.t; this.v = 0; return true; }
    return false;
  }
  snap(x) { this.x = this.t = x; this.v = 0; }
}

// ---------- refração ----------
export const supportsRefraction = /Chrome\/\d/.test(navigator.userAgent);
document.documentElement.classList.toggle('refract', supportsRefraction);

const filters = new Map(); // chave -> id
const defs = () => document.getElementById('glass-defs');

/** mapa de deslocamento de uma "gota" de vidro w×h com cantos r: forte nas bordas, neutro no meio */
function displacementMap(w, h, r) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const bezel = Math.max(6, Math.min(Math.min(w, h) * 0.5, 26));
  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - h / 2;
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2;
      const qx = Math.abs(px) - (w / 2 - r);
      const qy = Math.abs(py) - (h / 2 - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const out = Math.hypot(ox, oy);
      const sd = out + Math.min(Math.max(qx, qy), 0) - r; // distância assinada (negativa dentro)
      const t = Math.min(1, Math.max(0, -sd / bezel)); // 0 na borda, 1 depois do bisel
      let nx = 0, ny = 0;
      if (out > 0) { nx = (ox / out) * Math.sign(px); ny = (oy / out) * Math.sign(py); }
      else if (qx > qy) nx = Math.sign(px);
      else ny = Math.sign(py);
      // perfil de "squircle" convexo: inclinação grande perto da borda
      const k = Math.pow(1 - t, 2.6);
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * k * 127;
      img.data[i + 1] = 128 - ny * k * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function getFilter(w, h, r, chroma) {
  w = Math.max(8, Math.round(w / 2) * 2);
  h = Math.max(8, Math.round(h / 2) * 2);
  r = Math.max(0, Math.min(Math.round(r), Math.floor(Math.min(w, h) / 2)));
  const key = `${w}x${h}r${r}${chroma ? 'c' : ''}`;
  if (filters.has(key)) return filters.get(key);
  const id = 'lg-' + key;
  const s = Math.min(Math.min(w, h) * 0.6, 44);
  const map = `<feImage href="${displacementMap(w, h, r)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>`;
  const body = chroma
    ? `${map}
      <feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
      <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
      <feDisplacementMap in="SourceGraphic" in2="m" scale="${s * 0.92}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
      <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
      <feDisplacementMap in="SourceGraphic" in2="m" scale="${s * 0.84}" xChannelSelector="R" yChannelSelector="G" result="db"/>
      <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
      <feBlend in="r" in2="g" mode="screen" result="rg"/>
      <feBlend in="rg" in2="b" mode="screen"/>`
    : `${map}<feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G"/>`;
  defs()?.insertAdjacentHTML('beforeend',
    `<filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${body}</filter>`);
  filters.set(key, id);
  // limita a memória: remove filtros antigos
  if (filters.size > 90) {
    const [oldKey, oldId] = filters.entries().next().value;
    filters.delete(oldKey);
    document.getElementById(oldId)?.remove();
  }
  return id;
}

/** aplica refração num elemento de tamanho conhecido (lente) */
export function applyRefraction(el, w, h, r) {
  if (!el) return;
  if (!supportsRefraction || S.settings.perfMode) { el.style.removeProperty('--lg-filter'); return; }
  el.style.setProperty('--lg-filter', `url(#${getFilter(w, h, r, w * h < 40000)})`);
}

// gerenciador global: qualquer elemento ".lg" na tela
const tracked = new Set();
let pending = new Set();
let timer = 0;
const ro = new ResizeObserver((entries) => {
  for (const e of entries) pending.add(e.target);
  clearTimeout(timer);
  timer = setTimeout(flush, 60);
});
function flush() {
  const list = pending;
  pending = new Set();
  for (const el of list) {
    if (!el.isConnected) { tracked.delete(el); ro.unobserve(el); continue; }
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) continue;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    applyRefraction(el, w, h, Math.min(r, Math.min(w, h) / 2));
  }
}
function scan() {
  if (!supportsRefraction) return;
  for (const el of document.querySelectorAll('.lg, .gbtn')) {
    if (tracked.has(el)) continue;
    tracked.add(el);
    ro.observe(el);
  }
  for (const el of tracked) if (!el.isConnected) { tracked.delete(el); ro.unobserve(el); }
}
let scanQueued = false;
new MutationObserver(() => {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => { scanQueued = false; scan(); });
}).observe(document.documentElement, { childList: true, subtree: true });
export function refreshGlass() { for (const el of tracked) pending.add(el); flush(); }

// ---------- rolando: refração do vidro desligada até parar ----------
// a refração é recalculada a cada quadro em que o conteúdo atrás do vidro muda; durante a rolagem
// fica só o desfoque (igual a olho nu) e 200 ms depois de parar a refração volta.
let scrollTimer = 0;
addEventListener('scroll', () => {
  const root = document.documentElement;
  if (!root.classList.contains('scrolling')) root.classList.add('scrolling');
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => root.classList.remove('scrolling'), 200);
}, { capture: true, passive: true });

// ---------- barra com lente arrastável ----------
/**
 * items: [{ key, label?, render(active)?, title, badge, class, onContext }]
 * axis: 'x' | 'y'   dragFrom: 'any' | 'lens'
 */
export function GlassBar({ items, value, onChange, axis = 'x', dragFrom = 'any', class: klass = '', itemClass = '', pad = 3 }) {
  const bar = useRef();
  const lens = useRef();
  const st = useRef(null);
  if (!st.current) {
    st.current = {
      pos: new Spring(0, 560, 34), size: new Spring(0, 620, 38), cross: new Spring(0, 620, 38),
      lift: new Spring(0, 700, 30), raf: 0, last: 0, drag: null, rects: [], hot: -1, visible: false,
    };
  }
  const s = st.current;
  const horiz = axis === 'x';

  const measure = () => {
    const b = bar.current;
    if (!b) return;
    s.rects = [...b.querySelectorAll(':scope > .gbar-item')].map((el) => ({
      el, key: el.dataset.key,
      start: horiz ? el.offsetLeft : el.offsetTop,
      len: horiz ? el.offsetWidth : el.offsetHeight,
      clen: horiz ? el.offsetHeight : el.offsetWidth,
    }));
  };
  const targetFor = (key) => s.rects.find((r) => r.key === key);

  const render = () => {
    const l = lens.current;
    if (!l || !bar.current) return;
    const lift = s.lift.x;
    const stretch = Math.min(Math.abs(s.pos.v) / 2600, 0.3);
    const main = 1 + stretch + lift * 0.16;
    const cross = 1 - stretch * 0.4 + lift * 0.16;
    const len = s.size.x, clen = s.cross.x;
    const x = horiz ? s.pos.x - len / 2 : (bar.current.clientWidth - clen) / 2;
    const y = horiz ? (bar.current.clientHeight - clen) / 2 : s.pos.x - len / 2;
    l.style.width = (horiz ? len : clen) + 'px';
    l.style.height = (horiz ? clen : len) + 'px';
    l.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${horiz ? main : cross}, ${horiz ? cross : main})`;
    l.style.opacity = s.visible ? 1 : 0;
    l.classList.toggle('lifted', lift > 0.05);
    let hot = -1, best = Infinity;
    s.rects.forEach((r, i) => { const d = Math.abs(r.start + r.len / 2 - s.pos.x); if (d < best) { best = d; hot = i; } });
    if (s.drag && hot !== s.hot) { s.rects.forEach((r, i) => r.el.classList.toggle('hot', i === hot)); s.hot = hot; }
  };
  const loop = (t) => {
    const dt = Math.min(0.032, (t - (s.last || t)) / 1000 || 0.016);
    s.last = t;
    const done = [s.pos.step(dt), s.size.step(dt), s.cross.step(dt), s.lift.step(dt)].every(Boolean);
    render();
    if (done && !s.drag) { s.raf = 0; s.last = 0; return; }
    s.raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!s.raf) s.raf = requestAnimationFrame(loop); };

  const goTo = (key, animate = true) => {
    const r = targetFor(key);
    s.visible = !!r;
    if (!r) { render(); return; }
    const center = r.start + r.len / 2, len = r.len - pad * 2 + 6, clen = r.clen - pad * 2 + 2;
    if (!animate || !s.size.x) { s.pos.snap(center); s.size.snap(len); s.cross.snap(clen); render(); }
    else { s.pos.t = center; s.size.t = len; s.cross.t = clen; kick(); }
    applyRefraction(lens.current, horiz ? len : clen, horiz ? clen : len, Math.min(len, clen) / 2);
  };

  // troca de aba: a lente DESLIZA até o item novo (mola), nunca teletransporta
  s.value = value;
  useLayoutEffect(() => { measure(); goTo(value, true); }, [value, items.map((i) => i.key).join('|')]);
  // só reposiciona sem animar quando a barra muda de tamanho (janela redimensionada)
  useEffect(() => {
    let w = bar.current.offsetWidth, h = bar.current.offsetHeight;
    const ob = new ResizeObserver(() => {
      const nw = bar.current.offsetWidth, nh = bar.current.offsetHeight;
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      measure();
      if (!s.drag) goTo(s.value, false);
    });
    ob.observe(bar.current);
    return () => { ob.disconnect(); cancelAnimationFrame(s.raf); };
  }, []);

  const coord = (e) => {
    const b = bar.current.getBoundingClientRect();
    return horiz ? e.clientX - b.left + bar.current.scrollLeft : e.clientY - b.top + bar.current.scrollTop;
  };
  const choose = (key) => {
    const it = items.find((i) => i.key === key);
    if (!it) return;
    if (navigator.vibrate && key !== value) navigator.vibrate(8);
    onChange(key, it);
  };
  const onDown = (e) => {
    if (e.button > 0) return;
    measure();
    const onLens = targetFor(value)?.el.contains(e.target);
    const item = e.target.closest('.gbar-item');
    s.tapKey = item?.dataset.key;
    // no toque, barras que rolam só arrastam pela lente; com mouse arrasta de qualquer lugar
    if (dragFrom === 'lens' && !onLens && e.pointerType !== 'mouse') { s.drag = null; return; }
    s.drag = { id: e.pointerId, start: coord(e), moved: false };
    if (onLens) { s.lift.t = 1; kick(); }
  };
  const onMove = (e) => {
    const d = s.drag;
    if (!d || d.id !== e.pointerId) return;
    const c = coord(e);
    if (!d.moved && Math.abs(c - d.start) > 4) {
      d.moved = true;
      bar.current.setPointerCapture(e.pointerId);
      s.lift.t = 1; s.visible = true;
    }
    if (!d.moved) return;
    e.preventDefault();
    const first = s.rects[0], last = s.rects[s.rects.length - 1];
    s.pos.t = Math.max(first.start + first.len / 2 - 12, Math.min(last.start + last.len / 2 + 12, c));
    const near = s.rects.reduce((a, r) => (Math.abs(r.start + r.len / 2 - c) < Math.abs(a.start + a.len / 2 - c) ? r : a), first);
    s.size.t = near.len - pad * 2 + 6;
    kick();
  };
  const onUp = () => {
    const d = s.drag;
    s.lift.t = 0;
    kick();
    if (!d) { if (s.tapKey) choose(s.tapKey); return; }
    s.drag = null;
    s.rects.forEach((r) => r.el.classList.remove('hot'));
    s.hot = -1;
    if (d.moved) {
      const near = s.rects.reduce((a, r) => (Math.abs(r.start + r.len / 2 - s.pos.x) < Math.abs(a.start + a.len / 2 - s.pos.x) ? r : a));
      choose(near.key);
      goTo(near.key);
    } else if (s.tapKey) choose(s.tapKey);
  };

  return html`
    <div ref=${bar} class=${cx('gbar lg', horiz ? 'gbar-x' : 'gbar-y', klass)} role="tablist"
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp}
      onPointerCancel=${() => { s.drag = null; s.tapKey = null; s.lift.t = 0; s.rects.forEach((r) => r.el.classList.remove('hot')); goTo(value); kick(); }}>
      <div ref=${lens} class="lens" aria-hidden="true"></div>
      ${items.map((it) => html`
        <button key=${it.key} type="button" role="tab" data-key=${it.key} title=${it.title || ''} aria-selected=${it.key === value}
          class=${cx('gbar-item', it.key === value && 'on', itemClass, it.class)}
          onClick=${(e) => { if (e.detail === 0) choose(it.key); }} onContextMenu=${it.onContext}>
          ${it.render ? it.render(it.key === value) : it.label}
          ${it.badge ? html`<span class="badge">${it.badge}</span>` : null}
        </button>`)}
    </div>`;
}

// ---------- menu de vidro com lente que acompanha o dedo ----------
export function GlassMenu({ menu, onClose }) {
  const ref = useRef();
  const lens = useRef();
  const [pos, setPos] = useState(null);
  const sp = useRef({ y: new Spring(0, 640, 36), h: new Spring(0, 640, 36), raf: 0, last: 0, shown: false }).current;
  const picked = useRef(false);

  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight, m = 8;
    const x = menu.right != null ? menu.right - r.width : Math.min(menu.x, vw - r.width - m);
    let y = menu.y;
    if (y + r.height > vh - m) y = menu.above != null ? menu.above - r.height : vh - r.height - m;
    setPos({ x: Math.max(m, x), y: Math.max(m, y) });
  }, [menu.key]);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => { addEventListener('pointerdown', close, true); addEventListener('keydown', key); addEventListener('resize', onClose); }, 0);
    return () => { clearTimeout(t); removeEventListener('pointerdown', close, true); removeEventListener('keydown', key); removeEventListener('resize', onClose); };
  }, [menu.key]);

  const loop = (t) => {
    const dt = Math.min(0.032, (t - (sp.last || t)) / 1000 || 0.016);
    sp.last = t;
    const done = sp.y.step(dt) & sp.h.step(dt);
    const stretch = 1 + Math.min(Math.abs(sp.y.v) / 3000, 0.18);
    if (lens.current) {
      lens.current.style.transform = `translate3d(0, ${sp.y.x}px, 0) scale(${1 / stretch + 0.02}, ${stretch})`;
      lens.current.style.height = sp.h.x + 'px';
    }
    if (done) { sp.raf = 0; sp.last = 0; return; }
    sp.raf = requestAnimationFrame(loop);
  };
  const hover = (el) => {
    if (!el || !lens.current) return;
    const y = el.offsetTop, h = el.offsetHeight;
    if (!sp.shown) { sp.y.snap(y); sp.h.snap(h); sp.shown = true; lens.current.style.opacity = 1; }
    sp.y.t = y; sp.h.t = h;
    if (!sp.raf) sp.raf = requestAnimationFrame(loop);
    applyRefraction(lens.current, ref.current.clientWidth - 10, h, 11);
  };
  const itemAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.menu-item');
  const pick = (el) => {
    if (!el || el.disabled || picked.current) return;
    picked.current = true;
    const it = menu.items[+el.dataset.i];
    onClose();
    it?.onClick?.();
  };

  return html`
    <div ref=${ref} class="menu lg pop" role="menu"
      style=${pos ? `left:${pos.x}px;top:${pos.y}px` : 'visibility:hidden;left:0;top:0'}
      onPointerMove=${(e) => hover(itemAt(e))}
      onPointerDown=${(e) => { if (e.pointerType !== 'mouse') { ref.current.setPointerCapture(e.pointerId); hover(itemAt(e)); } }}
      onPointerUp=${(e) => { if (e.pointerType !== 'mouse') pick(itemAt(e)); }}>
      <div ref=${lens} class="lens menu-lens" aria-hidden="true"></div>
      ${menu.items.map((it, i) => it.sep
        ? html`<div key=${'s' + i} class="menu-sep"></div>`
        : it.header
          ? html`<div key=${'h' + i} class="menu-header">${it.header}</div>`
          : html`<button key=${i} type="button" role="menuitem" data-i=${i} class=${cx('menu-item', it.danger && 'danger', it.checked && 'checked')}
              disabled=${it.disabled} onClick=${(e) => pick(e.currentTarget)}>
              ${it.icon || null}<span>${it.label}</span>${it.hint ? html`<small>${it.hint}</small>` : null}
            </button>`)}
    </div>`;
}
