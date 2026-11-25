// Função "unfurl" (Supabase Edge Function): gera a miniatura de links e busca GIFs sem chave.
//   GET ?url=https://...   -> { url, site, title, description, image, video, gif, color }
//   GET ?gifs=gato         -> { results: [{ url, preview }] }   (raspa a busca pública do Tenor)
// Usa o mesmo "robô" do Discord (Discordbot), que os sites liberam para montar prévias.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const UA = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const json = (body: unknown, status = 200, cache = 86400) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${cache}` } });
const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
// não deixa usar a função para acessar a rede interna
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|.*\.internal$|.*\.local$)/i;

async function gifs(q: string) {
  const term = q.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').slice(0, 60);
  const page = term ? `https://tenor.com/search/${encodeURIComponent(term)}-gifs` : 'https://tenor.com/';
  const r = await fetch(page, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }, signal: AbortSignal.timeout(8000) });
  const html = await r.text();
  const seen = new Set<string>();
  const results: { url: string; preview: string }[] = [];
  for (const m of html.matchAll(/https:\/\/media\d?\.tenor\.com\/([A-Za-z0-9_-]+?)AAAA[A-Za-z]\/([a-z0-9-]+)\.gif/g)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({ url: `https://media.tenor.com/${id}AAAAM/${m[2]}.gif`, preview: `https://media.tenor.com/${id}AAAAM/${m[2]}.gif` });
    if (results.length >= 40) break;
  }
  return results;
}

async function unfurl(target: string) {
  const u = new URL(target);
  if (!/^https?:$/.test(u.protocol) || PRIVATE.test(u.hostname)) throw new Error('endereço não permitido');
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  const ct = r.headers.get('content-type') || '';
  if (/^(image|video)\//.test(ct)) {
    r.body?.cancel();
    return { url: r.url, site: new URL(r.url).hostname, direct: true, image: ct.startsWith('image/') ? r.url : null, video: ct.startsWith('video/') ? r.url : null, gif: /gif|webp/.test(ct) };
  }
  // lê só o começo da página (as metatags ficam no <head>)
  const reader = r.body!.getReader();
  let html = '', size = 0;
  while (size < 400_000) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    html += new TextDecoder().decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  reader.cancel().catch(() => {});
  const metas: Record<string, string[]> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1]?.toLowerCase();
    const val = (/content\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1];
    if (key && val != null) (metas[key] ||= []).push(decode(val));
  }
  const m = (k: string) => metas[k]?.[0] || '';
  const abs = (x: string) => { try { return x ? new URL(x, r.url).href : null; } catch { return null; } };
  const images = [...(metas['og:image'] || []), ...(metas['og:image:url'] || []), ...(metas['twitter:image'] || [])];
  const types = metas['og:image:type'] || [];
  const gifIdx = types.findIndex((t) => /gif/.test(t));
  const image = abs(gifIdx >= 0 ? images[gifIdx] : images.find((x) => /\.gif(\?|$)/i.test(x)) || images[0] || '');
  const video = abs(m('og:video:secure_url') || m('og:video:url') || m('og:video') || '');
  const site = m('og:site_name') || u.hostname.replace(/^www\./, '');
  const isGifHost = /(^|\.)(tenor|giphy|klipy|imgur|gfycat)\.com$/i.test(u.hostname);
  return {
    url: r.url,
    site,
    title: (m('og:title') || m('twitter:title') || decode((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '')).trim().slice(0, 200),
    description: (m('og:description') || m('twitter:description') || m('description')).trim().slice(0, 350),
    image,
    imageW: +(metas['og:image:width']?.[gifIdx >= 0 ? gifIdx : 0] || 0) || null,
    imageH: +(metas['og:image:height']?.[gifIdx >= 0 ? gifIdx : 0] || 0) || null,
    video: /\.mp4|\.webm/i.test(video || '') ? video : null,
    player: /youtube\.com|youtu\.be/i.test(u.hostname) ? (abs(m('og:video:url') || m('twitter:player')) || null) : null,
    gif: isGifHost && !!image,
    color: m('theme-color') || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const p = new URL(req.url).searchParams;
  try {
    if (p.has('gifs')) return json({ results: await gifs(p.get('gifs') || '') }, 200, 3600);
    const target = p.get('url');
    if (!target) return json({ error: 'falta url' }, 400);
    return json(await unfurl(target));
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 200, 300);
  }
});
