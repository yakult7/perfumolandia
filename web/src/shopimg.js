// Itens da loja feitos com imagem (PNG, GIF ou WebP animado), cadastrados pelo app (tabela shop_items).
//  - deco: moldura de avatar (imagem quadrada; a foto ocupa o círculo do meio, como no Discord)
//  - fx: efeito de perfil (imagem que cobre o cartão)
//  - plate: placa de identificação (imagem larga atrás do nome)
//  - bundle: pacote (junta uma deco, um fx e uma plate)
// "still" é a imagem parada (opcional): aparece nas listas e a animada só ao passar o mouse / com o perfil aberto.
const IMG = new Map();
let list = [];

export const imgItem = (id) => (id && id.startsWith('img-') ? IMG.get(id) || null : null);
export const imgItems = (kind) => list.filter((it) => it.kind === kind);

const esc = (u) => String(u || '').replace(/["\\\n<>]/g, '');

export function setShopItems(rows) {
  list = (rows || []).slice().sort((a, b) => (a.sort - b.sort) || String(b.created_at).localeCompare(String(a.created_at)));
  IMG.clear();
  for (const it of list) IMG.set(it.id, it);
  // placas: imagem atrás do nome (parada nas listas, animada ao passar o mouse)
  let css = '';
  for (const it of list) {
    if (it.kind !== 'plate' || !it.image) continue;
    const still = esc(it.still || it.image), anim = esc(it.image);
    css += `.np.np-${it.id}::before{background:url("${still}") right center/cover no-repeat,#111;}\n`;
    if (it.still) css += `.np.np-${it.id}:hover::before,.np.np-${it.id}.on::before{background-image:url("${anim}");}\n`;
    const c = it.extra?.color;
    css += `.np-name.np-${it.id}{color:${/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#fff'} !important;text-shadow:0 1px 3px rgba(0,0,0,.75);}\n`;
  }
  let el = document.getElementById('np-img-css');
  if (!el) { el = document.createElement('style'); el.id = 'np-img-css'; document.head.appendChild(el); }
  el.textContent = css;
}

/** HTML da moldura de avatar de imagem (vai dentro de .deco) */
export function decoImgHtml(it) {
  const anim = esc(it.image), still = esc(it.still);
  return still
    ? `<img class="dk-img dk-still" src="${still}" alt="" draggable="false"><img class="dk-img dk-anim" src="${anim}" alt="" draggable="false">`
    : `<img class="dk-img" src="${anim}" alt="" draggable="false">`;
}
