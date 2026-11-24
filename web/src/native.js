// Ponte com o app nativo (Capacitor) para transmitir a tela do celular.
// No navegador/PC isso fica indisponível e a transmissão usa getDisplayMedia normal.
const Cap = window.Capacitor;
const plugin = Cap?.isNativePlatform?.() ? Cap.Plugins?.ScreenShare : null;

export const nativeScreen = {
  available: !!plugin,
  active: false,
  async start(opts) {
    const rtc = await import('./rtc.js');
    return rtc.startNativeScreen(plugin, opts);
  },
  async stop() {
    const rtc = await import('./rtc.js');
    return rtc.stopNativeScreen(plugin);
  },
};
export const isNativeApp = !!Cap?.isNativePlatform?.();
export const nativePlatform = Cap?.getPlatform?.() || 'web';
