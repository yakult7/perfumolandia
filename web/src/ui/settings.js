import { html, useState, useEffect, useRef, cx, useMedia } from '../lib.js';
import { useS, S, setSettings, setUI } from '../store.js';
import { Icon } from '../icons.js';
import { GlassBar } from '../glass.js';
import * as api from '../api.js';
import * as rtc from '../rtc.js';
import { closeModal, openModal, run, safe, toast, enableNotifications } from '../actions.js';
import { Modal, Field, Avatar, GBtn, pickFile, shrinkImage, Video } from './common.js';
import { statusMenu } from './shell.js';

const TABS = [
  { key: 'account', label: 'Minha conta', icon: 'user' },
  { key: 'voice', label: 'Voz e vídeo', icon: 'mic' },
  { key: 'screen', label: 'Transmissão', icon: 'screen' },
  { key: 'look', label: 'Aparência e desempenho', icon: 'zap' },
  { key: 'notify', label: 'Notificações', icon: 'bell' },
  { key: 'about', label: 'Sobre e convites', icon: 'sparkles' },
];

export function Settings({ tab: t0 = 'account' }) {
  const [tab, setTab] = useState(t0);
  const mobile = useMedia('(max-width: 899px)');
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && closeModal();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  const items = TABS.map((t) => ({ key: t.key, title: t.label, render: () => html`<${Icon} n=${t.icon} s=${18} /><span>${t.label}</span>` }));
  return html`
    <div class="settings-wrap" onPointerDown=${(e) => e.target === e.currentTarget && closeModal()}>
      <div class="settings pop">
        <nav class="settings-nav">
          <h2>Configurações</h2>
          <${GlassBar} axis=${mobile ? 'x' : 'y'} items=${items} value=${tab} onChange=${setTab} class="snav" itemClass="snav-item" />
          ${!mobile ? html`<button class="gbtn danger wide logout" onClick=${() => api.logout()}><${Icon} n="logout" s=${18} /> Sair da conta</button>` : null}
        </nav>
        <section class="settings-body">
          <header class="settings-head"><h3>${TABS.find((x) => x.key === tab).label}</h3>
            <button class="gbtn icon-only sm" onClick=${closeModal} aria-label="Fechar"><${Icon} n="x" s=${18} /></button></header>
          <div class="settings-scroll">
            ${tab === 'account' ? html`<${Account} />` : null}
            ${tab === 'voice' ? html`<${Voice} />` : null}
            ${tab === 'screen' ? html`<${ScreenPrefs} />` : null}
            ${tab === 'look' ? html`<${Look} />` : null}
            ${tab === 'notify' ? html`<${Notify} />` : null}
            ${tab === 'about' ? html`<${About} />` : null}
            ${mobile && tab === 'account' ? html`<button class="gbtn danger wide" onClick=${() => api.logout()}><${Icon} n="logout" s=${18} /> Sair da conta</button>` : null}
          </div>
        </section>
      </div>
    </div>`;
}

const COLORS = ['#7c5cff', '#a78bfa', '#ff5c8a', '#f472b6', '#fb7185', '#f59e0b', '#a3e635', '#2dd4bf', '#38bdf8', '#94a3b8'];

function Account() {
  const me = useS((s) => s.me);
  const [f, setF] = useState({ displayName: me.displayName, customStatus: me.customStatus, bio: me.bio });
  const [pw, setPw] = useState('');
  const dirty = f.displayName !== me.displayName || f.customStatus !== me.customStatus || f.bio !== me.bio;
  const avatar = async () => {
    const file = await pickFile();
    if (!file) return;
    const [a] = await run(api.uploadFiles([await shrinkImage(file, 384)]));
    safe(api.updateProfile({ avatar: a.url }), 'Foto atualizada.');
  };
  return html`
    <div class="acct-card" style=${`--c:${me.color}`}>
      <div class="acct-banner"></div>
      <div class="acct-row">
        <button class="acct-av" onClick=${avatar} title="Trocar foto"><${Avatar} id=${me.id} size=${84} status /><span class="acct-av-edit"><${Icon} n="edit" s=${14} /></span></button>
        <div><b>${me.displayName}</b><small class="muted">@${me.username}</small></div>
      </div>
    </div>
    <${Field} label="Nome de exibição"><input value=${f.displayName} maxlength="32" onInput=${(e) => setF({ ...f, displayName: e.target.value })} /><//>
    <${Field} label="Status personalizado" hint="Ex.: jogando Valorant 🎮"><input value=${f.customStatus} maxlength="80" onInput=${(e) => setF({ ...f, customStatus: e.target.value })} /><//>
    <${Field} label="Sobre mim"><textarea rows="3" maxlength="190" value=${f.bio} onInput=${(e) => setF({ ...f, bio: e.target.value })}></textarea><//>
    <div class="field"><span class="field-label">Cor do perfil</span>
      <div class="swatches">${COLORS.map((c) => html`<button key=${c} class=${cx('swatch', me.color === c && 'on')} style=${`--c:${c}`} aria-label=${c} onClick=${() => safe(api.updateProfile({ color: c }))}></button>`)}</div>
    </div>
    <div class="row">
      <button class="gbtn primary" disabled=${!dirty} onClick=${() => safe(api.updateProfile(f), 'Perfil salvo.')}>Salvar perfil</button>
      ${me.avatar ? html`<button class="gbtn" onClick=${() => safe(api.updateProfile({ avatar: null }))}>Remover foto</button>` : null}
    </div>
    <hr />
    <${Field} label="Nova senha"><input type="password" autocomplete="new-password" value=${pw} minlength="6" onInput=${(e) => setPw(e.target.value)} /><//>
    <button class="gbtn" disabled=${pw.length < 6} onClick=${() => run(api.changePassword(pw), 'Senha alterada.').then(() => setPw('')).catch(() => {})}>Alterar senha</button>`;
}

function useDevices() {
  const [d, setD] = useState({ audioinput: [], audiooutput: [], videoinput: [] });
  useEffect(() => {
    const load = () => navigator.mediaDevices?.enumerateDevices().then((list) => {
      const g = { audioinput: [], audiooutput: [], videoinput: [] };
      list.forEach((x) => g[x.kind]?.push(x));
      setD(g);
    });
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, []);
  return d;
}

function DevSelect({ list, value, onChange, label }) {
  return html`
    <${Field} label=${label}>
      <select value=${value} onChange=${(e) => onChange(e.target.value)}>
        <option value="default">Padrão do sistema</option>
        ${list.filter((x) => x.deviceId && x.deviceId !== 'default').map((x, i) => html`<option key=${x.deviceId} value=${x.deviceId}>${x.label || `Dispositivo ${i + 1}`}</option>`)}
      </select>
    <//>`;
}

function Voice() {
  const st = useS((s) => s.settings);
  const dev = useDevices();
  const [testing, setTesting] = useState(false);
  const [camTest, setCamTest] = useState(null);
  const meter = useRef();
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    if (!testing) return;
    let stream, raf, ctx;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: st.inputDevice !== 'default' ? { exact: st.inputDevice } : undefined, noiseSuppression: st.noiseSuppression, echoCancellation: st.echoCancellation, autoGainControl: st.autoGain } });
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const data = new Float32Array(an.fftSize);
        const loop = () => {
          an.getFloatTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);
          if (meter.current) meter.current.style.setProperty('--v', Math.min(1, rms * 6));
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch { toast('Não deu para acessar o microfone.', 'err'); setTesting(false); }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ctx?.close(); };
  }, [testing, st.inputDevice, st.noiseSuppression, st.echoCancellation, st.autoGain]);

  useEffect(() => {
    if (!binding) return;
    const k = (e) => { e.preventDefault(); setSettings({ pttKey: e.code, pttLabel: e.key.length === 1 ? e.key.toUpperCase() : e.code }); setBinding(false); window.perfumolandiaDesktop?.setPttKey?.(e.code); };
    addEventListener('keydown', k, { once: true });
    return () => removeEventListener('keydown', k);
  }, [binding]);

  const toggleCamTest = async () => {
    if (camTest) { camTest.getTracks().forEach((t) => t.stop()); setCamTest(null); return; }
    try { setCamTest(await navigator.mediaDevices.getUserMedia({ video: st.videoDevice !== 'default' ? { deviceId: { exact: st.videoDevice } } : true })); }
    catch { toast('Câmera indisponível.', 'err'); }
  };
  useEffect(() => () => camTest?.getTracks().forEach((t) => t.stop()), [camTest]);

  const setAndReload = (patch) => { setSettings(patch); rtc.reloadMic(); };
  return html`
    <div class="grid2">
      <${DevSelect} label="Microfone" list=${dev.audioinput} value=${st.inputDevice} onChange=${(v) => setAndReload({ inputDevice: v })} />
      ${dev.audiooutput.length ? html`<${DevSelect} label="Saída de áudio" list=${dev.audiooutput} value=${st.outputDevice} onChange=${(v) => { setSettings({ outputDevice: v }); rtc.applyVolumes(); }} />` : null}
    </div>
    <div class="field"><span class="field-label">Teste de microfone</span>
      <div class="row center"><button class="gbtn sm" onClick=${() => setTesting(!testing)}>${testing ? 'Parar' : 'Testar'}</button>
        <div class="meter" ref=${meter}><i></i></div></div>
    </div>
    <div class="field"><span class="field-label">Modo de entrada</span>
      <div class="chips">
        <button class=${cx('chip', st.inputMode === 'voice' && 'on')} onClick=${() => setSettings({ inputMode: 'voice' })}>Detecção de voz</button>
        <button class=${cx('chip', st.inputMode === 'ptt' && 'on')} onClick=${() => setSettings({ inputMode: 'ptt' })}>Aperte para falar</button>
      </div>
      ${st.inputMode === 'ptt' ? html`<div class="row center">Tecla: <button class="kbd big" onClick=${() => setBinding(true)}>${binding ? 'Aperte uma tecla…' : st.pttLabel}</button>
        <small class="muted">${window.perfumolandiaDesktop ? 'Funciona mesmo com o jogo em foco.' : 'No navegador, só com o app em foco.'}</small></div>` : null}
    </div>
    <${Toggle} label="Supressão de ruído" hint="Tira barulho de teclado, ventilador e fundo." value=${st.noiseSuppression} onChange=${(v) => setAndReload({ noiseSuppression: v })} />
    <${Toggle} label="Cancelamento de eco" value=${st.echoCancellation} onChange=${(v) => setAndReload({ echoCancellation: v })} />
    <${Toggle} label="Ganho automático" value=${st.autoGain} onChange=${(v) => setAndReload({ autoGain: v })} />
    <hr />
    <div class="grid2">
      <${DevSelect} label="Câmera" list=${dev.videoinput} value=${st.videoDevice} onChange=${(v) => setSettings({ videoDevice: v })} />
      <${Field} label="Qualidade da câmera">
        <select value=${st.camQuality} onChange=${(e) => setSettings({ camQuality: e.target.value })}>
          <option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p (internet fraca)</option>
        </select>
      <//>
    </div>
    <div class="cam-test">${camTest ? html`<${Video} stream=${camTest} mirror />` : html`<${Icon} n="video" s=${30} />`}</div>
    <button class="gbtn sm" onClick=${toggleCamTest}>${camTest ? 'Parar teste' : 'Testar câmera'}</button>`;
}

function ScreenPrefs() {
  const st = useS((s) => s.settings);
  return html`
    <${Field} label="Qualidade padrão">
      <div class="chips">${Object.entries(rtc.QUALITY).map(([k, q]) => html`<button key=${k} class=${cx('chip', st.screenQuality === k && 'on')} onClick=${() => setSettings({ screenQuality: k })}>${q.label}</button>`)}</div>
    <//>
    <${Field} label="Codec de vídeo" hint="Automático usa H.264 pela placa de vídeo (quase não pesa no jogo). Ligue as estatísticas para ver o codificador em uso.">
      <select value=${st.codec} onChange=${(e) => setSettings({ codec: e.target.value })}>
        <option value="auto">Automático: H.264 pela placa de vídeo (recomendado)</option>
        <option value="video/H265">H.265 / HEVC (mais nítido no mesmo Mbps, placa de vídeo)</option>
        <option value="video/AV1">AV1 (placas RTX 40 / RX 7000 / Arc)</option>
        <option value="video/VP9">VP9</option>
        <option value="video/VP8">VP8</option>
      </select>
    <//>
    <${Toggle} label="Mostrar estatísticas no vídeo" hint="Resolução, FPS, Mbps e codificador em cada transmissão." value=${st.showStats} onChange=${(v) => setSettings({ showStats: v })} />
    <div class="note"><${Icon} n="zap" s=${18} /><p>Para 4K real seu monitor precisa ser 4K. Cada pessoa assistindo consome o upload configurado (4K60 ≈ 30 Mbps). Quem não clica em "Assistir" não gasta nada da sua internet.</p></div>`;
}

function Look() {
  const st = useS((s) => s.settings);
  useEffect(() => { document.documentElement.classList.toggle('perf', st.perfMode); }, [st.perfMode]);
  return html`
    <${Toggle} label="Modo desempenho (jogando)" hint="Desliga desfoque, refração e animações para gastar menos GPU durante o jogo." value=${st.perfMode} onChange=${(v) => setSettings({ perfMode: v })} />
    <${Toggle} label="Sons do app" hint="Entrar/sair da chamada, mensagens, mudo." value=${st.sounds} onChange=${(v) => setSettings({ sounds: v })} />`;
}

function Notify() {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  return html`
    <p class="muted">Avisos de mensagens diretas, menções e chamadas quando o app está em segundo plano.</p>
    <p>Status: <b>${{ granted: 'Ativadas', denied: 'Bloqueadas no sistema', default: 'Desativadas', unsupported: 'Não suportado aqui' }[perm]}</b></p>
    ${perm !== 'granted' && perm !== 'unsupported' ? html`<button class="gbtn primary" onClick=${() => run(enableNotifications(), 'Notificações ativadas.').then(() => setPerm('granted')).catch(() => setPerm(Notification.permission))}>Ativar notificações</button>` : null}
    ${perm === 'denied' ? html`<p class="muted small">Libere nas configurações do sistema/navegador para este app.</p>` : null}`;
}

function About() {
  const code = useS((s) => s.inviteCode);
  return html`
    <div class="code-box glass"><span>Código para criar conta</span><b>${code}</b>
      <button class="gbtn sm" onClick=${() => navigator.clipboard?.writeText(code).then(() => toast('Copiado.'))}><${Icon} n="copy" s=${16} /> Copiar</button></div>
    <p class="muted">Mande esse código e o link do app só para os amigos. Sem ele ninguém cria conta.</p>
    <button class="gbtn" onClick=${() => openModal('install')}><${Icon} n="download" s=${18} /> Como instalar no celular</button>
    <p class="muted small">Perfumolandia · versão 1.0</p>`;
}

export const Toggle = ({ label, hint, value, onChange }) => html`
  <label class="toggle-row">
    <span><b>${label}</b>${hint ? html`<small>${hint}</small>` : null}</span>
    <input type="checkbox" class="switch" checked=${value} onChange=${(e) => onChange(e.target.checked)} />
  </label>`;

/** aba "Você" do celular */
export function MePage() {
  const me = useS((s) => s.me);
  if (!me) return null;
  return html`
    <div class="me-page">
      <div class="acct-card" style=${`--c:${me.color}`}>
        <div class="acct-banner"></div>
        <div class="acct-row">
          <button class="acct-av" onClick=${statusMenu}><${Avatar} id=${me.id} size=${84} status /></button>
          <div><b>${me.displayName}</b><small class="muted">@${me.username}</small>${me.customStatus ? html`<small>${me.customStatus}</small>` : null}</div>
        </div>
      </div>
      <div class="me-list">
        ${TABS.map((t) => html`<button key=${t.key} class="me-item" onClick=${() => openModal('settings', { tab: t.key })}><${Icon} n=${t.icon} s=${20} /><span>${t.label}</span><${Icon} n="right" s=${18} /></button>`)}
        <button class="me-item" onClick=${statusMenu}><${Icon} n="sparkles" s=${20} /><span>Alterar status</span><${Icon} n="right" s=${18} /></button>
      </div>
      <button class="gbtn danger wide" onClick=${() => api.logout()}><${Icon} n="logout" s=${18} /> Sair da conta</button>
    </div>`;
}
