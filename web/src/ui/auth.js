import { html, useState, useMemo, isStandalone, isElectron } from '../lib.js';
import * as api from '../api.js';
import { PasswordInput } from './common.js';
import { Icon } from '../icons.js';
import { qrSvg } from '../qr.js';
import { SITE_URL } from '../config.js';
import { isNativeApp } from '../native.js';
import logo from '../logo.png';

// céu estrelado gerado uma vez (estrelas redondas + "pixels" quadrados que piscam)
const STARS = (() => {
  const r = (n) => Math.round(Math.random() * n);
  const dots = Array.from({ length: 70 }, () => `radial-gradient(${1 + Math.random() * 1.4}px ${1 + Math.random() * 1.4}px at ${r(100)}% ${r(100)}%, rgba(255,255,255,${(0.35 + Math.random() * 0.55).toFixed(2)}), transparent)`);
  return dots.join(',');
})();
const PIXELS = Array.from({ length: 16 }, () => ({
  x: Math.random() * 100, y: Math.random() * 100, s: 4 + Math.random() * 6, d: (Math.random() * 4).toFixed(2), c: Math.random() > 0.5 ? '#a78bfa' : '#93c5fd',
}));

export function Auth() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ username: '', password: '', displayName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isNew = mode === 'register';
  const qr = useMemo(() => qrSvg(SITE_URL + '#/baixar'), []);
  // "Voltar" para o site só no navegador (no app instalado vai direto para o login)
  const canGoBack = !isStandalone && !isElectron && !isNativeApp;
  const switchTo = (m) => { setMode(m); setErr(''); };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (isNew) await api.register(f);
      else await api.login(f);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div class="auth force-dark">
      <div class="auth-sky" style=${`background-image:${STARS}`} aria-hidden="true">
        ${PIXELS.map((p, i) => html`<i key=${i} style=${`left:${p.x}%;top:${p.y}%;width:${p.s}px;height:${p.s}px;background:${p.c};animation-delay:-${p.d}s`}></i>`)}
        <span class="auth-orb o1"></span><span class="auth-orb o2"></span><span class="auth-orb o3"></span>
      </div>
      ${canGoBack ? html`<a class="auth-top-brand" href="../"><img src=${logo} alt="" /><b>Perfumolandia</b></a>`
        : html`<div class="auth-top-brand"><img src=${logo} alt="" /><b>Perfumolandia</b></div>`}

      <div class=${'auth-card lg pop' + (isNew ? ' single' : '')}>
        <div class="auth-main">
          ${canGoBack ? html`<a class="gbtn sm auth-back" href="../"><${Icon} n="back" s=${15} /> Voltar</a>` : null}
          <div class="auth-head">
            <h1>${isNew ? 'Criar uma conta' : 'Boas-vindas de volta!'}</h1>
            <p>${isNew ? 'Escolha seu usuário e chame a turma.' : 'Que bom te ver de novo por aqui!'}</p>
          </div>
          <form onSubmit=${submit} class="auth-form">
            <label class="field"><span class="field-label">Usuário <i class="req">*</i></span>
              <input autocomplete="username" autocapitalize="none" spellcheck="false" value=${f.username} onInput=${up('username')} required autofocus /></label>
            ${isNew ? html`
              <label class="field"><span class="field-label">Nome de exibição</span>
                <input value=${f.displayName} onInput=${up('displayName')} maxlength="32" placeholder="Como os amigos te veem" /></label>` : null}
            <label class="field"><span class="field-label">Senha <i class="req">*</i></span>
              <${PasswordInput} value=${f.password} onInput=${up('password')} autocomplete=${isNew ? 'new-password' : 'current-password'} required minlength="6" /></label>
            ${isNew ? html`<small class="field-hint">Usuário: letras minúsculas, números, _ ou . (3 a 20). Senha: mínimo de 6 caracteres.</small>` : null}
            ${err ? html`<div class="form-err">${err}</div>` : null}
            <button class="gbtn primary wide auth-submit" disabled=${busy}>${busy ? 'Aguarde…' : isNew ? 'Continuar' : 'Entrar'}</button>
            <p class="auth-switch">
              ${isNew ? html`Já tem uma conta? <button type="button" onClick=${() => switchTo('login')}>Entrar</button>`
                : html`Precisando de uma conta? <button type="button" onClick=${() => switchTo('register')}>Registre-se</button>`}
            </p>
          </form>
        </div>
        ${!isNew ? html`
          <div class="auth-qr">
            <div class="qr-box"><span dangerouslySetInnerHTML=${{ __html: qr }}></span><img class="qr-logo" src=${logo} alt="" /></div>
            <h2>Leve no celular</h2>
            <p>Escaneie com a câmera do celular para instalar a <b>Perfumolandia</b> no iPhone ou Android.</p>
          </div>` : null}
      </div>
    </div>`;
}
