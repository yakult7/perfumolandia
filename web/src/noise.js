// Supressão de ruído inteligente (RNNoise: rede neural que separa voz de barulho, como o Krisp do Discord).
// Tira teclado, ventilador, ar-condicionado, latido... e deixa só a voz. Roda num AudioWorklet (48 kHz).
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

let ctx = null;
let wasm = null;
let ready = null;

function setup() {
  if (!ready) {
    ready = (async () => {
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      wasm = await loadRnnoise({ url: wasmUrl, simdUrl });
      await ctx.audioWorklet.addModule(workletUrl);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** devolve um stream com a voz limpa; stream.cleanup() desliga tudo (inclusive o microfone original) */
export async function denoise(raw) {
  await setup();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(raw);
  const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasm });
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 1;
  src.connect(node).connect(dest);
  const out = dest.stream;
  out.cleanup = () => {
    try { src.disconnect(); node.disconnect(); node.destroy?.(); } catch {}
    raw.getTracks().forEach((t) => t.stop());
  };
  return out;
}
