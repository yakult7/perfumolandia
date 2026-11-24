import { html, useState, useEffect, cx, isIOS, isStandalone } from '../lib.js';
import { useS, S, persist } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { closeModal, run, safe, go, toast, openDM, acceptCall, declineCall, callDM, statusOf } from '../actions.js';
import { Modal, Field, Avatar, GBtn, pickFile, shrinkImage, STATUS_LABEL } from './common.js';
import { ScreenShareModal, VolumeModal } from './call.js';
import { Settings } from './settings.js';
import { EmojiPicker, QUICK } from './chat.js';
import { isNativeApp } from '../native.js';

export function Modals() {
  const m = useS((s) => s.ui.modal);
  if (!m) return null;
  const C = {
    addServer: AddServer, createChannel: CreateChannel, renameChannel: RenameChannel, invite: Invite,
    serverSettings: ServerSettings, confirm: Confirm, profile: Profile, image: ImageView, react: React,
    screenShare: ScreenShareModal, volume: VolumeModal, settings: Settings, install: InstallHelp,
  }[m.name];
  return C ? html`<${C} ...${m} />` : null;
}

function AddServer() {
  const [mode, setMode] = useState('create');
  const [name, setName] = useState(`Servidor de ${S.me.displayName}`);
  const [icon, setIcon] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      let url = null;
      if (icon) url = (await api.uploadFiles([await shrinkImage(icon, 256)]))[0].url;
      const id = await run(api.createServer(name, url), 'Servidor criado!');
      closeModal(); go(id);
    } catch {} finally { setBusy(false); }
  };
  const join = async () => {
    setBusy(true);
    try { const id = await run(api.joinServer(code), 'Você entrou!'); closeModal(); go(id); } catch {} finally { setBusy(false); }
  };
  return html`
    <${Modal} title=${mode === 'create' ? 'Criar servidor' : 'Entrar em um servidor'}>
      <div class="seg glass small-seg">
        <button class=${mode === 'create' ? 'on' : ''} onClick=${() => setMode('create')}>Criar</button>
        <button class=${mode === 'join' ? 'on' : ''} onClick=${() => setMode('join')}>Tenho um convite</button>
      </div>
      ${mode === 'create' ? html`
        <button class="icon-pick" onClick=${async () => { const f = await pickFile(); if (f) setIcon(f); }}>
          ${icon ? html`<img src=${URL.createObjectURL(icon)} alt="" />` : html`<${Icon} n="image" s=${26} /><small>Ícone</small>`}
        </button>
        <${Field} label="Nome do servidor"><input value=${name} maxlength="48" onInput=${(e) => setName(e.target.value)} /><//>
        <button class="gbtn primary wide" disabled=${busy || !name.trim()} onClick=${create}>Criar</button>` : html`
        <${Field} label="Código ou link do convite" hint="Ex.: K7Q2XA"><input value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="K7Q2XA" autocapitalize="characters" /><//>
        <button class="gbtn primary wide" disabled=${busy || !code.trim()} onClick=${join}>Entrar</button>`}
    <//>`;
}

function CreateChannel({ serverId, type: t0 = 'text' }) {
  const [type, setType] = useState(t0);
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { const id = await run(api.createChannel(serverId, name, type)); closeModal(); if (type === 'text') go(serverId, id); } catch {}
  };
  return html`
    <${Modal} title="Criar canal">
      <form onSubmit=${submit} class="stack">
        <div class="seg glass small-seg">
          <button type="button" class=${type === 'text' ? 'on' : ''} onClick=${() => setType('text')}><${Icon} n="hash" s=${16} /> Texto</button>
          <button type="button" class=${type === 'voice' ? 'on' : ''} onClick=${() => setType('voice')}><${Icon} n="volume" s=${16} /> Voz</button>
        </div>
        <${Field} label="Nome"><input value=${name} maxlength="40" autofocus onInput=${(e) => setName(e.target.value)} placeholder=${type === 'text' ? 'novo-canal' : 'Sala de jogo'} /><//>
        <button class="gbtn primary wide" disabled=${!name.trim()}>Criar canal</button>
      </form>
    <//>`;
}

function RenameChannel({ c, serverId }) {
  const [name, setName] = useState(c.name);
  return html`
    <${Modal} title="Renomear canal">
      <form class="stack" onSubmit=${(e) => { e.preventDefault(); run(api.renameChannel(c.id, name, c.type, serverId)).then(closeModal).catch(() => {}); }}>
        <${Field} label="Nome"><input value=${name} maxlength="40" autofocus onInput=${(e) => setName(e.target.value)} /><//>
        <button class="gbtn primary wide" disabled=${!name.trim()}>Salvar</button>
      </form>
    <//>`;
}

function Invite({ id }) {
  const sv = useS((s) => s.servers[id]);
  const code = useS((s) => s.inviteCode);
  if (!sv) return null;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copiado!'));
  const msg = `Entra no meu servidor "${sv.name}" na Perfumolandia! Convite do servidor: ${sv.invite}` + (code ? ` · Código para criar conta: ${code}` : '');
  return html`
    <${Modal} title=${'Convidar para ' + sv.name}>
      <p class="muted">Mande o código para os amigos. Eles entram em <b>+ → Tenho um convite</b>.</p>
      <div class="code-box glass"><b>${sv.invite}</b><button class="gbtn sm" onClick=${() => copy(sv.invite)}><${Icon} n="copy" s=${16} /> Copiar</button></div>
      <p class="muted small">Quem ainda não tem conta precisa do código de cadastro: <code>${code}</code></p>
      <div class="row">
        <button class="gbtn" onClick=${() => copy(msg)}><${Icon} n="copy" s=${16} /> Copiar mensagem pronta</button>
        ${navigator.share ? html`<button class="gbtn" onClick=${() => navigator.share({ text: msg }).catch(() => {})}><${Icon} n="share" s=${16} /> Compartilhar</button>` : null}
      </div>
    <//>`;
}

function ServerSettings({ id }) {
  const sv = useS((s) => s.servers[id]);
  const [name, setName] = useState(sv?.name || '');
  if (!sv) return null;
  const setIcon = async () => {
    const f = await pickFile();
    if (!f) return;
    const [a] = await run(api.uploadFiles([await shrinkImage(f, 256)]));
    await safe(api.updateServer(id, { icon: a.url }), 'Ícone atualizado.');
  };
  return html`
    <${Modal} title="Configurações do servidor">
      <div class="row center">
        <button class="icon-pick" onClick=${setIcon}>${sv.icon ? html`<img src=${sv.icon} alt="" />` : html`<${Icon} n="image" s=${26} /><small>Ícone</small>`}</button>
        <div class="grow stack">
          <${Field} label="Nome"><input value=${name} maxlength="48" onInput=${(e) => setName(e.target.value)} /><//>
          <button class="gbtn primary" disabled=${!name.trim() || name === sv.name} onClick=${() => safe(api.updateServer(id, { name }), 'Salvo.')}>Salvar nome</button>
        </div>
      </div>
      <${Field} label="Convite atual"><div class="code-box glass"><b>${sv.invite}</b>
        <button class="gbtn sm" onClick=${() => safe(api.updateServer(id, { resetInvite: true }), 'Novo convite gerado.')}>Gerar novo</button></div><//>
      <div class="field"><span class="field-label">Membros (${sv.members.length})</span>
        <div class="mem-list">
          ${sv.members.map((uid) => html`
            <div class="mem-row" key=${uid}><${Avatar} id=${uid} size=${30} status /><span class="grow">${S.users[uid]?.displayName}</span>
              ${uid !== sv.ownerId ? html`<button class="gbtn sm danger" onClick=${() => safe(api.kickMember(id, uid), 'Removido.')}>Remover</button>` : html`<small class="muted">Dono</small>`}
            </div>`)}
        </div>
      </div>
    <//>`;
}

function Confirm({ title, text, action, cta = 'Confirmar' }) {
  return html`
    <${Modal} title=${title}>
      <p>${text}</p>
      <div class="row end">
        <button class="gbtn" onClick=${closeModal}>Cancelar</button>
        <button class="gbtn danger solid" onClick=${() => { closeModal(); action(); }}>${cta}</button>
      </div>
    <//>`;
}

function Profile({ id }) {
  const u = useS((s) => s.users[id]);
  const st = useS((s) => statusOf(s, id));
  const rel = useS((s) => Object.values(s.relations).find((r) => (r.from === id && r.to === s.uid) || (r.to === id && r.from === s.uid)));
  if (!u) return null;
  const me = id === S.uid;
  return html`
    <${Modal} title="Perfil" class="profile-modal">
      <div class="profile-banner" style=${`--c:${u.color}`}></div>
      <div class="profile-av"><${Avatar} id=${id} size=${92} status /></div>
      <h2 class="profile-name">${u.displayName}</h2>
      <p class="muted">@${u.username} · ${STATUS_LABEL[st]}</p>
      ${u.customStatus ? html`<p class="custom-status">${u.customStatus}</p>` : null}
      ${u.bio ? html`<div class="bio"><small class="field-label">Sobre</small><p>${u.bio}</p></div>` : null}
      ${!me ? html`
        <div class="row center">
          ${rel?.status === 'accepted' ? html`
            <button class="gbtn primary" onClick=${() => { closeModal(); openDM(id); }}><${Icon} n="message" s=${18} /> Mensagem</button>
            <button class="gbtn" onClick=${async () => { closeModal(); const dm = await openDM(id); callDM(dm.id); }}><${Icon} n="phone" s=${18} /> Ligar</button>`
            : rel ? html`<span class="muted">Pedido de amizade pendente</span>`
            : html`<button class="gbtn primary" onClick=${() => run(api.friendRequest(u.username), 'Pedido enviado!')}><${Icon} n="userPlus" s=${18} /> Adicionar amigo</button>`}
        </div>` : null}
    <//>`;
}

function ImageView({ a }) {
  return html`
    <div class="viewer" onClick=${closeModal}>
      <img src=${a.url} alt=${a.name} onClick=${(e) => e.stopPropagation()} />
      <div class="viewer-bar glass" onClick=${(e) => e.stopPropagation()}>
        <span>${a.name}</span>
        <a class="gbtn sm" href=${a.url} target="_blank" rel="noopener" download=${a.name}><${Icon} n="download" s=${16} /> Baixar</a>
        <button class="gbtn icon-only sm" onClick=${closeModal} aria-label="Fechar"><${Icon} n="x" s=${18} /></button>
      </div>
    </div>`;
}

function React({ m }) {
  const pick = (e) => { closeModal(); safe(api.toggleReaction(m.id, e)); };
  return html`
    <${Modal} title="Reagir">
      <div class="quick-reacts">${QUICK.map((q) => html`<button key=${q} onClick=${() => pick(q)}>${q}</button>`)}</div>
      <${EmojiPicker} inline onPick=${pick} onClose=${closeModal} />
    <//>`;
}

export function IncomingCall() {
  const inc = useS((s) => s.incoming);
  const u = useS((s) => (inc ? s.users[inc.from] : null));
  if (!inc) return null;
  return html`
    <div class="incoming glass pop" role="alertdialog" aria-label="Chamada recebida">
      <div class="inc-av"><${Avatar} id=${inc.from} size=${84} /></div>
      <b>${u?.displayName}</b>
      <small>está te ligando…</small>
      <div class="row center">
        <button class="gbtn icon-only ctl danger" aria-label="Recusar" onClick=${declineCall}><${Icon} n="hangup" /></button>
        <button class="gbtn icon-only ctl ok" aria-label="Atender" onClick=${acceptCall}><${Icon} n="phone" /></button>
      </div>
    </div>`;
}

// ---------- instalar o app ----------
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

export function InstallBanner() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('rs.installHidden') === '1'; } catch { return false; } });
  const ready = useS((s) => s.ready);
  if (hidden || isStandalone || isNativeApp || window.perfumolandiaDesktop || !ready) return null;
  const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || isIOS;
  if (!isMobile) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem('rs.installHidden', '1'); } catch {} };
  return html`
    <div class="install glass pop">
      <${Icon} n="download" s=${20} />
      <span>Instale a Perfumolandia na tela de início para receber chamadas e usar em tela cheia.</span>
      <button class="gbtn sm primary" onClick=${() => (deferredPrompt ? deferredPrompt.prompt() : import('../actions.js').then((a) => a.openModal('install')))}>Instalar</button>
      <button class="mini-btn" onClick=${dismiss} aria-label="Fechar"><${Icon} n="x" s=${16} /></button>
    </div>`;
}

export function InstallHelp() {
  return html`
    <${Modal} title="Instalar no celular">
      ${isIOS ? html`
        <ol class="steps">
          <li>Abra este link no <b>Safari</b> (não funciona pelo Chrome no iPhone).</li>
          <li>Toque em <span class="kbd"><${Icon} n="share" s=${16} /> Compartilhar</span> na barra de baixo.</li>
          <li>Role e toque em <span class="kbd"><${Icon} n="plusSquare" s=${16} /> Adicionar à Tela de Início</span>.</li>
          <li>Toque em <b>Adicionar</b>. Abra pelo ícone da tela de início.</li>
        </ol>` : html`
        <ol class="steps">
          <li>No Chrome, toque no menu <b>⋮</b>.</li>
          <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
          <li>Ou baixe o APK da Perfumolandia (melhor: permite transmitir a tela).</li>
        </ol>`}
    <//>`;
}
