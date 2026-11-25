import { html, useState, useEffect, useRef, cx } from '../lib.js';
import { Icon } from '../icons.js';
import { imageMenu } from './imagemenu.js';
import { openModal } from '../actions.js';
import { mediaFromText, isGifPage, unfurl, linksIn, searchGifs } from '../gifs.js';

const openImg = (url, video) => openModal('image', { a: { url, name: 'Imagem', type: video ? 'video/mp4' : 'image/webp' } });

/** mensagem que é só um link de GIF/imagem/vídeo (ou página do Tenor/KLIPY/GIPHY): vira a mídia, sem a URL */
export const isLinkMedia = (text) => !!mediaFromText(text) || isGifPage(text);
export function LinkMedia({ text }) {
  const direct = mediaFromText(text);
  const [page, setPage] = useState(undefined);
  const [broken, setBroken] = useState(false);
  useEffect(() => { if (!direct) unfurl(text.trim()).then((u) => setPage(u && (u.video || u.image) ? u : null)); }, [text]);
  if (broken || page === null) return html`<div class="msg-text"><a href=${text.trim()} target="_blank" rel="noopener noreferrer">${text.trim()}</a></div>`;
  if (!direct && page === undefined) return html`<div class="link-media loading"></div>`;
  const video = direct ? (direct.video ? direct.url : null) : page.video;
  const img = direct ? (!direct.video ? direct.url : null) : page.image;
  return video
    ? html`<video class="link-media" src=${video} autoplay loop muted playsinline onError=${() => setBroken(true)} onContextMenu=${(e) => imageMenu(e, video, 'gif')}></video>`
    : html`<button class="link-media" onClick=${() => openImg(img)} onContextMenu=${(e) => imageMenu(e, img, 'gif')}><img src=${img} alt="" loading="lazy" onError=${() => setBroken(true)} /></button>`;
}

/** miniaturas dos links da mensagem (como no Discord) */
export function Embeds({ text }) {
  const links = linksIn(text).filter((u) => !mediaFromText(u));
  if (!links.length) return null;
  return html`<div class="embeds">${links.map((u) => html`<${Embed} key=${u} url=${u} />`)}</div>`;
}
function Embed({ url }) {
  const [d, setD] = useState(null);
  const [play, setPlay] = useState(false);
  useEffect(() => { let on = true; unfurl(url).then((x) => on && setD(x)); return () => { on = false; }; }, [url]);
  if (!d || (!d.title && !d.image && !d.description)) return null;
  if (d.gif && (d.video || d.image)) {
    return d.video
      ? html`<video class="link-media" src=${d.video} autoplay loop muted playsinline></video>`
      : html`<button class="link-media" onClick=${() => openImg(d.image)}><img src=${d.image} alt="" loading="lazy" /></button>`;
  }
  const big = d.player || (d.imageW && d.imageW >= 400) || /youtube|twitch|instagram|tiktok|x\.com|twitter/i.test(d.site || '');
  return html`
    <div class="embed" style=${d.color ? `--ec:${d.color}` : ''}>
      <div class="embed-main">
        <small class="embed-site">${d.site}</small>
        ${d.title ? html`<a class="embed-title" href=${d.url || url} target="_blank" rel="noopener noreferrer">${d.title}</a>` : null}
        ${d.description ? html`<p class="embed-desc">${d.description}</p>` : null}
        ${big && d.image ? html`
          <div class="embed-media">
            ${play && d.player ? html`<iframe src=${d.player + (d.player.includes('?') ? '&' : '?') + 'autoplay=1'} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
              : html`<button class="embed-img" onClick=${() => (d.player ? setPlay(true) : openImg(d.image))}><img src=${d.image} alt="" loading="lazy" />${d.player ? html`<span class="embed-play"><${Icon} n="play" s=${22} /></span>` : null}</button>`}
          </div>` : null}
      </div>
      ${!big && d.image ? html`<button class="embed-thumb" onClick=${() => openImg(d.image)}><img src=${d.image} alt="" loading="lazy" /></button>` : null}
    </div>`;
}

/** seletor de GIFs (busca do Tenor pelo raspador; com chave do KLIPY usa o KLIPY) */
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
      ${err ? html`<p class="gif-empty">${err}</p>`
        : !list ? html`<div class="gif-empty"><span class="spinner" style="--s:22px"></span></div>`
        : !list.length ? html`<p class="gif-empty">Nada encontrado para “${q}”.</p>`
        : html`<div class="gif-grid">${cols.map((c, ci) => html`<div class="gif-col" key=${ci}>${c.map((g) => html`
            <button key=${g.id} class="gif-item" title=${g.title} style=${g.preview.w > 1 ? `aspect-ratio:${g.preview.w}/${g.preview.h}` : ''} onClick=${() => onPick(g)}>
              ${g.preview.video ? html`<video src=${g.preview.url} autoplay loop muted playsinline></video>` : html`<img src=${g.preview.url} alt=${g.title} loading="lazy" />`}
            </button>`)}</div>`)}</div>`}
    </div>`;
}
