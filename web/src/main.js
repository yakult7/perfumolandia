import './app.css';
import './shop.css';
import { html, render } from './lib.js';
import { useS, S, subscribe } from './store.js';
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
// janela sem foco (jogando) ou escondida: pausa toda animação e tira a refração do vidro -> CPU perto de zero
const setIdle = () => document.documentElement.classList.toggle('idle', document.hidden || !document.hasFocus());
addEventListener('focus', setIdle);
addEventListener('blur', setIdle);
document.addEventListener('visibilitychange', setIdle);
setIdle();
import('./decoart.js').then((m) => m.installDecoDefs());
import('./nameplates.js').then((m) => m.installNameplates());
document.documentElement.classList.toggle('native', isNativeApp);
if (window.perfumolandiaDesktop) {
  document.documentElement.classList.add('desktop-app');
  window.perfumolandiaDesktop.setPttKey(S.settings.pttKey);
  window.perfumolandiaDesktop.onGame?.((g) => api.setMyGame(g));
  window.perfumolandiaDesktop.getGame?.().then((g) => g && api.setMyGame(g));
  window.perfumolandiaDesktop.onMusic?.((m) => api.setMyMusic(m));
  window.perfumolandiaDesktop.getMusic?.().then((m) => m && api.setMyMusic(m));
}
render(html`<${App} />`, document.getElementById('app'));
// convite por link: ?convite=CODIGO (navegador/celular) ou perfumolandia://convite/CODIGO (app do PC)
import('./actions.js').then(({ queueInvite, tryPendingInvite }) => {
  const inv = new URLSearchParams(location.search).get('convite');
  if (inv) { history.replaceState(null, '', location.pathname); queueInvite(inv); }
  window.perfumolandiaDesktop?.onInvite?.((c) => queueInvite(c));
  window.perfumolandiaDesktop?.getInvite?.().then((c) => c && queueInvite(c));
  subscribe(tryPendingInvite);
});
// acesso para diagnóstico pelo console (F12)
Promise.all([import('./rtc.js'), import('./actions.js'), import('./store.js'), import('./media.js'), import('./remote.js')]).then(([rtc, actions, store, media, remote]) => { window.__p = { api, rtc, S, actions, store, media, remote }; });
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
