// Som do PC para a transmissão de tela no app do Windows, SEM as vozes da chamada.
// O Electron só sabe capturar o som do PC inteiro (e aí quem assiste ouve a própria voz de volta).
// O audiocap.exe (processo principal) captura tudo menos o Perfumolandia (ou só o programa da janela escolhida)
// e manda PCM 16 bits 48 kHz estéreo; aqui vira uma faixa de áudio normal via AudioWorklet.

const WORKLET = `
class SysAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.N = 48000; this.L = new Float32Array(this.N); this.R = new Float32Array(this.N);
    this.w = 0; this.r = 0; this.n = 0; this.playing = false;
    this.port.onmessage = (e) => {
      const s = new Int16Array(e.data);
      for (let i = 0; i + 1 < s.length; i += 2) {
        this.L[this.w] = s[i] / 32768; this.R[this.w] = s[i + 1] / 32768;
        this.w = (this.w + 1) % this.N;
        if (this.n < this.N) this.n++; else this.r = (this.r + 1) % this.N;
      }
      // atrasou demais (aba em segundo plano, CPU ocupada): descarta o excesso e volta para ~50 ms
      if (this.n > 9600) { const drop = this.n - 2400; this.r = (this.r + drop) % this.N; this.n -= drop; }
    };
  }
  process(inputs, outputs) {
    const L = outputs[0][0], R = outputs[0][1] || L;
    if (!this.playing && this.n < 1440) return true; // junta 30 ms antes de tocar (evita picotar)
    this.playing = true;
    for (let i = 0; i < L.length; i++) {
      if (this.n > 0) { L[i] = this.L[this.r]; R[i] = this.R[this.r]; this.r = (this.r + 1) % this.N; this.n--; }
      else { L[i] = 0; R[i] = 0; this.playing = false; }
    }
    return true;
  }
}
registerProcessor('sysaudio', SysAudio);`;

/** inicia a captura; key 'screen' (spec.source = fonte da tela) ou 'music' (spec.pid = Spotify).
 *  Devolve { track, stop } ou null se não der. */
export async function startSysAudio(key, spec) {
  const d = window.perfumolandiaDesktop;
  if (!d?.startSysAudio) return null;
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(ctx, 'sysaudio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 2;
    node.connect(dest);
    const ok = await d.startSysAudio(key, spec, (u8) => {
      const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      node.port.postMessage(ab, [ab]);
    });
    if (!ok) throw new Error('audiocap');
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const track = dest.stream.getAudioTracks()[0];
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      d.stopSysAudio(key);
      track.stop();
      ctx.close().catch(() => {});
    };
    return { track, stop };
  } catch {
    ctx.close().catch(() => {});
    return null;
  }
}
