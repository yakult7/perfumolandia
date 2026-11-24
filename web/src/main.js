import './app.css';
import { html, render } from './lib.js';
import { useS, S } from './store.js';
import * as api from './api.js';
import { Auth } from './ui/auth.js';
import { Shell } from './ui/shell.js';
import { Spinner } from './ui/common.js';
import { isNativeApp } from './native.js';
import { applyTheme } from './theme.js';
import './glass.js';
import logo from './logo.png';

function App() {
  const booting = useS((s) => s.booting);
  const authed = useS((s) => s.authed && s.ready);
  document.documentElement.classList.toggle('on-auth', !booting && !authed);
  if (booting) return html`<div class="splash"><img src=${logo} alt="" /><${Spinner} s=${26} /></div>`;
  return authed ? html`<${Shell} />` : html`<${Auth} />`;
}

applyTheme();
document.documentElement.classList.toggle('native', isNativeApp);
if (window.perfumolandiaDesktop) {
  document.documentElement.classList.add('desktop-app');
  window.perfumolandiaDesktop.setPttKey(S.settings.pttKey);
}
render(html`<${App} />`, document.getElementById('app'));
// acesso para diagnóstico pelo console (F12)
Promise.all([import('./rtc.js'), import('./actions.js'), import('./store.js'), import('./media.js')]).then(([rtc, actions, store, media]) => { window.__p = { api, rtc, S, actions, store, media }; });
api.start().catch((e) => {
  console.error(e);
  import('./store.js').then(({ set }) => set((s) => { s.booting = false; }));
});

// pausa a animação do fundo quando o app não está visível (economiza GPU jogando)
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('hidden-tab', document.hidden));

// PWA: service worker (não no app nativo / Electron)
if ('serviceWorker' in navigator && !isNativeApp && !window.perfumolandiaDesktop && location.protocol === 'https:') {
  navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && e.data.url) location.href = e.data.url;
  });
}
