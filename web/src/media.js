// Otimiza imagens antes do envio: tudo vira WebP (bem menor que PNG/JPG/GIF).
// - Fotos: redimensiona se for maior que o limite e codifica em WebP.
// - GIF animado: vira WebP animado (mesmos quadros e tempos, arquivo ~3x menor).
// Vídeos e outros arquivos passam do jeito que estão.
import { parseGIF, decompressFrames } from 'gifuct-js';

const STATIC = /^image\/(png|jpe?g|webp|bmp|avif|heic|heif)$/i;
const MAX_GIF_WORK = 160e6; // largura × altura × quadros (evita travar o aparelho com GIFs gigantes)
const rename = (name) => (name || 'imagem').replace(/\.[a-z0-9]+$/i, '') + '.webp';

async function canvasToWebp(canvas, quality) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
  if (blob && blob.type === 'image/webp') return blob;
  // Safari não codifica WebP pelo canvas: usa o codificador WebAssembly
  const { encode } = await import('@jsquash/webp');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return new Blob([await encode(data, { quality: Math.round(quality * 100) })], { type: 'image/webp' });
}

async function staticToWebp(file, max, quality) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await canvasToWebp(c, quality);
  // já era WebP pequeno e não precisou reduzir: mantém o original
  if (k === 1 && blob.size >= file.size && /webp/i.test(file.type)) return file;
  return new File([blob], rename(file.name), { type: 'image/webp' });
}

async function gifToWebp(file, max) {
  const gif = parseGIF(new Uint8Array(await file.arrayBuffer()));
  const frames = decompressFrames(gif, true);
  if (frames.length <= 1) return staticToWebp(file, max, 0.82);
  const W = gif.lsd.width, H = gif.lsd.height;
  if (W * H * frames.length > MAX_GIF_WORK) return file;
  const k = Math.min(1, max / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));

  const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
  const cctx = comp.getContext('2d', { willReadFrequently: true });
  const patchC = document.createElement('canvas');
  const pctx = patchC.getContext('2d');
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d', { willReadFrequently: true });
  const list = [];
  for (const fr of frames) {
    const { dims } = fr;
    const saved = fr.disposalType === 3 ? cctx.getImageData(0, 0, W, H) : null;
    patchC.width = dims.width; patchC.height = dims.height;
    pctx.putImageData(new ImageData(fr.patch, dims.width, dims.height), 0, 0);
    cctx.drawImage(patchC, dims.left, dims.top);
    octx.clearRect(0, 0, w, h);
    octx.drawImage(comp, 0, 0, w, h);
    const px = octx.getImageData(0, 0, w, h).data;
    const rgba = new Uint32Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      rgba[p] = ((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0;
    }
    list.push({ duration: Math.max(20, fr.delay || 100), isKeyframe: false, rgba });
    if (fr.disposalType === 2) cctx.clearRect(dims.left, dims.top, dims.width, dims.height);
    if (saved) cctx.putImageData(saved, 0, 0);
  }
  const [{ default: WebPXMux }, { default: wasmUrl }] = await Promise.all([import('webpxmux/dist/webpxmux.min.js'), import('webpxmux/dist/webpxmux.wasm?url')]);
  const mux = (WebPXMux.default || WebPXMux)(wasmUrl);
  await mux.waitRuntime();
  const bytes = await mux.encodeFrames({ frameCount: list.length, width: w, height: h, loopCount: 0, bgColor: 0x00000000, frames: list });
  if (bytes.length >= file.size && k === 1) return file; // raro: GIF já muito otimizado
  return new File([bytes], rename(file.name), { type: 'image/webp' });
}

/** devolve um File otimizado (WebP) ou o próprio arquivo se não for imagem */
export async function optimizeImage(file, { max = 2560, quality = 0.82 } = {}) {
  try {
    if (/^image\/gif$/i.test(file.type)) return await gifToWebp(file, max);
    if (STATIC.test(file.type)) return await staticToWebp(file, max, quality);
  } catch (e) {
    console.warn('não deu para converter para WebP', e);
  }
  return file;
}
