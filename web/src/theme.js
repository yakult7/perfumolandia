// Tema: claro/escuro/sistema, cor de destaque, papel de parede e tipo de vidro.
import { S, subscribe } from './store.js';

export const ACCENTS = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#ac8e68', '#8e8e93'];

/** papéis de parede: 3 cores que se misturam (modo claro clareia automaticamente) */
export const WALLPAPERS = {
  aurora: { name: 'Aurora', colors: ['#3b5bff', '#a04dff', '#00c2c7'] },
  sunset: { name: 'Pôr do sol', colors: ['#ff6a3d', '#ff2d78', '#7b3dff'] },
  ocean: { name: 'Oceano', colors: ['#0066ff', '#00d4ff', '#1b2a8f'] },
  forest: { name: 'Floresta', colors: ['#00b37a', '#00c6a7', '#2d5bff'] },
  perfume: { name: 'Perfume', colors: ['#c58cff', '#ff8fb8', '#ffc56b'] },
  graphite: { name: 'Grafite', colors: ['#6b7080', '#3d4250', '#9aa0b0'] },
};

const mq = matchMedia('(prefers-color-scheme: dark)');
export const effectiveMode = (st = S.settings) => (st.theme === 'system' ? (mq.matches ? 'dark' : 'light') : st.theme);

export function wallpaperCss(st = S.settings, mode = effectiveMode(st)) {
  if (st.wallpaper === 'image' && st.wallpaperImage) {
    const veil = mode === 'dark' ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.12)';
    return `linear-gradient(${veil}, ${veil}), url("${st.wallpaperImage}") center / cover no-repeat`;
  }
  const c = st.wallpaper === 'custom' ? st.wallpaperColors : (WALLPAPERS[st.wallpaper] || WALLPAPERS.aurora).colors;
  return `url("${ribbons(c, mode === 'light')}") center / cover no-repeat, ${mode === 'light' ? '#eef0f6' : '#07070b'}`;
}

/** mistura uma cor hex com branco/preto (k = 0..1) */
function mix(hex, k, to) {
  const n = parseInt(hex.slice(1), 16);
  const t = to === 'w' ? 255 : 0;
  const ch = (v) => Math.round(v + (t - v) * k).toString(16).padStart(2, '0');
  return '#' + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255);
}

const wpCache = new Map();
/** papel de parede vetorial: faixas fluidas com borda definida + esferas de luz (a refração do vidro aparece nelas) */
function ribbons([a, b, c], light) {
  const key = a + b + c + light;
  if (wpCache.has(key)) return wpCache.get(key);
  const t = (x, k) => (light ? mix(x, k, 'w') : mix(x, k * 0.35, 'b'));
  const base = light ? '#eef0f6' : '#06060a';
  const hl = light ? 0.55 : 0.22;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'>
<defs>
<linearGradient id='g1' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${t(a, 0.25)}'/><stop offset='1' stop-color='${t(b, 0.3)}'/></linearGradient>
<linearGradient id='g2' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t(b, 0.2)}'/><stop offset='1' stop-color='${t(c, 0.35)}'/></linearGradient>
<linearGradient id='g3' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='${t(c, 0.3)}'/><stop offset='1' stop-color='${t(a, 0.4)}'/></linearGradient>
<radialGradient id='o1' cx='.35' cy='.3' r='.75'><stop offset='0' stop-color='${t(b, 0.05)}'/><stop offset='.7' stop-color='${t(a, 0.35)}'/><stop offset='1' stop-color='${t(a, 0.5)}'/></radialGradient>
<radialGradient id='o2' cx='.35' cy='.3' r='.75'><stop offset='0' stop-color='${t(c, 0.05)}'/><stop offset='1' stop-color='${t(b, 0.45)}'/></radialGradient>
<radialGradient id='glow' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='${t(a, 0)}' stop-opacity='.9'/><stop offset='1' stop-color='${t(a, 0)}' stop-opacity='0'/></radialGradient>
<filter id='soft' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='60'/></filter>
</defs>
<rect width='1600' height='1000' fill='${base}'/>
<ellipse cx='260' cy='180' rx='520' ry='360' fill='url(#glow)' filter='url(#soft)' opacity='.55'/>
<ellipse cx='1350' cy='840' rx='560' ry='380' fill='${t(c, 0.2)}' filter='url(#soft)' opacity='.5'/>
<path d='M-120 360C220 120 520 470 860 300S1420 60 1760 220L1760-120H-120Z' fill='url(#g2)'/>
<path d='M-120 640C260 430 560 820 940 600S1480 360 1760 500L1760 1120H-120Z' fill='url(#g1)'/>
<path d='M-120 860C340 720 700 1040 1100 840S1560 700 1760 780L1760 1120H-120Z' fill='url(#g3)'/>
<path d='M-120 640C260 430 560 820 940 600S1480 360 1760 500' fill='none' stroke='white' stroke-opacity='${hl}' stroke-width='2'/>
<path d='M-120 360C220 120 520 470 860 300S1420 60 1760 220' fill='none' stroke='white' stroke-opacity='${hl * 0.7}' stroke-width='1.5'/>
<circle cx='1210' cy='330' r='150' fill='url(#o1)'/>
<ellipse cx='1170' cy='270' rx='70' ry='34' fill='white' opacity='${light ? 0.55 : 0.28}' transform='rotate(-25 1170 270)'/>
<circle cx='330' cy='760' r='92' fill='url(#o2)'/>
<ellipse cx='305' cy='722' rx='40' ry='19' fill='white' opacity='${light ? 0.5 : 0.24}' transform='rotate(-25 305 722)'/>
<circle cx='760' cy='150' r='46' fill='url(#o2)' opacity='.9'/>
</svg>`;
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\n/g, ''));
  wpCache.set(key, url);
  return url;
}

export function applyTheme() {
  const st = S.settings;
  const mode = effectiveMode(st);
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.dataset.glass = st.glassStyle || 'clear';
  root.style.setProperty('--accent', /^#[0-9a-f]{6}$/i.test(st.accent || '') ? st.accent : ACCENTS[0]);
  root.style.setProperty('--wallpaper', wallpaperCss(st, mode));
  root.classList.toggle('perf', !!st.perfMode);
  root.classList.toggle('wp-image', st.wallpaper === 'image' && !!st.wallpaperImage);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#07070b' : '#eef0f6');
}

let last = '';
subscribe(() => {
  const st = S.settings;
  const key = [st.theme, st.accent, st.wallpaper, st.wallpaperImage, (st.wallpaperColors || []).join(), st.glassStyle, st.perfMode].join('|');
  if (key !== last) { last = key; applyTheme(); }
});
mq.addEventListener('change', applyTheme);
