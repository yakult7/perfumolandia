import { html, useState, useRef, useEffect, useLayoutEffect, useMemo, cx, timeAgo, fmtSize } from '../lib.js';
import { useS, S, setUI, set } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import * as rtc from '../rtc.js';
import { md, isBigEmoji } from '../markdown.js';
import { sendMessage, loadMessages, markRead, openMenu, openModal, back, run, safe, toast, dmPartner, callDM, statusOf } from '../actions.js';
import { Avatar, GBtn, Spinner, Empty, STATUS_LABEL } from './common.js';
import { CallStage } from './call.js';

export const QUICK = ['👍', '❤️', '😂', '🔥', '😮', '😢'];
export const EMOJIS = {
  'Rostos': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 🤖',
  'Gestos': '👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🫡 🫶',
  'Coisas': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💯 💢 💥 💫 💦 🔥 ✨ ⭐ 🌟 🎉 🎊 🎮 🕹️ 🎧 🎤 🏆 🥇 ⚽ 🏀 🎯 🎲 🍕 🍔 🍟 🌭 🍿 🍺 🍻 🥂 ☕ 🧃 💸 💰 💎 🌸 🌹 🧴 👑 🚀 ⚡ 🌈 ☀️ 🌙 ⏰ 📸 📞 💬 👀 🗿',
};

export function Chat({ cid, mobile }) {
  const box = useS((s) => s.messages[cid]);
  const dm = useS((s) => s.dms[cid]);
  const sv = useS((s) => (dm ? null : Object.values(s.servers).find((x) => x.channels.some((c) => c.id === cid))));
  const ch = sv?.channels.find((c) => c.id === cid);
  const callHere = useS((s) => s.call?.roomId === cid);
  const voiceHere = useS((s) => (s.voice[cid] || []).length);
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => { loadMessages(cid); markRead(cid); }, [cid]);
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && markRead(cid);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [cid]);

  const other = dm ? dmPartner(dm) : null;
  const title = dm ? other.displayName : ch?.name;
  const startCall = async (video) => {
    if (dm) { await callDM(cid); } else return;
    if (video && !rtc.hasCam()) rtc.toggleCamera();
    setUI({ callOpen: true });
  };

  return html`
    <div class="chat">
      <header class="top glass chat-top">
        ${mobile ? html`<button class="gbtn icon-only sm" aria-label="Voltar" onClick=${() => history.back()}><${Icon} n="back" s=${20} /></button>` : null}
        <div class="top-title" onClick=${() => dm && openModal('profile', { id: other.id })}>
          ${dm ? html`<${Avatar} id=${other.id} size=${30} status />` : html`<${Icon} n="hash" s=${20} />`}
          <b>${title}</b>
          ${dm ? html`<${DmStatus} id=${other.id} />` : null}
        </div>
        <div class="top-actions">
          ${dm ? html`
            ${voiceHere && !callHere ? html`<button class="gbtn sm ok" onClick=${() => startCall(false)}><${Icon} n="phone" s=${16} /> Entrar</button>` : null}
            <${GBtn} icon="phone" title="Ligar" class="icon-only sm" onClick=${() => startCall(false)} size=${18} />
            <${GBtn} icon="video" title="Chamada de vídeo" class="icon-only sm" onClick=${() => startCall(true)} size=${18} />` : null}
          ${sv && !mobile ? html`<${GBtn} icon="users" title="Membros" class="icon-only sm" onClick=${() => setUI({ showMembers: !S.ui.showMembers })} size=${18} />` : null}
          ${sv ? html`<${GBtn} icon="userPlus" title="Convidar" class="icon-only sm" onClick=${() => openModal('invite', { id: sv.id })} size=${18} />` : null}
        </div>
      </header>
      ${callHere && !mobile ? html`<div class="dm-stage"><${CallStage} compact /></div>` : null}
      <${MessageList} cid=${cid} box=${box} title=${title} dm=${!!dm} onReply=${setReply} editing=${editing} setEditing=${setEditing} />
      <${TypingLine} cid=${cid} />
      <${Composer} cid=${cid} placeholder=${dm ? `Conversar com @${other.username}` : `Conversar em #${ch?.name || ''}`}
        reply=${reply} clearReply=${() => setReply(null)} members=${dm ? dm.members : sv?.members || []}
        onEditLast=${() => { const mine = [...(box?.list || [])].reverse().find((m) => m.authorId === S.uid && !m.pending); if (mine) setEditing(mine.id); }} />
    </div>`;
}

const DmStatus = ({ id }) => {
  const st = useS((s) => statusOf(s, id));
  return html`<small class="muted">${STATUS_LABEL[st]}</small>`;
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
    const grouped = prev && prev.authorId === m.authorId && m.createdAt - prev.createdAt < 7 * 60000 && !m.replyTo && new Date(prev.createdAt).toDateString() === d.toDateString();
    rows.push(html`<${Message} key=${m.id} m=${m} grouped=${grouped} names=${names} onReply=${onReply} editing=${editing === m.id} setEditing=${setEditing} />`);
    prev = m;
  }

  return html`
    <div class="msgs" ref=${ref} onScroll=${onScroll}>
      <div class="msgs-inner">
        ${box?.loading && list.length ? html`<div class="loading-more"><${Spinner} /></div>` : null}
        ${box && !box.hasMore ? html`
          <div class="chat-start">
            <div class="chat-start-ic"><${Icon} n=${dm ? 'message' : 'hash'} s=${34} /></div>
            <h2>${dm ? title : 'Bem-vindo a #' + title}</h2>
            <p class="muted">${dm ? 'Este é o começo da conversa de vocês.' : 'Este é o começo do canal.'}</p>
          </div>` : null}
        ${!box ? html`<div class="loading-more"><${Spinner} s=${28} /></div>` : rows}
      </div>
    </div>`;
}

function Message({ m, grouped, names, onReply, editing, setEditing }) {
  const author = useS((s) => s.users[m.authorId]);
  const replied = useS((s) => (m.replyTo ? s.messages[m.channelId]?.list.find((x) => x.id === m.replyTo) : null));
  const repliedAuthor = useS((s) => (replied ? s.users[replied.authorId] : null));
  const mine = m.authorId === S.uid;
  const sv = Object.values(S.servers).find((x) => x.channels.some((c) => c.id === m.channelId));
  const canDelete = mine || sv?.ownerId === S.uid;
  const mention = m.content.includes('@' + S.me.username) || m.content.includes('@todos');
  const press = useRef(null);

  const menu = (e) => openMenu(e, [
    { label: 'Reagir…', icon: html`<${Icon} n="smile" s=${18} />`, onClick: () => openModal('react', { m }) },
    { label: 'Responder', icon: html`<${Icon} n="reply" s=${18} />`, onClick: () => onReply(m) },
    { label: 'Copiar texto', icon: html`<${Icon} n="copy" s=${18} />`, onClick: () => navigator.clipboard?.writeText(m.content).then(() => toast('Copiado.')) },
    ...(mine ? [{ label: 'Editar', icon: html`<${Icon} n="edit" s=${18} />`, onClick: () => setEditing(m.id) }] : []),
    ...(canDelete ? [{ sep: true }, { label: 'Apagar mensagem', danger: true, icon: html`<${Icon} n="trash" s=${18} />`, onClick: () => safe(api.deleteMessage(m.id)) }] : []),
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
          : html`<button class="msg-av" onClick=${() => openModal('profile', { id: m.authorId })}><${Avatar} id=${m.authorId} size=${40} /></button>`}
        <div class="msg-body">
          ${grouped ? null : html`
            <div class="msg-head">
              <b style=${`color:${author?.color}`} onClick=${() => openModal('profile', { id: m.authorId })}>${author?.displayName || 'Alguém'}</b>
              <time>${timeAgo(m.createdAt)}</time>
            </div>`}
          ${editing ? html`<${EditBox} m=${m} done=${() => setEditing(null)} />`
            : m.content ? html`<div class=${cx('msg-text', isBigEmoji(m.content) && 'big-emoji')} dangerouslySetInnerHTML=${{ __html: md(m.content, names) }}></div>` : null}
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
        <div class="msg-tools glass">
          ${QUICK.slice(0, 3).map((q) => html`<button key=${q} onClick=${() => safe(api.toggleReaction(m.id, q))}>${q}</button>`)}
          <button title="Reagir" onClick=${() => openModal('react', { m })}><${Icon} n="smile" s=${17} /></button>
          <button title="Responder" onClick=${() => onReply(m)}><${Icon} n="reply" s=${17} /></button>
          ${mine ? html`<button title="Editar" onClick=${() => setEditing(m.id)}><${Icon} n="edit" s=${17} /></button>` : null}
          <button title="Mais" onClick=${menu}><${Icon} n="more" s=${17} /></button>
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
  if (t.startsWith('image/')) return html`<button class="att-img" onClick=${() => openModal('image', { a })}><img src=${a.url} alt=${a.name} loading="lazy" /></button>`;
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
        <div class="mention-pop glass pop">
          ${mentionList.map((u, i) => html`
            <button key=${u.username} class=${cx('mention-item', i === mention.i && 'on')} onPointerDown=${(e) => { e.preventDefault(); applyMention(u); }}>
              ${u.id !== 'all' ? html`<${Avatar} id=${u.id} size=${26} />` : html`<${Icon} n="users" s=${20} />`}<b>${u.displayName}</b><small>@${u.username}</small>
            </button>`)}
        </div>` : null}
      ${emoji ? html`<${EmojiPicker} onPick=${(em) => { const t = ta.current; const p = t.selectionStart ?? text.length; const v = text.slice(0, p) + em + text.slice(p); setText(v); t.value = v; t.focus(); }} onClose=${() => setEmoji(false)} />` : null}
      ${reply ? html`
        <div class="reply-bar glass">
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
      <div class="composer glass">
        <label class="gbtn icon-only sm" title="Enviar arquivo">
          <${Icon} n="plus" s=${20} />
          <input type="file" multiple hidden onChange=${(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <textarea ref=${ta} rows="1" value=${text} placeholder=${placeholder} onInput=${onInput} onKeyDown=${onKey}
          onPaste=${(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
          enterkeyhint="send"></textarea>
        <button class=${cx('gbtn icon-only sm', emoji && 'on')} title="Emoji" onClick=${() => setEmoji(!emoji)}><${Icon} n="smile" s=${20} /></button>
        <button class="gbtn icon-only sm primary send" title="Enviar" disabled=${(!text.trim() && !files.length) || progress != null} onClick=${send}><${Icon} n="send" s=${18} /></button>
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
    <div ref=${ref} class=${cx('emoji-pop glass', !inline && 'pop')}>
      ${Object.entries(EMOJIS).map(([g, list]) => html`
        <div class="emoji-group" key=${g}><small>${g}</small>
          <div class="emoji-grid">${list.split(' ').map((e) => html`<button key=${e} onClick=${() => onPick(e)}>${e}</button>`)}</div>
        </div>`)}
    </div>`;
}
