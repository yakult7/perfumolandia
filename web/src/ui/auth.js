import { html, useState } from '../lib.js';
import { useS } from '../store.js';
import * as api from '../api.js';
import logo from '../logo.png';

export function Auth() {
  const needsProfile = useS((s) => s.needsProfile);
  const [mode, setMode] = useState(needsProfile ? 'register' : 'login');
  const [f, setF] = useState({ username: '', password: '', displayName: '', code: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await api.login(f);
      else await api.register(f);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div class="auth">
      <div class="auth-card pop">
        <div class="auth-logo"><img src=${logo} alt="" /></div>
        <h1>Perfumolandia</h1>
        <p class="muted">${mode === 'login' ? 'Bem-vindo de volta. Bora pra resenha.' : 'Crie sua conta com o código que seu amigo te passou.'}</p>
        <div class="seg glass">
          <button type="button" class=${mode === 'login' ? 'on' : ''} onClick=${() => setMode('login')}>Entrar</button>
          <button type="button" class=${mode === 'register' ? 'on' : ''} onClick=${() => setMode('register')}>Criar conta</button>
        </div>
        <form onSubmit=${submit} class="auth-form">
          <label class="field"><span class="field-label">Usuário</span>
            <input autocomplete="username" autocapitalize="none" spellcheck="false" value=${f.username} onInput=${up('username')} placeholder="ex.: arthur" required /></label>
          ${mode === 'register' ? html`
            <label class="field"><span class="field-label">Nome de exibição</span>
              <input value=${f.displayName} onInput=${up('displayName')} placeholder="Como os amigos te veem" maxlength="32" /></label>` : null}
          <label class="field"><span class="field-label">Senha</span>
            <input type="password" autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} value=${f.password} onInput=${up('password')} required minlength="6" /></label>
          ${mode === 'register' ? html`
            <label class="field"><span class="field-label">Código de convite</span>
              <input value=${f.code} onInput=${up('code')} placeholder="8 caracteres" autocapitalize="characters" required /></label>` : null}
          ${err ? html`<div class="form-err">${err}</div>` : null}
          <button class="gbtn primary wide" disabled=${busy}>${busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
      </div>
    </div>`;
}
