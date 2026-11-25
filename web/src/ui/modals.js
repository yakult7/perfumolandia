import { html, useState, useEffect, cx, isIOS, isStandalone } from '../lib.js';
import { useS, S, persist } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import { inviteLink } from '../config.js';
import { requestControl } from '../remote.js';
import { inviteToServer } from './usermenu.js';
import { imageMenu, copyImage, saveImage } from './imagemenu.js';
import { closeModal, run, safe, go, toast, openDM, acceptCall, declineCall, callDM, statusOf, groupName, openModal } from '../actions.js';
import { Modal, Field, Avatar, GBtn, pickFile, shrinkImage, STATUS_LABEL, GroupAvatar } from './common.js';
import { ProfileCard } from './profile.js';
import { ScreenShareModal, VolumeModal } from './call.js';
import { Settings } from './settings.js';
import { EmojiPicker, QUICK } from './chat.js';
import { isNativeApp } from '../native.js';
import { pushSupported, pushPermission, enablePush } from '../push.js';

export function Modals() {
  const m = useS((s) => s.ui.modal);
  if (!m) return null;
  const C = {
    addServer: AddServer, prompt: Prompt, inviteTo: InviteTo, createChannel: CreateChannel, renameChannel: RenameChannel, invite: Invite,
    serverSettings: ServerSettings, confirm: Confirm, profile: Profile, image: ImageView, react: React,
    screenShare: ScreenShareModal, volume: VolumeModal, settings: Settings, install: InstallHelp,
    createGroup: CreateGroup, groupSettings: GroupSettings, addToGroup: AddToGroup,
  }[m.name];
  return C ? html`<${C} key=${m.name + (m.tab || '')} ...${m} />` : null;
}

// ---------- grupos ----------
function FriendPicker({ selected, setSelected, exclude = [] }) {
  const [q, setQ] = useState('');
  const rels = useS((s) => s.relations);
  const friends = Object.values(rels).filter((r) => r.status === 'accepted')
    .map((r) => (r.from === S.uid ? r.to : r.from))
    .filter((id) => !exclude.includes(id) && S.users[id])
    .filter((id) => !q || S.users[id].displayName.toLowerCase().includes(q.toLowerCase()) || S.users[id].username.includes(q.toLowerCase()))
    .sort((a, b) => S.users[a].displayName.localeCompare(S.users[b].displayName));
  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return html`
    <input placeholder="Buscar amigos" value=${q} onInput=${(e) => setQ(e.target.value)} />
    <div class="pick-list">
      ${friends.length ? friends.map((id) => html`
        <button key=${id} type="button" class=${cx('pick-row', selected.includes(id) && 'on')} onClick=${() => toggle(id)}>
          <${Avatar} id=${id} size=${30} status />
          <span class="grow"><b>${S.users[id].displayName}</b> <small class="muted">@${S.users[id].username}</small></span>
          <i class="tick">${selected.includes(id) ? html`<${Icon} n="check" s=${13} />` : null}</i>
        </button>`) : html`<p class="muted small pad">Nenhum amigo disponível. Adicione amigos primeiro.</p>`}
    </div>`;
}

function CreateGroup({ preselect = [] }) {
  const [sel, setSel] = useState(preselect);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try { const id = await run(api.createGroup(name, sel)); closeModal(); go(null, id); } catch {} finally { setBusy(false); }
  };
  return html`
    <${Modal} title="Novo grupo">
      <p class="muted">Converse e ligue com várias pessoas ao mesmo tempo, sem precisar de servidor.</p>
      <${Field} label="Nome do grupo (opcional)"><input value=${name} maxlength="48" placeholder="Ex.: Squad do fim de semana" onInput=${(e) => setName(e.target.value)} /><//>
      <${FriendPicker} selected=${sel} setSelected=${setSel} />
      <button class="gbtn primary wide" disabled=${busy || !sel.length} onClick=${create}>Criar grupo${sel.length ? ` com ${sel.length + 1} pessoas` : ''}</button>
    <//>`;
}

function AddToGroup({ id }) {
  const g = useS((s) => s.groups[id]);
  const [sel, setSel] = useState([]);
  if (!g) return null;
  return html`
    <${Modal} title="Adicionar ao grupo">
      <${FriendPicker} selected=${sel} setSelected=${setSel} exclude=${g.members} />
      <button class="gbtn primary wide" disabled=${!sel.length} onClick=${() => run(api.addGroupMembers(id, sel), 'Adicionado!').then(closeModal).catch(() => {})}>Adicionar</button>
    <//>`;
}

function GroupSettings({ id }) {
  const g = useS((s) => s.groups[id]);
  const [name, setName] = useState(g?.name || '');
  if (!g) return null;
  const owner = g.ownerId === S.uid;
  const setIcon = async () => {
    const f = await pickFile();
    if (!f) return;
    const [a] = await run(api.uploadFiles([await shrinkImage(f, 256)]));
    safe(api.updateGroup(id, { icon: a.url }), 'Ícone atualizado.');
  };
  return html`
    <${Modal} title="Ajustes do grupo">
      <div class="row center">
        <button class="icon-pick" onClick=${setIcon}>${g.icon ? html`<img src=${g.icon} alt="" />` : html`<${Icon} n="image" s=${22} /><small>Ícone</small>`}</button>
        <div class="grow stack">
          <${Field} label="Nome"><input value=${name} maxlength="48" placeholder=${groupName({ ...g, name: '' })} onInput=${(e) => setName(e.target.value)} /><//>
          <button class="gbtn primary sm" disabled=${name === g.name} onClick=${() => safe(api.updateGroup(id, { name }), 'Salvo.')}>Salvar nome</button>
        </div>
      </div>
      <div class="field"><span class="field-label">Membros (${g.members.length})</span>
        <div class="mem-list">
          ${g.members.map((uid) => html`
            <div class="mem-row" key=${uid}><${Avatar} id=${uid} size=${28} status /><span class="grow">${S.users[uid]?.displayName}${uid === g.ownerId ? html` <small class="muted">· criador</small>` : null}</span>
              ${owner && uid !== S.uid ? html`<button class="gbtn sm plain danger" onClick=${() => safe(api.kickFromGroup(id, uid), 'Removido.')}>Remover</button>` : null}
            </div>`)}
        </div>
        <button class="gbtn sm" onClick=${() => openModal('addToGroup', { id })}><${Icon} n="userPlus" s=${14} /> Adicionar amigos</button>
      </div>
      <button class="gbtn danger wide" onClick=${() => openModal('confirm', { title: 'Sair do grupo', text: 'Sair deste grupo? Você para de ver as mensagens.', cta: 'Sair', action: () => run(api.leaveGroup(id)).then(() => go(null)) })}>Sair do grupo</button>
    <//>`;
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
      <div class="seg lg small-seg">
        <button class=${mode === 'create' ? 'on' : ''} onClick=${() => setMode('create')}>Criar</button>
        <button class=${mode === 'join' ? 'on' : ''} onClick=${() => setMode('join')}>Tenho um convite</button>
      </div>
      ${mode === 'create' ? html`
        <button class="icon-pick" onClick=${async () => { const f = await pickFile(); if (f) setIcon(f); }}>
          ${icon ? html`<img src=${URL.createObjectURL(icon)} alt="" />` : html`<${Icon} n="image" s=${26} /><small>Ícone</small>`}
        </button>
        <${Field} label="Nome do servidor"><input value=${name} maxlength="48" onInput=${(e) => setName(e.target.value)} /><//>
        <button class="gbtn primary wide" disabled=${busy || !name.trim()} onClick=${create}>Criar</button>` : html`
        <${Field} label="Código ou link do convite" hint="Cole o link que recebeu ou digite o código (ex.: K7Q2XA)"><input value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="K7Q2XA ou o link do convite" /><//>
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
        <div class="seg lg small-seg">
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
  if (!sv) return null;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copiado!'));
  const link = inviteLink(sv.invite);
  const msg = `Entra no meu servidor "${sv.name}" na Perfumolandia! ${link} (ou use o código ${sv.invite})`;
  return html`
    <${Modal} title=${'Convidar para ' + sv.name}>
      <p class="muted">Mande o link: quem abrir entra direto (pelo app ou pelo navegador). Ou mande o código, que eles colocam em <b>+ → Tenho um convite</b>.</p>
      <${Field} label="Link do convite"><div class="code-box link"><b>${link}</b><button class="gbtn sm primary" onClick=${() => copy(link)}><${Icon} n="copy" s=${14} /> Copiar link</button></div><//>
      <${Field} label="Código"><div class="code-box"><b>${sv.invite}</b><button class="gbtn sm" onClick=${() => copy(sv.invite)}><${Icon} n="copy" s=${14} /> Copiar</button></div><//>
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
      <${Field} label="Convite atual"><div class="code-box"><b>${sv.invite}</b>
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

function Prompt({ title, label, value = '', placeholder = '', multiline, max = 100, onSave }) {
  const [v, setV] = useState(value);
  const save = (e) => { e?.preventDefault(); onSave(v); closeModal(); };
  return html`
    <${Modal} title=${title}>
      <form class="stack" onSubmit=${save}>
        <${Field} label=${label}>${multiline
          ? html`<textarea rows="4" maxlength=${max} value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.target.value)} autofocus></textarea>`
          : html`<input maxlength=${max} value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.target.value)} autofocus />`}<//>
        <div class="row end"><button type="button" class="gbtn" onClick=${closeModal}>Cancelar</button><button class="gbtn primary">Salvar</button></div>
      </form>
    <//>`;
}

function InviteTo({ uid }) {
  const servers = useS((s) => Object.values(s.servers));
  const u = S.users[uid];
  return html`
    <${Modal} title=${'Convidar ' + (u?.displayName || '') + ' para um servidor'}>
      <div class="stack" style="gap:6px">${servers.map((sv) => html`
        <button key=${sv.id} class="invite-row" onClick=${() => { closeModal(); inviteToServer(uid, sv.id).then(() => toast('Convite enviado na conversa.')); }}>
          <span class="rail-ic">${sv.icon ? html`<img src=${sv.icon} alt="" />` : html`<b>${sv.name.slice(0, 2)}</b>`}</span><b>${sv.name}</b><span class="muted small">Enviar convite</span>
        </button>`)}</div>
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
  const pc = useS((s) => !!s.pcs[id]);
  return html`
    <${Modal} title="Perfil" class="profile-modal">
      <${ProfileCard} u=${u} status=${st}>
        ${me ? html`<button class="gbtn sm primary" onClick=${() => openModal('settings', { tab: 'account' })}><${Icon} n="edit" s=${14} /> Editar perfil</button>`
          : rel?.status === 'accepted' ? html`
            <button class="gbtn sm primary" onClick=${() => { closeModal(); openDM(id); }}><${Icon} n="message" s=${14} /> Mensagem</button>
            <button class="gbtn sm" onClick=${async () => { closeModal(); const dm = await openDM(id); callDM(dm.id); }}><${Icon} n="phone" s=${14} /> Ligar</button>
            ${pc ? html`<button class="gbtn sm" title="Pede para controlar o PC dele (ele precisa permitir)" onClick=${() => { closeModal(); requestControl(id); }}><${Icon} n="remote" s=${14} /> Controlar PC</button>` : null}`
          : rel ? html`<span class="muted small">Pedido de amizade pendente</span>`
          : html`<button class="gbtn sm primary" onClick=${() => run(api.friendRequest(u.username), 'Pedido enviado!')}><${Icon} n="userPlus" s=${14} /> Adicionar amigo</button>`}
      <//>
    <//>`;
}

function ImageView({ a: a0, list, i: i0 = 0 }) {
  const [i, setI] = useState(i0);
  const a = list ? list[i] : a0;
  const n = list?.length || 1;
  const go = (d) => setI((x) => (x + d + n) % n);
  useEffect(() => {
    if (n < 2) return;
    const k = (e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [n]);
  return html`
    <div class="viewer" onClick=${closeModal}>
      ${String(a.type || '').startsWith('video/') ? html`<video src=${a.url} autoplay loop muted playsinline controls onClick=${(e) => e.stopPropagation()}></video>`
        : html`<img src=${a.url} alt=${a.name} onClick=${(e) => e.stopPropagation()} onContextMenu=${(e) => { e.stopPropagation(); imageMenu(e, a.url, a.name); }} />`}
      <div class="viewer-bar lg" onClick=${(e) => e.stopPropagation()}>
        <span>${a.name}${n > 1 ? ` · ${i + 1} de ${n}` : ''}</span>
        ${n > 1 ? html`<button class="gbtn icon-only sm" title="Anterior" onClick=${() => go(-1)}><${Icon} n="back" s=${16} /></button><button class="gbtn icon-only sm" title="Próxima" onClick=${() => go(1)}><${Icon} n="right" s=${16} /></button>` : null}
        <button class="gbtn sm" onClick=${() => copyImage(a.url)}><${Icon} n="copy" s=${16} /> Copiar</button>
        <button class="gbtn sm" onClick=${() => saveImage(a.url, a.name)}><${Icon} n="download" s=${16} /> Salvar</button>
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
  const g = useS((s) => (inc ? s.groups[inc.dmId] : null));
  if (!inc) return null;
  return html`
    <div class="incoming lg pop" role="alertdialog" aria-label="Chamada recebida">
      <div class="inc-av">${g ? html`<${GroupAvatar} g=${g} size=${76} />` : html`<${Avatar} id=${inc.from} size=${76} />`}</div>
      <b>${g ? groupName(g) : u?.displayName}</b>
      <small>${g ? `${u?.displayName} está chamando o grupo…` : 'está te ligando…'}</small>
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
  const inCall = useS((s) => !!s.call && s.ui.callOpen !== false);
  if (hidden || inCall || isStandalone || isNativeApp || window.perfumolandiaDesktop || !ready) return null;
  const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || isIOS;
  if (!isMobile) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem('rs.installHidden', '1'); } catch {} };
  return html`
    <div class="install lg pop">
      <${Icon} n="download" s=${20} />
      <span>Instale a Perfumolandia na tela de início para receber chamadas e usar em tela cheia.</span>
      <button class="gbtn sm primary" onClick=${() => (deferredPrompt ? deferredPrompt.prompt() : import('../actions.js').then((a) => a.openModal('install')))}>Instalar</button>
      <button class="mini-btn" onClick=${dismiss} aria-label="Fechar"><${Icon} n="x" s=${16} /></button>
    </div>`;
}

/** celular: pede para ligar os avisos de ligação (tocar com o app fechado) */
export function PushBanner() {
  const ready = useS((s) => s.ready);
  const ok = useS((s) => s.ui.pushOk);
  const inCall = useS((s) => !!s.call && s.ui.callOpen !== false);
  const [hidden, setHidden] = useState(() => { try { return Date.now() - Number(localStorage.getItem('rs.pushHidden') || 0) < 3 * 864e5; } catch { return false; } });
  const [busy, setBusy] = useState(false);
  if (!pushSupported || !ready || ok || hidden || inCall || pushPermission() === 'granted') return null;
  const denied = pushPermission() === 'denied';
  const dismiss = () => { setHidden(true); try { localStorage.setItem('rs.pushHidden', String(Date.now())); } catch {} };
  const on = async () => {
    setBusy(true);
    try {
      if (await enablePush()) toast('Pronto! Seu celular vai tocar quando te ligarem.');
      else toast('Permita as notificações para o celular tocar nas ligações.');
    } catch (e) {
      if (/firebase/i.test(e.message)) { toast('Os avisos de ligação chegam na próxima versão do app.'); setHidden(true); }
      else toast('Não deu para ativar: ' + e.message);
    } finally { setBusy(false); }
  };
  return html`
    <div class="install lg pop">
      <${Icon} n="phone" s=${20} />
      <span>${denied ? 'As notificações estão bloqueadas. Libere nos ajustes do celular para tocar quando te ligarem.'
        : 'Ative as notificações para o celular tocar quando te ligarem, mesmo com o app fechado.'}</span>
      ${denied ? null : html`<button class="gbtn sm primary" disabled=${busy} onClick=${on}>Ativar</button>`}
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
