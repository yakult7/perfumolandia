import { html, useRef, useEffect, useState, cx } from '../lib.js';
import { useS, S } from '../store.js';
import { Icon } from '../icons.js';
import { Avatar } from './common.js';
import { acceptControl, declineControl, stopControl, sendInput, remoteStream } from '../remote.js';

/** tudo do acesso remoto que aparece por cima do app */
export function RemoteLayer() {
  const r = useS((s) => s.remote);
  const inc = useS((s) => s.rcIncoming);
  return html`
    ${inc ? html`<${RcIncoming} inc=${inc} />` : null}
    ${r?.role === 'viewer' && r.state === 'asking' ? html`<${Asking} r=${r} />` : null}
    ${r?.role === 'viewer' && r.state !== 'asking' ? html`<${RemoteView} r=${r} />` : null}
    ${r?.role === 'host' ? html`<${HostBanner} r=${r} />` : null}`;
}

function RcIncoming({ inc }) {
  const u = useS((s) => s.users[inc.from]);
  return html`
    <div class="rc-incoming lg pop" role="alertdialog">
      <${Avatar} id=${inc.from} size=${48} />
      <div class="rc-text">
        <b>${u?.displayName} quer controlar seu computador</b>
        <small>Ele vai ver sua tela principal e mexer no mouse e no teclado. Você pode encerrar a qualquer momento (Ctrl+Alt+F12).</small>
      </div>
      <div class="rc-btns">
        <button class="gbtn sm danger solid" onClick=${declineControl}>Recusar</button>
        <button class="gbtn sm ok" onClick=${acceptControl}>Permitir</button>
      </div>
    </div>`;
}

function Asking({ r }) {
  const u = useS((s) => s.users[r.peer]);
  return html`
    <div class="rc-incoming lg pop">
      <span class="spinner" style="--s:22px"></span>
      <div class="rc-text"><b>Pedindo acesso ao PC de ${u?.displayName}…</b><small>Ele precisa tocar em Permitir no app do Windows.</small></div>
      <button class="gbtn sm" onClick=${stopControl}>Cancelar</button>
    </div>`;
}

function HostBanner({ r }) {
  const u = useS((s) => s.users[r.peer]);
  return html`
    <div class="rc-banner">
      <${Icon} n="screen" s=${15} />
      <span><b>${u?.displayName}</b> ${r.state === 'live' ? 'está controlando seu computador' : 'está conectando ao seu computador…'}</span>
      <button onClick=${stopControl}>Encerrar <kbd>Ctrl+Alt+F12</kbd></button>
    </div>`;
}

/** tela do amigo: mouse e teclado vão para o PC dele */
function RemoteView({ r }) {
  const u = useS((s) => s.users[r.peer]);
  const vref = useRef();
  const wrap = useRef();
  const [full, setFull] = useState(false);
  const pressed = useRef(new Set());
  const pending = useRef(null);

  useEffect(() => { const v = vref.current; if (v && v.srcObject !== remoteStream()) v.srcObject = remoteStream(); }, [r.v, r.state]);
  // no app do PC: janela maximizada (sua barra de tarefas continua aí) e o teclado todo — Alt+Tab, tecla Windows —
  // vai para o PC do amigo enquanto esta janela estiver em foco; clicou na sua barra, volta a ser seu
  useEffect(() => {
    const d = window.perfumolandiaDesktop;
    if (!d?.rcViewer) return;
    d.onRcKey?.((k) => sendInput({ t: 'ks', scan: k.scan, ext: k.ext, down: k.down }));
    d.rcViewer(true);
    return () => { d.onRcKey?.(null); d.rcViewer(false); };
  }, []);

  // posição na imagem (o vídeo fica "contain": desconta as faixas pretas)
  const norm = (e) => {
    const v = vref.current;
    if (!v?.videoWidth) return null;
    const b = v.getBoundingClientRect();
    const k = Math.min(b.width / v.videoWidth, b.height / v.videoHeight);
    const w = v.videoWidth * k, h = v.videoHeight * k;
    const x = (e.clientX - b.left - (b.width - w) / 2) / w;
    const y = (e.clientY - b.top - (b.height - h) / 2) / h;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };
  const move = (e) => {
    const p = norm(e);
    if (!p) return;
    if (!pending.current) requestAnimationFrame(() => { if (pending.current) sendInput({ t: 'm', ...pending.current }); pending.current = null; });
    pending.current = p;
  };
  const btn = (b) => (b === 1 ? 1 : b === 2 ? 2 : 0);

  useEffect(() => {
    const kd = (e) => {
      if (!wrap.current?.matches(':focus-within, :hover') && !full) return;
      e.preventDefault();
      if (e.repeat && pressed.current.has(e.code)) { sendInput({ t: 'k', code: e.code, down: true }); return; }
      pressed.current.add(e.code);
      sendInput({ t: 'k', code: e.code, down: true });
    };
    const ku = (e) => {
      if (!pressed.current.has(e.code)) return;
      e.preventDefault();
      pressed.current.delete(e.code);
      sendInput({ t: 'k', code: e.code, down: false });
    };
    const blur = () => { for (const c of pressed.current) sendInput({ t: 'k', code: c, down: false }); pressed.current.clear(); };
    addEventListener('keydown', kd, true);
    addEventListener('keyup', ku, true);
    addEventListener('blur', blur);
    return () => { blur(); removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); removeEventListener('blur', blur); };
  }, [full]);

  const toggleFull = async () => {
    const d = window.perfumolandiaDesktop;
    if (document.fullscreenElement || full) { await document.exitFullscreen().catch(() => {}); navigator.keyboard?.unlock?.(); d?.setFullScreen?.(false); setFull(false); return; }
    if (d?.setFullScreen) await d.setFullScreen(true);
    await wrap.current.requestFullscreen().catch(() => {});
    navigator.keyboard?.lock?.().catch(() => {}); // em tela cheia, até Esc e atalhos vão para o PC do amigo
    setFull(true);
  };
  useEffect(() => { const f = () => !document.fullscreenElement && setFull(false); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);

  return html`
    <div class="rc-view" ref=${wrap} tabindex="0">
      <div class="rc-bar lg">
        <${Avatar} id=${r.peer} size=${22} />
        <span>PC de <b>${u?.displayName}</b>${r.state !== 'live' ? ' · conectando…' : ''}</span>
        <button class="gbtn sm icon-only" title=${full ? 'Sair da tela cheia' : 'Tela cheia (captura todas as teclas)'} onClick=${toggleFull}><${Icon} n=${full ? 'minimize' : 'maximize'} s=${15} /></button>
        <button class="gbtn sm danger solid" onClick=${stopControl}>Encerrar</button>
      </div>
      <video ref=${vref} class="rc-video" autoplay playsinline muted
        onPointerMove=${move}
        onPointerDown=${(e) => { e.preventDefault(); wrap.current.focus(); const p = norm(e); if (p) sendInput({ t: 'm', ...p }); sendInput({ t: 'd', b: btn(e.button) }); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerUp=${(e) => { e.preventDefault(); sendInput({ t: 'u', b: btn(e.button) }); }}
        onContextMenu=${(e) => e.preventDefault()}
        onWheel=${(e) => { e.preventDefault(); const f = e.deltaMode === 1 ? 40 : 1; if (e.deltaY) sendInput({ t: 'w', d: -e.deltaY * f * 1.2 }); if (e.deltaX) sendInput({ t: 'h', d: e.deltaX * f * 1.2 }); }}></video>
      ${r.state !== 'live' ? html`<div class="rc-wait"><span class="spinner" style="--s:28px"></span></div>` : null}
    </div>`;
}
