import { html, useState, useEffect, useRef, cx } from '../lib.js';
import { Icon } from '../icons.js';
import { openModal } from '../actions.js';
import { mediaFromText, isKlipyPage, resolveKlipyPage, searchGifs, hasGifApi } from '../gifs.js';

/** mensagem que é só um link de GIF/imagem/vídeo: mostra a mídia no lugar da URL */
export function LinkMedia({ text }) {
  const direct = mediaFromText(text);
  const [klipy, setKlipy] = useState(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => { if (!direct && isKlipyPage(text)) resolveKlipyPage(text).then(setKlipy); }, [text]);
  const m = direct || klipy;
  if (!m || broken) return null;
  const open = () => openModal('image', { a: { url: m.url, name: 'GIF', type: m.video ? 'video/mp4' : 'image/webp' } });
  return m.video
    ? html`<video class="link-media" src=${m.url} autoplay loop muted playsinline onError=${() => setBroken(true)}></video>`
    : html`<button class="link-media" onClick=${open}><img src=${m.url} alt="" loading="lazy" onError=${() => setBroken(true)} /></button>`;
}
/** true se o texto vira mídia (aí a URL não aparece) */
export const isLinkMedia = (text) => !!mediaFromText(text) || (isKlipyPage(text) && hasGifApi());

/** seletor de GIFs (KLIPY) */
export function GifPicker({ onPick, onClose }) {
  const ref = useRef();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const f = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest('.composer')) onClose(); };
    addEventListener('pointerdown', f, true);
    return () => removeEventListener('pointerdown', f, true);
  }, []);
  useEffect(() => {
    if (!hasGifApi()) return;
    let alive = true;
    setList(null);
    const t = setTimeout(() => {
      searchGifs(q.trim()).then((l) => alive && (setList(l), setErr(null))).catch(() => alive && setErr('Não deu para carregar os GIFs agora.'));
    }, q ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const cols = [[], []];
  (list || []).forEach((g, i) => cols[i % 2].push(g));
  return html`
    <div ref=${ref} class="gif-pop lg pop">
      <div class="gif-search"><${Icon} n="search" s=${15} /><input autofocus placeholder="Pesquisar GIFs" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      ${!hasGifApi() ? html`<p class="gif-empty">Os GIFs ainda não foram ativados (falta a chave do KLIPY). Enquanto isso, cole o link de um GIF na mensagem que ele aparece direto.</p>`
        : err ? html`<p class="gif-empty">${err}</p>`
        : !list ? html`<div class="gif-empty"><span class="spinner" style="--s:22px"></span></div>`
        : !list.length ? html`<p class="gif-empty">Nada encontrado para “${q}”.</p>`
        : html`<div class="gif-grid">${cols.map((c, ci) => html`<div class="gif-col" key=${ci}>${c.map((g) => html`
            <button key=${g.id} class="gif-item" title=${g.title} style=${`aspect-ratio:${g.preview.w || 1}/${g.preview.h || 1}`} onClick=${() => onPick(g)}>
              ${g.preview.video ? html`<video src=${g.preview.url} autoplay loop muted playsinline></video>` : html`<img src=${g.preview.url} alt=${g.title} loading="lazy" />`}
            </button>`)}</div>`)}</div>`}
      <small class="gif-attr">Powered by KLIPY</small>
    </div>`;
}
