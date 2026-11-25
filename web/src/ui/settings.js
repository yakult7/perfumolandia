import { html, useState, useEffect, useRef, cx, useMedia } from '../lib.js';
import { useS, S, setSettings, setUI } from '../store.js';
import { Icon } from '../icons.js';
import * as api from '../api.js';
import * as rtc from '../rtc.js';
import { Shop } from './shop.js';
import { closeModal, openModal, run, safe, toast, enableNotifications } from '../actions.js';
import { Modal, Field, Avatar, GBtn, pickFile, shrinkImage, Video, PasswordInput } from './common.js';
import { statusMenu } from './shell.js';
import { ProfileEditor, ProfileCard } from './profile.js';
import { ACCENTS, APP_THEMES, appBackground, effectiveMode } from '../theme.js';
import { OtpCode } from './otp.js';

const GROUPS = [
  { title: 'Sua conta', items: [
    { key: 'account', label: 'Perfil', icon: 'user', color: '#0a84ff', desc: 'Foto, banner, nome, bio e o visual do seu perfil.' },
    { key: 'security', label: 'Conta e senha', icon: 'shield', color: '#30d158', desc: 'Usuário, email e senha de acesso.' },
    { key: 'shop', label: 'Loja', icon: 'gift', color: '#ff375f', desc: 'Decorações, efeitos e molduras para o perfil.', mobileOnly: true },
  ] },
  { title: 'App', items: [
    { key: 'look', label: 'Aparência', icon: 'brush', color: '#bf5af2', desc: 'Claro ou escuro, vidro e modo desempenho.' },
    { key: 'theme', label: 'Tema e cores', icon: 'palette', color: '#ff9f0a', desc: 'Degradês do fundo e cor de destaque.' },
    { key: 'voice', label: 'Voz e vídeo', icon: 'mic', color: '#32d74b', desc: 'Microfone, fone, câmera e supressão de ruído.' },
    { key: 'screen', label: 'Transmissão', icon: 'screen', color: '#64d2ff', desc: 'Qualidade e som ao transmitir a tela.' },
    { key: 'notify', label: 'Notificações', icon: 'bell', color: '#ff453a', desc: 'Avisos de mensagens, menções e ligações.' },
  ] },
  { title: 'Mais', items: [
    { key: 'about', label: 'Sobre', icon: 'sparkles', color: '#5e5ce6', desc: 'Chamar os amigos e baixar o app.' },
  ] },
];
const TABS = GROUPS.flatMap((g) => g.items);

export function Settings({ tab: t0 = 'account' }) {
  const mobile = useMedia('(max-width: 899px)');
  const me = useS((s) => s.me);
  const [tab, setTab] = useState(t0 || (mobile ? null : 'account'));
  const [q, setQ] = useState('');
  const [ver, setVer] = useState('');
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && closeModal();
    addEventListener('keydown', k);
    window.perfumolandiaDesktop?.version?.().then(setVer).catch(() => {});
    return () => removeEventListener('keydown', k);
  }, []);
  const cur = TABS.find((x) => x.key === tab);
  const showNav = !mobile || !cur;
  const showBody = !mobile || !!cur;
  const match = (t) => !q.trim() || (t.label + ' ' + t.desc).toLowerCase().includes(q.trim().toLowerCase());
  return html`
    <div class="settings-wrap" onPointerDown=${(e) => e.target === e.currentTarget && closeModal()}>
      <div class=${cx('st sheet pop', mobile && 'st-mobile')}>
        ${showNav ? html`
          <nav class="st-nav">
            <div class="st-nav-top">
              ${mobile ? html`<div class="st-mtitle"><h2>Ajustes</h2><button class="st-close" onClick=${closeModal} aria-label="Fechar"><${Icon} n="x" s=${15} /></button></div>` : null}
              ${me ? html`
                <button class=${cx('st-me', tab === 'account' && 'on')} onClick=${() => setTab('account')}>
                  <${Avatar} id=${me.id} size=${42} status />
                  <span><b>${me.displayName}</b><small>@${me.username}</small></span>
                  <${Icon} n="right" s=${15} />
                </button>` : null}
              <label class="st-search"><${Icon} n="search" s=${15} />
                <input placeholder="Buscar ajuste" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
            </div>
            <div class="st-groups">
              ${GROUPS.map((g) => {
                const items = g.items.filter((t) => (mobile || !t.mobileOnly) && match(t));
                if (!items.length) return null;
                return html`
                  <div class="st-group" key=${g.title}>
                    <span class="st-gtitle">${g.title}</span>
                    ${items.map((t) => html`
                      <button key=${t.key} class=${cx('st-item', tab === t.key && 'on')} onClick=${() => setTab(t.key)}>
                        <span class="st-ic" style=${`--c:${t.color}`}><${Icon} n=${t.icon} s=${15} /></span>
                        <span class="st-label">${t.label}</span>
                        ${mobile ? html`<${Icon} n="right" s=${15} />` : null}
                      </button>`)}
                  </div>`;
              })}
            </div>
            <div class="st-foot">
              <button class="st-logout" onClick=${() => api.logout()}><${Icon} n="logout" s=${15} /> Sair da conta</button>
              <small>Perfumolandia${ver ? ' · v' + ver : ''}</small>
            </div>
          </nav>` : null}
        ${showBody && cur ? html`
          <section class="st-body">
            <header class="st-head">
              ${mobile ? html`<button class="st-back" onClick=${() => setTab(null)} aria-label="Voltar"><${Icon} n="back" s=${18} /></button>` : null}
              <span class="st-ic big" style=${`--c:${cur.color}`}><${Icon} n=${cur.icon} s=${20} /></span>
              <div class="st-titles"><h3>${cur.label}</h3><p>${cur.desc}</p></div>
              <button class="st-close" onClick=${closeModal} aria-label="Fechar"><${Icon} n="x" s=${15} /></button>
            </header>
            <div class="st-scroll settings-scroll" key=${tab}>
              ${tab === 'account' ? html`<${ProfileEditor} />` : null}
              ${tab === 'voice' ? html`<div class="st-card st-pad"><${Voice} /></div>` : null}
              ${tab === 'screen' ? html`<div class="st-card st-pad"><${ScreenPrefs} /></div>` : null}
              ${tab === 'look' ? html`<${Look} />` : null}
              ${tab === 'theme' ? html`<${ThemeEditor} />` : null}
              ${tab === 'shop' ? html`<${Shop} />` : null}
              ${tab === 'notify' ? html`<div class="st-card st-pad"><${Notify} /></div>` : null}
              ${tab === 'security' ? html`<${Security} />` : null}
              ${tab === 'about' ? html`<${About} />` : null}
            </div>
          </section>` : null}
      </div>
    </div>`;
}

/** Conta e senha: usuário, email (troca com código) e senha (atual + nova 2x) */
function Security() {
  const me = useS((s) => s.me);
  const email = useS((s) => s.myEmail);
  const pending = useS((s) => s.emailPending);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => { api.checkEmail().catch(() => {}); }, []);
  const match = pw === pw2;
  const save = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api.changePassword(cur, pw);
      toast('Senha alterada.');
      setCur(''); setPw(''); setPw2('');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return html`
    <span class="st-label-top">Entrada</span>
    <div class="st-card">
      <div class="st-row">
        <span class="st-ic sm" style="--c:#0a84ff"><${Icon} n="user" s=${14} /></span>
        <span class="st-row-main"><b>Usuário</b><small>@${me.username} · para entrar e para os amigos te adicionarem</small></span>
        <button class="gbtn sm" onClick=${() => navigator.clipboard?.writeText(me.username).then(() => toast('Copiado.'))}><${Icon} n="copy" s=${14} /> Copiar</button>
      </div>
      <div class="st-row">
        <span class="st-ic sm" style="--c:#ff9f0a"><${Icon} n="mail" s=${14} /></span>
        <span class="st-row-main"><b>Email</b>
          <small>${email && !pending ? email : pending ? html`${pending} <i class="st-badge warn">não confirmado</i>` : html`Nenhum email <i class="st-badge warn">adicione para recuperar a conta</i>`}</small></span>
        ${!editing ? html`<button class="gbtn sm" onClick=${() => setEditing(true)}>${email && !pending ? 'Alterar' : pending ? 'Confirmar' : 'Adicionar'}</button>` : null}
      </div>
      ${editing ? html`<${EmailChange} initial=${pending || ''} close=${() => setEditing(false)} />` : null}
    </div>

    <span class="st-label-top">Senha</span>
    <form class="st-card st-pad" onSubmit=${save}>
      <${Field} label="Senha atual"><${PasswordInput} autocomplete="current-password" value=${cur} onInput=${(e) => setCur(e.target.value)} required /><//>
      <${Field} label="Nova senha"><${PasswordInput} autocomplete="new-password" value=${pw} minlength="6" placeholder="Mínimo de 6 caracteres" onInput=${(e) => setPw(e.target.value)} required /><//>
      <${Field} label="Repita a nova senha" hint=${pw2 && !match ? 'As senhas não são iguais.' : ''}><${PasswordInput} autocomplete="new-password" value=${pw2} onInput=${(e) => setPw2(e.target.value)} required /><//>
      ${err ? html`<div class="form-err">${err}</div>` : null}
      <div class="row end"><button class="gbtn primary" disabled=${busy || !cur || pw.length < 6 || !match}>${busy ? 'Salvando…' : 'Alterar senha'}</button></div>
    </form>

    <span class="st-label-top">Sessão</span>
    <div class="st-card">
      <button class="st-row st-danger" onClick=${() => api.logout()}>
        <span class="st-ic sm" style="--c:#ff453a"><${Icon} n="logout" s=${14} /></span>
        <span class="st-row-main"><b>Sair da conta</b><small>Você pode entrar de novo com usuário ou email e senha.</small></span>
      </button>
    </div>`;
}

/** troca/adiciona o email: digita -> código no email novo (com a animação) -> pronto */
function EmailChange({ initial, close }) {
  const [email, setEmail] = useState(initial);
  const [mode, setMode] = useState(null); // null = digitando o email
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async (e) => {
    e?.preventDefault?.();
    setErr(''); setBusy(true);
    try { setMode(await api.changeEmail(email)); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const done = () => api.checkEmail().then(() => { toast('Email confirmado!'); close(); });
  return html`
    <div class="st-sub">
      ${!mode ? html`
        <form class="st-inline" onSubmit=${send}>
          <input type="email" placeholder="novoemail@exemplo.com" autocomplete="email" value=${email} onInput=${(e) => setEmail(e.target.value)} required autofocus />
          <button class="gbtn primary sm" disabled=${busy}>${busy ? 'Enviando…' : 'Enviar código'}</button>
          <button type="button" class="gbtn sm plain" onClick=${close}>Cancelar</button>
        </form>` : html`
        <p class="st-sub-text">Digite o código de 6 números que mandamos para <b>${email}</b>.</p>
        <${OtpCode} onSubmit=${(c) => api.verifyEmailChange(email, c, mode)} onDone=${done} />
        <div class="row between"><button type="button" class="link" onClick=${() => setMode(null)}>Trocar email</button>
          <button type="button" class="link" disabled=${busy} onClick=${send}>Reenviar código</button></div>`}
      ${err ? html`<div class="form-err">${err}</div>` : null}
    </div>`;
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
    let stream, raf, ctx, audioEl;
    (async () => {
      try {
        // mesmo microfone da chamada (com a supressão escolhida); "ouvir" toca de volta para você conferir
        stream = await rtc.getMic();
        ctx = new AudioContext();
        if (testing === 'listen') { audioEl = new Audio(); audioEl.srcObject = stream; audioEl.play().catch(() => {}); }
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
    return () => { cancelAnimationFrame(raf); if (audioEl) audioEl.srcObject = null; stream?.getTracks().forEach((t) => t.stop()); stream?.cleanup?.(); ctx?.close(); };
  }, [testing, st.inputDevice, st.noiseMode, st.echoCancellation, st.autoGain]);

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
      <div class="row center"><button class="gbtn sm" onClick=${() => setTesting(testing ? false : 'meter')}>${testing === 'meter' ? 'Parar' : 'Testar'}</button>
        <button class=${cx('gbtn sm', testing === 'listen' && 'on')} title="Toca sua voz de volta (use fone)" onClick=${() => setTesting(testing === 'listen' ? false : 'listen')}>${testing === 'listen' ? 'Parar' : 'Ouvir minha voz'}</button>
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
    <div class="field"><span class="field-label">Supressão de ruído</span>
      <div class="chips">
        <button class=${cx('chip', (st.noiseMode || 'smart') === 'smart' && 'on')} onClick=${() => { localStorage.setItem('rs.noiseChosen', '1'); setAndReload({ noiseMode: 'smart' }); }}>Inteligente (IA)</button>
        <button class=${cx('chip', st.noiseMode === 'basic' && 'on')} onClick=${() => setAndReload({ noiseMode: 'basic' })}>Básica</button>
        <button class=${cx('chip', st.noiseMode === 'off' && 'on')} onClick=${() => setAndReload({ noiseMode: 'off' })}>Desligada</button>
      </div>
      <small class="muted">Inteligente: uma rede neural separa sua voz de teclado, ventilador, ar-condicionado e barulho da casa.</small>
    </div>
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
  return html`
    <div class="group-box">
      <span class="field-label">Tema</span>
      <div class="seg">
        ${[['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => html`
          <button key=${k} class=${st.theme === k ? 'on' : ''} onClick=${() => setSettings({ theme: k })}>${k === 'light' ? html`<${Icon} n="sun" s=${14} />` : k === 'dark' ? html`<${Icon} n="moon" s=${14} />` : null}${l}</button>`)}
      </div>
      <span class="field-label">Vidro</span>
      <div class="seg">
        <button class=${st.glassStyle !== 'tinted' ? 'on' : ''} onClick=${() => setSettings({ glassStyle: 'clear' })}>Transparente</button>
        <button class=${st.glassStyle === 'tinted' ? 'on' : ''} onClick=${() => setSettings({ glassStyle: 'tinted' })}>Fosco (mais legível)</button>
      </div>
    </div>
    <button class="gbtn" onClick=${() => openModal('settings', { tab: 'theme' })}><${Icon} n="palette" s=${15} /> Personalizar cores e degradês</button>
    <div class="group-box">
      <${Toggle} label="Modo desempenho" hint="Sem vidro e sem animações o tempo todo. Já liga sozinho quando um jogo está aberto, com o app em segundo plano e em PC fraco." value=${st.perfMode} onChange=${(v) => setSettings({ perfMode: v })} />
      ${window.perfumolandiaDesktop?.metrics ? html`<${PerfPanel} />` : null}
      <${Toggle} label="Sons do app" hint="Entrar/sair da chamada, mensagens, mudo." value=${st.sounds} onChange=${(v) => setSettings({ sounds: v })} />
      <${Toggle} label="Mostrar o jogo que estou jogando" hint="No app do Windows, seus amigos veem “Jogando …” com a capa do jogo." value=${st.shareGame !== false} onChange=${(v) => { setSettings({ shareGame: v }); api.refreshPresence(); }} />
      ${window.perfumolandiaDesktop?.getAutostart ? html`<${AutostartToggle} />` : null}
    </div>`;
}

/** aba Tema e cores: degradês prontos + editor livre (cores, ângulo, intensidade) */
function ThemeEditor() {
  const st = useS((s) => s.settings);
  const mode = effectiveMode(st);
  const custom = st.appTheme === 'custom';
  const setColor = (i, v) => { const c = [...st.appColors]; c[i] = v; setSettings({ appTheme: 'custom', appColors: c }); };
  const toggleThird = () => {
    const c = [...st.appColors];
    if (c[2]) c[2] = null; else c[2] = '#0a84ff';
    setSettings({ appTheme: 'custom', appColors: c });
  };
  const preview = (key) => appBackground({ ...st, appTheme: key }, mode) || 'var(--bg)';
  return html`
    <div class="theme-preview" style=${`background:${appBackground(st, mode) || 'var(--bg)'}`}>
      <div class="tp-side"><span class="tp-line" style="width:70%"></span><span class="tp-line"></span><span class="tp-line" style="width:50%"></span></div>
      <div class="tp-main"><span class="tp-bubble">bora jogar hoje?</span><span class="tp-bubble me">bora! 🎮</span></div>
    </div>
    <div class="group-box">
      <span class="field-label">Degradês prontos</span>
      <div class="wp-grid">
        ${Object.entries(APP_THEMES).map(([k, th]) => html`
          <button key=${k} class=${cx('wp-item', st.appTheme === k && 'on')} style=${`background:${preview(k)}`} onClick=${() => setSettings({ appTheme: k })}><span>${th.name}</span></button>`)}
        <button class=${cx('wp-item', custom && 'on')} style=${`background:${preview('custom')}`} onClick=${() => setSettings({ appTheme: 'custom' })}><span>Personalizado</span></button>
      </div>
    </div>
    <div class="group-box">
      <span class="field-label">Criar o meu degradê</span>
      <div class="color-row">
        ${st.appColors.map((c, i) => (c ? html`<input key=${i} type="color" value=${c} onInput=${(e) => setColor(i, e.target.value)} title=${'Cor ' + (i + 1)} />` : null))}
        <button class="gbtn sm" onClick=${toggleThird}>${st.appColors[2] ? 'Usar 2 cores' : '+ 3ª cor'}</button>
      </div>
      <div class="angle-row"><small class="muted">Direção</small>
        <input type="range" min="0" max="360" step="5" value=${st.appAngle} onInput=${(e) => setSettings({ appTheme: 'custom', appAngle: +e.target.value })} /><b>${st.appAngle}°</b></div>
      <div class="angle-row"><small class="muted">Intensidade</small>
        <input type="range" min="0.1" max="1" step="0.05" value=${st.appIntensity} onInput=${(e) => setSettings({ appIntensity: +e.target.value })} /><b>${Math.round(st.appIntensity * 100)}%</b></div>
      <small class="field-hint">A intensidade vale para todos os degradês. No tema escuro as cores ficam mais fechadas e no claro mais suaves, para o texto continuar legível.</small>
    </div>
    <div class="group-box">
      <span class="field-label">Cor de destaque (botões, seleção, links)</span>
      <div class="swatches">
        ${ACCENTS.map((c) => html`<button key=${c} class=${cx('swatch', st.accent === c && 'on')} style=${`--c:${c}`} aria-label=${c} onClick=${() => setSettings({ accent: c })}></button>`)}
        <input type="color" value=${st.accent} onInput=${(e) => setSettings({ accent: e.target.value })} title="Escolher qualquer cor" />
      </div>
    </div>`;
}

function AutostartToggle() {
  const [on, setOn] = useState(null);
  useEffect(() => { window.perfumolandiaDesktop.getAutostart().then(setOn); }, []);
  if (on === null) return null;
  return html`<${Toggle} label="Iniciar com o Windows" hint="Abre escondido na bandeja quando o PC liga, para você receber chamadas." value=${on}
    onChange=${(v) => window.perfumolandiaDesktop.setAutostart(v).then(setOn)} />`;
}

function Notify() {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  return html`
    <p class="muted">Avisos de mensagens diretas, menções e chamadas quando o app está em segundo plano.</p>
    <p>Status: <b>${{ granted: 'Ativadas', denied: 'Bloqueadas no sistema', default: 'Desativadas', unsupported: 'Não suportado aqui' }[perm]}</b></p>
    ${perm !== 'granted' && perm !== 'unsupported' ? html`<button class="gbtn primary" onClick=${() => run(enableNotifications(), 'Notificações ativadas.').then(() => setPerm('granted')).catch(() => setPerm(Notification.permission))}>Ativar notificações</button>` : null}
    ${perm === 'denied' ? html`<p class="muted small">Libere nas configurações do sistema/navegador para este app.</p>` : null}`;
}

const SITE = 'https://yakult7.github.io/perfumolandia/';
const RELEASES = 'https://github.com/yakult7/perfumolandia/releases/tag/latest';
function About() {
  const share = `Baixa a Perfumolandia pra gente conversar e jogar junto!\nPC e Android: ${RELEASES}\niPhone (abra no Safari): ${SITE}`;
  return html`
    <div class="group-box">
      <b>Chamar os amigos</b>
      <p class="muted" style="margin:0">Eles baixam o app, criam a conta e te adicionam pelo seu usuário.</p>
      <div class="row">
        <button class="gbtn primary sm" onClick=${() => navigator.clipboard?.writeText(share).then(() => toast('Mensagem copiada.'))}><${Icon} n="copy" s=${14} /> Copiar convite</button>
        <a class="gbtn sm" href=${RELEASES} target="_blank" rel="noopener"><${Icon} n="download" s=${14} /> Página de downloads</a>
        <button class="gbtn sm" onClick=${() => openModal('install')}><${Icon} n="share" s=${14} /> Instalar no celular</button>
      </div>
    </div>
    `;
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
      <div class="mob-title" style="padding:6px 4px 0"><h1>Você</h1></div>
      <${ProfileCard} u=${me} status=${me.chosenStatus === 'invisible' ? 'offline' : me.chosenStatus}>
        <button class="gbtn sm primary" onClick=${() => openModal('settings', { tab: 'account' })}><${Icon} n="edit" s=${14} /> Editar perfil</button>
        <button class="gbtn sm" onClick=${statusMenu}>Alterar status</button>
      <//>
      <div class="me-list material">
        ${TABS.map((t) => html`<button key=${t.key} class="me-item" onClick=${() => openModal('settings', { tab: t.key })}><${Icon} n=${t.icon} s=${19} /><span>${t.label}</span><${Icon} n="right" s=${16} /></button>`)}
      </div>
    </div>`;
}

/** quanto o app está gastando agora, por parte (para descobrir o que pesa num PC) */
function PerfPanel() {
  const [m, setM] = useState(null);
  useEffect(() => {
    let on = true;
    const tick = () => window.perfumolandiaDesktop.metrics().then((x) => on && setM(x)).catch(() => {});
    tick();
    const t = setInterval(tick, 2000);
    return () => { on = false; clearInterval(t); };
  }, []);
  if (!m) return null;
  const NAMES = { Browser: 'Principal', Tab: 'Tela do app', GPU: 'Vídeo (GPU)', Utility: 'Serviços', 'Pepper Plugin': 'Plugin', Unknown: 'Outros' };
  const total = m.list.reduce((a, p) => a + p.cpu, 0);
  return html`
    <div class="perf-box">
      <div class="perf-head"><b>Uso agora</b><span class=${total > 5 ? 'warn' : 'ok'}>${total.toFixed(1)}% da CPU</span></div>
      ${m.list.filter((p) => p.cpu >= 0.05).map((p) => html`<div class="perf-row" key=${p.pid}><span>${NAMES[p.type] || p.type}${p.name ? ' · ' + p.name : ''}</span><b>${p.cpu.toFixed(1)}%</b></div>`)}
      <small class="muted">${m.cores} núcleos · aceleração de vídeo ${m.gpu ? 'ligada' : 'DESLIGADA'}${document.documentElement.classList.contains('idle') ? ' · modo leve ativo' : ''}</small>
    </div>`;
}
