// Vidro líquido: lente arrastável com física de mola, refração (Chromium), brilho que segue o dedo/mouse.
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

// ---------- refração (só Chromium aceita backdrop-filter com filtro SVG) ----------
export const supportsRefraction = /Chrome\/\d/.test(navigator.userAgent) && !/Mobile.*Firefox/.test(navigator.userAgent);
const filters = new Map();
/** gera um mapa de deslocamento de "lente convexa" para um retângulo arredondado w×h */
function refractionFilter(w, h, r) {
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h)); r = Math.min(r, h / 2, w / 2);
  const key = `${w}x${h}x${Math.round(r)}`;
  if (filters.has(key)) return filters.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const bezel = Math.min(w, h) * 0.42;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // distância até a borda do retângulo arredondado (SDF) e direção normal
      const qx = Math.abs(x + 0.5 - w / 2) - (w / 2 - r);
      const qy = Math.abs(y + 0.5 - h / 2) - (h / 2 - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const sd = outside + Math.min(Math.max(qx, qy), 0) - r; // <0 dentro
      const depth = Math.min(1, Math.max(0, -sd / bezel));
      let nx = 0, ny = 0;
      if (outside > 0) { nx = (ox / outside) * Math.sign(x + 0.5 - w / 2); ny = (oy / outside) * Math.sign(y + 0.5 - h / 2); }
      else if (qx > qy) nx = Math.sign(x + 0.5 - w / 2);
      else ny = Math.sign(y + 0.5 - h / 2);
      const strength = Math.pow(1 - depth, 2.2); // forte na borda, zero no centro
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * strength * 127;
      img.data[i + 1] = 128 - ny * strength * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const id = 'lq-' + key;
  const defs = document.getElementById('glass-defs');
  defs.insertAdjacentHTML('beforeend', `
    <filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feImage href="${c.toDataURL()}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${Math.round(Math.min(w, h) * 0.55)}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`);
  filters.set(key, id);
  return id;
}
export function applyRefraction(el, w, h, r) {
  if (!supportsRefraction || S.settings.perfMode || !el) { if (el) el.style.backdropFilter = ''; return; }
  const id = refractionFilter(w, h, r);
  el.style.backdropFilter = `url(#${id}) blur(1.2px) saturate(1.7) brightness(1.06)`;
}

// ---------- brilho especular que segue o ponteiro ----------
let lightRaf = 0, lightEv = null;
addEventListener('pointermove', (e) => {
  lightEv = e;
  if (lightRaf) return;
  lightRaf = requestAnimationFrame(() => {
    lightRaf = 0;
    const t = lightEv.target?.closest?.('.glass, .gbtn');
    if (!t || S.settings.perfMode) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', ((lightEv.clientX - r.left) / r.width) * 100 + '%');
    t.style.setProperty('--my', ((lightEv.clientY - r.top) / r.height) * 100 + '%');
  });
}, { passive: true });

// ---------- barra com lente arrastável ----------
/**
 * items: [{ key, label, render(active) , title, badge }]
 * value: chave ativa | null
 * axis: 'x' (barra horizontal) | 'y' (vertical)
 * dragFrom: 'any' | 'lens' (na vertical que rola, só arrasta pela lente)
 */
export function GlassBar({ items, value, onChange, axis = 'x', dragFrom = 'any', class: klass = '', itemClass = '', pad = 4 }) {
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
      cstart: horiz ? el.offsetTop : el.offsetLeft,
      clen: horiz ? el.offsetHeight : el.offsetWidth,
    }));
  };
  const targetFor = (key) => s.rects.find((r) => r.key === key);

  const render = () => {
    const l = lens.current;
    if (!l) return;
    const lift = s.lift.x;
    const vel = Math.abs(s.pos.v);
    const stretch = Math.min(vel / 2600, 0.32);
    const scaleMain = 1 + stretch + lift * 0.14;
    const scaleCross = 1 - stretch * 0.45 + lift * 0.14;
    const len = s.size.x, clen = s.cross.x;
    const x = horiz ? s.pos.x - len / 2 : (bar.current.clientWidth - clen) / 2;
    const y = horiz ? (bar.current.clientHeight - clen) / 2 : s.pos.x - len / 2;
    l.style.width = (horiz ? len : clen) + 'px';
    l.style.height = (horiz ? clen : len) + 'px';
    l.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${horiz ? scaleMain : scaleCross}, ${horiz ? scaleCross : scaleMain})`;
    l.style.opacity = s.visible ? 1 : 0;
    l.classList.toggle('lifted', lift > 0.05);
    // item "quente" sob a lente
    let hot = -1, best = Infinity;
    s.rects.forEach((r, i) => { const d = Math.abs(r.start + r.len / 2 - s.pos.x); if (d < best) { best = d; hot = i; } });
    if (s.drag && hot !== s.hot) {
      s.rects.forEach((r, i) => r.el.classList.toggle('hot', i === hot));
      s.hot = hot;
    }
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
    const center = r.start + r.len / 2, len = r.len - pad * 2 + 8, clen = r.clen - pad * 2 + 4;
    if (!animate || !s.size.x) { s.pos.snap(center); s.size.snap(len); s.cross.snap(clen); render(); }
    else { s.pos.t = center; s.size.t = len; s.cross.t = clen; kick(); }
    const radius = Math.min(len, clen) / 2;
    applyRefraction(lens.current, horiz ? len : clen, horiz ? clen : len, radius);
  };

  useLayoutEffect(() => { measure(); goTo(value, true); }, [value, items.map((i) => i.key).join('|')]);
  useEffect(() => {
    const ro = new ResizeObserver(() => { measure(); goTo(value, false); });
    ro.observe(bar.current);
    return () => { ro.disconnect(); cancelAnimationFrame(s.raf); };
  }, [value]);

  const coord = (e) => {
    const b = bar.current.getBoundingClientRect();
    return horiz ? e.clientX - b.left + bar.current.scrollLeft : e.clientY - b.top + bar.current.scrollTop;
  };
  const onDown = (e) => {
    if (e.button > 0) return;
    measure();
    const onLens = e.target.closest('.lens') || (targetFor(value)?.el.contains(e.target));
    const item = e.target.closest('.gbar-item');
    if (dragFrom === 'lens' && !onLens) { s.drag = null; s.tapKey = item?.dataset.key; return; }
    s.drag = { id: e.pointerId, start: coord(e), moved: false, onLens, startKey: item?.dataset.key };
    s.tapKey = item?.dataset.key;
    if (onLens) { s.lift.t = 1; kick(); }
  };
  const onMove = (e) => {
    const d = s.drag;
    if (!d || d.id !== e.pointerId) return;
    const c = coord(e);
    if (!d.moved && Math.abs(c - d.start) > 6) {
      d.moved = true;
      bar.current.setPointerCapture(e.pointerId);
      s.lift.t = 1;
      s.visible = true;
    }
    if (!d.moved) return;
    e.preventDefault();
    const first = s.rects[0], last = s.rects[s.rects.length - 1];
    const min = first.start + first.len / 2 - 14, max = last.start + last.len / 2 + 14;
    s.pos.t = Math.max(min, Math.min(max, c));
    // tamanho acompanha o item mais próximo
    const near = s.rects.reduce((a, r) => (Math.abs(r.start + r.len / 2 - c) < Math.abs(a.start + a.len / 2 - c) ? r : a), first);
    s.size.t = near.len - pad * 2 + 8;
    kick();
  };
  const onUp = (e) => {
    const d = s.drag;
    s.lift.t = 0;
    kick();
    if (!d) {
      if (s.tapKey && dragFrom === 'lens') choose(s.tapKey);
      return;
    }
    s.drag = null;
    s.rects.forEach((r) => r.el.classList.remove('hot'));
    s.hot = -1;
    if (d.moved) {
      const near = s.rects[Math.max(0, s.rects.findIndex((r) => r.start <= s.pos.x && s.pos.x <= r.start + r.len)) ] ||
        s.rects.reduce((a, r) => (Math.abs(r.start + r.len / 2 - s.pos.x) < Math.abs(a.start + a.len / 2 - s.pos.x) ? r : a));
      choose(near.key);
      goTo(near.key);
    } else if (s.tapKey) choose(s.tapKey);
  };
  const choose = (key) => {
    const it = items.find((i) => i.key === key);
    if (!it) return;
    if (navigator.vibrate && key !== value) navigator.vibrate(8);
    onChange(key, it);
  };

  return html`
    <div ref=${bar} class=${cx('gbar glass', horiz ? 'gbar-x' : 'gbar-y', klass)} role="tablist"
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp}
      onPointerCancel=${() => { s.drag = null; s.tapKey = null; s.lift.t = 0; s.rects.forEach((r) => r.el.classList.remove('hot')); goTo(value); kick(); }}>
      <div ref=${lens} class="lens" aria-hidden="true"><i></i></div>
      ${items.map((it) => html`
        <button key=${it.key} type="button" role="tab" data-key=${it.key} title=${it.title || ''} aria-selected=${it.key === value}
          class=${cx('gbar-item', it.key === value && 'on', itemClass, it.class)}
          onClick=${(e) => { if (e.detail === 0) choose(it.key); }}
          onContextMenu=${it.onContext}>
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
  const spring = useRef({ y: new Spring(0, 640, 36), h: new Spring(0, 640, 36), raf: 0, last: 0, shown: false });

  useLayoutEffect(() => {
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight, m = 10;
    let x = Math.min(menu.x, vw - r.width - m);
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

  const sp = spring.current;
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
    applyRefraction(lens.current, ref.current.clientWidth - 12, h, 12);
  };
  const itemAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.menu-item');
  const picked = useRef(false);
  const pick = (el) => {
    if (!el || el.disabled || picked.current) return;
    picked.current = true;
    const it = menu.items[+el.dataset.i];
    onClose();
    it?.onClick?.();
  };

  return html`
    <div ref=${ref} class="menu glass pop" role="menu"
      style=${pos ? `left:${pos.x}px;top:${pos.y}px` : 'visibility:hidden;left:0;top:0'}
      onPointerMove=${(e) => hover(itemAt(e))}
      onPointerDown=${(e) => { if (e.pointerType !== 'mouse') { ref.current.setPointerCapture(e.pointerId); hover(itemAt(e)); } }}
      onPointerUp=${(e) => { if (e.pointerType !== 'mouse') pick(itemAt(e)); }}>
      <div ref=${lens} class="lens menu-lens" aria-hidden="true"><i></i></div>
      ${menu.items.map((it, i) => it.sep
        ? html`<div key=${'s' + i} class="menu-sep"></div>`
        : it.header
          ? html`<div key=${'h' + i} class="menu-header">${it.header}</div>`
          : html`<button key=${i} type="button" role="menuitem" data-i=${i} class=${cx('menu-item', it.danger && 'danger', it.checked && 'checked')}
              disabled=${it.disabled} onClick=${(e) => pick(e.currentTarget)}>
              ${it.icon ? it.icon : null}<span>${it.label}</span>${it.hint ? html`<small>${it.hint}</small>` : null}
            </button>`)}
    </div>`;
}
