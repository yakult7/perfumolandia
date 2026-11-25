// Campo do código por email (6 números) com animação:
// confirmou -> os números formam um círculo (3 de cada lado) e giram enquanto confere;
// certo -> são sugados para o meio; errado -> se repelem e voltam vazios para digitar de novo.
import { html, useState, useRef, useEffect, cx } from '../lib.js';
import { Icon } from '../icons.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP = 50; // distância entre as caixas
const RING = 62; // raio do círculo
// lado esquerdo: cima, meio (mais para a esquerda), baixo; lado direito igual, espelhado
const ANGLES = [-120, 180, 120, -60, 0, 60];

function spot(i, phase) {
  if (phase === 'idle' || phase === 'typing') return { x: (i - 2.5) * STEP + (i < 3 ? -6 : 6), y: 0 };
  const a = (ANGLES[i] * Math.PI) / 180;
  const r = phase === 'bad' ? RING * 3.2 : phase === 'ok' ? 0 : RING;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/**
 * onSubmit(code) -> Promise: resolve = código certo, reject(Error) = errado (a mensagem aparece embaixo).
 * onDone() roda depois da animação de sucesso.
 */
export function OtpCode({ length = 6, onSubmit, onDone, disabled }) {
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | orbit | ok | bad
  const [err, setErr] = useState('');
  const input = useRef(null);
  const busy = phase !== 'idle';

  useEffect(() => { if (!disabled) input.current?.focus(); }, [disabled]);

  const submit = async (c) => {
    setErr('');
    setPhase('orbit');
    const t0 = Date.now();
    let msg = null;
    try { await onSubmit(c); } catch (e) { msg = e?.message || 'Código errado.'; }
    await wait(Math.max(0, 1500 - (Date.now() - t0))); // gira pelo menos um pouco
    if (msg === null) {
      setPhase('ok');
      await wait(950);
      onDone?.();
      return;
    }
    setPhase('bad');
    await wait(560);
    setCode('');
    setPhase('idle');
    setErr(msg + ' Digite o código novamente.');
    setTimeout(() => input.current?.focus(), 50);
  };

  const onInput = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, length);
    setCode(v);
    if (err) setErr('');
    if (v.length === length && !busy) submit(v);
  };

  const digits = Array.from({ length }, (_, i) => code[i] || '');
  const caret = Math.min(code.length, length - 1);
  return html`
    <div class=${cx('otp', 'otp-' + phase, err && 'otp-err')} onClick=${() => !busy && input.current?.focus()}>
      <input ref=${input} class="otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength=${length}
        value=${code} onInput=${onInput} disabled=${disabled || busy} aria-label="Código de ${length} números" />
      <div class="otp-stage">
        ${digits.map((_, i) => {
          const p = spot(i, 'idle');
          return html`<span key=${'b' + i} class=${cx('otp-box', !busy && i === caret && code.length < length && 'on')} style=${`transform:translate(${p.x}px,${p.y}px) translate(-50%,-50%)`}></span>`;
        })}
        <div class="otp-ring">
          ${digits.map((d, i) => {
            const p = spot(i, phase);
            return html`<span key=${'d' + i} class=${cx('otp-digit', d && 'has')}
              style=${`transform:translate(${p.x}px,${p.y}px) translate(-50%,-50%);transition-delay:${phase === 'orbit' ? i * 45 : phase === 'ok' ? (i % 3) * 40 : 0}ms`}><i>${d}</i></span>`;
          })}
        </div>
        <span class="otp-burst"><${Icon} n="check" s=${30} /></span>
      </div>
      <p class="otp-msg" role="status">${phase === 'orbit' ? 'Conferindo…' : phase === 'ok' ? 'Tudo certo!' : err}</p>
    </div>`;
}
