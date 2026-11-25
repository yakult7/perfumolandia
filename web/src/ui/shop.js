import { html, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { run } from '../actions.js';
import { Avatar } from './common.js';
import { DECORATIONS, EFFECTS, itemId } from '../shop.js';

/** efeitos de perfil: camada por cima do cartão (partículas em SVG, posições fixas por índice) */
const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const PETAL = '<svg viewBox="-6 -8 12 9"><path d="M0 0 C -4 -2 -5 -7 -1 -7.5 C 0 -6.5 1 -6.5 1.5 -7.5 C 5 -7 4 -2 0 0Z" fill="url(#dk-sakura)"/></svg>';
const FLAKE = '<svg viewBox="-10 -10 20 20"><g stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none">' +
  [0, 60, 120].map((a) => `<g transform="rotate(${a})"><path d="M0 -9V9M0 -6l-2.5 -2.5M0 -6l2.5 -2.5M0 6l-2.5 2.5M0 6l2.5 2.5"/></g>`).join('') + '</g></svg>';
const STAR = '<svg viewBox="-6 -6 12 12"><path d="M0 -6 L1.3 -1.3 L6 0 L1.3 1.3 L0 6 L-1.3 1.3 L-6 0 L-1.3 -1.3Z" fill="#fff"/></svg>';
function fxHtml(effect) {
  const N = { petalas: 18, neve: 22, bokeh: 14, estrelas: 22 }[effect] || 0;
  const inner = { petalas: PETAL, neve: FLAKE, estrelas: STAR, bokeh: '' }[effect] ?? '';
  let h = '';
  for (let i = 0; i < N; i++) {
    const st = `--x:${(rnd(i, 1) * 100).toFixed(1)}%;--y:${(rnd(i, 2) * 100).toFixed(1)}%;--d:${(-rnd(i, 3) * 10).toFixed(2)}s;--t:${(6 + rnd(i, 4) * 6).toFixed(2)}s;--z:${(0.55 + rnd(i, 5) * 0.9).toFixed(2)};--h:${Math.round(rnd(i, 6) * 360)};--r:${Math.round(rnd(i, 7) * 360)}deg`;
    h += `<i style="${st}">${inner}</i>`;
  }
  if (effect === 'estrelas') h += '<b class="shoot"></b><b class="shoot s2"></b>';
  if (effect === 'aurora') h = '<i class="a1"></i><i class="a2"></i><i class="a3"></i>';
  if (effect === 'jardim') {
    const corner = (cls, flip) => `<svg class="garden ${cls}" viewBox="0 0 120 70"${flip ? ' style="transform:scaleX(-1)"' : ''}><g filter="url(#dk-shadow)">
      <path d="M0 30 C 30 26 52 14 70 0" fill="none" stroke="url(#dk-silverleaf)" stroke-width="2.4"/>
      <path d="M0 44 C 18 40 30 34 40 26" fill="none" stroke="url(#dk-silverleaf)" stroke-width="1.6"/>
      ${roseSvg(26, 18, 15)}${roseSvg(58, 6, 10)}${roseSvg(6, 36, 9)}${roseSvg(42, 30, 7)}</g>
      <rect width="120" height="70" fill="url(#dk-shine)" opacity=".3"/></svg>`;
    h = corner('l', false) + corner('r', true);
  }
  return h;
}
function roseSvg(cx, cy, s) {
  let d = '';
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = s * (0.25 + i * 0.085);
    const x = cx + Math.cos(a) * r * 0.35, y = cy + Math.sin(a) * r * 0.35;
    d += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.72).toFixed(1)}" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#dk-silver)" stroke="rgba(40,40,60,.45)" stroke-width=".5"/>`;
  }
  return d;
}
const fxCache = new Map();
export function ProfileEffect({ effect }) {
  if (!effect) return null;
  if (!fxCache.has(effect)) fxCache.set(effect, fxHtml(effect));
  return html`<div class=${'pfx pfx-' + effect} aria-hidden="true" dangerouslySetInnerHTML=${{ __html: fxCache.get(effect) }}></div>`;
}

/** loja: resgatar (grátis) e usar molduras e efeitos */
export function Shop() {
  const me = useS((s) => s.me);
  const [kind, setKind] = useState('deco');
  if (!me) return null;
  const owned = new Set(me.items || []);
  const list = kind === 'deco' ? DECORATIONS : EFFECTS;
  const using = kind === 'deco' ? me.decoration : me.effect;
  const redeem = (it) => run(api.updateProfile({ items: [...owned, itemId(kind, it.id)] }), `${it.name} é sua!`);
  const equip = (id) => run(api.updateProfile(kind === 'deco' ? { decoration: id } : { effect: id }), id ? 'Pronto, já está no seu perfil.' : 'Removido do perfil.');
  return html`
    <div class="shop">
      <div class="shop-hero">
        <div><h2>Loja</h2><p class="muted">Molduras animadas para a sua foto e efeitos para o seu perfil. Tudo grátis: é só resgatar.</p></div>
        <div class="shop-me"><${Avatar} id=${me.id} size=${64} /></div>
      </div>
      <div class="seg lg small-seg">
        <button class=${kind === 'deco' ? 'on' : ''} onClick=${() => setKind('deco')}>Molduras de avatar</button>
        <button class=${kind === 'fx' ? 'on' : ''} onClick=${() => setKind('fx')}>Efeitos de perfil</button>
      </div>
      <div class="shop-grid">
        ${list.map((it) => {
          const has = owned.has(itemId(kind, it.id));
          const on = using === it.id;
          return html`
            <div key=${it.id} class=${cx('shop-card', on && 'on')}>
              <div class="shop-prev" style=${`--pc1:${me.color || '#5e5ce6'};--pc2:${me.accent || me.color || '#5e5ce6'}`}>
                ${kind === 'deco' ? html`<${Avatar} id=${me.id} size=${72} deco=${it.id} />` : html`<${ProfileEffect} effect=${it.id} /><${Avatar} id=${me.id} size=${52} />`}
              </div>
              <div class="shop-info">
                <b>${it.name}</b>${it.tag ? html`<span class="shop-tag">${it.tag}</span>` : null}
                <small class="muted">${it.desc}</small>
              </div>
              ${!has ? html`<button class="gbtn sm primary wide" onClick=${() => redeem(it)}><${Icon} n="gift" s=${14} /> Resgatar grátis</button>`
                : on ? html`<button class="gbtn sm wide" onClick=${() => equip(null)}>Em uso · tirar</button>`
                : html`<button class="gbtn sm wide ok" onClick=${() => equip(it.id)}>Usar</button>`}
            </div>`;
        })}
      </div>
    </div>`;
}
