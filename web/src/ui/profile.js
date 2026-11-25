import { html, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { run, safe, toast, statusOf } from '../actions.js';
import { ProfileEffect } from './shop.js';
import { Avatar, STATUS_LABEL, pickFile, shrinkImage, Field, GameCard } from './common.js';

const SINCE = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** cartão de perfil (usado no perfil dos outros e na prévia do editor) */
export function ProfileCard({ u, status, children, avatarSlot, bannerSlot }) {
  const c1 = u.color || '#5e5ce6';
  const c2 = u.accent || c1;
  return html`
    <div class="pcard" style=${`--pc1:${c1};--pc2:${c2}`}>
      <${ProfileEffect} effect=${u.effect} />
      <div class="pcard-banner">${u.banner ? html`<img src=${u.banner} alt="" />` : null}${bannerSlot}</div>
      <div class="pcard-av">${avatarSlot || html`<${Avatar} user=${u} id=${u.id} size=${76} status=${!!status} />`}</div>
      <div class="pcard-body">
        <div class="pcard-panel">
          <div>
            <div class="pcard-name">${u.displayName || 'Seu nome'}</div>
            <div class="pcard-user"><span>@${u.username}</span>${u.pronouns ? html`<span>· ${u.pronouns}</span>` : null}</div>
          </div>
          ${u.customStatus ? html`<div class="pcard-status">${u.customStatus}</div>` : null}
          ${u.id ? html`<${GameCard} id=${u.id} />` : null}
          ${u.bio ? html`<div class="pcard-section"><small>Sobre mim</small><p class="pcard-bio">${u.bio}</p></div>` : null}
          ${u.createdAt ? html`<div class="pcard-section"><small>Membro desde</small><span class="muted">${SINCE(u.createdAt)}</span></div>` : null}
          ${status ? html`<div class="pcard-section"><small>Status</small><span><i class=${'dot inline st-' + status}></i> ${STATUS_LABEL[status]}</span></div>` : null}
          ${children ? html`<div class="pcard-actions">${children}</div>` : null}
        </div>
      </div>
    </div>`;
}

const PALETTE = ['#5e5ce6', '#0a84ff', '#64d2ff', '#30d158', '#ffd60a', '#ff9f0a', '#ff375f', '#bf5af2', '#ac8e68', '#1c1c1e', '#f2f2f7'];

function ColorPick({ value, onChange, label }) {
  return html`
    <div class="field"><span class="field-label">${label}</span>
      <div class="swatches">
        ${PALETTE.map((c) => html`<button key=${c} type="button" class=${cx('swatch', value === c && 'on')} style=${`--c:${c}`} aria-label=${c} onClick=${() => onChange(c)}></button>`)}
        <input type="color" value=${value || '#5e5ce6'} onInput=${(e) => onChange(e.target.value)} title="Cor personalizada" />
      </div>
    </div>`;
}

/** editor de perfil com prévia ao vivo */
export function ProfileEditor() {
  const me = useS((s) => s.me);
  const [d, setD] = useState(() => ({
    displayName: me.displayName, pronouns: me.pronouns, customStatus: me.customStatus, bio: me.bio,
    color: me.color, accent: me.accent || me.color, avatar: me.avatar, banner: me.banner,
  }));
  const [busy, setBusy] = useState('');
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const dirty = Object.keys(d).some((k) => (d[k] || '') !== ((k === 'accent' ? me.accent || me.color : me[k]) || ''));

  const upload = async (kind) => {
    const f = await pickFile('image/*');
    if (!f) return;
    const max = kind === 'avatar' ? 10 : 15;
    if (f.size > max * 1024 * 1024) return toast(`Imagem muito grande (máx. ${max} MB).`, 'err');
    setBusy(kind);
    try {
      const file = await shrinkImage(f, kind === 'avatar' ? 512 : 1600);
      const [a] = await api.uploadFiles([file]);
      set(kind)(a.url);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const save = () => safe(api.updateProfile({
    displayName: d.displayName, pronouns: d.pronouns, customStatus: d.customStatus, bio: d.bio,
    color: d.color, accent: d.accent, avatar: d.avatar || null, banner: d.banner || null,
  }), 'Perfil salvo.');

  const preview = { ...me, ...d };
  return html`
    <div class="grid2" style="align-items:start">
      <div class="stack">
        <div class="group-box">
          <div class="field"><span class="field-label">Foto de perfil</span>
            <div class="upload-row">
              <button class="gbtn sm" onClick=${() => upload('avatar')} disabled=${!!busy}><${Icon} n="image" s=${15} /> ${busy === 'avatar' ? 'Enviando…' : 'Trocar foto'}</button>
              ${d.avatar ? html`<button class="gbtn sm plain" onClick=${() => set('avatar')(null)}>Remover</button>` : null}
            </div>
            <small class="field-hint">PNG, JPG, WEBP ou GIF animado (até 10 MB).</small>
          </div>
          <div class="field"><span class="field-label">Banner</span>
            <div class="upload-row">
              <button class="gbtn sm" onClick=${() => upload('banner')} disabled=${!!busy}><${Icon} n="image" s=${15} /> ${busy === 'banner' ? 'Enviando…' : 'Trocar banner'}</button>
              ${d.banner ? html`<button class="gbtn sm plain" onClick=${() => set('banner')(null)}>Remover</button>` : null}
            </div>
            <small class="field-hint">Imagem ou GIF. Sem banner, a capa usa as cores abaixo.</small>
          </div>
        </div>
        <div class="group-box">
          <${ColorPick} label="Cor principal da capa" value=${d.color} onChange=${set('color')} />
          <${ColorPick} label="Cor de destaque (degradê)" value=${d.accent} onChange=${set('accent')} />
        </div>
        <${Field} label="Nome de exibição"><input value=${d.displayName} maxlength="32" onInput=${(e) => set('displayName')(e.target.value)} /><//>
        <${Field} label="Pronomes"><input value=${d.pronouns} maxlength="40" placeholder="ele/dele, ela/dela…" onInput=${(e) => set('pronouns')(e.target.value)} /><//>
        <${Field} label="Status personalizado"><input value=${d.customStatus} maxlength="80" placeholder="jogando Valorant 🎮" onInput=${(e) => set('customStatus')(e.target.value)} /><//>
        <${Field} label=${`Sobre mim (${(d.bio || '').length}/400)`}><textarea rows="4" maxlength="400" value=${d.bio} onInput=${(e) => set('bio')(e.target.value)}></textarea><//>
        <div class="row">
          <button class="gbtn primary" disabled=${!dirty || !!busy} onClick=${save}>Salvar perfil</button>
          ${dirty ? html`<button class="gbtn plain" onClick=${() => setD({ displayName: me.displayName, pronouns: me.pronouns, customStatus: me.customStatus, bio: me.bio, color: me.color, accent: me.accent || me.color, avatar: me.avatar, banner: me.banner })}>Desfazer</button>` : null}
        </div>
      </div>
      <div class="stack" style="position:sticky;top:0">
        <span class="field-label">Prévia</span>
        <${ProfileCard} u=${preview} status=${statusOf(S, me.id) === 'offline' ? null : statusOf(S, me.id)} />
      </div>
    </div>`;
}
