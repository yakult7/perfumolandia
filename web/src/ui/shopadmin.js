// Gerenciar itens da loja feitos com imagem (só para quem é admin da loja; o banco confere).
import { html, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { toast, openModal } from '../actions.js';
import { Modal, Avatar, pickFile } from './common.js';
import { ProfileEffect } from './shop.js';
import { imgItems } from '../shopimg.js';

const KINDS = [
  ['deco', 'Moldura de avatar', 'PNG/GIF/WebP quadrado e transparente (ex.: 512×512). A foto fica no círculo do meio (83% da largura), como no Discord.'],
  ['fx', 'Efeito de perfil', 'Imagem animada transparente em pé (ex.: 600×900). Fica por cima do cartão de perfil inteiro.'],
  ['plate', 'Placa de identificação', 'Imagem larga (ex.: 600×120). Aparece atrás do nome nas listas.'],
  ['bundle', 'Pacote', 'Junta uma moldura, um efeito e uma placa já cadastrados.'],
];
const label = (k) => KINDS.find((x) => x[0] === k)?.[1] || k;
const rid = () => 'img-' + Math.random().toString(36).slice(2, 10);

export function ShopAdmin() {
  useS((s) => s.shopImgs);
  const me = useS((s) => s.me);
  const [kind, setKind] = useState('deco');
  const [f, setF] = useState({ name: '', description: '', color: '#ffffff', c1: '#1e1f22', c2: '#3a3d44', deco: '', fx: '', plate: '' });
  const [anim, setAnim] = useState(null); // arquivo da imagem animada
  const [still, setStill] = useState(null); // arquivo da imagem parada (opcional)
  const [busy, setBusy] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const animUrl = anim ? URL.createObjectURL(anim) : null;

  const choose = async (setter) => {
    const file = await pickFile('image/png,image/gif,image/webp,image/apng,image/jpeg');
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast('Imagem muito grande (máx. 15 MB).', 'err');
    setter(file);
  };
  const save = async () => {
    if (!f.name.trim()) return toast('Dê um nome ao item.', 'err');
    if (kind !== 'bundle' && !anim) return toast('Escolha a imagem do item.', 'err');
    if (kind === 'bundle' && !f.deco && !f.fx && !f.plate) return toast('Escolha pelo menos um item para o pacote.', 'err');
    setBusy(true);
    try {
      let image = null, stillUrl = null;
      if (kind !== 'bundle') {
        const files = [anim, ...(still ? [still] : [])];
        const res = await api.uploadFiles(files, null, { raw: true });
        image = res[0].url;
        stillUrl = res[1]?.url || null;
      }
      const extra = kind === 'plate' ? { color: f.color } : kind === 'bundle' ? { deco: f.deco || null, fx: f.fx || null, plate: f.plate || null, c1: f.c1, c2: f.c2 } : {};
      await api.saveShopItem({ id: rid(), kind, name: f.name.trim().slice(0, 60), description: f.description.trim().slice(0, 200), image, still: stillUrl, extra });
      toast('Item cadastrado! Já aparece na loja para todo mundo.');
      setF({ ...f, name: '', description: '' }); setAnim(null); setStill(null);
    } catch (e) { toast('Não deu para salvar: ' + e.message, 'err'); } finally { setBusy(false); }
  };
  const del = (it) => openModal('confirm', { title: 'Apagar item', text: `Apagar "${it.name}" da loja? Quem estiver usando volta ao normal.`, cta: 'Apagar', action: () => api.deleteShopItem(it.id).then(() => toast('Item apagado.')).catch((e) => toast(e.message, 'err')) });
  const all = [...imgItems('bundle'), ...imgItems('deco'), ...imgItems('fx'), ...imgItems('plate')];
  const pick = (k, key) => html`
    <label class="field"><span class="field-label">${label(k)}</span>
      <select value=${f[key]} onChange=${up(key)}><option value="">Nenhum</option>${imgItems(k).map((it) => html`<option value=${it.id}>${it.name}</option>`)}</select></label>`;

  return html`
    <${Modal} title="Itens da loja (imagens)" wide class="shop-adm">
      <div class="stack">
        <div class="seg">${KINDS.map(([k, l]) => html`<button key=${k} class=${kind === k ? 'on' : ''} onClick=${() => setKind(k)}>${l}</button>`)}</div>
        <small class="muted">${KINDS.find((x) => x[0] === kind)[2]} A imagem parada é opcional: com ela, a animação só roda ao passar o mouse ou com o perfil aberto (mais leve para quem joga).</small>
        <div class="sa-row">
          <div class="stack" style="flex:1;min-width:0">
            <label class="field"><span class="field-label">Nome</span><input value=${f.name} maxlength="60" onInput=${up('name')} placeholder="Ex.: Garras Carmesim" /></label>
            <label class="field"><span class="field-label">Descrição</span><input value=${f.description} maxlength="200" onInput=${up('description')} /></label>
            ${kind === 'bundle' ? html`${pick('deco', 'deco')}${pick('fx', 'fx')}${pick('plate', 'plate')}
              <div class="row"><label class="field"><span class="field-label">Cor 1</span><input type="color" value=${f.c1} onInput=${up('c1')} /></label><label class="field"><span class="field-label">Cor 2</span><input type="color" value=${f.c2} onInput=${up('c2')} /></label></div>`
              : html`
              <div class="row">
                <button class="gbtn sm" onClick=${() => choose(setAnim)}><${Icon} n="image" s=${14} /> ${anim ? 'Trocar imagem' : 'Imagem do item'}</button>
                <button class="gbtn sm" onClick=${() => choose(setStill)}><${Icon} n="image" s=${14} /> ${still ? 'Trocar parada' : 'Imagem parada (opcional)'}</button>
              </div>
              <small class="muted">${anim ? anim.name : 'Nenhuma imagem escolhida'}${still ? ' · parada: ' + still.name : ''}</small>
              ${kind === 'plate' ? html`<label class="field"><span class="field-label">Cor do nome</span><input type="color" value=${f.color} onInput=${up('color')} /></label>` : null}`}
            <button class="gbtn primary" disabled=${busy} onClick=${save}>${busy ? 'Enviando…' : 'Cadastrar na loja'}</button>
          </div>
          <div class="sa-prev">
            ${kind === 'deco' && animUrl ? html`<span class="avatar" style="--s:110px"><b>${(me?.displayName || '?')[0]}</b><span class="deco"><img class="dk-img" src=${animUrl} alt="" /></span></span>` : null}
            ${kind === 'fx' && animUrl ? html`<div class="sa-card"><div class="pfx pfx-img"><img src=${animUrl} alt="" /></div><${Avatar} id=${S.uid} size=${56} /><b>${me?.displayName}</b></div>` : null}
            ${kind === 'plate' && animUrl ? html`<div class="sa-plate" style=${`background-image:url(${animUrl})`}><${Avatar} id=${S.uid} size=${30} /><b style=${`color:${f.color}`}>${me?.displayName}</b></div>` : null}
            ${!animUrl && kind !== 'bundle' ? html`<span class="muted small">A prévia aparece aqui.</span>` : null}
          </div>
        </div>
        <h3 class="sa-title">Cadastrados (${all.length})</h3>
        <div class="sa-list">
          ${all.length ? all.map((it) => html`
            <div key=${it.id} class="sa-item">
              <span class="sa-thumb">${it.kind === 'bundle' ? html`<${Icon} n="gift" s=${18} />` : html`<img src=${it.still || it.image} alt="" />`}</span>
              <span class="sa-info"><b>${it.name}</b><small>${label(it.kind)}</small></span>
              <button class="gbtn sm danger" onClick=${() => del(it)} aria-label=${'Apagar ' + it.name}><${Icon} n="trash" s=${14} /></button>
            </div>`) : html`<p class="muted small">Nenhum item com imagem ainda.</p>`}
        </div>
      </div>
    <//>`;
}

// prévia do efeito usa o mesmo componente da loja
export { ProfileEffect };
