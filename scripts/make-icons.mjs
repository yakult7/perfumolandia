// Gera todos os ícones a partir de assets/logo-original.webp
// - logo.png: fundo branco removido (transparente) para usar dentro do app
// - ícones PWA / Electron / Android / iOS com fundo branco
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets/logo-original.webp');
const OUT_WEB = path.join(ROOT, 'web/public/icons');
const OUT_ASSETS = path.join(ROOT, 'assets');
fs.mkdirSync(OUT_WEB, { recursive: true });

// 1) recorta o branco das bordas e remove o fundo (flood fill a partir das bordas)
const trimmed = await sharp(SRC).trim({ background: '#ffffff', threshold: 12 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data, info } = trimmed;
const { width: W, height: H } = info;
const minc = (i) => Math.min(data[i], data[i + 1], data[i + 2]);
const bg = new Uint8Array(W * H);
const stack = [];
const isWhite = (p) => minc(p * 4) > 232;
for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
while (stack.length) {
  const p = stack.pop();
  if (bg[p] || !isWhite(p)) continue;
  bg[p] = 1;
  const x = p % W, y = (p / W) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < W - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - W);
  if (y < H - 1) stack.push(p + W);
}
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  if (bg[p]) { data[i + 3] = 0; continue; }
  // borda suave: pixels claros vizinhos do fundo ficam semi-transparentes
  const x = p % W, y = (p / W) | 0;
  const nearBg = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
  if (nearBg) data[i + 3] = Math.max(0, Math.min(255, Math.round(((255 - minc(i)) / 60) * 255)));
}
const transparent = sharp(data, { raw: { width: W, height: H, channels: 4 } }).png();
const logoBuf = await transparent.toBuffer();
await sharp(logoBuf).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile(path.join(ROOT, 'web/src/logo.png'));

// 2) ícones quadrados com fundo branco (padding em % do lado)
async function square(size, pad, file, bgc = '#ffffff') {
  const inner = Math.round(size * (1 - pad * 2));
  const fg = await sharp(logoBuf).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bgc } })
    .composite([{ input: fg, gravity: 'center' }]).png().toFile(file);
}
await square(192, 0.1, path.join(OUT_WEB, 'icon-192.png'));
await square(512, 0.1, path.join(OUT_WEB, 'icon-512.png'));
await square(512, 0.2, path.join(OUT_WEB, 'maskable-512.png'));
await square(180, 0.1, path.join(OUT_WEB, 'apple-touch-icon.png'));
await square(1024, 0.12, path.join(OUT_ASSETS, 'icon-only.png'));
await square(1024, 0.22, path.join(OUT_ASSETS, 'icon-foreground.png'), { r: 0, g: 0, b: 0, alpha: 0 });
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } }).png().toFile(path.join(OUT_ASSETS, 'icon-background.png'));
await square(512, 0.06, path.join(OUT_ASSETS, 'icon-512.png'));
// ícones só com o logo, fundo transparente (Windows: janela, barra de tarefas, bandeja; favicon do site)
await square(512, 0.03, path.join(OUT_ASSETS, 'icon-transparent-512.png'), { r: 0, g: 0, b: 0, alpha: 0 });
await square(64, 0.02, path.join(OUT_WEB, 'favicon.png'), { r: 0, g: 0, b: 0, alpha: 0 });
// splash
await square(2732, 0.38, path.join(OUT_ASSETS, 'splash.png'), '#ffffff');
await square(2732, 0.38, path.join(OUT_ASSETS, 'splash-dark.png'), '#07070c');
console.log('Ícones gerados.');
