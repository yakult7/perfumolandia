import { html, useState, useRef, useEffect, cx, canShareScreen, isElectron } from '../lib.js';
import { useS, S, setUI, setSettings } from '../store.js';
import { Icon } from '../icons.js';
import * as rtc from '../rtc.js';
import * as api from '../api.js';
import { openModal, closeModal, openMenu, roomName, serverOfRoom, cancelOutgoing, toast } from '../actions.js';
import { Avatar, GBtn, Video, Modal, useNow, fmtDur } from './common.js';
import { nativeScreen } from '../native.js';

/** monta quem está na chamada e o que cada um está mostrando */
function useCallModel() {
  const call = useS((s) => s.call);
  const parts = useS((s) => (s.call ? s.voice[s.call.roomId] || [] : []));
  if (!call) return null;
  const meP = { sid: api.clientId, userId: S.uid, me: true, state: { muted: call.muted, deafened: call.deafened, camera: rtc.hasCam(), screen: rtc.isSharing(), screenLabel: call.screenLabel } };
  const all = [meP, ...parts.filter((p) => p.sid !== api.clientId)];
  const media = [];
  for (const p of all) {
    if (p.state?.screen) media.push({ id: p.sid + ':screen', p, kind: 'screen' });
    if (p.state?.camera) media.push({ id: p.sid + ':cam', p, kind: 'cam' });
  }
  // destaque: o escolhido; senão a primeira tela compartilhada
  let focus = call.focus && media.find((t) => t.p.sid === call.focus.sid && t.kind === call.focus.kind);
  if (!focus && call.focus !== 'grid') focus = media.find((t) => t.kind === 'screen') || null;
  const noCam = all.filter((p) => !p.state?.camera);
  return { call, all, media, focus, noCam };
}

export function CallStage({ mobile, docked, collapsed, onCollapse, onExpand, expanded }) {
  const m = useCallModel();
  const outgoing = useS((s) => s.outgoing);
  const showStats = useS((s) => s.settings.showStats);
  useNow(1000);
  if (!m) return null;
  const { call, all, media, focus, noCam } = m;
  const sv = serverOfRoom(call.roomId);
  const others = focus ? media.filter((t) => t !== focus) : media;
  const cols = others.length <= 1 ? 1 : others.length <= 4 ? 2 : 3;

  return html`
    <div class=${cx('stage', mobile && 'mobile', docked && 'docked', collapsed && 'collapsed')}>
      <header class="stage-top">
        ${mobile ? html`<${GBtn} icon="down" title="Minimizar" class="icon-only sm" onClick=${() => setUI({ callOpen: false })} size=${16} />` : null}
        <div class="stage-title">
          <b>${sv ? '🔊 ' : ''}${roomName(call.roomId)}</b>
          <small>${call.connecting ? 'Conectando…' : outgoing ? 'Chamando…' : fmtDur(Date.now() - call.joinedAt)} · ${all.length} ${all.length === 1 ? 'pessoa' : 'pessoas'}</small>
        </div>
        ${collapsed ? html`<div class="row" style="gap:4px">${all.map((p) => html`<${Avatar} key=${p.sid} id=${p.userId} size=${24} ring />`)}</div>`
          : media.length && noCam.length ? html`<div class="people-strip">${noCam.map((p) => html`<${MiniPerson} key=${p.sid} p=${p} />`)}</div>` : null}
        ${!mobile && !collapsed ? html`<${GBtn} icon="activity" title="Estatísticas de vídeo" class=${cx('icon-only sm', showStats && 'on')} onClick=${() => setSettings({ showStats: !showStats })} size=${15} />` : null}
        ${focus && media.length > 1 && !collapsed ? html`<${GBtn} icon="menu" title="Ver todos em grade" class="icon-only sm" onClick=${() => rtc.setFocus('grid')} size=${15} />` : null}
        ${docked ? html`
          <${GBtn} icon=${expanded ? 'minimize' : 'maximize'} title=${expanded ? 'Voltar para a conversa' : 'Expandir chamada'} class="icon-only sm" onClick=${onExpand} size=${15} />
          <${GBtn} icon=${collapsed ? 'down' : 'back'} title=${collapsed ? 'Mostrar chamada' : 'Recolher'} class="icon-only sm" onClick=${onCollapse} size=${15} style=${collapsed ? '' : 'transform:rotate(90deg)'} />` : null}
      </header>
      ${collapsed ? null : html`
        <div class="stage-body">
          ${media.length === 0 ? html`
            <div class="people">${all.map((p) => html`<${Person} key=${p.sid} p=${p} size=${docked ? 64 : mobile ? 84 : 96} />`)}</div>`
          : focus ? html`
            <div class="stage-main"><${Tile} t=${focus} big /></div>
            ${others.length ? html`<div class="stage-side">${others.map((t) => html`<${Tile} key=${t.id} t=${t} />`)}</div>` : null}`
          : html`<div class="media-grid" style=${`--cols:${cols}`}>${media.map((t) => html`<${Tile} key=${t.id} t=${t} />`)}</div>`}
        </div>`}
      <${Controls} mobile=${mobile} />
    </div>`;
}

/** palco encaixado no topo de uma conversa/grupo: arrastar a borda de baixo muda a altura */
export function CallDock() {
  const h = useS((s) => s.settings.callHeight || 340);
  const expanded = useS((s) => !!s.ui.callExpanded);
  const collapsed = useS((s) => !!s.ui.callCollapsed);
  const ref = useRef();
  const drag = useRef(null);
  const onDown = (e) => {
    e.preventDefault();
    drag.current = { y: e.clientY, h: ref.current.offsetHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const max = ref.current.parentElement.clientHeight - 150;
    const nh = Math.max(180, Math.min(max, drag.current.h + e.clientY - drag.current.y));
    ref.current.style.height = nh + 'px';
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setSettings({ callHeight: ref.current.offsetHeight });
  };
  return html`
    <div ref=${ref} class=${cx('dock', collapsed && 'collapsed', expanded && 'expanded')} style=${expanded || collapsed ? '' : `height:${h}px`}>
      <${CallStage} docked collapsed=${collapsed} expanded=${expanded}
        onCollapse=${() => setUI({ callCollapsed: !collapsed, callExpanded: false })}
        onExpand=${() => setUI({ callExpanded: !expanded, callCollapsed: false })} />
      ${!expanded && !collapsed ? html`
        <div class="dock-handle" title="Arraste para aumentar ou diminuir" onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}
          onDblClick=${() => setSettings({ callHeight: 340 })}></div>` : null}
    </div>`;
}

function personMenu(e, p) {
  if (p.me) return;
  e.preventDefault();
  openMenu(e, [
    { label: 'Volume de ' + (S.users[p.userId]?.displayName || ''), icon: html`<${Icon} n="volume" s=${16} />`, onClick: () => openModal('volume', { uid: p.userId, kind: 'cam' }) },
    { label: 'Ver perfil', icon: html`<${Icon} n="user" s=${16} />`, onClick: () => openModal('profile', { id: p.userId }) },
  ]);
}

/** pessoa sem câmera: só o avatar redondo */
function Person({ p, size }) {
  const u = useS((s) => s.users[p.userId]);
  const speaking = useS((s) => !!s.speaking[p.userId]);
  const st = p.state || {};
  return html`
    <div class=${cx('person', speaking && 'speaking')} onContextMenu=${(e) => personMenu(e, p)}>
      <div class="av-wrap">
        <${Avatar} id=${p.userId} size=${size} ring />
        ${st.deafened || st.muted ? html`<span class="av-mute"><${Icon} n=${st.deafened ? 'headphonesOff' : 'micOff'} s=${13} /></span>` : null}
        ${st.screen ? html`<span class="av-live live">AO VIVO</span>` : null}
      </div>
      <b>${u?.displayName}${p.me ? ' (você)' : ''}</b>
    </div>`;
}
function MiniPerson({ p }) {
  const u = useS((s) => s.users[p.userId]);
  return html`<span title=${u?.displayName} onContextMenu=${(e) => personMenu(e, p)} style="position:relative;display:inline-flex">
    <${Avatar} id=${p.userId} size=${30} ring />
    ${p.state?.muted || p.state?.deafened ? html`<span class="av-mute" style="width:15px;height:15px;right:-3px;bottom:-3px;box-shadow:0 0 0 2px #0e0e14"><${Icon} n="micOff" s=${9} /></span>` : null}
  </span>`;
}

function Tile({ t, big }) {
  const { p, kind } = t;
  const u = useS((s) => s.users[p.userId]);
  const speaking = useS((s) => kind === 'cam' && !!s.speaking[p.userId]);
  const watching = useS((s) => !!s.call?.watching?.[p.sid]);
  useS((s) => s.call?.v);
  const showStats = useS((s) => s.settings.showStats);
  const ref = useRef();
  const st = p.state || {};
  const rawConn = !p.me ? rtc.connectionOf(p.sid) : 'connected';
  const conn = rawConn === 'new' ? 'connected' : rawConn;

  let stream = null;
  if (p.me) stream = kind === 'screen' ? rtc.localStream('screen') : rtc.localStream('cam');
  else if (kind === 'screen' ? watching : st.camera) stream = rtc.remoteStream(p.sid, kind);
  const hasVideo = !!stream?.getVideoTracks().length;

  const focusMe = () => rtc.setFocus(big ? 'grid' : { sid: p.sid, kind });
  const fullscreen = (e) => { e?.stopPropagation(); openTheater(p.sid, kind); };
  const pip = async (e) => {
    e?.stopPropagation();
    const vid = ref.current?.querySelector('video');
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await vid?.requestPictureInPicture();
    } catch { toast('Janela flutuante não suportada aqui.'); }
  };
  const menu = (e) => {
    e.stopPropagation();
    openMenu(e, [
      ...(hasVideo ? [
        { label: 'Tela cheia', icon: html`<${Icon} n="maximize" s=${16} />`, onClick: fullscreen },
        { label: 'Janela flutuante (PiP)', icon: html`<${Icon} n="pip" s=${16} />`, onClick: pip },
      ] : []),
      ...(!p.me ? [{ label: kind === 'screen' ? 'Volume da transmissão' : 'Volume de ' + (u?.displayName || ''), icon: html`<${Icon} n="volume" s=${16} />`, onClick: () => openModal('volume', { uid: p.userId, kind }) }] : []),
      ...(!p.me && kind === 'screen' && watching ? [{ label: 'Parar de assistir', icon: html`<${Icon} n="eye" s=${16} />`, onClick: () => rtc.watch(p.sid, false) }] : []),
      ...(p.me && kind === 'screen' ? [{ label: 'Parar transmissão', danger: true, icon: html`<${Icon} n="stop" s=${16} />`, onClick: () => (nativeScreen.active ? nativeScreen.stop() : rtc.stopScreen()) }] : []),
    ]);
  };

  return html`
    <div ref=${ref} class=${cx('tile', kind, big && 'big', speaking && 'speaking')} onDblClick=${hasVideo ? fullscreen : null} onClick=${focusMe} onContextMenu=${menu}>
      ${hasVideo ? html`<${Video} stream=${stream} mirror=${p.me && kind === 'cam' && S.call?.facing !== 'environment'} contain=${kind === 'screen'} />`
        : kind === 'screen' ? html`
          <div class="screen-card">
            <span class="live">AO VIVO</span>
            <b>${p.me ? 'Você está transmitindo' : `${u?.displayName} está transmitindo`}</b>
            ${st.screenLabel ? html`<small>${st.screenLabel}</small>` : null}
            ${!p.me ? html`<button class="gbtn primary" onClick=${(e) => { e.stopPropagation(); rtc.watch(p.sid, true); }}><${Icon} n="eye" s=${15} /> Assistir</button>` : null}
          </div>`
        : html`<${Avatar} id=${p.userId} size=${big ? 110 : 64} ring />`}
      ${showStats && hasVideo ? html`<${StatsBadge} sid=${p.sid} kind=${kind} />` : null}
      <div class="tile-foot">
        <span class="tile-name lg">
          ${kind === 'screen' ? html`<${Icon} n="screen" s=${12} />` : st.muted ? html`<${Icon} n="micOff" s=${12} />` : null}
          ${u?.displayName}${p.me ? ' (você)' : ''}
        </span>
        ${conn !== 'connected' && !p.me ? html`<span class="tile-name lg" style="color:var(--warn)">${conn === 'failed' ? 'Sem conexão' : 'Conectando…'}</span>` : null}
      </div>
      <div class="tile-tools" onClick=${(e) => e.stopPropagation()}>
        ${hasVideo ? html`<${GBtn} icon="maximize" title="Tela cheia" class="icon-only xs" onClick=${fullscreen} size=${13} />` : null}
        <${GBtn} icon="more" title="Opções" class="icon-only xs" onClick=${menu} size=${13} />
      </div>
    </div>`;
}

// ---------- modo cinema (tela cheia estável) ----------
export function openTheater(sid, kind) {
  setUI({ theater: { sid, kind } });
  const el = document.documentElement;
  if (!document.fullscreenElement) (el.requestFullscreen?.() || Promise.resolve()).catch(() => {});
}
export function closeTheater() {
  setUI({ theater: null });
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && S.ui.theater) setUI({ theater: null }); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui.theater) closeTheater(); });

export function Theater() {
  const th = useS((s) => s.ui.theater);
  const parts = useS((s) => (s.call ? s.voice[s.call.roomId] || [] : []));
  const watching = useS((s) => (th ? !!s.call?.watching?.[th.sid] : false));
  useS((s) => s.call?.v);
  const showStats = useS((s) => s.settings.showStats);
  const ref = useRef();
  if (!th || !S.call) return null;
  const me = th.sid === api.clientId;
  const p = me ? { sid: api.clientId, userId: S.uid } : parts.find((x) => x.sid === th.sid);
  if (!p) { setTimeout(closeTheater); return null; }
  const stream = me ? rtc.localStream(th.kind) : th.kind === 'screen' && !watching ? null : rtc.remoteStream(th.sid, th.kind);
  const u = S.users[p.userId];
  const pip = async () => {
    try {
      const v = ref.current?.querySelector('video');
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else { await v?.requestPictureInPicture(); closeTheater(); }
    } catch { toast('Janela flutuante não suportada aqui.'); }
  };
  return html`
    <div class="theater" ref=${ref} onDblClick=${closeTheater}>
      ${stream ? html`<${Video} stream=${stream} contain mirror=${me && th.kind === 'cam'} />` : html`<div class="screen-card"><b>Sem vídeo agora</b></div>`}
      ${showStats && stream ? html`<${StatsBadge} sid=${th.sid} kind=${th.kind} />` : null}
      <div class="theater-bar lg">
        <span class="theater-name">${th.kind === 'screen' ? html`<${Icon} n="screen" s=${14} />` : null}${u?.displayName}${me ? ' (você)' : ''}</span>
        <${GBtn} icon="pip" title="Janela flutuante" class="icon-only sm" onClick=${pip} size=${15} />
        <${GBtn} icon="minimize" title="Sair da tela cheia (Esc)" class="icon-only sm" onClick=${closeTheater} size=${15} />
      </div>
    </div>`;
}

function StatsBadge({ sid, kind }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => { const r = await rtc.videoStats(sid, kind).catch(() => null); if (alive) setS(r); };
    tick();
    const i = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(i); };
  }, [sid, kind]);
  if (!s) return null;
  return html`<div class="stats">${s.w}×${s.h} · ${s.fps} fps · ${(s.kbps / 1000).toFixed(1)} Mbps · ${s.codec}${s.encoder ? ' · ' + s.encoder : ''}${s.limit ? ' · limitado: ' + s.limit : ''}</div>`;
}

function Controls({ mobile }) {
  const call = useS((s) => s.call && { muted: s.call.muted, deafened: s.call.deafened, v: s.call.v });
  const ptt = useS((s) => s.settings.inputMode === 'ptt');
  const pttOn = useS((s) => s.ui.ptt);
  if (!call) return null;
  const cam = rtc.hasCam();
  const share = rtc.isSharing();
  const screenAvailable = canShareScreen || isElectron || nativeScreen.available;
  return html`
    <div class="controls lg">
      <${GBtn} icon=${call.muted ? 'micOff' : 'mic'} title=${call.muted ? 'Ativar microfone' : 'Silenciar'} class=${cx('icon-only ctl', call.muted && 'off', ptt && pttOn && 'on')} onClick=${rtc.toggleMute} size=${19} />
      <${GBtn} icon=${call.deafened ? 'headphonesOff' : 'headphones'} title=${call.deafened ? 'Ativar áudio' : 'Ensurdecer'} class=${cx('icon-only ctl', call.deafened && 'off')} onClick=${rtc.toggleDeafen} size=${19} />
      <${GBtn} icon=${cam ? 'video' : 'videoOff'} title=${cam ? 'Desligar câmera' : 'Ligar câmera'} class=${cx('icon-only ctl', cam && 'on')} onClick=${rtc.toggleCamera} size=${19} />
      ${cam && mobile ? html`<${GBtn} icon="flip" title="Virar câmera" class="icon-only ctl" onClick=${rtc.flipCamera} size=${19} />` : null}
      ${screenAvailable ? html`<${GBtn} icon=${share ? 'screenOff' : 'screen'} title=${share ? 'Parar transmissão' : 'Transmitir tela'} class=${cx('icon-only ctl', share && 'on')}
        onClick=${() => (share ? (nativeScreen.active ? nativeScreen.stop() : rtc.stopScreen()) : openModal('screenShare'))} size=${19} />` : null}
      ${!mobile ? html`<${GBtn} icon="settings" title="Configurações de voz e vídeo" class="icon-only ctl" onClick=${() => openModal('settings', { tab: 'voice' })} size=${19} />` : null}
      <${GBtn} icon="hangup" title="Sair da chamada" class="icon-only ctl danger" onClick=${() => { cancelOutgoing(); rtc.leave(); setUI({ callExpanded: false, callCollapsed: false }); }} size=${19} />
    </div>`;
}

export function MiniCall() {
  const call = useS((s) => s.call && { roomId: s.call.roomId, joinedAt: s.call.joinedAt, muted: s.call.muted });
  useNow(1000);
  if (!call) return null;
  return html`
    <div class="minicall lg pop">
      <button class="mc-info" onClick=${() => setUI({ callOpen: true })}>
        <i class="live-dot"></i><span><b>${roomName(call.roomId)}</b><small>${fmtDur(Date.now() - call.joinedAt)}</small></span>
      </button>
      <${GBtn} icon=${call.muted ? 'micOff' : 'mic'} class=${cx('icon-only sm', call.muted && 'off')} title="Microfone" onClick=${rtc.toggleMute} size=${15} />
      <${GBtn} icon="hangup" class="icon-only sm danger" title="Sair" onClick=${() => rtc.leave()} size=${15} />
    </div>`;
}

// ---------- modal de transmissão ----------
export function ScreenShareModal() {
  const st = useS((s) => s.settings);
  const [sources, setSources] = useState(null);
  const [src, setSrc] = useState(null);
  const [tab, setTab] = useState('screen');
  const desktop = window.perfumolandiaDesktop;

  useEffect(() => {
    if (!desktop?.getSources) return;
    let alive = true;
    const load = () => desktop.getSources().then((l) => { if (alive) { setSources(l); setSrc((cur) => cur || l.find((x) => x.id.startsWith('screen'))?.id); } });
    load();
    const i = setInterval(load, 3000);
    return () => { alive = false; clearInterval(i); };
  }, []);

  if (nativeScreen.available) {
    return html`
      <${Modal} title="Transmitir tela do celular">
        <p class="muted">O celular vai pedir permissão para gravar a tela. Sai em até 1080p a 30 fps, sem o áudio do jogo (sua voz continua pelo microfone).</p>
        <button class="gbtn primary wide" onClick=${() => { closeModal(); nativeScreen.start({}); }}><${Icon} n="screen" s=${16} /> Começar</button>
      <//>`;
  }

  const go = () => {
    closeModal();
    rtc.startScreen({ quality: st.screenQuality, priority: st.screenPriority, audio: st.screenAudio, sourceId: src });
  };
  const list = (sources || []).filter((x) => (tab === 'screen' ? x.id.startsWith('screen') : !x.id.startsWith('screen')));
  return html`
    <${Modal} title="Transmitir tela" wide=${!!desktop}>
      ${desktop ? html`
        <div class="seg">
          <button class=${tab === 'screen' ? 'on' : ''} onClick=${() => setTab('screen')}>Telas</button>
          <button class=${tab === 'window' ? 'on' : ''} onClick=${() => setTab('window')}>Janelas e jogos</button>
        </div>
        <div class="sources">
          ${!sources ? html`<p class="muted">Carregando…</p>` : list.map((x) => html`
            <button key=${x.id} class=${cx('source', src === x.id && 'on')} onClick=${() => setSrc(x.id)} onDblClick=${go}>
              <img src=${x.thumbnail} alt="" />
              <span>${x.appIcon ? html`<img class="app-ic" src=${x.appIcon} alt="" />` : null}${x.name}</span>
            </button>`)}
        </div>` : html`<p class="muted">O navegador vai perguntar qual tela, janela ou aba transmitir.</p>`}
      <div class="share-opts">
        <div class="field"><span class="field-label">Resolução e fluidez</span>
          <div class="chips">${Object.entries(rtc.QUALITY).map(([k, q]) => html`<button key=${k} class=${cx('chip', st.screenQuality === k && 'on')} onClick=${() => setSettings({ screenQuality: k })}>${q.label}</button>`)}</div>
        </div>
        <div class="field"><span class="field-label">Quando a internet apertar</span>
          <div class="chips">
            <button class=${cx('chip', st.screenPriority === 'resolution' && 'on')} onClick=${() => setSettings({ screenPriority: 'resolution' })}>Manter 4K nítido</button>
            <button class=${cx('chip', st.screenPriority === 'fps' && 'on')} onClick=${() => setSettings({ screenPriority: 'fps' })}>Manter FPS (jogos)</button>
          </div>
        </div>
        <label class="check"><input type="checkbox" checked=${st.screenAudio} onChange=${(e) => setSettings({ screenAudio: e.target.checked })} /> Transmitir áudio do PC</label>
        <p class="muted small">4K 60 usa até ~30 Mbps de upload por pessoa assistindo. Se travar, use 1440p ou 1080p.</p>
      </div>
      <button class="gbtn primary wide" disabled=${desktop && !src} onClick=${go}><${Icon} n="screen" s=${16} /> Transmitir</button>
    <//>`;
}

export function VolumeModal({ uid, kind }) {
  const st = useS((s) => s.settings);
  const u = useS((s) => s.users[uid]);
  const key = kind === 'screen' ? 'streamVolumes' : 'userVolumes';
  const v = st[key][uid] ?? 1;
  return html`
    <${Modal} title=${kind === 'screen' ? 'Volume da transmissão' : 'Volume de ' + (u?.displayName || '')}>
      <div class="vol-row">
        <${Icon} n="volume" s=${18} />
        <input type="range" min="0" max="1" step="0.01" value=${v}
          onInput=${(e) => { setSettings({ [key]: { ...st[key], [uid]: +e.target.value } }); rtc.applyVolumes(); }} />
        <b>${Math.round(v * 100)}%</b>
      </div>
      <button class="gbtn" onClick=${() => { setSettings({ [key]: { ...st[key], [uid]: v === 0 ? 1 : 0 } }); rtc.applyVolumes(); }}>${v === 0 ? 'Reativar' : 'Silenciar para mim'}</button>
    <//>`;
}
