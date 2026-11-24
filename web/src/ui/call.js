import { html, useState, useRef, useEffect, cx, canShareScreen, isElectron } from '../lib.js';
import { useS, S, setUI, setSettings } from '../store.js';
import { Icon } from '../icons.js';
import * as rtc from '../rtc.js';
import * as api from '../api.js';
import { openModal, closeModal, openMenu, roomName, serverOfRoom, cancelOutgoing, toast } from '../actions.js';
import { Avatar, GBtn, Video, Modal, useNow, fmtDur } from './common.js';
import { nativeScreen } from '../native.js';

export function CallStage({ compact, mobile }) {
  const call = useS((s) => s.call);
  const parts = useS((s) => (s.call ? s.voice[s.call.roomId] || [] : []));
  const outgoing = useS((s) => s.outgoing);
  const showStats = useS((s) => s.settings.showStats);
  useNow(1000);
  if (!call) return null;

  // participantes: eu primeiro, depois os outros por ordem de entrada
  const meP = { sid: api.clientId, userId: S.uid, state: { muted: call.muted, deafened: call.deafened, camera: rtc.hasCam(), screen: rtc.isSharing(), screenLabel: call.screenLabel }, me: true };
  const others = parts.filter((p) => p.sid !== api.clientId);
  const all = [meP, ...others];
  const tiles = [];
  for (const p of all) {
    if (p.state?.screen) tiles.push({ id: p.sid + ':screen', p, kind: 'screen' });
    tiles.push({ id: p.sid + ':cam', p, kind: 'cam' });
  }
  const focus = call.focus && tiles.find((t) => t.p.sid === call.focus.sid && t.kind === call.focus.kind);
  const rest = focus ? tiles.filter((t) => t !== focus) : tiles;
  const sv = serverOfRoom(call.roomId);

  return html`
    <div class=${cx('stage', compact && 'compact', mobile && 'mobile', focus && 'has-focus')}>
      <header class="stage-top">
        ${mobile ? html`<${GBtn} icon="down" title="Minimizar" class="icon-only sm" onClick=${() => setUI({ callOpen: false })} />` : null}
        <div class="stage-title">
          <b>${sv ? '🔊 ' : ''}${roomName(call.roomId)}</b>
          <small>${call.connecting ? 'Conectando…' : outgoing ? 'Chamando…' : fmtDur(Date.now() - call.joinedAt)} · ${all.length} ${all.length === 1 ? 'pessoa' : 'pessoas'}</small>
        </div>
        ${!mobile && !compact ? html`<${GBtn} icon="activity" title="Estatísticas de vídeo" class=${cx('icon-only sm', showStats && 'on')} onClick=${() => setSettings({ showStats: !S.settings.showStats })} size=${18} />` : null}
      </header>
      <div class="stage-body">
        ${focus ? html`<div class="focus-area"><${Tile} t=${focus} big /></div>` : null}
        <div class=${cx('grid', focus && 'strip')} data-n=${Math.min(rest.length, 9)}>
          ${rest.map((t) => html`<${Tile} key=${t.id} t=${t} />`)}
        </div>
      </div>
      <${Controls} mobile=${mobile} />
    </div>`;
}

function Tile({ t, big }) {
  const { p, kind } = t;
  const u = useS((s) => s.users[p.userId]);
  const speaking = useS((s) => kind === 'cam' && !!s.speaking[p.userId]);
  const watching = useS((s) => !!s.call?.watching?.[p.sid]);
  const v = useS((s) => s.call?.v);
  const showStats = useS((s) => s.settings.showStats);
  const rawConn = !p.me ? rtc.connectionOf(p.sid) : 'connected';
  // "new" = ninguém enviando mídia ainda (ex.: os dois sem microfone): não mostra como problema
  const conn = rawConn === 'new' ? 'connected' : rawConn;
  const ref = useRef();
  const st = p.state || {};

  let stream = null;
  if (p.me) stream = kind === 'screen' ? rtc.localStream('screen') : rtc.localStream('cam');
  else if (kind === 'screen' ? watching : st.camera) stream = rtc.remoteStream(p.sid, kind);
  const hasVideo = !!stream?.getVideoTracks().length && (kind === 'screen' || st.camera);

  const focusMe = () => rtc.setFocus(big ? null : { sid: p.sid, kind });
  const fullscreen = () => {
    const vid = ref.current?.querySelector('video');
    if (document.fullscreenElement) return document.exitFullscreen();
    if (ref.current?.requestFullscreen) ref.current.requestFullscreen().catch(() => vid?.webkitEnterFullscreen?.());
    else vid?.webkitEnterFullscreen?.();
  };
  const pip = async () => {
    const vid = ref.current?.querySelector('video');
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await vid?.requestPictureInPicture();
    } catch { toast('Picture-in-picture não suportado aqui.'); }
  };
  const tileMenu = (e) => openMenu(e, [
    ...(hasVideo ? [
      { label: 'Tela cheia', icon: html`<${Icon} n="maximize" s=${18} />`, onClick: fullscreen },
      { label: 'Janela flutuante (PiP)', icon: html`<${Icon} n="pip" s=${18} />`, onClick: pip },
    ] : []),
    ...(!p.me ? [{ label: kind === 'screen' ? 'Volume da transmissão' : 'Volume de ' + (u?.displayName || ''), icon: html`<${Icon} n="volume" s=${18} />`, onClick: () => openModal('volume', { uid: p.userId, kind }) }] : []),
    ...(!p.me && kind === 'screen' && watching ? [{ label: 'Parar de assistir', icon: html`<${Icon} n="eye" s=${18} />`, onClick: () => rtc.watch(p.sid, false) }] : []),
    ...(p.me && kind === 'screen' ? [{ label: 'Parar transmissão', danger: true, icon: html`<${Icon} n="stop" s=${18} />`, onClick: () => rtc.stopScreen() }] : []),
  ]);

  return html`
    <div ref=${ref} class=${cx('tile', kind, big && 'big', speaking && 'speaking', hasVideo && 'has-video', conn !== 'connected' && !p.me && 'weak')}
      onDblClick=${hasVideo ? fullscreen : null} onClick=${focusMe} onContextMenu=${tileMenu}>
      ${hasVideo ? html`<${Video} stream=${stream} mirror=${p.me && kind === 'cam' && S.call?.facing !== 'environment'} contain=${kind === 'screen' || big} />` : kind === 'screen' ? html`
        <div class="screen-card">
          <span class="live">AO VIVO</span>
          <b>${u?.displayName} está transmitindo</b>
          ${st.screenLabel ? html`<small>${st.screenLabel}</small>` : null}
          ${p.me ? html`<small>Você está transmitindo</small>` : html`
            <button class="gbtn primary" onClick=${(e) => { e.stopPropagation(); rtc.watch(p.sid, true); }}><${Icon} n="eye" s=${18} /> Assistir transmissão</button>`}
        </div>` : html`
        <div class="tile-av"><${Avatar} id=${p.userId} size=${big ? 120 : 72} /></div>`}
      ${showStats && hasVideo ? html`<${StatsBadge} sid=${p.sid} kind=${kind} />` : null}
      <div class="tile-foot">
        <span class="tile-name glass">
          ${kind === 'screen' ? html`<${Icon} n="screen" s=${14} />` : null}
          ${st.deafened ? html`<${Icon} n="headphonesOff" s=${14} />` : st.muted && kind === 'cam' ? html`<${Icon} n="micOff" s=${14} />` : null}
          ${u?.displayName}${p.me ? ' (você)' : ''}
        </span>
        ${conn !== 'connected' && !p.me ? html`<span class="tile-conn glass">${conn === 'failed' ? 'Sem conexão' : 'Conectando…'}</span>` : null}
      </div>
      ${hasVideo || !p.me ? html`<button class="tile-more gbtn icon-only xs" aria-label="Opções" onClick=${(e) => { e.stopPropagation(); tileMenu(e); }}><${Icon} n="more" s=${16} /></button>` : null}
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
  return html`<div class="stats glass">${s.w}×${s.h} · ${s.fps} fps · ${(s.kbps / 1000).toFixed(1)} Mbps · ${s.codec}${s.encoder ? ' · ' + s.encoder : ''}${s.limit ? ' · limitado: ' + s.limit : ''}</div>`;
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
    <div class="controls glass">
      <${GBtn} icon=${call.muted ? 'micOff' : 'mic'} title=${call.muted ? 'Ativar microfone' : 'Silenciar'} class=${cx('icon-only ctl', call.muted && 'off', ptt && pttOn && 'on')} onClick=${rtc.toggleMute} />
      <${GBtn} icon=${call.deafened ? 'headphonesOff' : 'headphones'} title=${call.deafened ? 'Ativar áudio' : 'Ensurdecer'} class=${cx('icon-only ctl', call.deafened && 'off')} onClick=${rtc.toggleDeafen} />
      <${GBtn} icon=${cam ? 'video' : 'videoOff'} title=${cam ? 'Desligar câmera' : 'Ligar câmera'} class=${cx('icon-only ctl', cam && 'on')} onClick=${rtc.toggleCamera} />
      ${cam && mobile ? html`<${GBtn} icon="flip" title="Virar câmera" class="icon-only ctl" onClick=${rtc.flipCamera} />` : null}
      ${screenAvailable ? html`<${GBtn} icon=${share ? 'screenOff' : 'screen'} title=${share ? 'Parar transmissão' : 'Transmitir tela'} class=${cx('icon-only ctl', share && 'on')}
        onClick=${() => (share ? (nativeScreen.active ? nativeScreen.stop() : rtc.stopScreen()) : openModal('screenShare'))} />` : null}
      ${!mobile ? html`<${GBtn} icon="settings" title="Configurações de voz e vídeo" class="icon-only ctl" onClick=${() => openModal('settings', { tab: 'voice' })} />` : null}
      <${GBtn} icon="hangup" title="Sair da chamada" class="icon-only ctl danger" onClick=${() => { cancelOutgoing(); rtc.leave(); }} />
    </div>`;
}

export function MiniCall() {
  const call = useS((s) => s.call && { roomId: s.call.roomId, joinedAt: s.call.joinedAt, muted: s.call.muted });
  useNow(1000);
  if (!call) return null;
  return html`
    <div class="minicall glass pop">
      <button class="mc-info" onClick=${() => setUI({ callOpen: true })}>
        <i class="live-dot"></i><span><b>${roomName(call.roomId)}</b><small>${fmtDur(Date.now() - call.joinedAt)}</small></span>
      </button>
      <${GBtn} icon=${call.muted ? 'micOff' : 'mic'} class=${cx('icon-only sm', call.muted && 'off')} title="Microfone" onClick=${rtc.toggleMute} size=${18} />
      <${GBtn} icon="hangup" class="icon-only sm danger" title="Sair" onClick=${() => rtc.leave()} size=${18} />
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
        <p class="muted">O celular vai pedir permissão para gravar a tela. A transmissão sai na resolução da tela do aparelho.</p>
        <label class="check"><input type="checkbox" checked=${st.screenAudio} onChange=${(e) => setSettings({ screenAudio: e.target.checked })} /> Incluir áudio do celular (Android 10+)</label>
        <button class="gbtn primary wide" onClick=${() => { closeModal(); nativeScreen.start({ audio: st.screenAudio }); }}><${Icon} n="screen" /> Começar</button>
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
        <div class="seg glass small-seg">
          <button class=${tab === 'screen' ? 'on' : ''} onClick=${() => setTab('screen')}>Telas</button>
          <button class=${tab === 'window' ? 'on' : ''} onClick=${() => setTab('window')}>Janelas / jogos</button>
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
          <div class="chips">
            ${Object.entries(rtc.QUALITY).map(([k, q]) => html`<button key=${k} class=${cx('chip', st.screenQuality === k && 'on')} onClick=${() => setSettings({ screenQuality: k })}>${q.label}</button>`)}
          </div>
        </div>
        <div class="field"><span class="field-label">Prioridade quando a internet apertar</span>
          <div class="chips">
            <button class=${cx('chip', st.screenPriority === 'resolution' && 'on')} onClick=${() => setSettings({ screenPriority: 'resolution' })}>Manter 4K nítido</button>
            <button class=${cx('chip', st.screenPriority === 'fps' && 'on')} onClick=${() => setSettings({ screenPriority: 'fps' })}>Manter FPS (jogos)</button>
          </div>
        </div>
        <label class="check"><input type="checkbox" checked=${st.screenAudio} onChange=${(e) => setSettings({ screenAudio: e.target.checked })} /> Transmitir áudio do PC</label>
        <p class="muted small">4K 60 usa até ~30 Mbps de upload por pessoa assistindo. Se travar, use 1440p ou 1080p.</p>
      </div>
      <button class="gbtn primary wide" disabled=${desktop && !src} onClick=${go}><${Icon} n="screen" /> Transmitir</button>
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
        <${Icon} n="volume" />
        <input type="range" min="0" max="1" step="0.01" value=${v}
          onInput=${(e) => { setSettings({ [key]: { ...st[key], [uid]: +e.target.value } }); rtc.applyVolumes(); }} />
        <b>${Math.round(v * 100)}%</b>
      </div>
      <button class="gbtn" onClick=${() => { setSettings({ [key]: { ...st[key], [uid]: v === 0 ? 1 : 0 } }); rtc.applyVolumes(); }}>${v === 0 ? 'Reativar' : 'Silenciar para mim'}</button>
    <//>`;
}
