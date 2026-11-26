import { html, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { run, openModal } from '../actions.js';
import { Avatar } from './common.js';
import { DECORATIONS, EFFECTS, FRAMES, BUNDLES, itemId } from '../shop.js';
import { frameHtml } from '../framesart.js';
import { NAMEPLATES } from '../nameplates.js';
import { imgItem, imgItems } from '../shopimg.js';

/** efeitos de perfil: camada por cima do cartão (partículas em SVG, posições fixas por índice) */
const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const PETAL = '<svg viewBox="-6 -8 12 9"><path d="M0 0 C -4 -2 -5 -7 -1 -7.5 C 0 -6.5 1 -6.5 1.5 -7.5 C 5 -7 4 -2 0 0Z" fill="url(#dk-sakura)"/></svg>';
const FLAKE = '<svg viewBox="-10 -10 20 20"><g stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none">' +
  [0, 60, 120].map((a) => `<g transform="rotate(${a})"><path d="M0 -9V9M0 -6l-2.5 -2.5M0 -6l2.5 -2.5M0 6l-2.5 2.5M0 6l2.5 2.5"/></g>`).join('') + '</g></svg>';
const HEART = '<svg viewBox="-8 -8 16 15"><path d="M0 6 C -9 0 -7 -8 -2.5 -6.5 C -1 -6 0 -4.5 0 -4.5 C 0 -4.5 1 -6 2.5 -6.5 C 7 -8 9 0 0 6Z" fill="var(--hc)" stroke="#0d0d10" stroke-width="1.2"/></svg>';
const STAR = '<svg viewBox="-6 -6 12 12"><path d="M0 -6 L1.3 -1.3 L6 0 L1.3 1.3 L0 6 L-1.3 1.3 L-6 0 L-1.3 -1.3Z" fill="#fff"/></svg>';
function fxHtml(effect) {
  const N = { petalas: 18, neve: 22, bokeh: 14, estrelas: 22, lilas: 20, nevoa: 16, noir: 14, ouro: 26 }[effect] || 0;
  const inner = { petalas: PETAL, neve: FLAKE, estrelas: STAR, bokeh: '', lilas: STAR, nevoa: '', noir: HEART, ouro: '' }[effect] ?? '';
  let h = '';
  for (let i = 0; i < N; i++) {
    const st = `--x:${(rnd(i, 1) * 100).toFixed(1)}%;--y:${(rnd(i, 2) * 100).toFixed(1)}%;--d:${(-rnd(i, 3) * 10).toFixed(2)}s;--t:${(6 + rnd(i, 4) * 6).toFixed(2)}s;--z:${(0.55 + rnd(i, 5) * 0.9).toFixed(2)};--h:${Math.round(rnd(i, 6) * 360)};--r:${Math.round(rnd(i, 7) * 360)}deg;--hc:${i % 2 ? '#f4f4f6' : '#0d0d10'}`;
    h += `<i style="${st}">${inner}</i>`;
  }
  if (effect === 'estrelas') h += '<b class="shoot"></b><b class="shoot s2"></b>';
  if (effect === 'nevoa') h = '<b class="fog f1"></b><b class="fog f2"></b><b class="fog f3"></b>' + h;
  if (effect === 'lilas') h = '<b class="glowb g1"></b><b class="glowb g2"></b>' + h;
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
  const im = imgItem(effect);
  if (im?.kind === 'fx') return html`<div class="pfx pfx-img" aria-hidden="true"><img src=${im.image} alt="" draggable="false" /></div>`;
  if (!fxCache.has(effect)) fxCache.set(effect, fxHtml(effect));
  return html`<div class=${'pfx pfx-' + effect} aria-hidden="true" dangerouslySetInnerHTML=${{ __html: fxCache.get(effect) }}></div>`;
}

/** cartão de perfil em miniatura com moldura, decoração e efeito (prévia da loja) */
export function MiniCard({ me, deco, frame, effect, c1, c2 }) {
  const u1 = c1 || me.color || '#5e5ce6', u2 = c2 || me.accent || u1;
  return html`
    <div class=${cx('pcard-outer mini', frame && 'framed')}>
      <div class="pcard" style=${`--pc1:${u1};--pc2:${u2}`}>
        <${ProfileEffect} effect=${effect} />
        <div class="pcard-banner">${me.banner ? html`<img src=${me.banner} alt="" />` : null}</div>
        <div class="pcard-av"><${Avatar} user=${me} id=${me.id} size=${58} deco=${deco ?? me.decoration} /></div>
        <div class="pcard-body"><div class="pcard-panel"><div class="pcard-name">${me.displayName}</div><div class="pcard-user"><span>@${me.username}</span></div></div></div>
      </div>
      ${frame ? html`<div class="pframe-host" dangerouslySetInnerHTML=${{ __html: frameHtml(frame) }}></div>` : null}
    </div>`;
}

/** a loja como página (abre no lugar da conversa, só com os itens) */
export function ShopPage() {
  return html`<div class="shop-page"><div class="shop-scroll"><${Shop} /></div></div>`;
}

/** loja: pacotes (tudo combinando), molduras de avatar, molduras de cartão e efeitos. Tudo grátis. */
const fromImg = (it) => ({ id: it.id, name: it.name, desc: it.description, tag: 'Nova' });
export function Shop() {
  const me = useS((s) => s.me);
  const [kind, setKind] = useState('pack');
  useS((s) => s.shopImgs); // redesenha quando um item novo é cadastrado
  const admin = useS((s) => s.shopAdmin);
  if (!me) return null;
  const DECOS = [...imgItems('deco').map(fromImg), ...DECORATIONS];
  const FXS = [...imgItems('fx').map(fromImg), ...EFFECTS];
  const PLATES = [...imgItems('plate').map(fromImg), ...NAMEPLATES];
  const PACKS = [
    ...imgItems('bundle').map((b) => ({ id: b.id, name: b.name, deco: b.extra?.deco || null, frame: null, effect: b.extra?.fx || null, plate: b.extra?.plate || null, c1: b.extra?.c1 || '#1e1f22', c2: b.extra?.c2 || '#3a3d44', img: true })),
    ...BUNDLES,
  ];
  const owned = new Set(me.items || []);
  const save = (patch, msg) => run(api.updateProfile(patch), msg);
  const tabs = [['pack', 'Pacotes'], ['deco', 'Molduras de avatar'], ['frame', 'Cartões de perfil'], ['plate', 'Placas'], ['fx', 'Efeitos']];
  const usingBundle = (b) => me.decoration === b.deco && (b.img ? me.nameplate === b.plate : me.frame === b.frame) && me.effect === b.effect;
  const Btn = ({ has, on, redeem, equip, unequip }) => (!has
    ? html`<button class="gbtn sm primary wide" onClick=${redeem}><${Icon} n="gift" s=${14} /> Resgatar grátis</button>`
    : on ? html`<button class="gbtn sm wide" onClick=${unequip}>Em uso · tirar</button>`
    : html`<button class="gbtn sm wide ok" onClick=${equip}>Usar</button>`);
  const single = (list, k, field, kindKey) => list.map((it) => {
    const id = itemId(kindKey, it.id);
    const has = owned.has(id), on = me[field] === it.id;
    return html`
      <div key=${it.id} class=${cx('shop-card', on && 'on')}>
        <div class="shop-prev" style=${`--pc1:${me.color || '#5e5ce6'};--pc2:${me.accent || me.color || '#5e5ce6'}`}>
          ${k === 'plate' ? html`<div class=${'plate-prev np np-' + it.id}><${Avatar} id=${me.id} size=${30} status /><span class="mem-name"><b class=${'np-name np-' + it.id}>${me.displayName}</b><small>${it.desc}</small></span></div>`
            : k === 'deco' ? html`<${Avatar} id=${me.id} size=${70} deco=${it.id} />`
            : k === 'frame' ? html`<div class="shop-mini"><${MiniCard} me=${me} deco=${me.decoration} frame=${it.id} effect=${null} /></div>`
            : html`<${ProfileEffect} effect=${it.id} /><${Avatar} id=${me.id} size=${52} />`}
        </div>
        <div class="shop-info"><b>${it.name}</b>${it.tag ? html`<span class="shop-tag">${it.tag}</span>` : null}<small class="muted">${it.desc}</small></div>
        <${Btn} has=${has} on=${on} redeem=${() => save({ items: [...owned, id] }, `${it.name} é sua!`)}
          equip=${() => save({ [field]: it.id }, 'Pronto, já está no seu perfil.')} unequip=${() => save({ [field]: null }, 'Removido do perfil.')} />
      </div>`;
  });
  return html`
    <div class="shop">
      <div class="shop-hero">
        <div><h2>Loja</h2><p class="muted">Pacotes com moldura de avatar, cartão de perfil e efeito animado. Tudo grátis: é só resgatar.</p></div>
        ${admin ? html`<button class="gbtn sm" onClick=${() => openModal('shopAdmin')}><${Icon} n="plus" s=${14} /> Gerenciar itens</button>` : null}
      </div>
      <div class="seg lg small-seg shop-tabs">${tabs.map(([k, l]) => html`<button key=${k} class=${kind === k ? 'on' : ''} onClick=${() => setKind(k)}>${l}</button>`)}</div>
      ${kind === 'pack' ? html`
        <div class="bundle-grid">${PACKS.map((b) => {
          const ids = b.img
            ? [b.deco && itemId('deco', b.deco), b.effect && itemId('fx', b.effect), b.plate && itemId('plate', b.plate)].filter(Boolean)
            : [itemId('deco', b.deco), itemId('frame', b.frame), itemId('fx', b.effect)];
          const has = ids.every((x) => owned.has(x));
          const on = usingBundle(b);
          return html`
            <div key=${b.id} class=${cx('bundle', on && 'on')} style=${`--b1:${b.c1};--b2:${b.c2}`}>
              <div class="bundle-stage"><${MiniCard} me=${me} deco=${b.deco} frame=${b.frame} effect=${b.effect} c1=${b.c1} c2=${b.c2} /></div>
              <div class="bundle-info">
                <b>Pacote ${b.name}</b>
                <small class="muted">${b.img ? `Moldura de avatar, efeito e placa · ${ids.length} itens` : 'Moldura de avatar, cartão de perfil e efeito · 3 itens'}</small>
                ${on ? html`<button class="gbtn sm wide" onClick=${() => save(b.img ? { decoration: null, nameplate: null, effect: null } : { decoration: null, frame: null, effect: null }, 'Pacote removido do perfil.')}>Em uso · tirar</button>`
                  : html`<button class="gbtn sm wide primary" onClick=${() => save({ items: [...owned, ...ids], decoration: b.deco, effect: b.effect, ...(b.img ? { nameplate: b.plate, frame: null } : { frame: b.frame }) }, has ? 'Pacote aplicado!' : `Pacote ${b.name} é seu!`)}><${Icon} n="gift" s=${14} /> ${has ? 'Usar pacote' : 'Resgatar e usar'}</button>`}
              </div>
            </div>`;
        })}</div>`
      : html`<div class=${cx('shop-grid', (kind === 'frame' || kind === 'plate') && 'wide')}>${kind === 'deco' ? single(DECOS, 'deco', 'decoration', 'deco') : kind === 'frame' ? single(FRAMES, 'frame', 'frame', 'frame') : kind === 'plate' ? single(PLATES, 'plate', 'nameplate', 'plate') : single(FXS, 'fx', 'effect', 'fx')}</div>`}
    </div>`;
}
