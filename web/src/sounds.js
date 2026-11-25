// Sons sintetizados (sem arquivos de áudio): toque de chamada, entrar/sair, mudo, mensagem.
import { S } from './store.js';

let ctx, master;
export const audioCtx = () => {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};
function out() {
  const c = audioCtx();
  if (!master) {
    master = c.createGain();
    master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    master.connect(comp).connect(c.destination);
  }
  return master;
}
// desbloqueia o áudio no primeiro toque/clique (celular e navegador)
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => audioCtx(), { once: true, capture: true });

/** nota com envelope suave e um harmônico (som "de vidro", parecido com sons do sistema) */
function note(freq, at, dur, { gain = 0.2, type = 'sine', glide } = {}) {
  const c = audioCtx();
  const t = c.currentTime + at;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out());
  for (const [mult, amp] of [[1, 1], [2, 0.28], [3, 0.08]]) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * mult, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide * mult, t + dur * 0.6);
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

const on = () => S.settings.sounds;
let ringTimer = null;

export const sounds = {
  // você entrou na chamada: subida de 3 notas
  join() { if (!on()) return; note(523, 0, 0.18); note(659, 0.08, 0.18); note(988, 0.16, 0.32); },
  // você saiu: descida
  leave() { if (!on()) return; note(988, 0, 0.16); note(659, 0.08, 0.18); note(440, 0.16, 0.34); },
  // alguém entrou / saiu
  peerJoin() { if (!on()) return; note(659, 0, 0.14, { gain: 0.16 }); note(988, 0.08, 0.24, { gain: 0.16 }); },
  peerLeave() { if (!on()) return; note(784, 0, 0.14, { gain: 0.16 }); note(494, 0.08, 0.26, { gain: 0.16 }); },
  mute() { if (!on()) return; note(560, 0, 0.12, { glide: 360, gain: 0.14 }); },
  unmute() { if (!on()) return; note(420, 0, 0.12, { glide: 700, gain: 0.14 }); },
  message() { if (!on()) return; note(1175, 0, 0.12, { gain: 0.1 }); note(1568, 0.06, 0.18, { gain: 0.08 }); },
  streamStart() { if (!on()) return; note(523, 0, 0.12); note(659, 0.07, 0.12); note(784, 0.14, 0.24); },
  streamStop() { if (!on()) return; note(784, 0, 0.1); note(659, 0.07, 0.1); note(523, 0.14, 0.2); },
  viewerJoin() { if (!on()) return; note(880, 0, 0.08); note(1175, 0.06, 0.16); },
  viewerLeave() { if (!on()) return; note(1175, 0, 0.08); note(880, 0.06, 0.14); },
  /** toque contínuo: recebendo (melodia) ou chamando (tom de chamada) — toca mesmo com sons do app desligados */
  ring(outgoing = false) {
    this.stopRing();
    const play = () => {
      if (outgoing) { note(440, 0, 0.9, { gain: 0.09 }); note(480, 0, 0.9, { gain: 0.09 }); }
      else {
        [784, 988, 1175, 1568, 1175, 988].forEach((f, i) => note(f, i * 0.12, 0.26, { type: 'triangle', gain: 0.22 }));
        navigator.vibrate?.([300, 150, 300]);
      }
    };
    play();
    ringTimer = setInterval(play, outgoing ? 3000 : 1600);
  },
  stopRing() { clearInterval(ringTimer); ringTimer = null; navigator.vibrate?.(0); },
};
