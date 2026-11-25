// GIFs: (1) link de GIF/imagem/vídeo sozinho na mensagem vira a mídia, sem mostrar a URL (como no Discord);
// (2) seletor de GIFs com busca e "em alta" usando a API do KLIPY (precisa da chave em config.js).
import { KLIPY_KEY } from './config.js';
import { S } from './store.js';

const MEDIA_EXT = /\.(gif|webp|png|jpe?g|avif|mp4|webm)(\?[^\s]*)?$/i;
const MEDIA_HOST = /^https:\/\/(static\d?\.klipy\.com|media\d?\.giphy\.com|i\.giphy\.com|media\d?\.tenor\.com|c\.tenor\.com|i\.imgur\.com|cdn\.discordapp\.com|media\.discordapp\.net)\//i;

/** se a mensagem é só um link de mídia, devolve { url, video } */
export function mediaFromText(text) {
  const t = String(text || '').trim();
  if (!/^https:\/\/\S+$/.test(t)) return null;
  // página do GIPHY (giphy.com/gifs/nome-ID) -> arquivo direto
  const gp = /^https:\/\/giphy\.com\/(?:gifs|stickers)\/(?:[\w-]*-)?([A-Za-z0-9]+)\/?(\?.*)?$/.exec(t);
  if (gp) return { url: `https://media.giphy.com/media/${gp[1]}/giphy.webp`, video: false };
  if (!MEDIA_EXT.test(t.split('#')[0]) && !MEDIA_HOST.test(t)) return null;
  return { url: t, video: /\.(mp4|webm)(\?|$)/i.test(t) };
}

/** página do KLIPY (klipy.com/gifs/slug): busca o arquivo pela API */
const klipyCache = new Map();
export async function resolveKlipyPage(text) {
  const m = /^https:\/\/(?:www\.)?klipy\.com\/(?:gifs|stickers|clips)\/([\w-]+)\/?$/i.exec(String(text || '').trim());
  if (!m || !KLIPY_KEY) return null;
  if (klipyCache.has(m[1])) return klipyCache.get(m[1]);
  const p = fetch(`https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/items?slugs=${encodeURIComponent(m[1])}`)
    .then((r) => r.json())
    .then((j) => { const it = (j?.data?.data || j?.data || [])[0]; return it ? pickFile(it, 'md') : null; })
    .catch(() => null);
  klipyCache.set(m[1], p);
  return p;
}

export const isKlipyPage = (text) => /^https:\/\/(?:www\.)?klipy\.com\/(?:gifs|stickers|clips)\/[\w-]+\/?$/i.test(String(text || '').trim());

// ---------- API ----------
function pickFile(it, size) {
  const f = it.file?.[size] || it.file?.md || it.file?.sm || it.file?.hd || {};
  const best = f.webp || f.gif || f.mp4;
  if (!best) return null;
  return { url: best.url, video: !f.webp && !f.gif, w: best.width, h: best.height };
}

export const hasGifApi = () => !!KLIPY_KEY;

/** busca (q) ou em alta (sem q). Devolve [{ id, slug, title, preview, send, w, h }] */
export async function searchGifs(q, page = 1) {
  if (!KLIPY_KEY) throw new Error('sem chave');
  const base = `https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/${q ? 'search' : 'trending'}`;
  const params = new URLSearchParams({ page: String(page), per_page: '30', customer_id: S.uid || 'anon', locale: 'br', content_filter: 'medium' });
  if (q) params.set('q', q);
  const r = await fetch(`${base}?${params}`);
  const j = await r.json();
  const list = j?.data?.data || [];
  return list.map((it) => ({
    id: it.id, slug: it.slug, title: it.title,
    preview: pickFile(it, 'sm'),
    send: pickFile(it, 'md'),
  })).filter((g) => g.preview && g.send);
}

/** avisa o KLIPY que o GIF foi enviado (pedido da API deles) */
export function reportShare(slug) {
  if (!KLIPY_KEY || !slug) return;
  fetch(`https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/share/${encodeURIComponent(slug)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: S.uid || 'anon' }),
  }).catch(() => {});
}
