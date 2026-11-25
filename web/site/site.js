// Site da Perfumolandia: apresentação + downloads (PC, iPhone, Android).
import './site.css';
import logo from '../src/logo.png';
import { DOWNLOAD_BASE } from '../src/config.js';

const WIN_URL = DOWNLOAD_BASE + 'Perfumolandia-Setup.exe';
const APK_URL = DOWNLOAD_BASE + 'Perfumolandia.apk';
const APP = './app/';

const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const isSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
const device = isIOS ? 'ios' : isAndroid ? 'android' : 'pc';

// ---------- ícones ----------
const I = {
  windows: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 1h10.5v10.5H1zM12.5 1H23v10.5H12.5zM1 12.5h10.5V23H1zM12.5 12.5H23V23H12.5z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.37 12.53c-.03-2.68 2.19-3.97 2.29-4.03-1.25-1.82-3.19-2.07-3.88-2.1-1.65-.17-3.22.97-4.06.97-.84 0-2.13-.95-3.5-.92-1.8.03-3.46 1.05-4.39 2.66-1.87 3.25-.48 8.06 1.34 10.69.89 1.29 1.95 2.73 3.34 2.68 1.34-.05 1.85-.87 3.47-.87s2.08.87 3.5.84c1.45-.03 2.36-1.31 3.24-2.6 1.02-1.49 1.44-2.94 1.47-3.01-.03-.01-2.82-1.08-2.85-4.29zM13.7 4.67c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.71-3.12 1.6-.69.79-1.29 2.06-1.13 3.27 1.19.09 2.41-.6 3.15-1.49z"/></svg>',
  android: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18a.37.37 0 0 0-.64-.37l-1.86 3.22a11.4 11.4 0 0 0-9.88 0L5.2 5.93a.37.37 0 0 0-.64.37L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>',
  plusSquare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2.5"/></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2.5"/><path d="M8 21h8M12 17v4"/><path d="m9 10 3-3 3 3M12 7v6"/></svg>',
  hangup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><g transform="rotate(135 12 12)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></g></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>',
  vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
};

const STARS = Array.from({ length: 80 }, () => {
  const r = (n) => Math.round(Math.random() * n);
  return `radial-gradient(${(1 + Math.random() * 1.3).toFixed(1)}px ${(1 + Math.random() * 1.3).toFixed(1)}px at ${r(100)}% ${r(100)}%, rgba(255,255,255,${(0.3 + Math.random() * 0.6).toFixed(2)}), transparent)`;
}).join(',');
const sky = () => `<div class="sky" style="background-image:${STARS}" aria-hidden="true">
  ${Array.from({ length: 14 }, () => `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${4 + Math.random() * 6}px;height:${4 + Math.random() * 6}px;animation-delay:-${(Math.random() * 4).toFixed(1)}s;background:${Math.random() > 0.5 ? '#b39dff' : '#8fb8ff'}"></i>`).join('')}
</div>`;

const av = (c, l) => `<span class="m-av" style="--c:${c}">${l}</span>`;

// ---------- páginas ----------
const nav = () => `
  <header class="nav-wrap">
    <nav class="nav lg">
      <a class="brand" href="#/"><img src="${logo}" alt=""><b>Perfumolandia</b></a>
      <div class="nav-links">
        <a href="#/baixar">Baixar</a>
        <a href="#/#recursos">Recursos</a>
        <a href="#/baixar/ios">iPhone</a>
      </div>
      <a class="btn white sm" href="${APP}">Entrar</a>
    </nav>
  </header>`;

const footer = () => `
  <footer class="foot">
    <div class="foot-in">
      <div class="foot-brand"><img src="${logo}" alt=""><b>Perfumolandia</b><p>O lugar da sua turma.</p></div>
      <div class="foot-cols">
        <div><h4>Produto</h4><a href="#/baixar">Baixar</a><a href="${APP}">Abrir no navegador</a><a href="#/#recursos">Recursos</a></div>
        <div><h4>Aparelhos</h4><a href="#/baixar/pc">Windows</a><a href="#/baixar/ios">iPhone</a><a href="#/baixar/android">Android</a></div>
      </div>
    </div>
    <div class="foot-bottom"><span>© ${new Date().getFullYear()} Perfumolandia</span><a class="btn white sm" href="${APP}">Entrar</a></div>
  </footer>`;

function home() {
  return `
  <section class="hero">
    ${sky()}
    <span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>
    <div class="hero-in">
      <h1>A resenha que<br>nunca acaba</h1>
      <p>A Perfumolandia é o lugar da sua turma: conversa, grupos, chamadas de voz e vídeo e tela compartilhada em até <b>4K</b>. Leve, bonita e feita para jogar junto.</p>
      <div class="hero-cta">
        ${device === 'pc'
          ? `<a class="btn white lgb" href="#/baixar/pc"><span class="ic">${I.windows}</span>Baixar para Windows</a>`
          : device === 'ios'
            ? `<a class="btn white lgb" href="#/baixar/ios"><span class="ic">${I.apple}</span>Instalar no iPhone</a>`
            : `<a class="btn white lgb" href="#/baixar/android"><span class="ic">${I.android}</span>Baixar para Android</a>`}
        <a class="btn glass lgb lg" href="${APP}"><span class="ic">${I.globe}</span>Abrir no navegador</a>
      </div>
      <a class="hero-more" href="#/baixar">Ver todas as opções de download</a>
    </div>
    <div class="hero-art">${mockWindow()}</div>
  </section>

  <main id="recursos" class="features">
    ${feature('Chamadas que não pesam no jogo',
      'Voz limpinha com supressão de ruído, câmera e tela compartilhada em até 4K 60 fps codificada pela placa de vídeo. O aperte-para-falar funciona mesmo com o jogo em primeiro plano.',
      mockCall(), false)}
    ${feature('Grupos e servidores do seu jeito',
      'Crie um grupo em segundos para chamar a galera, ou monte um servidor com canais de texto e de voz para cada assunto. Convite por código e pronto.',
      mockServer(), true)}
    ${feature('Seu perfil, sua cara',
      'Foto e banner animados, cores da capa em degradê, pronomes, status e uma bio para contar quem você é.',
      mockProfile(), false)}
    ${feature('Vidro líquido, claro ou escuro',
      'Visual inspirado no iOS 26, com vidro de verdade nas barras e botões. Quer o máximo de FPS? Liga o modo desempenho.',
      mockGlass(), true)}
  </main>

  <section class="cta">
    ${sky()}
    <h2>Pronto pra resenha?</h2>
    <a class="btn white lgb" href="#/baixar"><span class="ic">${I.windows}</span>Baixar a Perfumolandia</a>
  </section>
  ${footer()}`;
}

const feature = (title, text, art, flip) => `
  <section class="feat${flip ? ' flip' : ''}">
    <div class="feat-art">${art}</div>
    <div class="feat-text"><h2>${title}</h2><p>${text}</p></div>
  </section>`;

// ---------- ilustrações (HTML/CSS, sem imagens) ----------
function mockWindow() {
  return `<div class="mock-win">
    <div class="mw-rail">${av('#5e5ce6', '🫧')}${av('#ff375f', 'J')}${av('#30d158', 'R')}${av('#ff9f0a', 'S')}</div>
    <div class="mw-side">
      <b class="mw-title">Turma do fim de semana</b>
      <span class="mw-ch">${I.hash} geral</span><span class="mw-ch on">${I.hash} clipes</span>
      <span class="mw-sec">Voz</span><span class="mw-ch">${I.vol} Jogando</span>
      <span class="mw-user">${av('#bf5af2', 'L')} Lia</span><span class="mw-user speak">${av('#0a84ff', 'T')} Theo</span>
    </div>
    <div class="mw-chat">
      <div class="mw-top lg"># clipes</div>
      <div class="mw-msg">${av('#ff375f', 'J')}<div><b style="color:#ff6482">Ju</b><p>olha esse clutch 🔥</p><div class="mw-img"></div></div></div>
      <div class="mw-msg">${av('#30d158', 'R')}<div><b style="color:#5de07b">Rafa</b><p>bora de novo hoje às 21h?</p><span class="mw-react">👍 3</span></div></div>
      <div class="mw-comp lg">Conversar em #clipes</div>
    </div>
  </div>`;
}
function mockCall() {
  return `<div class="mock-call">
    <div class="mc-screen"><span class="mc-live">AO VIVO</span><span class="mc-res">3840×2160 · 60 fps</span></div>
    <div class="mc-people">${av('#0a84ff', 'T')}${av('#ff375f', 'J')}${av('#30d158', 'R')}</div>
    <div class="mc-ctl lg"><span>${I.mic}</span><span>${I.video}</span><span class="on">${I.screen}</span><span class="red">${I.hangup}</span></div>
  </div>`;
}
function mockServer() {
  return `<div class="mock-server">
    <div class="ms-col lg">
      <b>Servidores</b>
      ${['Turma do fim de semana', 'Valorant 5x5', 'Estudos'].map((n, i) => `<span class="ms-row${i === 0 ? ' on' : ''}">${av(['#5e5ce6', '#ff375f', '#30d158'][i], n[0])}${n}</span>`).join('')}
    </div>
    <div class="ms-col lg">
      <b>Grupos</b>
      <span class="ms-row">${av('#ff9f0a', 'S')}Sofia, Ju, Rafa</span>
      <span class="ms-row">${av('#bf5af2', 'L')}Lia e Theo</span>
      <span class="ms-new">+ Novo grupo</span>
    </div>
  </div>`;
}
function mockProfile() {
  return `<div class="mock-profile">
    <div class="mp-banner"></div>
    <span class="mp-av">${av('#bf5af2', 'L')}<i></i></span>
    <div class="mp-body"><b>Lia</b><small>@lia · ela/dela</small><p>jogando Valorant 🎮</p>
      <span class="mp-sec">Sobre mim</span><p class="mp-bio">Suporte nas horas vagas, DJ da call nas outras.</p></div>
  </div>`;
}
function mockGlass() {
  return `<div class="mock-glass">
    <div class="mg-bg"></div>
    <div class="mg-bar lg"><span class="mg-lens"></span>
      <span class="mg-tab on">⌂<small>Início</small></span><span class="mg-tab">💬<small>Conversas</small></span><span class="mg-tab">👥<small>Amigos</small></span><span class="mg-tab">${av('#bf5af2', 'L')}<small>Você</small></span>
    </div>
  </div>`;
}

// ---------- downloads ----------
function downloads() {
  const card = (key, icon, title, text, href) => `
    <a class="dl-card lg${device === key ? ' rec' : ''}" href="${href}">
      ${device === key ? '<span class="dl-rec">Recomendado para você</span>' : ''}
      <span class="dl-ic">${icon}</span>
      <b>${title}</b><p>${text}</p>
      <span class="btn white sm">Escolher</span>
    </a>`;
  return `
  <section class="page">
    ${sky()}
    <div class="page-in">
      <a class="back" href="#/">${I.back} Voltar</a>
      <h1>Baixe a Perfumolandia</h1>
      <p class="lead">Escolha o seu aparelho.</p>
      <div class="dl-grid">
        ${card('pc', I.windows, 'Windows', 'Instalador para Windows 10 e 11. Atualiza sozinho.', '#/baixar/pc')}
        ${card('ios', I.apple, 'iPhone', 'Instale pelo Safari em menos de 1 minuto.', '#/baixar/ios')}
        ${card('android', I.android, 'Android', 'App para Android (APK) ou direto pelo Chrome.', '#/baixar/android')}
      </div>
      <a class="alt-link" href="${APP}">${I.globe} Prefere sem instalar? Abra no navegador</a>
    </div>
  </section>`;
}

function pc() {
  setTimeout(() => { if (location.hash === '#/baixar/pc') location.href = WIN_URL; }, 900);
  return `
  <section class="page">
    ${sky()}
    <div class="page-in narrow">
      <a class="back" href="#/baixar">${I.back} Voltar</a>
      <div class="big-ic win">${I.windows}</div>
      <h1>Seu download começou</h1>
      <p class="lead">Baixando <b>Perfumolandia-Setup.exe</b>. Não começou? <a href="${WIN_URL}">Clique aqui</a>.</p>
      <ol class="steps lg">
        <li><span class="n">1</span><div><b>Abra o arquivo baixado</b><p>Ele aparece na barra de downloads do navegador.</p></div></li>
        <li><span class="n">2</span><div><b>Se o Windows avisar "O Windows protegeu o computador"</b><p>Clique em <b>Mais informações</b> e depois em <b>Executar assim mesmo</b>. O aviso aparece porque o app não tem assinatura paga da Microsoft.</p></div></li>
        <li><span class="n">3</span><div><b>Pronto!</b><p>A Perfumolandia abre sozinha, inicia junto com o Windows e se atualiza automaticamente quando sair versão nova.</p></div></li>
      </ol>
      <a class="btn white lgb" href="${WIN_URL}"><span class="ic">${I.windows}</span>Baixar de novo</a>
    </div>
  </section>`;
}

function ios() {
  const appAbs = new URL(APP, location.href).href;
  return `
  <section class="page">
    ${sky()}
    <div class="page-in narrow">
      <a class="back" href="#/baixar">${I.back} Voltar</a>
      <div class="big-ic">${I.apple}</div>
      <h1>Instalar no iPhone</h1>
      <p class="lead">A Perfumolandia vira um app na sua Tela de Início, abre em tela cheia e vai direto para o login.</p>
      ${!isIOS ? `<div class="note lg">Abra esta página no iPhone, pelo <b>Safari</b>: <code>${appAbs}</code></div>` : !isSafari ? `<div class="note lg warn">Você está em outro navegador. O iPhone só instala apps assim pelo <b>Safari</b>. <button class="btn glass sm" id="copy-link">Copiar link</button></div>` : ''}
      <ol class="steps lg">
        <li><span class="n">1</span><div><b>Abra o app no Safari</b><p>Toque no botão abaixo. Ele abre a tela de login da Perfumolandia.</p>
          <a class="btn white sm" href="${APP}">Abrir a Perfumolandia</a></div></li>
        <li><span class="n">2</span><div><b>Toque em Compartilhar</b><p>É o quadrado com a seta para cima, na barra do Safari (embaixo ou em cima, conforme o seu iPhone).</p>
          <div class="ill safari"><span>‹</span><span>›</span><span class="hl">${I.share}</span><span>▢</span><span>⧉</span></div></div></li>
        <li><span class="n">3</span><div><b>Toque em "Adicionar à Tela de Início"</b><p>Se não aparecer, role a lista para baixo.</p>
          <div class="ill menu"><span>Copiar</span><span>Adicionar aos Favoritos</span><span class="hl">Adicionar à Tela de Início <i>${I.plusSquare}</i></span><span>Imprimir</span></div></div></li>
        <li><span class="n">4</span><div><b>Toque em "Adicionar"</b><p>O ícone da Perfumolandia aparece na Tela de Início. Abra sempre por ele.</p>
          <div class="ill home"><span class="app"><img src="${logo}" alt=""></span><small>Perfumolandia</small></div></div></li>
      </ol>
    </div>
  </section>`;
}

function android() {
  return `
  <section class="page">
    ${sky()}
    <div class="page-in narrow">
      <a class="back" href="#/baixar">${I.back} Voltar</a>
      <div class="big-ic and">${I.android}</div>
      <h1>Instalar no Android</h1>
      <p class="lead">O app para Android também transmite a tela do celular.</p>
      <a class="btn white lgb" href="${APK_URL}"><span class="ic">${I.android}</span>Baixar o APK</a>
      <ol class="steps lg">
        <li><span class="n">1</span><div><b>Abra o arquivo Perfumolandia.apk</b><p>Ele fica nos downloads do Chrome.</p></div></li>
        <li><span class="n">2</span><div><b>Permita a instalação</b><p>Se o Android pedir, toque em <b>Configurações</b> e ative <b>Permitir desta fonte</b>.</p></div></li>
        <li><span class="n">3</span><div><b>Toque em Instalar</b><p>Pronto, é só abrir e entrar.</p></div></li>
      </ol>
      <p class="lead small">Prefere não instalar APK? Abra <a href="${APP}">o app no Chrome</a>, toque no menu <b>⋮</b> e em <b>Instalar app</b>.</p>
    </div>
  </section>`;
}

// convite de servidor: perfumolandia.../#/convite/K7Q2XA
function invite(code) {
  const web = `${APP}index.html?convite=${code}`;
  const isWin = /Windows/.test(navigator.userAgent);
  return `
  <section class="page">
    ${sky()}
    <div class="page-in narrow">
      <div class="big-ic"><img src="${logo}" alt="" style="width:72px;height:72px;object-fit:contain"></div>
      <h1>Você foi convidado!</h1>
      <p class="lead">Um amigo te chamou para o servidor dele na Perfumolandia.<br>Código do convite: <b>${code}</b></p>
      <div class="row-btns">
        ${isWin ? `<a class="btn white lgb" href="perfumolandia://convite/${code}"><span class="ic">${I.windows}</span>Abrir no app do PC</a>` : ''}
        <a class="btn ${isWin ? 'glass' : 'white'} lgb" href="${web}">Entrar pelo navegador</a>
      </div>
      <p class="lead small">Ainda não tem o app? <a href="#/baixar">Baixe aqui</a>. Dentro do app, também dá para entrar em <b>+ → Tenho um convite</b> com o código <b>${code}</b>.</p>
    </div>
  </section>`;
}

// ---------- roteador ----------
const root = document.getElementById('site');
function render() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, anchor] = h.split('#');
  const inv = /^\/convite\/([A-Za-z0-9]{4,12})$/.exec(path);
  const page = inv ? () => invite(inv[1].toUpperCase()) : { '/': home, '/baixar': downloads, '/baixar/pc': pc, '/baixar/ios': ios, '/baixar/android': android }[path] || home;
  root.innerHTML = nav() + page();
  document.documentElement.dataset.page = path === '/' ? 'home' : 'page';
  if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
  else window.scrollTo({ top: 0 });
  root.querySelector('#copy-link')?.addEventListener('click', (e) => {
    navigator.clipboard?.writeText(new URL(APP, location.href).href).then(() => { e.target.textContent = 'Link copiado!'; });
  });
}
addEventListener('hashchange', render);
render();

// barra de navegação ganha vidro mais forte ao rolar
addEventListener('scroll', () => document.documentElement.classList.toggle('scrolled', scrollY > 20), { passive: true });
