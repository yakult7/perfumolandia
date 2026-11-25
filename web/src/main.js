import './app.css';
import './shop.css';
import './settings.css';
import { html, render } from './lib.js';
import { useS, S, subscribe, setSettings } from './store.js';
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
// PC fraco: 4 núcleos ou menos, ou sem aceleração de vídeo
const weakPC = () => (navigator.hardwareConcurrency || 8) <= 4 || document.documentElement.classList.contains('nogpu');
let frozen = false;
let wasIdle = false;
/** modo leve: pausa só animações que repetem para sempre (brilhos, estrelas, discos...).
 *  Animações de abrir/fechar (que acabam sozinhas) nunca são tocadas. Repassa a cada 4 s para pegar as novas. */
const sweepAnimations = () => {
  for (const a of document.getAnimations()) {
    if (a.effect?.getTiming?.().iterations !== Infinity) continue;
    if (a.effect?.target?.closest?.('.otp')) continue; // animação do código por email roda sempre
    if (wasIdle && a.playState === 'running') { a.pause(); a.__leve = true; }
    else if (!wasIdle && a.__leve) { a.play(); a.__leve = false; }
  }
};
setInterval(() => { if (wasIdle) sweepAnimations(); }, 4000);
const setIdle = () => {
  // leve = janela sem foco/escondida, jogo aberto (mesmo com o app num 2º monitor), PC fraco ou modo desempenho ligado
  const idle = document.hidden || !document.hasFocus() || !!S.myGame || weakPC() || !!S.settings.perfMode;
  document.documentElement.classList.toggle('idle', idle);
  if (idle !== wasIdle) { wasIdle = idle; sweepAnimations(); }
  // GIFs e vídeos do chat: param só quando você não está olhando (sem foco/escondido) ou com um jogo aberto
  const freeze = document.hidden || !document.hasFocus() || !!S.myGame;
  if (freeze === frozen) return;
  frozen = freeze;
  for (const v of document.querySelectorAll('.link-media, .embed video, .gif-item video')) if (v.tagName === 'VIDEO') { if (freeze) v.pause(); else v.play().catch(() => {}); }
  for (const img of document.querySelectorAll('.link-media img, .att-img img, .gif-item img')) {
    if (freeze) {
      if (!img.complete || !img.naturalWidth || img.dataset.live) continue;
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        img.dataset.live = img.src;
        img.src = c.toDataURL('image/webp', 0.8);
      } catch {}
    } else if (img.dataset.live) { img.src = img.dataset.live; delete img.dataset.live; }
  }
};
addEventListener('focus', setIdle);
addEventListener('blur', setIdle);
document.addEventListener('visibilitychange', setIdle);
setIdle();
subscribe(setIdle);

// contador no ícone da barra de tarefas: conversas/grupos não lidos + pedidos de amizade recebidos
if (window.perfumolandiaDesktop?.setBadge) {
  let lastBadge = -1;
  const badgeImg = (n) => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#f23f43';
    g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = `bold ${n > 9 ? 17 : 21}px Segoe UI, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n > 9 ? '9+' : String(n), 16, 17);
    return c.toDataURL('image/png');
  };
  const updateBadge = () => {
    if (!S.ready) return;
    const unread = [...Object.keys(S.dms), ...Object.keys(S.groups)].filter((id) => S.lastIds[id] && S.readIds[id] !== S.lastIds[id] && S.view.channelId !== id && !S.settings.mutedUsers?.[S.dms[id]?.members?.find((m) => m !== S.uid)]).length;
    const pending = Object.values(S.relations).filter((r) => r.status === 'pending' && r.to === S.uid).length;
    const n = unread + pending;
    if (n === lastBadge) return;
    lastBadge = n;
    window.perfumolandiaDesktop.setBadge(n, n ? badgeImg(n) : '');
  };
  subscribe(updateBadge);
}
// a 1.10 trocava PCs de 4 núcleos para a supressão básica e o áudio piorou: volta todo mundo que foi trocado para a de IA
if (!localStorage.getItem('rs.noiseFix') ) {
  if (localStorage.getItem('rs.noiseChosen') && S.settings.noiseMode === 'basic') setSettings({ noiseMode: 'smart' });
  localStorage.removeItem('rs.noiseChosen');
  localStorage.setItem('rs.noiseFix', '1');
}
import('./decoart.js').then((m) => m.installDecoDefs());
import('./nameplates.js').then((m) => m.installNameplates());
document.documentElement.classList.toggle('native', isNativeApp);
if (window.perfumolandiaDesktop) {
  document.documentElement.classList.add('desktop-app');
  window.perfumolandiaDesktop.setPttKey(S.settings.pttKey);
  const upd = (v) => v && import('./store.js').then(({ setUI }) => setUI({ updateReady: v }));
  window.perfumolandiaDesktop.onUpdateReady?.(upd);
  window.perfumolandiaDesktop.updateReady?.().then(upd);
  window.perfumolandiaDesktop.gpuStatus?.().then((g) => {
    if (g && !/^enabled/.test(g.gpu_compositing || '')) { document.documentElement.classList.add('nogpu'); setIdle(); }
  });
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
