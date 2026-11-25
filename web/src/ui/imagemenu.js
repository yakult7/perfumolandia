// Copiar e salvar imagens/GIFs do chat (botão direito na imagem e no visualizador).
import { html } from '../lib.js';
import { Icon } from '../icons.js';
import { openMenu, toast } from '../actions.js';

const I = (n) => html`<${Icon} n=${n} s=${16} />`;
const extOf = (type, url) => (type?.split('/')[1] || (/\.(\w{3,4})(\?|$)/.exec(url)?.[1]) || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');

async function fetchBlob(url) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error('download');
  return r.blob();
}

/** copia a imagem para a área de transferência (o Windows só aceita PNG: converte) */
export async function copyImage(url) {
  try {
    const blob = await fetchBlob(url);
    let png = blob;
    if (blob.type !== 'image/png') {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      png = await new Promise((res) => c.toBlob(res, 'image/png'));
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('Imagem copiada.');
  } catch {
    // sem permissão ou formato estranho: copia o link
    await navigator.clipboard?.writeText(url).catch(() => {});
    toast('Não deu para copiar a imagem; o link foi copiado.');
  }
}

/** salva a imagem/GIF original (no PC abre "Salvar como") */
export async function saveImage(url, name = 'imagem') {
  try {
    const blob = await fetchBlob(url);
    const base = String(name).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'imagem';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.${extOf(blob.type, url)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch {
    toast('Não deu para salvar a imagem.', 'err');
  }
}

export function imageMenu(e, url, name) {
  e.preventDefault();
  openMenu(e, [
    { label: 'Copiar imagem', icon: I('copy'), onClick: () => copyImage(url) },
    { label: 'Salvar imagem', icon: I('download'), onClick: () => saveImage(url, name) },
    { sep: true },
    { label: 'Copiar link', icon: I('link'), onClick: () => navigator.clipboard?.writeText(url).then(() => toast('Link copiado.')) },
    { label: 'Abrir no navegador', icon: I('share'), onClick: () => window.open(url, '_blank', 'noopener') },
  ]);
}
