import { html, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { run } from '../actions.js';
import { Avatar } from './common.js';
import { DECORATIONS, EFFECTS, itemId } from '../shop.js';

/** partículas do efeito de perfil (posições fixas por índice para não "pular" a cada render) */
const N = 16;
const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
export function ProfileEffect({ effect }) {
  if (!effect) return null;
  return html`<div class=${'pfx pfx-' + effect} aria-hidden="true">${Array.from({ length: N }, (_, i) => html`
    <i key=${i} style=${`--x:${(rnd(i, 1) * 100).toFixed(1)}%;--y:${(rnd(i, 2) * 100).toFixed(1)}%;--d:${(rnd(i, 3) * 6).toFixed(2)}s;--t:${(4 + rnd(i, 4) * 5).toFixed(2)}s;--z:${(0.6 + rnd(i, 5) * 0.8).toFixed(2)};--h:${Math.round(rnd(i, 6) * 360)}`}></i>`)}</div>`;
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
