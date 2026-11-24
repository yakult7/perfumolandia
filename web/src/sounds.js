// Sons sintetizados (sem arquivos de áudio).
import { S } from './store.js';

let ctx;
export const audioCtx = () => {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};
// desbloqueia áudio no primeiro toque (iOS)
addEventListener('pointerdown', () => audioCtx(), { once: true, capture: true });

function tone(freq, at, dur, { type = 'sine', gain = 0.09, to } = {}) {
  const c = audioCtx();
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const on = () => S.settings.sounds;
let ringTimer = null;

export const sounds = {
  join() { if (!on()) return; tone(587, 0, 0.16); tone(880, 0.09, 0.22); },
  leave() { if (!on()) return; tone(880, 0, 0.14); tone(523, 0.08, 0.24); },
  peerJoin() { if (!on()) return; tone(660, 0, 0.12, { gain: 0.06 }); tone(990, 0.07, 0.16, { gain: 0.06 }); },
  peerLeave() { if (!on()) return; tone(740, 0, 0.12, { gain: 0.06 }); tone(494, 0.07, 0.18, { gain: 0.06 }); },
  mute() { if (!on()) return; tone(440, 0, 0.09, { to: 300, gain: 0.07 }); },
  unmute() { if (!on()) return; tone(520, 0, 0.09, { to: 760, gain: 0.07 }); },
  message() { if (!on()) return; tone(1046, 0, 0.08, { gain: 0.05 }); tone(1568, 0.05, 0.12, { gain: 0.04 }); },
  streamStart() { if (!on()) return; tone(523, 0, 0.1); tone(659, 0.07, 0.1); tone(784, 0.14, 0.18); },
  ring(outgoing = false) {
    this.stopRing();
    const play = () => {
      if (outgoing) { tone(440, 0, 0.35, { gain: 0.05 }); tone(480, 0, 0.35, { gain: 0.05 }); }
      else { [784, 988, 1175, 988].forEach((f, i) => tone(f, i * 0.13, 0.22, { type: 'triangle', gain: 0.08 })); }
    };
    play();
    ringTimer = setInterval(play, outgoing ? 2600 : 1800);
  },
  stopRing() { clearInterval(ringTimer); ringTimer = null; },
};
