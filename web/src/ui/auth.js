import { html, useState } from '../lib.js';
import * as api from '../api.js';
import { PasswordInput } from './common.js';
import logo from '../logo.png';

export function Auth() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ username: '', password: '', displayName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isNew = mode === 'register';

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
    <div class="auth">
      <div class="auth-card lg pop">
        <div class="auth-brand">
          <img class="auth-logo" src=${logo} alt="" />
          <h1>Perfumolandia</h1>
          <p>${isNew ? 'Crie sua conta e chame a turma.' : 'Que bom te ver de novo.'}</p>
        </div>
        <div class="seg" role="tablist">
          <button type="button" class=${!isNew ? 'on' : ''} onClick=${() => { setMode('login'); setErr(''); }}>Entrar</button>
          <button type="button" class=${isNew ? 'on' : ''} onClick=${() => { setMode('register'); setErr(''); }}>Criar conta</button>
        </div>
        <form onSubmit=${submit} class="auth-form">
          <label class="field"><span class="field-label">Usuário</span>
            <input autocomplete="username" autocapitalize="none" spellcheck="false" value=${f.username} onInput=${up('username')} placeholder="seu_usuario" required /></label>
          ${isNew ? html`
            <label class="field"><span class="field-label">Nome de exibição</span>
              <input value=${f.displayName} onInput=${up('displayName')} placeholder="Como os amigos te veem" maxlength="32" /></label>` : null}
          <label class="field"><span class="field-label">Senha</span>
            <${PasswordInput} value=${f.password} onInput=${up('password')} autocomplete=${isNew ? 'new-password' : 'current-password'}
              placeholder=${isNew ? 'Mínimo de 6 caracteres' : ''} required minlength="6" /></label>
          ${err ? html`<div class="form-err">${err}</div>` : null}
          <button class="gbtn primary wide" disabled=${busy}>${busy ? 'Aguarde…' : isNew ? 'Criar conta' : 'Entrar'}</button>
        </form>
        <div class="auth-foot">${isNew ? 'Usuário: letras minúsculas, números, _ ou . (3 a 20)' : 'Chat, chamadas e tela em 4K com a turma.'}</div>
      </div>
    </div>`;
}
