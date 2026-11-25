// Molduras do CARTÃO de perfil (estilo "profile frame" da loja do Discord):
// ornamento grande no topo saindo do cartão, laterais decoradas (padrão que repete) e base.
// Topo: viewBox 320×96 (a borda de cima do cartão fica em y≈66). Base: 320×56 (borda de baixo em y≈14).
// Gradientes, padrões e filtros vão no mesmo <svg> escondido das molduras de avatar (decoart.js).

const f = (n) => Math.round(n * 10) / 10;
const mirror = (g) => `<g transform="translate(320 0) scale(-1 1)">${g}</g>`;
const lobe = (s) => `M0 0 C ${f(-0.75 * s)} ${f(-0.25 * s)} ${f(-0.8 * s)} ${f(-1.05 * s)} 0 ${f(-1.1 * s)} C ${f(0.8 * s)} ${f(-1.05 * s)} ${f(0.75 * s)} ${f(-0.25 * s)} 0 0Z`;
/** rosa (camadas de pétalas + miolo em espiral) */
export function rose(cx, cy, s, a = 'fr-rose', b = 'fr-rose2', line = 'rgba(80,60,120,.55)') {
  const layer = (n, size, off, fill) => Array.from({ length: n }, (_, i) => `<path d="${lobe(size)}" transform="rotate(${f(off + (360 / n) * i)})" fill="${fill}" stroke="${line}" stroke-width="${f(s * 0.035)}"/>`).join('');
  const spiral = `<path d="M0 0 c ${f(s * 0.12)} ${f(-s * 0.1)} ${f(s * 0.22)} ${f(s * 0.06)} ${f(s * 0.06)} ${f(s * 0.18)} c ${f(-s * 0.22)} ${f(s * 0.14)} ${f(-s * 0.36)} ${f(-s * 0.12)} ${f(-s * 0.14)} ${f(-s * 0.3)} c ${f(s * 0.26)} ${f(-s * 0.2)} ${f(s * 0.5)} ${f(s * 0.04)} ${f(s * 0.34)} ${f(s * 0.34)}" fill="none" stroke="${line}" stroke-width="${f(s * 0.05)}" stroke-linecap="round"/>`;
  return `<g transform="translate(${f(cx)} ${f(cy)})">${layer(5, s, 0, `url(#${a})`)}${layer(5, s * 0.72, 36, `url(#${b})`)}${layer(4, s * 0.45, 10, `url(#${a})`)}<circle r="${f(s * 0.28)}" fill="url(#${b})"/>${spiral}</g>`;
}
export function leaf(x, y, len, ang, fill, stroke = 'rgba(60,50,90,.45)') {
  return `<path d="M0 0 Q ${f(len * 0.5)} ${f(-len * 0.34)} ${f(len)} 0 Q ${f(len * 0.5)} ${f(len * 0.34)} 0 0Z" transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})" fill="${fill}" stroke="${stroke}" stroke-width=".5"/>`;
}
const sparkle = (x, y, s, cls = 'fr-tw') => `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><path class="${cls}" d="M0 -6 L1.3 -1.3 L6 0 L1.3 1.3 L0 6 L-1.3 1.3 L-6 0 L-1.3 -1.3Z" fill="#fff"/></g>`;
function blossom(x, y, s, rot = 0) {
  let p = '';
  for (let i = 0; i < 5; i++) p += `<path d="M0 0 C ${f(-s * 0.55)} ${f(-s * 0.5)} ${f(-s * 0.3)} ${f(-s * 1.1)} 0 ${f(-s * 0.95)} C ${f(s * 0.3)} ${f(-s * 1.1)} ${f(s * 0.55)} ${f(-s * 0.5)} 0 0Z" transform="rotate(${i * 72})" fill="url(#dk-sakura)" stroke="rgba(200,80,120,.35)" stroke-width=".4"/>`;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})">${p}<circle r="${f(s * 0.22)}" fill="#ffd36e"/><circle r="${f(s * 0.1)}" fill="#e85d8a"/></g>`;
}
const crow = (x, y, s, flip = 1) => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s * flip)} ${f(s)})">
  <path d="M0 0 C 3 -6 9 -7 12 -4 L 16 -5 L 13 -2 C 13 2 10 6 4 7 L -2 14 L -1 7 C -6 6 -9 3 -10 0 C -6 1 -3 1 0 0Z" fill="#0b0b10"/>
  <circle cx="11" cy="-3.6" r="1" fill="#ff2a2a"/></g>`;

// ---------- definições (entram no <svg> escondido) ----------
export const FRAME_DEFS = `
<linearGradient id="fr-rose" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#efe6ff"/><stop offset="1" stop-color="#b6a2ec"/></linearGradient>
<linearGradient id="fr-rose2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8ff"/><stop offset="1" stop-color="#9d89d9"/></linearGradient>
<linearGradient id="fr-lilac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#d8c9ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<linearGradient id="fr-leaf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3eeff"/><stop offset="1" stop-color="#a796dc"/></linearGradient>
<radialGradient id="fr-moon" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d9dde6"/><stop offset="1" stop-color="#8b93a5"/></radialGradient>
<radialGradient id="fr-moonglow" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#dfe8ff" stop-opacity=".55"/><stop offset="1" stop-color="#dfe8ff" stop-opacity="0"/></radialGradient>
<linearGradient id="fr-bark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f44"/><stop offset="1" stop-color="#121418"/></linearGradient>
<linearGradient id="fr-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd8e6" stop-opacity="0"/><stop offset="1" stop-color="#cfd8e6" stop-opacity=".55"/></linearGradient>
<linearGradient id="fr-goldx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c6"/><stop offset=".3" stop-color="#f1c94e"/><stop offset=".6" stop-color="#b8841d"/><stop offset=".85" stop-color="#f6dc85"/><stop offset="1" stop-color="#7d550f"/></linearGradient>
<radialGradient id="fr-ruby" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd0d6"/><stop offset=".4" stop-color="#e0223f"/><stop offset="1" stop-color="#5c0614"/></radialGradient>
<filter id="fr-glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.2" result="b"/><feFlood flood-color="#e7dcff" flood-opacity=".9"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="fr-soft" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000" flood-opacity=".5"/></filter>
<filter id="fr-rim" x="-10%" y="-20%" width="120%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="d"/><feFlood flood-color="#d3dae6" flood-opacity=".8"/><feComposite in2="d" operator="in" result="o"/><feGaussianBlur in="o" stdDeviation=".7" result="ob"/><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000" flood-opacity=".5" in="SourceGraphic" result="sg"/><feMerge><feMergeNode in="ob"/><feMergeNode in="sg"/></feMerge></filter>
<filter id="fr-blur6"><feGaussianBlur stdDeviation="6"/></filter>
<!-- padrões das laterais (repetem na altura do cartão) -->
<pattern id="fr-pat-rosas" width="16" height="56" patternUnits="userSpaceOnUse">
  <path d="M8 0 V56" stroke="url(#fr-lilac)" stroke-width="1.6"/><path d="M5 0 V56" stroke="#e9e0ff" stroke-width=".6" opacity=".8"/>
  <path d="M8 14 C 14 10 15 4 10 3 C 7 3 7 6 9 6.5" fill="none" stroke="#efe6ff" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M8 42 C 2 38 1 32 6 31 C 9 31 9 34 7 34.5" fill="none" stroke="#efe6ff" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="8" cy="28" r="1.6" fill="#fff"/></pattern>
<pattern id="fr-pat-lua" width="18" height="64" patternUnits="userSpaceOnUse">
  <path d="M9 0 C 5 10 13 18 8 30 C 4 40 13 50 9 64" fill="none" stroke="#c9d1de" stroke-width="4.8" stroke-linecap="round" opacity=".55"/>
  <path d="M9 0 C 5 10 13 18 8 30 C 4 40 13 50 9 64" fill="none" stroke="url(#fr-bark)" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M8 18 l6 -4 M9 44 l-6 -3 M10 56 l5 2" stroke="#1a1d21" stroke-width="1.4" stroke-linecap="round"/></pattern>
<pattern id="fr-pat-coelho" width="16" height="20" patternUnits="userSpaceOnUse">
  <rect x="7" width="5" height="20" fill="#0d0d10"/><path d="M12 0 a 4 5 0 0 1 0 10 a 4 5 0 0 1 0 10" fill="#f6f6f8" stroke="#0d0d10" stroke-width=".6"/>
  <circle cx="12" cy="5" r="1.1" fill="#0d0d10"/><circle cx="12" cy="15" r="1.1" fill="#0d0d10"/><circle cx="4" cy="10" r="1.7" fill="#fff" stroke="#0d0d10" stroke-width=".5"/></pattern>
<pattern id="fr-pat-barroco" width="16" height="30" patternUnits="userSpaceOnUse">
  <rect x="5" width="6" height="30" fill="url(#fr-goldx)"/><rect x="7.2" width="1.6" height="30" fill="#7d550f" opacity=".6"/>
  <circle cx="8" cy="15" r="3.2" fill="url(#fr-goldx)" stroke="#7d550f" stroke-width=".6"/><circle cx="7" cy="14" r=".9" fill="#fff" opacity=".8"/></pattern>
<pattern id="fr-pat-sakura" width="14" height="90" patternUnits="userSpaceOnUse">
  <path d="M7 0 V90" stroke="#ffb3cf" stroke-width="1.2" opacity=".9"/>
  <g transform="translate(7 45)"><path d="M0 0 C -3 -3 -2 -6 0 -5.2 C 2 -6 3 -3 0 0Z" fill="#ffb3cf" transform="rotate(0)"/><path d="M0 0 C -3 -3 -2 -6 0 -5.2 C 2 -6 3 -3 0 0Z" fill="#ffc9dc" transform="rotate(72)"/><path d="M0 0 C -3 -3 -2 -6 0 -5.2 C 2 -6 3 -3 0 0Z" fill="#ffb3cf" transform="rotate(144)"/><path d="M0 0 C -3 -3 -2 -6 0 -5.2 C 2 -6 3 -3 0 0Z" fill="#ffc9dc" transform="rotate(216)"/><path d="M0 0 C -3 -3 -2 -6 0 -5.2 C 2 -6 3 -3 0 0Z" fill="#ffb3cf" transform="rotate(288)"/><circle r="1.2" fill="#ffd36e"/></g></pattern>`;

// ---------- molduras do cartão ----------
const scrollL = `<path d="M160 66 C 132 64 116 48 94 52 C 76 56 72 72 56 72 C 40 72 34 58 22 62 C 12 66 10 78 14 90" fill="none" stroke="url(#fr-lilac)" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M94 52 C 90 40 98 32 106 36 C 112 40 108 47 103 45" fill="none" stroke="#f1eaff" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M56 72 C 50 62 56 54 63 57 C 68 60 65 66 61 65" fill="none" stroke="#f1eaff" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M22 62 C 14 52 20 44 27 47" fill="none" stroke="#f1eaff" stroke-width="1.3" stroke-linecap="round"/>`;
const FRAMES = {
  rosas: {
    top: () => `<g filter="url(#fr-glow)">${scrollL}${mirror(scrollL)}
      ${leaf(120, 56, 14, 200, 'url(#fr-leaf)')}${leaf(200, 56, 14, -20, 'url(#fr-leaf)')}${leaf(96, 62, 11, 160, 'url(#fr-leaf)')}${leaf(224, 62, 11, 20, 'url(#fr-leaf)')}${leaf(150, 20, 12, 230, 'url(#fr-leaf)')}${leaf(170, 20, 12, -50, 'url(#fr-leaf)')}
      ${rose(160, 40, 20)}${rose(130, 52, 13)}${rose(190, 52, 13)}${rose(110, 62, 9)}${rose(210, 62, 9)}
      ${rose(30, 62, 12)}${rose(290, 62, 12)}${rose(12, 78, 8)}${rose(308, 78, 8)}</g>
      ${sparkle(76, 30, 0.6)}${sparkle(246, 26, 0.5, 'fr-tw b')}${sparkle(140, 14, 0.45, 'fr-tw c')}`,
    side: 'fr-pat-rosas',
    bottom: () => `<g filter="url(#fr-glow)"><path d="M40 14 C 90 22 120 36 160 36 C 200 36 230 22 280 14" fill="none" stroke="url(#fr-lilac)" stroke-width="2"/>
      ${leaf(140, 32, 11, 170, 'url(#fr-leaf)')}${leaf(180, 32, 11, 10, 'url(#fr-leaf)')}${rose(160, 32, 12)}${rose(142, 38, 7)}${rose(178, 38, 7)}
      ${rose(14, 14, 10)}${rose(306, 14, 10)}</g>`,
  },
  lua: {
    top: () => `<circle cx="160" cy="34" r="44" fill="url(#fr-moonglow)" class="fr-breathe"/>
      <circle cx="160" cy="34" r="27" fill="url(#fr-moon)"/>
      <circle cx="151" cy="27" r="4" fill="#b9bfcc" opacity=".6"/><circle cx="168" cy="41" r="6" fill="#aab1bf" opacity=".5"/><circle cx="170" cy="24" r="2.5" fill="#b9bfcc" opacity=".6"/>
      <g filter="url(#fr-rim)">
        <path d="M0 70 C 30 60 56 66 84 54 C 104 46 118 50 132 40 M58 63 C 50 50 56 40 46 30 M100 50 C 104 38 98 30 104 20 M132 40 C 140 36 144 30 152 32" fill="none" stroke="url(#fr-bark)" stroke-width="4" stroke-linecap="round"/>
        <path d="M320 70 C 290 60 264 66 236 54 C 216 46 202 50 188 40 M262 63 C 270 50 264 40 274 30 M220 50 C 216 38 222 30 216 20 M188 40 C 180 36 176 30 168 32" fill="none" stroke="url(#fr-bark)" stroke-width="4" stroke-linecap="round"/>
        <path d="M46 30 l-6 -8 M46 30 l6 -6 M104 20 l-5 -7 M274 30 l6 -8 M216 20 l5 -7" stroke="#1a1d21" stroke-width="2" stroke-linecap="round"/>
        ${crow(70, 50, 1.25)}${crow(116, 36, 1)}${crow(232, 40, 1.15, -1)}${crow(270, 52, 0.9, -1)}${crow(150, 8, 0.75)}</g>`,
    side: 'fr-pat-lua',
    bottom: () => `<rect x="-10" y="0" width="340" height="56" fill="url(#fr-fog)" filter="url(#fr-blur6)"/>
      <g filter="url(#fr-rim)"><path d="M0 18 C 40 30 70 22 100 34 M320 18 C 280 30 250 22 220 34 M30 24 C 26 36 34 44 28 54 M290 24 C 294 36 286 44 292 54" fill="none" stroke="url(#fr-bark)" stroke-width="3.5" stroke-linecap="round"/></g>`,
  },
  coelhinho: {
    top: () => {
      const ear = (x, rot) => `<g transform="translate(${x} 56) rotate(${rot})">
        <path d="M0 0 C -14 -16 -14 -48 0 -56 C 14 -48 14 -16 0 0Z" fill="#0d0d10" stroke="#f4f4f6" stroke-width="1.6"/>
        <path d="M0 -6 C -7 -18 -7 -42 0 -48 C 7 -42 7 -18 0 -6Z" fill="#f4f4f6"/>
        <path d="M0 -10 C -4 -20 -4 -38 0 -43 C 4 -38 4 -20 0 -10Z" fill="#ffd6e4"/></g>`;
      const bow = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
        <path d="M0 0 C -10 -10 -22 -8 -20 2 C -19 10 -8 8 0 0Z M0 0 C 10 -10 22 -8 20 2 C 19 10 8 8 0 0Z" fill="#0d0d10" stroke="#f4f4f6" stroke-width="1.4"/>
        <path d="M-3 2 L -9 16 L -4 13 L -1 17Z M3 2 L 9 16 L 4 13 L 1 17Z" fill="#0d0d10" stroke="#f4f4f6" stroke-width="1"/>
        <circle r="3.6" fill="#f4f4f6" stroke="#0d0d10" stroke-width="1"/></g>`;
      const scallops = Array.from({ length: 23 }, (_, i) => `<circle cx="${6 + i * 13.7}" cy="${70 - Math.sin((i / 22) * Math.PI) * 10}" r="5.4" fill="#f6f6f8" stroke="#0d0d10" stroke-width=".8"/>`).join('');
      const pearls = Array.from({ length: 23 }, (_, i) => `<circle cx="${6 + i * 13.7}" cy="${60 - Math.sin((i / 22) * Math.PI) * 10}" r="2.2" fill="#fff" stroke="#0d0d10" stroke-width=".6"/>`).join('');
      return `<g filter="url(#fr-soft)">${ear(122, -14)}${ear(198, 14)}
        <path d="M0 74 Q 160 46 320 74 L 320 62 Q 160 34 0 62Z" fill="#0d0d10"/>${scallops}${pearls}
        <path d="M150 52 C 150 44 160 42 160 50 C 160 42 170 44 170 52 C 170 58 160 64 160 66 C 160 64 150 58 150 52Z" fill="#f4f4f6" stroke="#0d0d10" stroke-width="1.3"/>
        ${bow(26, 62, 1)}${bow(294, 62, 1)}</g>`;
    },
    side: 'fr-pat-coelho',
    bottom: () => {
      const scallops = Array.from({ length: 23 }, (_, i) => `<circle cx="${6 + i * 13.7}" cy="18" r="5.2" fill="#f6f6f8" stroke="#0d0d10" stroke-width=".8"/>`).join('');
      return `<g filter="url(#fr-soft)"><rect x="0" y="8" width="320" height="8" fill="#0d0d10"/>${scallops}
        <g transform="translate(160 14)"><path d="M0 0 C -10 -10 -22 -8 -20 2 C -19 10 -8 8 0 0Z M0 0 C 10 -10 22 -8 20 2 C 19 10 8 8 0 0Z" fill="#0d0d10" stroke="#f4f4f6" stroke-width="1.4"/><circle r="3.6" fill="#f4f4f6" stroke="#0d0d10"/></g></g>`;
    },
  },
  barroco: {
    top: () => {
      const half = `<path d="M160 66 C 140 66 128 56 116 58 C 100 60 98 74 82 72 C 64 70 62 52 46 54 C 30 56 26 70 12 70 C 6 70 2 74 2 84" fill="none" stroke="url(#fr-goldx)" stroke-width="4" stroke-linecap="round"/>
        <path d="M116 58 C 108 44 118 34 128 40 C 134 45 128 52 122 49" fill="none" stroke="url(#fr-goldx)" stroke-width="3" stroke-linecap="round"/>
        <path d="M82 72 C 70 60 78 48 88 54" fill="none" stroke="url(#fr-goldx)" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M46 54 C 40 42 48 34 56 38 C 61 41 57 47 52 45" fill="none" stroke="url(#fr-goldx)" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M100 62 q 6 -12 16 -10 q -8 4 -16 10Z M64 62 q 2 -12 12 -14 q -6 6 -12 14Z" fill="url(#fr-goldx)"/>`;
      return `<g filter="url(#fr-soft)">${half}${mirror(half)}
        <path d="M160 70 C 136 70 132 46 140 34 C 146 24 154 20 160 12 C 166 20 174 24 180 34 C 188 46 184 70 160 70Z" fill="url(#fr-goldx)" stroke="#7d550f" stroke-width="1"/>
        <ellipse cx="160" cy="46" rx="11" ry="14" fill="url(#fr-ruby)" stroke="#7d550f" stroke-width="1.4"/><ellipse cx="156" cy="40" rx="3" ry="4" fill="#fff" opacity=".7"/>
        <path d="M146 14 L 150 2 L 155 10 L 160 0 L 165 10 L 170 2 L 174 14Z" fill="url(#fr-goldx)" stroke="#7d550f" stroke-width=".8"/>
        <circle cx="150" cy="2" r="2" fill="url(#fr-ruby)"/><circle cx="160" cy="0" r="2.4" fill="url(#fr-ruby)"/><circle cx="170" cy="2" r="2" fill="url(#fr-ruby)"/></g>
        <rect x="100" y="0" width="120" height="76" fill="url(#dk-shine)" opacity=".45"/>`;
    },
    side: 'fr-pat-barroco',
    bottom: () => `<g filter="url(#fr-soft)"><path d="M10 12 H310" stroke="url(#fr-goldx)" stroke-width="5"/>
      <path d="M160 10 C 144 10 136 26 124 22 C 114 18 118 8 126 10 M160 10 C 176 10 184 26 196 22 C 206 18 202 8 194 10" fill="none" stroke="url(#fr-goldx)" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="160" cy="16" rx="7" ry="8" fill="url(#fr-ruby)" stroke="#7d550f" stroke-width="1.2"/></g>`,
  },
  sakura: {
    top: () => {
      const half = `<path d="M-4 78 C 20 60 40 58 66 50 C 90 42 104 30 128 26 M40 58 C 36 46 44 36 40 26 M84 44 C 92 36 104 38 110 30" fill="none" stroke="url(#dk-branch)" stroke-width="4.2" stroke-linecap="round"/>
        ${blossom(130, 26, 9, 10)}${blossom(110, 30, 8, 40)}${blossom(40, 24, 9, -10)}${blossom(64, 50, 10, 30)}${blossom(20, 64, 9, 5)}${blossom(92, 42, 7, 60)}${blossom(50, 40, 6, 15)}${blossom(4, 72, 7, -30)}`;
      return `<g filter="url(#fr-soft)">${half}${mirror(half)}</g>
        <g class="fr-petals">${[0, 1, 2, 3].map((i) => `<path class="fr-petal q${i}" d="M0 0 C -3 -3 -2 -7 0 -6 C 2 -7 3 -3 0 0Z" fill="url(#dk-sakura)"/>`).join('')}</g>`;
    },
    side: 'fr-pat-sakura',
    bottom: () => `<g filter="url(#fr-soft)"><path d="M-4 30 C 20 24 34 14 52 12 M324 30 C 300 24 286 14 268 12" fill="none" stroke="url(#dk-branch)" stroke-width="3.2" stroke-linecap="round"/>
      ${blossom(52, 12, 7, 0)}${blossom(30, 20, 6, 30)}${blossom(268, 12, 7, 20)}${blossom(290, 20, 6, -10)}</g>`,
  },
};

const cache = new Map();
/** HTML da moldura do cartão (vai por cima de .pcard, dentro de .pcard-outer) */
export function frameHtml(id) {
  const fr = FRAMES[id];
  if (!fr) return '';
  if (!cache.has(id)) {
    const side = (cls) => `<svg class="fr-side ${cls}" width="16" height="100%" aria-hidden="true"><rect width="16" height="100%" fill="url(#${fr.side})"/></svg>`;
    cache.set(id, `<div class="pframe pframe-${id}" aria-hidden="true">
      <svg class="fr-top" viewBox="0 0 320 96" preserveAspectRatio="xMidYMax meet">${fr.top()}</svg>
      ${side('l')}${side('r')}
      <svg class="fr-bottom" viewBox="0 0 320 56" preserveAspectRatio="xMidYMin meet">${fr.bottom()}</svg></div>`);
  }
  return cache.get(id);
}
export const hasFrame = (id) => !!FRAMES[id];
