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

// 3) ícone do Windows (.ico com 16→256 px, cada tamanho reduzido separadamente e nítido; logo ocupando o quadro todo)
{
  const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
  const pngs = [];
  // fundo redondo em degradê (o mascote é vidro claro e fino: sozinho ficava pequeno e apagado na barra de tarefas)
  const disc = (s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5cff"/><stop offset=".55" stop-color="#3b3fd8"/><stop offset="1" stop-color="#1c1f7a"/></linearGradient>
    <radialGradient id="h" cx=".35" cy=".25" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="50" r="49" fill="url(#g)"/><circle cx="50" cy="50" r="49" fill="url(#h)"/>
    <circle cx="50" cy="50" r="48.4" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.2"/></svg>`);
  for (const s of sizes) {
    const inner = Math.round(s * (s <= 24 ? 0.9 : 0.86));
    let img = sharp(logoBuf).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).modulate({ brightness: 1.15 });
    if (s <= 64) img = img.sharpen({ sigma: s <= 32 ? 0.6 : 0.4 });
    const fg = await img.png().toBuffer();
    const bg = await sharp(disc(s)).resize(s, s).png().toBuffer();
    pngs.push(await sharp(bg).composite([{ input: fg, gravity: 'center' }]).png().toBuffer());
  }
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += pngs[i].length;
  });
  fs.writeFileSync(path.join(OUT_ASSETS, 'icon.ico'), Buffer.concat([head, ...pngs]));
  await sharp(logoBuf).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT_ASSETS, 'icon-transparent-1024.png'));
}
