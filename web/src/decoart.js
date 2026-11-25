// Arte das molduras de avatar (estilo "avatar decoration" do Discord): ilustrações em SVG que
// envolvem e saem do círculo da foto. Caixa 120×120; a foto é o círculo r=50 no centro (60,60).
// Gradientes e filtros ficam num único <svg> escondido no documento (ids únicos, sem repetir por avatar).

const f = (n) => Math.round(n * 10) / 10;
const rad = (d) => (d * Math.PI) / 180;
const P = (a, r) => [60 + r * Math.cos(a), 60 + r * Math.sin(a)];

/** pincelada em arco, afinando nas pontas (ângulos em graus, 0 = direita, sentido horário) */
function brush(r, w, d0, d1, { wob = 0, freq = 7, skew = 0.7, n = 48 } = {}) {
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = rad(d0 + (d1 - d0) * t);
    const ww = w * Math.pow(Math.sin(Math.PI * Math.pow(t, skew)), 0.8);
    const rr = r + wob * Math.sin(t * freq);
    out.push(P(a, rr + ww / 2));
    inn.push(P(a, rr - ww / 2));
  }
  const pts = [...out, ...inn.reverse()];
  return 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + 'Z';
}
/** rosa vista de cima: três camadas de pétalas e miolo em espiral */
const lobe = (s) => `M0 0 C ${f(-0.75 * s)} ${f(-0.25 * s)} ${f(-0.8 * s)} ${f(-1.05 * s)} 0 ${f(-1.1 * s)} C ${f(0.8 * s)} ${f(-1.05 * s)} ${f(0.75 * s)} ${f(-0.25 * s)} 0 0Z`;
function rose(cx, cy, s, grad) {
  const layer = (n, size, off, fill, op = 1) => Array.from({ length: n }, (_, i) => `<path d="${lobe(size)}" transform="rotate(${f(off + (360 / n) * i)})" fill="${fill}" stroke="rgba(30,32,44,.55)" stroke-width="${f(s * 0.03)}" opacity="${op}"/>`).join('');
  const spiral = `<path d="M0 0 c ${f(s * 0.12)} ${f(-s * 0.1)} ${f(s * 0.22)} ${f(s * 0.06)} ${f(s * 0.06)} ${f(s * 0.18)} c ${f(-s * 0.22)} ${f(s * 0.14)} ${f(-s * 0.36)} ${f(-s * 0.12)} ${f(-s * 0.14)} ${f(-s * 0.3)} c ${f(s * 0.26)} ${f(-s * 0.2)} ${f(s * 0.5)} ${f(s * 0.04)} ${f(s * 0.34)} ${f(s * 0.34)}" fill="none" stroke="rgba(30,32,44,.6)" stroke-width="${f(s * 0.045)}" stroke-linecap="round"/>`;
  return `<g transform="translate(${f(cx)} ${f(cy)})">${layer(5, s, 0, `url(#${grad})`)}${layer(5, s * 0.72, 36, 'url(#dk-silver2)')}${layer(4, s * 0.45, 10, `url(#${grad})`)}<circle r="${f(s * 0.28)}" fill="url(#dk-silver2)"/>${spiral}</g>`;
}
function leaf(x, y, len, ang, grad) {
  return `<path d="M0 0 Q ${f(len * 0.5)} ${f(-len * 0.32)} ${f(len)} 0 Q ${f(len * 0.5)} ${f(len * 0.32)} 0 0Z" transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})" fill="url(#${grad})" stroke="rgba(30,40,40,.4)" stroke-width=".4"/>`;
}
function blossom(x, y, s, rot = 0) {
  let p = '';
  for (let i = 0; i < 5; i++) p += `<path d="M0 0 C ${f(-s * 0.55)} ${f(-s * 0.5)} ${f(-s * 0.3)} ${f(-s * 1.1)} 0 ${f(-s * 0.95)} C ${f(s * 0.3)} ${f(-s * 1.1)} ${f(s * 0.55)} ${f(-s * 0.5)} 0 0Z" transform="rotate(${i * 72})" fill="url(#dk-sakura)"/>`;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})">${p}<circle r="${f(s * 0.22)}" fill="#ffd36e"/><circle r="${f(s * 0.1)}" fill="#e85d8a"/></g>`;
}
function curl(a, r, s, flip) {
  // voluta ornamental (nuvem chinesa) apontando para fora
  const [x, y] = P(rad(a), r);
  const k = flip ? -1 : 1;
  return `<path d="M0 0 c ${f(3 * s * k)} ${f(-6 * s)} ${f(11 * s * k)} ${f(-6 * s)} ${f(11 * s * k)} ${f(1 * s)} c 0 ${f(4 * s)} ${f(-5 * s * k)} ${f(5 * s)} ${f(-6 * s * k)} ${f(1.5 * s)} c ${f(-1 * s * k)} ${f(-2.5 * s)} ${f(2 * s * k)} ${f(-3.5 * s)} ${f(3 * s * k)} ${f(-1.5 * s)}" transform="translate(${f(x)} ${f(y)}) rotate(${f(a + 90)})" fill="none" stroke="url(#dk-cloud)" stroke-width="${f(2.2 * s)}" stroke-linecap="round"/>`;
}
function laurel(side) {
  // ramo de louro subindo por um lado
  let g = '';
  for (let i = 0; i < 9; i++) {
    const deg = side > 0 ? 100 - i * 17 : 80 + i * 17;
    const [x, y] = P(rad(deg), 56.5);
    const tang = deg + (side > 0 ? -90 : 90);
    g += leaf(x, y, 9 - i * 0.35, tang - 35 * side, 'dk-gold');
    g += leaf(x, y, 8 - i * 0.35, tang + 30 * side, 'dk-gold2');
  }
  const path = brush(56.5, 1.6, side > 0 ? 102 : 78, side > 0 ? -45 : 225, { skew: 1 });
  return `<path d="${path}" fill="url(#dk-gold)"/>${g}`;
}
function drop(x, y, s) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><path d="M0 -9 C 4 -3 6 1 6 4 A 6 6 0 0 1 -6 4 C -6 1 -4 -3 0 -9Z" fill="url(#dk-drop)" stroke="#1d6fd8" stroke-width=".6"/><ellipse cx="-2" cy="3" rx="1.4" ry="2.4" fill="#fff" opacity=".8"/></g>`;
}
function butterfly(cls) {
  const wing = (k) => `<g class="dk-wing-${k > 0 ? 'r' : 'l'}">
    <path d="M0 -1 C ${3 * k} -10 ${13 * k} -15 ${17 * k} -9 C ${19 * k} -4 ${12 * k} 1 0 1Z" fill="url(#dk-wing)" stroke="#2a1650" stroke-width=".6"/>
    <path d="M0 1 C ${9 * k} 2 ${13 * k} 7 ${10 * k} 11 C ${7 * k} 14 ${2 * k} 9 0 2Z" fill="url(#dk-wing2)" stroke="#2a1650" stroke-width=".6"/>
    <circle cx="${11 * k}" cy="-8" r="1.6" fill="#fff" opacity=".85"/><circle cx="${7 * k}" cy="6" r="1.1" fill="#fff" opacity=".7"/></g>`;
  return `<g class="${cls}">${wing(-1)}${wing(1)}<rect x="-.9" y="-6" width="1.8" height="13" rx=".9" fill="#1a1030"/><path d="M-.5 -6 q -2 -4 -4 -5 M.5 -6 q 2 -4 4 -5" stroke="#1a1030" stroke-width=".6" fill="none"/></g>`;
}
function flame(deg, h, delay) {
  const [x, y] = P(rad(deg), 52);
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(deg + 90)}) scale(${f(h)})"><path class="dk-flame" style="animation-delay:-${delay}s" d="M0 2 C -6 -3 -5 -10 -1 -17 C -1 -11 3 -10 4 -14 C 7 -8 6 -2 0 2Z" fill="url(#dk-blueflame)"/><path class="dk-flame" style="animation-delay:-${delay}s" d="M0 1 C -2.5 -2 -2 -6 0 -9 C 1.5 -6 2.5 -3 0 1Z" fill="#fff" opacity=".85"/></g>`;
}
const star = (x, y, s, cls = '') => `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><path class="${cls}" d="M0 -6 L1.4 -1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4 -1.4Z" fill="#fff"/></g>`;

// ---------- definições compartilhadas ----------
export const DEFS = `
<linearGradient id="dk-cyan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9fdff"/><stop offset=".35" stop-color="#3fe0ff"/><stop offset=".7" stop-color="#0b8bd9"/><stop offset="1" stop-color="#0a3d91"/></linearGradient>
<linearGradient id="dk-magenta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1f4"/><stop offset=".35" stop-color="#ff3fbf"/><stop offset=".75" stop-color="#9b1fa8"/><stop offset="1" stop-color="#4a0b63"/></linearGradient>
<linearGradient id="dk-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#c9ccd6"/><stop offset=".55" stop-color="#7d8291"/><stop offset=".8" stop-color="#e8eaf0"/><stop offset="1" stop-color="#8a8f9c"/></linearGradient>
<linearGradient id="dk-silver2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f5f8"/><stop offset=".5" stop-color="#a4a9b6"/><stop offset="1" stop-color="#5d6270"/></linearGradient>
<linearGradient id="dk-enamel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fb4ff"/><stop offset=".5" stop-color="#1a4fd0"/><stop offset="1" stop-color="#0c2a7a"/></linearGradient>
<linearGradient id="dk-silverleaf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dfe3ea"/><stop offset="1" stop-color="#6f7684"/></linearGradient>
<linearGradient id="dk-sakura" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0f5"/><stop offset=".6" stop-color="#ffb3cf"/><stop offset="1" stop-color="#ff7aa8"/></linearGradient>
<linearGradient id="dk-branch" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b4434"/><stop offset="1" stop-color="#3b241b"/></linearGradient>
<linearGradient id="dk-cloud" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff3ff"/><stop offset=".5" stop-color="#3aa6ff"/><stop offset="1" stop-color="#1b4fd6"/></linearGradient>
<linearGradient id="dk-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#f2c84b"/><stop offset=".65" stop-color="#b9861e"/><stop offset="1" stop-color="#7a5310"/></linearGradient>
<linearGradient id="dk-gold2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a1"/><stop offset=".5" stop-color="#d9a62e"/><stop offset="1" stop-color="#8d6213"/></linearGradient>
<linearGradient id="dk-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a80"/><stop offset=".5" stop-color="#ff2d2d"/><stop offset="1" stop-color="#9e0b0b"/></linearGradient>
<radialGradient id="dk-drop" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#e8f6ff"/><stop offset=".5" stop-color="#6cc3ff"/><stop offset="1" stop-color="#2f80ed"/></radialGradient>
<linearGradient id="dk-blueflame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#7cf3ff"/><stop offset=".7" stop-color="#2d8cff"/><stop offset="1" stop-color="#5b2dff" stop-opacity=".2"/></linearGradient>
<linearGradient id="dk-wing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7af0ff"/><stop offset=".5" stop-color="#8b5cff"/><stop offset="1" stop-color="#ff5fd2"/></linearGradient>
<linearGradient id="dk-wing2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9be8"/><stop offset="1" stop-color="#7a3cff"/></linearGradient>
<linearGradient id="dk-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".25" stop-color="#cfe0ff" stop-opacity=".55"/><stop offset=".55" stop-color="#8fa8ff" stop-opacity=".35"/><stop offset=".8" stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="#b7c6ff" stop-opacity=".5"/></linearGradient>
<linearGradient id="dk-shine" x1="0" y1="0" x2="50" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  <animateTransform attributeName="gradientTransform" type="translate" from="-60 -20" to="130 40" dur="3.2s" repeatCount="indefinite"/></linearGradient>
<filter id="dk-ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>
<filter id="dk-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="dk-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000" flood-opacity=".45"/></filter>`;

// ---------- molduras ----------
const ART = {
  tinta: () => `<g filter="url(#dk-ink)" class="dk-sway">
    <path d="${brush(55, 13, 140, 330, { wob: 1.5 })}" fill="url(#dk-cyan)"/>
    <path d="${brush(57, 9, -25, 115, { wob: 1.2, skew: 1.3 })}" fill="url(#dk-cyan)" opacity=".95"/>
    <path d="${brush(63, 4, 195, 250)}" fill="#bff6ff" opacity=".9"/>
    <path d="${brush(64, 3, 40, 80)}" fill="#3fe0ff"/>
    <circle cx="112" cy="40" r="2" fill="#3fe0ff"/><circle cx="8" cy="88" r="1.6" fill="#0b8bd9"/><circle cx="104" cy="98" r="1.2" fill="#bff6ff"/></g>`,
  nebulosa: () => `<g filter="url(#dk-ink)" class="dk-sway rev">
    <path d="${brush(56, 12, 200, 380, { wob: 2.5, freq: 5 })}" fill="url(#dk-magenta)"/>
    <path d="${brush(58, 10, 20, 160, { wob: 2, skew: 1.4 })}" fill="url(#dk-magenta)" opacity=".9"/>
    <path d="${brush(66, 5, 230, 285, { wob: 1 })}" fill="#ff7ad9"/>
    <path d="${brush(64, 4, 95, 140)}" fill="#c13cc9"/>
    <path d="M100 18 q 10 -4 14 4 q -8 -2 -14 -4Z" fill="#ff3fbf"/><path d="M12 108 q -9 2 -10 -6 q 5 4 10 6Z" fill="#9b1fa8"/></g>`,
  rosas: () => `<g filter="url(#dk-shadow)">
    <path d="${brush(55.5, 2.4, 140, 315, { skew: 1, wob: 0.8, freq: 11 })}" fill="url(#dk-silverleaf)"/>
    <path d="${brush(58.5, 1.2, 165, 290, { wob: 1.2, freq: 9 })}" fill="url(#dk-silverleaf)" opacity=".8"/>
    ${leaf(13, 78, 12, 140, 'dk-silverleaf')}${leaf(4, 50, 11, 190, 'dk-silverleaf')}${leaf(22, 8, 12, 230, 'dk-silverleaf')}${leaf(62, 1, 11, 330, 'dk-silverleaf')}${leaf(33, 30, 9, 120, 'dk-silverleaf')}
    ${rose(21, 27, 14, 'dk-silver')}${rose(7, 60, 9.5, 'dk-silver')}${rose(48, 6, 9, 'dk-silver')}
    ${leaf(92, 108, 11, 30, 'dk-silverleaf')}${leaf(110, 88, 10, -40, 'dk-silverleaf')}${rose(102, 98, 9, 'dk-silver')}</g>
    <path d="${brush(55.5, 3, 150, 300)}" fill="url(#dk-shine)" opacity=".7"/>`,
  sakura: () => `<g filter="url(#dk-shadow)">
    <path d="M118 112 C 100 96 96 84 104 64 C 108 54 112 50 117 44" fill="none" stroke="url(#dk-branch)" stroke-width="4" stroke-linecap="round"/>
    <path d="M104 64 C 94 60 88 66 84 74" fill="none" stroke="url(#dk-branch)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M100 92 C 88 98 80 106 70 112" fill="none" stroke="url(#dk-branch)" stroke-width="2.6" stroke-linecap="round"/>
    ${blossom(113, 46, 7, 10)}${blossom(84, 75, 6, 40)}${blossom(104, 66, 8, -10)}${blossom(72, 111, 7, 20)}${blossom(98, 100, 6, 60)}${blossom(116, 82, 5, 5)}
    <path d="M18 10 C 10 18 4 28 4 40" fill="none" stroke="url(#dk-branch)" stroke-width="2.2" stroke-linecap="round"/>${blossom(16, 13, 6, 15)}${blossom(5, 36, 5, -20)}</g>
    <g class="dk-petals">${[0, 1, 2].map((i) => `<path class="dk-petal p${i}" d="M0 0 C -3 -3 -2 -7 0 -6 C 2 -7 3 -3 0 0Z" fill="url(#dk-sakura)"/>`).join('')}</g>`,
  ondas: () => {
    const scroll = (rot) => `<g transform="rotate(${rot} 60 60)"><g transform="translate(60 2.5)">
      <path d="M0 2 C -4 -2 -10 -2 -13 2 C -16 6 -12 10 -8.5 8 C -6.5 6.5 -8 4 -10 5" fill="none" stroke="url(#dk-gold)" stroke-width="2" stroke-linecap="round"/>
      <path d="M0 2 C 4 -2 10 -2 13 2 C 16 6 12 10 8.5 8 C 6.5 6.5 8 4 10 5" fill="none" stroke="url(#dk-gold)" stroke-width="2" stroke-linecap="round"/>
      <path d="M0 -4 C 2.5 -1 2.5 3 0 6 C -2.5 3 -2.5 -1 0 -4Z" fill="url(#dk-enamel)" stroke="url(#dk-gold)" stroke-width="1"/></g></g>`;
    const gem = (deg) => { const [x, y] = P(rad(deg), 55.5); return `<circle cx="${f(x)}" cy="${f(y)}" r="2.6" fill="url(#dk-enamel)" stroke="url(#dk-gold)" stroke-width="1"/><circle cx="${f(x - 0.8)}" cy="${f(y - 0.8)}" r=".7" fill="#fff" opacity=".9"/>`; };
    return `<g filter="url(#dk-shadow)">
      <circle cx="60" cy="60" r="55.5" fill="none" stroke="url(#dk-enamel)" stroke-width="3.6"/>
      <circle cx="60" cy="60" r="57.6" fill="none" stroke="url(#dk-gold)" stroke-width="1"/>
      <circle cx="60" cy="60" r="53.4" fill="none" stroke="url(#dk-gold)" stroke-width=".9"/>
      ${scroll(0)}${scroll(180)}${[45, 135, 225, 315].map(gem).join('')}</g>
      <circle cx="60" cy="60" r="55.5" fill="none" stroke="url(#dk-shine)" stroke-width="4" opacity=".55"/>`;
  },
  louros: () => `<g filter="url(#dk-shadow)">${laurel(1)}${laurel(-1)}
    <path d="M60 2 l3 6 6.5 1 -4.8 4.6 1.2 6.5 -5.9 -3.1 -5.9 3.1 1.2 -6.5 -4.8 -4.6 6.5 -1z" fill="url(#dk-gold)" stroke="#7a5310" stroke-width=".5"/></g>
    <path d="${brush(56.5, 6, 100, 260)}" fill="url(#dk-shine)" opacity=".55"/>`,
  raiva: () => `<g filter="url(#dk-ink)">
    <path d="${brush(57, 6, 120, 230, { skew: 1.3 })}" fill="url(#dk-red)"/>
    <path d="${brush(62, 3.5, 140, 200)}" fill="#ff2d2d" opacity=".85"/>
    <path d="${brush(57, 5, 330, 390)}" fill="url(#dk-red)"/></g>
    <g class="dk-pulse" transform="translate(98 20)"><g filter="url(#dk-shadow)">
      <text x="0" y="7" text-anchor="middle" font-size="22" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">💢</text></g></g>`,
  gotas: () => `<path d="${brush(56, 3, 160, 250)}" fill="#6cc3ff" opacity=".8"/>
    <g filter="url(#dk-shadow)"><g class="dk-bob">${drop(18, 18, 1.25)}</g><g class="dk-bob d2">${drop(6, 40, 0.9)}</g><g class="dk-bob d3">${drop(34, 4, 0.8)}</g></g>`,
  chamas: () => {
    let fl = '';
    for (let d = -10, i = 0; d <= 190; d += 11, i++) {
      const h = 0.55 + 0.75 * Math.pow(Math.sin(rad(((d + 10) / 200) * 180)), 1.5) + (i % 3) * 0.08;
      fl += flame(d, h, ((i * 0.17) % 0.9).toFixed(2));
    }
    return `<g filter="url(#dk-glow)"><circle cx="60" cy="60" r="52.5" fill="none" stroke="#5fd0ff" stroke-width="1.6" opacity=".9"/>${fl}</g>`;
  },
  borboletas: () => `<circle cx="60" cy="60" r="56" fill="none" stroke="url(#dk-wing)" stroke-width="1.2" stroke-dasharray="1 4" stroke-linecap="round" opacity=".9"/>
    <g class="dk-orbit"><g transform="translate(100 16) rotate(30) scale(1.5)" filter="url(#dk-shadow)">${butterfly('dk-fly')}</g><g transform="translate(14 98) rotate(-140) scale(1.1)" filter="url(#dk-shadow)">${butterfly('dk-fly d2')}</g></g>`,
  constelacao: () => {
    const degs = [200, 228, 252, 284, 310, 30, 58, 84, 120, 150];
    const pts = degs.map((d, i) => P(rad(d), 56 + (i % 3) * 2.5));
    const lines = pts.slice(0, 5).map((p, i, a) => (i ? `<line x1="${f(a[i - 1][0])}" y1="${f(a[i - 1][1])}" x2="${f(p[0])}" y2="${f(p[1])}"/>` : '')).join('') +
      pts.slice(5).map((p, i, a) => (i ? `<line x1="${f(a[i - 1][0])}" y1="${f(a[i - 1][1])}" x2="${f(p[0])}" y2="${f(p[1])}"/>` : '')).join('');
    return `<circle cx="60" cy="60" r="53" fill="none" stroke="#8fb0ff" stroke-width=".8" opacity=".5"/><g stroke="#cfe0ff" stroke-width=".7" opacity=".75">${lines}</g>
      <g filter="url(#dk-glow)">${pts.map((p, i) => star(p[0], p[1], 0.38 + (i % 3) * 0.14, 'dk-tw t' + (i % 4))).join('')}</g>`;
  },
  frasco: () => `<circle cx="60" cy="60" r="55" fill="none" stroke="url(#dk-glass)" stroke-width="6"/>
    <circle cx="60" cy="60" r="55" fill="none" stroke="url(#dk-shine)" stroke-width="6" opacity=".6"/>
    <path d="${brush(55, 2, 200, 250)}" fill="#fff" opacity=".9"/>
    <g transform="translate(100 98)" filter="url(#dk-shadow)">
      <rect x="-5" y="-21" width="10" height="5" rx="1.5" fill="url(#dk-silver)"/><rect x="-3" y="-16" width="6" height="4" fill="#c9ccd6"/>
      <path d="M-11 -12 H11 Q14 -12 14 -8 V8 Q14 13 9 13 H-9 Q-14 13 -14 8 V-8 Q-14 -12 -11 -12Z" fill="url(#dk-glass)" stroke="#fff" stroke-width=".8"/>
      <path d="M-11 0 H11 V8 Q11 10 9 10 H-9 Q-11 10 -11 8Z" fill="#c9a7ff" opacity=".75"/>
      <circle cx="-4" cy="-3" r="1.6" fill="#1a1030"/><circle cx="4" cy="-3" r="1.6" fill="#1a1030"/></g>
    <g filter="url(#dk-glow)">${star(14, 18, 0.7, 'dk-tw t0')}${star(110, 30, 0.5, 'dk-tw t2')}${star(22, 104, 0.45, 'dk-tw t1')}</g>`,
};

const cache = new Map();
export function decoSvg(id) {
  if (!ART[id]) return '';
  if (!cache.has(id)) cache.set(id, `<svg viewBox="0 0 120 120" class="dk dk-${id}" aria-hidden="true">${ART[id]()}</svg>`);
  return cache.get(id);
}
export const hasDeco = (id) => !!ART[id];

/** coloca as definições (gradientes/filtros) uma vez no documento */
export function installDecoDefs() {
  if (document.getElementById('deco-defs')) return;
  const d = document.createElement('div');
  d.innerHTML = `<svg id="deco-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${DEFS}</defs></svg>`;
  document.body.appendChild(d.firstChild);
}
