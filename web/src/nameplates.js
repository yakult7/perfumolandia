// Placas de identificação (estilo "nameplate" do Discord): arte atrás do nome nas listas
// + cor/fonte do nome. Nas conversas aparece ao passar o mouse; em grupos e servidores, sempre.
// A arte é SVG gerado aqui e vira CSS (data URI) injetado uma vez na página.

const svg = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMaxYMid slice'>${body}</svg>`)}")`;
const crow = (x, y, s, c = '#0b0b10') => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M0 0 C 3 -6 9 -7 12 -4 L 16 -5 L 13 -2 C 13 2 10 6 4 7 L -2 14 L -1 7 C -6 6 -9 3 -10 0 C -6 1 -3 1 0 0Z' fill='${c}'/></g>`;
const flyingCrow = (x, y, s, c) => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M0 0 C -8 -10 -20 -12 -30 -6 C -20 -6 -12 -2 -6 4 C -4 8 0 10 4 8 C 8 10 12 8 14 4 C 20 -2 28 -6 38 -6 C 28 -12 16 -10 8 0 C 6 -2 2 -2 0 0Z' fill='${c}'/></g>`;
const rose = (x, y, s, c1, c2) => {
  let d = '';
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = s * (0.25 + i * 0.085); const cx = x + Math.cos(a) * r * 0.35, cy = y + Math.sin(a) * r * 0.35; d += `<ellipse cx='${cx.toFixed(1)}' cy='${cy.toFixed(1)}' rx='${r.toFixed(1)}' ry='${(r * 0.72).toFixed(1)}' transform='rotate(${((a * 180) / Math.PI).toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})' fill='${i % 2 ? c1 : c2}' stroke='rgba(20,20,30,.45)' stroke-width='.5'/>`; }
  return d;
};
const petal = (x, y, r, c) => `<path transform='translate(${x} ${y}) rotate(${r})' d='M0 0 C -4 -2 -5 -8 -1 -9 C 0 -8 1 -8 1.5 -9 C 5 -8 4 -2 0 0Z' fill='${c}'/>`;
const spark = (x, y, s, c = '#fff') => `<path transform='translate(${x} ${y}) scale(${s})' d='M0 -6 L1.3 -1.3 L6 0 L1.3 1.3 L0 6 L-1.3 1.3 L-6 0 L-1.3 -1.3Z' fill='${c}'/>`;

export const NAMEPLATES = [
  { id: 'luanegra', name: 'Lua Negra', desc: 'Lua prateada, galhos secos e corvo.', bg: '#0f1217',
    art: svg(240, 48, `<defs><radialGradient id='m' cx='.4' cy='.4'><stop offset='0' stop-color='#fff'/><stop offset='1' stop-color='#9aa3b3'/></radialGradient></defs>
      <circle cx='200' cy='24' r='19' fill='url(#m)'/><circle cx='194' cy='19' r='3' fill='#b8bfcc' opacity='.6'/><circle cx='206' cy='30' r='4' fill='#aab1bf' opacity='.5'/>
      <path d='M150 48 C 160 36 170 34 176 24 M168 34 L 162 26 M240 40 C 228 34 222 26 214 14 M224 28 L 232 22' stroke='#07080b' stroke-width='3' fill='none' stroke-linecap='round'/>${crow(176, 22, 1.1)}`),
    style: { color: '#e6ebf5' } },
  { id: 'luasangue', name: 'Lua de Sangue', desc: 'Lua vermelha sobre a floresta morta.', bg: '#1a0607',
    art: svg(240, 48, `<defs><radialGradient id='m' cx='.4' cy='.4'><stop offset='0' stop-color='#ff8a7a'/><stop offset='1' stop-color='#8e0d12'/></radialGradient></defs>
      <circle cx='204' cy='24' r='20' fill='url(#m)' opacity='.95'/><path d='M150 48 L 156 30 L 160 48 M170 48 L 174 22 L 180 48 M230 48 L 234 28 L 240 48' fill='#0a0202'/>${crow(214, 16, 0.9, '#120203')}`),
    style: { color: '#ff9a9a', glow: '#ff2a2a' } },
  { id: 'rosas', name: 'Rosas Sombrias', desc: 'Rosas brancas no escuro.', bg: '#101012',
    art: svg(240, 48, `${rose(196, 34, 12, '#f4f4f6', '#c9ccd6')}${rose(222, 22, 9, '#f4f4f6', '#c9ccd6')}${rose(176, 40, 7, '#e6e8ee', '#b5b9c4')}
      <path d='M160 46 C 180 40 200 44 236 38' stroke='#8d93a1' stroke-width='1.4' fill='none'/>`),
    style: { color: '#f2f3f7', font: 'serif' } },
  { id: 'petalas', name: 'Pétalas Místicas', desc: 'Pétalas e brilhos lilás flutuando.', bg: '#1c1830', anim: 'drift',
    art: svg(240, 48, `${petal(170, 14, 30, '#e9ddff')}${petal(196, 34, -20, '#d4c2ff')}${petal(220, 12, 60, '#f3ecff')}${petal(150, 36, 10, '#cdb8ff')}${petal(232, 38, -50, '#e9ddff')}
      ${spark(184, 26, 0.7)}${spark(208, 20, 0.5)}${spark(160, 22, 0.45)}${spark(228, 28, 0.55)}`),
    style: { color: '#efe6ff', glow: '#b79dff' } },
  { id: 'estrela', name: 'Estrela Deslumbrante', desc: 'Lua crescente entre nuvens numa noite azul.', bg: '#13205a',
    art: svg(240, 48, `<path d='M214 10 a 12 12 0 1 0 10 18 a 9 9 0 1 1 -10 -18Z' fill='#fff7d6'/>
      <path d='M150 46 C 154 36 166 36 170 40 C 174 32 188 32 192 40 C 198 36 210 38 210 46Z M196 46 C 200 40 210 40 214 44 C 218 38 232 38 240 46Z' fill='#cfd9ff' opacity='.9'/>
      ${spark(182, 14, 0.5)}${spark(234, 12, 0.4)}${spark(160, 20, 0.35)}`),
    style: { color: '#ffffff', glow: '#7aa2ff' } },
  { id: 'arranhoes', name: 'Marcas de Arranhões', desc: 'Garras rasgando em vermelho.', bg: '#2a0506',
    art: svg(240, 48, `<g stroke='#ff3b30' stroke-linecap='round' fill='none'><path d='M160 4 L 196 44' stroke-width='3'/><path d='M176 2 L 210 44' stroke-width='3.6'/><path d='M192 4 L 224 42' stroke-width='3'/><path d='M206 2 L 236 36' stroke-width='2.4'/></g>
      <g stroke='#ffb3ad' stroke-linecap='round' fill='none' opacity='.7'><path d='M178 6 L 206 38' stroke-width='1'/><path d='M194 8 L 220 38' stroke-width='1'/></g>`),
    style: { color: '#ffd1cc', glow: '#ff2a1f' } },
  { id: 'chuvisco', name: 'Chuvisco', desc: 'Lago verde com gotas de chuva.', bg: '#0f2418', anim: 'rain',
    art: svg(240, 48, `<ellipse cx='200' cy='38' rx='44' ry='10' fill='#2b6b4a' opacity='.7'/><ellipse cx='196' cy='38' rx='10' ry='2.6' fill='none' stroke='#bff2d6' stroke-width='.8' opacity='.8'/><ellipse cx='220' cy='36' rx='7' ry='1.8' fill='none' stroke='#bff2d6' stroke-width='.7' opacity='.7'/>
      <path d='M150 20 C 160 10 170 14 172 22 M226 8 C 232 4 238 8 238 14' stroke='#3f8f5e' stroke-width='3' fill='none' stroke-linecap='round'/>
      <path d='M158 46 q 2 -10 6 -14 M236 46 q -2 -12 -6 -16' stroke='#4fae73' stroke-width='2' fill='none'/>`),
    style: { color: '#d9ffe8' } },
  { id: 'olhos', name: 'Sempre de Olho', desc: 'Olhos brancos observando no escuro.', bg: '#050506',
    art: svg(240, 48, [[170, 14, 1], [196, 30, 1.2], [222, 12, 0.9], [214, 38, 0.8], [182, 38, 0.7]].map(([x, y, s]) => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M-10 0 C -5 -6 5 -6 10 0 C 5 6 -5 6 -10 0Z' fill='#f4f4f6'/><circle r='3' fill='#050506'/><circle cx='-1' cy='-1' r='.9' fill='#fff'/></g>`).join('')),
    style: { color: '#ffffff' } },
  { id: 'corvo', name: 'Nunca Mais', desc: 'Corvo voando na névoa.', bg: '#bfc3c9', light: true,
    art: svg(240, 48, `<ellipse cx='200' cy='30' rx='60' ry='20' fill='#e8eaee' opacity='.8'/>${flyingCrow(196, 22, 1.2, '#1b1d22')}${flyingCrow(226, 10, 0.55, '#3a3d44')}`),
    style: { color: '#1b1d22' } },
  { id: 'neon', name: 'Neon Rosa', desc: 'Gradiente neon com nome brilhando.', bg: 'linear-gradient(90deg, #2a1240, #7a1fa8 60%, #c2189b)',
    art: svg(240, 48, `<path d='M150 48 L 240 0 L 240 48Z' fill='#ff4fd8' opacity='.25'/>${spark(222, 14, 0.6, '#ffd6f6')}${spark(200, 34, 0.4, '#ffd6f6')}`),
    style: { color: '#ff5ec4', glow: '#ff1fb0', font: 'display' } },
  { id: 'ouro', name: 'Ouro Real', desc: 'Brilho dourado com nome em ouro.', bg: 'linear-gradient(90deg, #2a1d08, #6b4a10)', anim: 'shine',
    art: svg(240, 48, `<path d='M176 24 C 188 8 206 8 214 18 C 222 8 236 12 240 20' stroke='#f2c84b' stroke-width='2' fill='none'/>${spark(190, 30, 0.6, '#fff3c4')}${spark(226, 32, 0.45, '#fff3c4')}`),
    style: { gradient: 'linear-gradient(90deg, #fff3c4, #f2c84b 45%, #b8841d 70%, #fff3c4)' } },
  { id: 'sakura', name: 'Sakura', desc: 'Galho de cerejeira florido.', bg: '#2b1620',
    art: svg(240, 48, `<path d='M240 4 C 220 14 200 16 180 30 C 170 36 160 40 150 46' stroke='#5a3526' stroke-width='3' fill='none' stroke-linecap='round'/>
      ${[[214, 12], [196, 22], [178, 32], [228, 26], [162, 40]].map(([x, y], i) => [0, 72, 144, 216, 288].map((r) => petal(x, y, r + i * 10, i % 2 ? '#ffc9dc' : '#ffb3cf')).join('') + `<circle cx='${x}' cy='${y}' r='1.6' fill='#ffd36e'/>`).join('')}`),
    style: { color: '#ffd6e6' } },
];

const byId = Object.fromEntries(NAMEPLATES.map((p) => [p.id, p]));
/** classe da placa de um usuário (ou '') */
export const plateOf = (u) => (u?.nameplate && byId[u.nameplate] ? 'np-' + u.nameplate : '');

/** injeta o CSS das placas uma vez */
export function installNameplates() {
  if (document.getElementById('np-css')) return;
  let css = '';
  for (const p of NAMEPLATES) {
    const bg = p.bg.startsWith('linear') ? p.bg : p.bg;
    css += `.np.np-${p.id}::before{background:${p.art} right center/auto 100% no-repeat, ${bg};}\n`;
    const n = p.style;
    css += `.np-name.np-${p.id}{${n.gradient ? `background:${n.gradient};-webkit-background-clip:text;background-clip:text;color:transparent !important;` : `color:${n.color} !important;`}${n.glow ? `text-shadow:0 0 8px ${n.glow},0 0 2px ${n.glow};` : ''}${n.font === 'serif' ? "font-family:'Georgia','Times New Roman',serif;font-style:italic;letter-spacing:.01em;" : n.font === 'display' ? 'font-weight:800;letter-spacing:.03em;' : ''}}\n`;
    if (p.light) css += `.np.np-${p.id} small{color:#2a2d33 !important;}\n`;
  }
  const el = document.createElement('style');
  el.id = 'np-css';
  el.textContent = css;
  document.head.appendChild(el);
}
