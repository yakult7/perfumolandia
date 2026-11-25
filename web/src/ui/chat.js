import { html, useState, useRef, useEffect, useLayoutEffect, useMemo, cx, timeAgo, fmtSize } from '../lib.js';
import { useS, S, setUI, set, setSettings } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import * as rtc from '../rtc.js';
import { md, isBigEmoji } from '../markdown.js';
import { sendMessage, loadMessages, markRead, openMenu, openModal, back, run, safe, toast, dmPartner, callDM, statusOf, groupName } from '../actions.js';
import { Avatar, GBtn, Spinner, Empty, STATUS_LABEL, GroupAvatar, Activity } from './common.js';
import { CallDock } from './call.js';
import { GifPicker, LinkMedia, isLinkMedia, Embeds } from './gifpicker.js';
import { reportShare } from '../gifs.js';
import { requestControl } from '../remote.js';
import { imageMenu } from './imagemenu.js';
import { openProfile } from './popover.js';
import { userMenu, nameOf, isIgnored, isBlocked } from './usermenu.js';
import { plateOf } from '../nameplates.js';
import { readableColor, effectiveMode } from '../theme.js';

export const QUICK = ['👍', '❤️', '😂', '🔥', '😮', '😢'];
export const EMOJIS = {
  'Rostos': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 🤖',
  'Gestos': '👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🫡 🫶',
  'Coisas': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💯 💢 💥 💫 💦 🔥 ✨ ⭐ 🌟 🎉 🎊 🎮 🕹️ 🎧 🎤 🏆 🥇 ⚽ 🏀 🎯 🎲 🍕 🍔 🍟 🌭 🍿 🍺 🍻 🥂 ☕ 🧃 💸 💰 💎 🌸 🌹 🧴 👑 🚀 ⚡ 🌈 ☀️ 🌙 ⏰ 📸 📞 💬 👀 🗿',
};

export function Chat({ cid, mobile }) {
  const box = useS((s) => s.messages[cid]);
  const dm = useS((s) => s.dms[cid]);
  const group = useS((s) => s.groups[cid]);
  const sv = useS((s) => (dm || group ? null : Object.values(s.servers).find((x) => x.channels.some((c) => c.id === cid))));
  const ch = sv?.channels.find((c) => c.id === cid);
  const callHere = useS((s) => s.call?.roomId === cid);
  const voiceHere = useS((s) => (s.voice[cid] || []).length);
  const expandedCall = useS((s) => !!s.ui.callExpanded);
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => { loadMessages(cid); markRead(cid); }, [cid]);
  // ao reconectar o app recarrega tudo e esvazia as mensagens: a conversa aberta pede de novo
  // (antes ficava um "carregando" girando para sempre, redesenhando a tela e gastando CPU)
  const hasBox = useS((s) => !!s.messages[cid]);
  useEffect(() => { if (!hasBox) loadMessages(cid); }, [hasBox, cid]);
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && markRead(cid);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [cid]);

  const other = dm ? dmPartner(dm) : null;
  const otherPc = useS((s) => !!(other && s.pcs[other.id]));
  const showProfile = useS((s) => s.settings.dmProfile !== false);
  const title = dm ? other.displayName : group ? groupName(group) : ch?.name;
  const direct = !!(dm || group);
  const startCall = async (video) => {
    if (!direct) return;
    await callDM(cid);
    if (video && !rtc.hasCam()) rtc.toggleCamera();
    setUI({ callOpen: true });
  };
  const groupMenu = (e) => openMenu(e, [
    { label: 'Adicionar amigos', icon: html`<${Icon} n="userPlus" s=${16} />`, onClick: () => openModal('addToGroup', { id: cid }) },
    { label: 'Ajustes do grupo', icon: html`<${Icon} n="settings" s=${16} />`, onClick: () => openModal('groupSettings', { id: cid }) },
  ], { anchor: true });

  return html`
    <div class=${cx('chat', callHere && expandedCall && !mobile && 'call-full')}>
      <header class="top lg chat-top">
        ${mobile ? html`<button class="gbtn icon-only sm plain" aria-label="Voltar" onClick=${() => history.back()}><${Icon} n="back" s=${19} /></button>` : null}
        <div class=${cx('top-title', direct && 'click')} onClick=${(e) => (dm ? openProfile(other.id, e) : group && openModal('groupSettings', { id: cid }))} onContextMenu=${(e) => dm && userMenu(e, other.id, { dmId: cid })}>
          ${dm ? html`<${Avatar} id=${other.id} size=${26} status />` : group ? html`<${GroupAvatar} g=${group} size=${26} />` : html`<${Icon} n="hash" s=${17} />`}
          <b>${title}</b>
          ${dm ? html`<${DmStatus} id=${other.id} />` : group ? html`<small class="muted">${group.members.length} membros</small>` : null}
        </div>
        <div class="top-actions">
          ${direct ? html`
            ${voiceHere && !callHere ? html`<button class="gbtn sm ok" onClick=${() => startCall(false)}><${Icon} n="phone" s=${14} /> Entrar</button>` : null}
            <${GBtn} icon="phone" title=${group ? 'Ligar para o grupo' : 'Ligar'} class="icon-only sm" onClick=${() => startCall(false)} size=${15} />
            <${GBtn} icon="video" title="Chamada de vídeo" class="icon-only sm" onClick=${() => startCall(true)} size=${15} />
            ${dm && otherPc ? html`<${GBtn} icon="remote" title="Controlar o PC (estilo AnyDesk; ele precisa permitir)" class="icon-only sm" onClick=${() => requestControl(other.id)} size=${15} />` : null}` : null}
          ${group ? html`<${GBtn} icon="more" title="Grupo" class="icon-only sm" onClick=${groupMenu} size=${15} />` : null}
          ${sv && !mobile ? html`<${GBtn} icon="users" title="Membros" class="icon-only sm" onClick=${() => setUI({ showMembers: !S.ui.showMembers })} size=${15} />` : null}
          ${dm && !mobile ? html`<${GBtn} icon="user" title=${showProfile ? 'Esconder perfil' : 'Mostrar perfil'} class=${cx('icon-only sm', showProfile && 'on')} onClick=${() => setSettings({ dmProfile: !showProfile })} size=${15} />` : null}
          ${sv ? html`<${GBtn} icon="userPlus" title="Convidar" class="icon-only sm" onClick=${() => openModal('invite', { id: sv.id })} size=${15} />` : null}
        </div>
      </header>
      ${callHere && !mobile ? html`<${CallDock} />` : null}
      <${MessageList} cid=${cid} box=${box} title=${title} dm=${direct} onReply=${setReply} editing=${editing} setEditing=${setEditing} />
      <${TypingLine} cid=${cid} />
      <${Composer} cid=${cid} placeholder=${dm ? `Conversar com @${other.username}` : group ? `Conversar em ${title}` : `Conversar em #${ch?.name || ''}`}
        reply=${reply} clearReply=${() => setReply(null)} members=${dm ? dm.members : group ? group.members : sv?.members || []}
        onEditLast=${() => { const mine = [...(box?.list || [])].reverse().find((m) => m.authorId === S.uid && !m.pending); if (mine) setEditing(mine.id); }} />
    </div>`;
}

const DmStatus = ({ id }) => {
  const st = useS((s) => statusOf(s, id));
  return html`<small class="muted"><${Activity} id=${id} fallback=${STATUS_LABEL[st]} /></small>`;
};

function MessageList({ cid, box, title, dm, onReply, editing, setEditing }) {
  const ref = useRef();
  const stick = useRef(true);
  const prevH = useRef(0);
  const list = box?.list || [];
  const usernames = useS((s) => s.users);
  const names = useMemo(() => new Set(Object.values(usernames).map((u) => u.username)), [usernames]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (prevH.current && el.scrollHeight > prevH.current && el.scrollTop < 40) el.scrollTop += el.scrollHeight - prevH.current;
    prevH.current = el.scrollHeight;
  }, [list.length, list[0]?.id]);
  useEffect(() => {
    // imagens carregando mudam a altura: mantém no fim
    const el = ref.current;
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el.firstElementChild || el);
    return () => ro.disconnect();
  }, [cid]);

  const onScroll = () => {
    const el = ref.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 200 && box?.hasMore && !box.loading) { prevH.current = el.scrollHeight; loadMessages(cid, true); }
  };

  const rows = [];
  let prev = null;
  for (const m of list) {
    const d = new Date(m.createdAt);
    if (!prev || new Date(prev.createdAt).toDateString() !== d.toDateString()) {
      rows.push(html`<div class="day" key=${'d' + m.id}><span>${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>`);
    }
    const grouped = prev && prev.type !== 'call' && m.type !== 'call' && prev.authorId === m.authorId && m.createdAt - prev.createdAt < 7 * 60000 && !m.replyTo && new Date(prev.createdAt).toDateString() === d.toDateString();
    rows.push(html`<${Message} key=${m.id} m=${m} grouped=${grouped} names=${names} onReply=${onReply} editing=${editing === m.id} setEditing=${setEditing} />`);
    prev = m;
  }

  return html`
    <div class="msgs" ref=${ref} onScroll=${onScroll}>
      <div class="msgs-inner">
        ${box?.loading && list.length ? html`<div class="loading-more"><${Spinner} /></div>` : null}
        ${box && !box.hasMore ? html`
          <div class="chat-start">
            <div class="chat-start-ic"><${Icon} n=${dm ? 'message' : 'hash'} s=${28} /></div>
            <h2>${dm ? title : 'Bem-vindo a #' + title}</h2>
            <p class="muted">${dm ? 'Este é o começo da conversa de vocês.' : 'Este é o começo do canal.'}</p>
          </div>` : null}
        ${!box ? html`<div class="loading-more"><${Spinner} s=${28} /></div>` : rows}
      </div>
    </div>`;
}

const dur = (ms) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/** linha de registro de chamada (iniciada, perdida, recusada, duração) */
function CallLog({ m }) {
  const caller = useS((s) => s.users[m.authorId]);
  const live = useS((s) => (s.voice[m.channelId] || []).length > 0);
  const inIt = useS((s) => s.call?.roomId === m.channelId);
  const meta = m.meta || {};
  const st = meta.status || 'ringing';
  const mine = m.authorId === S.uid;
  const name = mine ? 'Você' : caller?.displayName || 'Alguém';
  let icon = 'phone', tone = 'ok', text;
  if (st === 'missed') { tone = 'bad'; text = mine ? 'Ninguém atendeu sua chamada' : `Chamada perdida de ${name}`; }
  else if (st === 'declined') { tone = 'bad'; text = mine ? `${S.users[meta.declinedBy]?.displayName || 'A pessoa'} recusou sua chamada` : 'Você recusou a chamada'; }
  else if (st === 'ended') text = `${name} ${mine ? 'iniciou' : 'iniciou'} uma chamada que durou ${dur((meta.endedAt || 0) - (meta.answeredAt || meta.startedAt || m.createdAt))}`;
  else if (st === 'answered') text = `${name} iniciou uma chamada · em andamento`;
  else text = mine ? 'Você está chamando…' : `${name} está ligando…`;
  if (tone === 'bad') icon = 'hangup';
  const canJoin = (st === 'ringing' || st === 'answered') && live && !inIt;
  return html`
    <div class=${cx('call-log', tone)}>
      <span class="call-log-ic"><${Icon} n=${icon} s=${14} /></span>
      <span class="call-log-text">${text}</span>
      <time>${timeAgo(m.createdAt)}</time>
      ${canJoin ? html`<button class="gbtn sm ok" onClick=${() => { rtc.join(m.channelId); setUI({ callOpen: true }); }}><${Icon} n="phone" s=${13} /> Entrar</button>` : null}
    </div>`;
}

function Message({ m, grouped, names, onReply, editing, setEditing }) {
  if (m.type === 'call') return html`<${CallLog} m=${m} />`;
  if (isIgnored(m.authorId)) return html`<${IgnoredMessage} m=${m} grouped=${grouped} names=${names} onReply=${onReply} editing=${editing} setEditing=${setEditing} />`;
  return html`<${TextMessage} m=${m} grouped=${grouped} names=${names} onReply=${onReply} editing=${editing} setEditing=${setEditing} />`;
}

function IgnoredMessage(props) {
  const [show, setShow] = useState(false);
  useS((s) => s.settings.ignored?.[props.m.authorId] || s.settings.blocked?.[props.m.authorId]);
  if (show) return html`<${TextMessage} ...${props} />`;
  return html`<div class="msg ignored"><button class="ignored-pill" onClick=${() => setShow(true)}><${Icon} n="eyeOff" s=${13} /> Mensagem de usuário ${isBlocked(props.m.authorId) ? 'bloqueado' : 'ignorado'} · mostrar</button></div>`;
}

function TextMessage({ m, grouped, names, onReply, editing, setEditing }) {
  const author = useS((s) => s.users[m.authorId]);
  const theme = useS((s) => effectiveMode(s.settings)); // recalcula a cor do nome ao trocar de tema
  const replied = useS((s) => (m.replyTo ? s.messages[m.channelId]?.list.find((x) => x.id === m.replyTo) : null));
  const repliedAuthor = useS((s) => (replied ? s.users[replied.authorId] : null));
  const mine = m.authorId === S.uid;
  const sv = Object.values(S.servers).find((x) => x.channels.some((c) => c.id === m.channelId));
  const canDelete = mine || sv?.ownerId === S.uid;
  const mention = m.content.includes('@' + S.me.username) || m.content.includes('@todos');
  const press = useRef(null);

  const menu = (e) => openMenu(e, [
    { label: 'Reagir…', icon: html`<${Icon} n="smile" s=${16} />`, onClick: () => openModal('react', { m }) },
    { label: 'Responder', icon: html`<${Icon} n="reply" s=${16} />`, onClick: () => onReply(m) },
    { label: 'Copiar texto', icon: html`<${Icon} n="copy" s=${16} />`, onClick: () => navigator.clipboard?.writeText(m.content).then(() => toast('Copiado.')) },
    ...(mine ? [{ label: 'Editar', icon: html`<${Icon} n="edit" s=${16} />`, onClick: () => setEditing(m.id) }] : []),
    ...(canDelete ? [{ sep: true }, { label: 'Apagar mensagem', danger: true, icon: html`<${Icon} n="trash" s=${16} />`, onClick: () => safe(api.deleteMessage(m.id)) }] : []),
  ]);

  // toque longo no celular abre o menu
  const onTouchStart = (e) => {
    const t = e.touches[0];
    press.current = setTimeout(() => { navigator.vibrate?.(10); menu({ clientX: t.clientX, clientY: t.clientY, preventDefault() {}, stopPropagation() {} }); }, 450);
  };
  const cancelPress = () => clearTimeout(press.current);

  return html`
    <div class=${cx('msg', grouped && 'grouped', m.pending && 'pending', m.failed && 'failed', mention && 'mentioned')}
      onContextMenu=${menu} onTouchStart=${onTouchStart} onTouchEnd=${cancelPress} onTouchMove=${cancelPress}>
      ${m.replyTo ? html`
        <div class="reply-ref"><${Icon} n="reply" s=${14} />
          ${replied ? html`<b>${repliedAuthor?.displayName}</b><span>${replied.content.slice(0, 90) || 'Anexo'}</span>` : html`<span class="muted">Mensagem original não carregada</span>`}
        </div>` : null}
      <div class="msg-row">
        ${grouped ? html`<span class="msg-time-side">${new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>`
          : html`<button class="msg-av" onClick=${(e) => openProfile(m.authorId, e)} onContextMenu=${(e) => userMenu(e, m.authorId)}><${Avatar} id=${m.authorId} size=${36} /></button>`}
        <div class="msg-body">
          ${grouped ? null : html`
            <div class="msg-head">
              <b class=${cx('msg-author', theme === 'dark' && plateOf(author) && 'np-name ' + plateOf(author))} style=${`color:${readableColor(author?.color, theme)}`} onClick=${(e) => openProfile(m.authorId, e)} onContextMenu=${(e) => userMenu(e, m.authorId)}>${nameOf(m.authorId, author?.displayName)}</b>
              <time>${timeAgo(m.createdAt)}</time>
            </div>`}
          ${editing ? html`<${EditBox} m=${m} done=${() => setEditing(null)} />`
            : m.content && isLinkMedia(m.content) ? html`<${LinkMedia} text=${m.content} />`
            : m.content ? html`<div class=${cx('msg-text', isBigEmoji(m.content) && 'big-emoji')} dangerouslySetInnerHTML=${{ __html: md(m.content, names) }}></div><${Embeds} text=${m.content} />` : null}
          ${m.editedAt && !editing ? html`<small class="edited">(editada)</small>` : null}
          ${m.attachments?.length ? html`<div class="atts">${m.attachments.map((a, i) => html`<${Attachment} key=${i} a=${a} />`)}</div>` : null}
          ${Object.keys(m.reactions || {}).length ? html`
            <div class="reacts">
              ${Object.entries(m.reactions).map(([e, ids]) => html`
                <button key=${e} class=${cx('react', ids.includes(S.uid) && 'mine')} title=${ids.map((id) => S.users[id]?.displayName).join(', ')}
                  onClick=${() => safe(api.toggleReaction(m.id, e))}>${e} <b>${ids.length}</b></button>`)}
              <button class="react add" title="Reagir" onClick=${() => openModal('react', { m })}><${Icon} n="smile" s=${15} /></button>
            </div>` : null}
          ${m.failed ? html`<small class="err-text">Não enviada. Verifique a conexão.</small>` : null}
        </div>
      </div>
      ${!m.pending && !editing ? html`
        <div class="msg-tools lg">
          ${QUICK.slice(0, 3).map((q) => html`<button key=${q} onClick=${() => safe(api.toggleReaction(m.id, q))}>${q}</button>`)}
          <button title="Reagir" onClick=${() => openModal('react', { m })}><${Icon} n="smile" s=${15} /></button>
          <button title="Responder" onClick=${() => onReply(m)}><${Icon} n="reply" s=${15} /></button>
          ${mine ? html`<button title="Editar" onClick=${() => setEditing(m.id)}><${Icon} n="edit" s=${15} /></button>` : null}
          <button title="Mais" onClick=${menu}><${Icon} n="more" s=${15} /></button>
        </div>` : null}
    </div>`;
}

function EditBox({ m, done }) {
  const [v, setV] = useState(m.content);
  const ref = useRef();
  useEffect(() => { const t = ref.current; t.focus(); t.setSelectionRange(v.length, v.length); autosize(t); }, []);
  const save = () => {
    if (v.trim() === m.content) return done();
    run(api.editMessage(m.id, v.trim())).then(done).catch(() => {});
  };
  return html`
    <div class="editbox">
      <textarea ref=${ref} value=${v} onInput=${(e) => { setV(e.target.value); autosize(e.target); }}
        onKeyDown=${(e) => { if (e.key === 'Escape') done(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }}></textarea>
      <small class="muted">Esc para cancelar · Enter para salvar</small>
    </div>`;
}

function Attachment({ a }) {
  const t = a.type || '';
  if (t.startsWith('image/')) return html`<button class="att-img" onClick=${() => openModal('image', { a })} onContextMenu=${(e) => imageMenu(e, a.url, a.name)}><img src=${a.url} alt=${a.name} loading="lazy" /></button>`;
  if (t.startsWith('video/')) return html`<video class="att-video" src=${a.url} controls playsinline preload="metadata"></video>`;
  if (t.startsWith('audio/')) return html`<audio class="att-audio" src=${a.url} controls preload="metadata"></audio>`;
  return html`
    <a class="att-file" href=${a.url} target="_blank" rel="noopener" download=${a.name}>
      <${Icon} n="file" s=${28} /><span><b>${a.name}</b><small>${fmtSize(a.size)}</small></span><${Icon} n="download" s=${18} />
    </a>`;
}

function TypingLine({ cid }) {
  const typing = useS((s) => s.typing[cid]);
  const ids = Object.keys(typing || {}).filter((id) => id !== S.uid);
  if (!ids.length) return html`<div class="typing"></div>`;
  const names = ids.map((id) => S.users[id]?.displayName || 'Alguém');
  const text = names.length === 1 ? `${names[0]} está digitando` : names.length === 2 ? `${names[0]} e ${names[1]} estão digitando` : 'Várias pessoas estão digitando';
  return html`<div class="typing on"><i class="dots"><b></b><b></b><b></b></i>${text}…</div>`;
}

const autosize = (t) => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; };

function Composer({ cid, placeholder, reply, clearReply, members, onEditLast }) {
  const [text, setText] = useState(() => S.ui.drafts?.[cid] || '');
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [emoji, setEmoji] = useState(false);
  const [gif, setGif] = useState(false);
  const [mention, setMention] = useState(null);
  const ta = useRef();
  const touch = matchMedia('(pointer: coarse)').matches;

  useEffect(() => { if (!touch) ta.current?.focus(); }, [cid, reply]);
  useEffect(() => () => set((s) => { s.ui = { ...s.ui, drafts: { ...s.ui.drafts, [cid]: ta.current?.value || '' } }; }), [cid]);

  const addFiles = (fl) => {
    const arr = [...fl].slice(0, 10);
    if (arr.some((f) => f.size > 50 * 1024 * 1024)) toast('Máximo de 50 MB por arquivo.', 'err');
    setFiles((cur) => [...cur, ...arr.filter((f) => f.size <= 50 * 1024 * 1024).map((f) => ({ f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }))].slice(0, 10));
  };

  const send = async () => {
    const content = text.trim();
    if (!content && !files.length) return;
    let atts = [];
    if (files.length) {
      setProgress(0);
      try { atts = await api.uploadFiles(files.map((x) => x.f), setProgress); }
      catch (e) { toast(e.message, 'err'); setProgress(null); return; }
      setProgress(null);
      files.forEach((x) => x.url && URL.revokeObjectURL(x.url));
      setFiles([]);
    }
    setText('');
    if (ta.current) { ta.current.value = ''; autosize(ta.current); }
    clearReply();
    setEmoji(false);
    sendMessage(cid, content, atts, reply?.id || null);
  };

  const onInput = (e) => {
    setText(e.target.value);
    autosize(e.target);
    if (e.target.value) api.sendTyping(cid);
    const before = e.target.value.slice(0, e.target.selectionStart);
    const mm = before.match(/(^|\s)@([a-z0-9_.]{0,20})$/i);
    setMention(mm ? { q: mm[2].toLowerCase(), i: 0 } : null);
  };
  const mentionList = mention ? [
    ...members.filter((id) => id !== S.uid).map((id) => S.users[id]).filter(Boolean)
      .filter((u) => u.username.includes(mention.q) || u.displayName.toLowerCase().includes(mention.q)),
    ...('todos'.startsWith(mention.q) && members.length > 2 ? [{ username: 'todos', displayName: 'Todo mundo', id: 'all' }] : []),
  ].slice(0, 6) : [];
  const applyMention = (u) => {
    const t = ta.current;
    const before = t.value.slice(0, t.selectionStart).replace(/@([a-z0-9_.]{0,20})$/i, '@' + u.username + ' ');
    const v = before + t.value.slice(t.selectionStart);
    setText(v); t.value = v; t.focus(); t.setSelectionRange(before.length, before.length);
    setMention(null);
  };

  const onKey = (e) => {
    if (mentionList.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setMention({ ...mention, i: (mention.i + (e.key === 'ArrowDown' ? 1 : -1) + mentionList.length) % mentionList.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mentionList[mention.i]); return; }
      if (e.key === 'Escape') { setMention(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !touch) { e.preventDefault(); send(); }
    if (e.key === 'ArrowUp' && !text) { e.preventDefault(); onEditLast(); }
    if (e.key === 'Escape' && reply) clearReply();
  };

  return html`
    <div class="composer-wrap"
      onDragOver=${(e) => { e.preventDefault(); }}
      onDrop=${(e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      ${mentionList.length ? html`
        <div class="mention-pop lg pop">
          ${mentionList.map((u, i) => html`
            <button key=${u.username} class=${cx('mention-item', i === mention.i && 'on')} onPointerDown=${(e) => { e.preventDefault(); applyMention(u); }}>
              ${u.id !== 'all' ? html`<${Avatar} id=${u.id} size=${26} />` : html`<${Icon} n="users" s=${20} />`}<b>${u.displayName}</b><small>@${u.username}</small>
            </button>`)}
        </div>` : null}
      ${gif ? html`<${GifPicker} onClose=${() => setGif(false)} onPick=${(g) => { setGif(false); reportShare(g.slug); sendMessage(cid, g.send.url, [], reply?.id || null); clearReply(); }} />` : null}
      ${emoji ? html`<${EmojiPicker} onPick=${(em) => { const t = ta.current; const p = t.selectionStart ?? text.length; const v = text.slice(0, p) + em + text.slice(p); setText(v); t.value = v; t.focus(); }} onClose=${() => setEmoji(false)} />` : null}
      ${reply ? html`
        <div class="reply-bar lg">
          <span>Respondendo a <b>${S.users[reply.authorId]?.displayName}</b></span>
          <button class="mini-btn" onClick=${clearReply} aria-label="Cancelar resposta"><${Icon} n="x" s=${16} /></button>
        </div>` : null}
      ${files.length ? html`
        <div class="file-tray">
          ${files.map((x, i) => html`
            <div class="file-chip" key=${i}>
              ${x.url ? html`<img src=${x.url} alt="" />` : html`<${Icon} n="file" s=${26} />`}
              <small>${x.f.name}</small>
              <button class="mini-btn" onClick=${() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remover"><${Icon} n="x" s=${14} /></button>
            </div>`)}
          ${progress != null ? html`<div class="upload-bar"><i style=${`width:${Math.round(progress * 100)}%`}></i></div>` : null}
        </div>` : null}
      <div class="composer lg">
        <label class="gbtn icon-only sm" title="Enviar arquivo">
          <${Icon} n="plus" s=${17} />
          <input type="file" multiple hidden onChange=${(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <textarea ref=${ta} rows="1" value=${text} placeholder=${placeholder} onInput=${onInput} onKeyDown=${onKey}
          onPaste=${(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
          enterkeyhint="send"></textarea>
        <button class=${cx('gbtn sm gif-btn', gif && 'on')} title="GIFs" onClick=${() => { setGif(!gif); setEmoji(false); }}>GIF</button>
        <button class=${cx('gbtn icon-only sm', emoji && 'on')} title="Emoji" onClick=${() => { setEmoji(!emoji); setGif(false); }}><${Icon} n="smile" s=${17} /></button>
        <button class="gbtn icon-only sm primary send" title="Enviar" disabled=${(!text.trim() && !files.length) || progress != null} onClick=${send}><${Icon} n="send" s=${15} /></button>
      </div>
    </div>`;
}

export function EmojiPicker({ onPick, onClose, inline }) {
  const ref = useRef();
  useEffect(() => {
    if (inline) return;
    const f = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest('.composer')) onClose(); };
    addEventListener('pointerdown', f, true);
    return () => removeEventListener('pointerdown', f, true);
  }, []);
  return html`
    <div ref=${ref} class=${cx('emoji-pop lg', inline ? 'inline' : 'pop')}>
      ${Object.entries(EMOJIS).map(([g, list]) => html`
        <div class="emoji-group" key=${g}><small>${g}</small>
          <div class="emoji-grid">${list.split(' ').map((e) => html`<button key=${e} onClick=${() => onPick(e)}>${e}</button>`)}</div>
        </div>`)}
    </div>`;
}
