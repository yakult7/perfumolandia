// Avisos de ligação com o app fechado (celular).
//  - iPhone/Android com o app na tela inicial: Web Push pelo service worker (sw.js)
//  - app Android (APK): Firebase, pelo plugin nativo CallPush
import { sb } from './api.js';
import { S, set } from './store.js';
import { isStandalone } from './lib.js';
import { isNativeApp, nativePlatform } from './native.js';

const native = isNativeApp && nativePlatform === 'android' ? window.Capacitor?.Plugins?.CallPush : null;
const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** onde dá para receber ligação com o app fechado */
export const pushSupported = !!native || (isMobile && isStandalone && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

const b64 = (s) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** estado da permissão: 'granted' | 'denied' | 'default' */
export function pushPermission() {
  if (native) { try { return localStorage.getItem('rs.pushOk') === '1' ? 'granted' : 'default'; } catch { return 'default'; } }
  return 'Notification' in window ? Notification.permission : 'denied';
}

/** liga os avisos (precisa ser chamado num toque do usuário no iPhone) */
export async function enablePush({ ask = true } = {}) {
  if (!pushSupported || !S.uid) return false;
  if (native) {
    const { token } = await native.register();
    await save('fcm', token, {});
    try { localStorage.setItem('rs.pushOk', '1'); } catch {}
    set((s) => { s.ui = { ...s.ui, pushOk: true }; });
    return true;
  }
  if (Notification.permission !== 'granted') {
    if (!ask) return false;
    if ((await Notification.requestPermission()) !== 'granted') return false;
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    // chave pública do servidor (criada por ele mesmo)
    const { data, error } = await sb.functions.invoke('call-push', { body: { action: 'key' } });
    if (error || !data?.publicKey) throw new Error('servidor de avisos indisponível');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(data.publicKey) });
  }
  const j = sub.toJSON();
  await save('web', j.endpoint, j.keys);
  set((s) => { s.ui = { ...s.ui, pushOk: true }; });
  return true;
}
async function save(kind, token, keys) {
  const { error } = await sb.rpc('save_push_sub', { p_kind: kind, p_token: token, p_keys: keys });
  if (error) throw new Error(error.message);
}

/** ao abrir o app: renova a inscrição em silêncio (se já tinha permitido) e abre a conversa da ligação tocada */
export async function initPush(openDm) {
  if (!pushSupported) return;
  if (pushPermission() === 'granted') enablePush({ ask: false }).catch(() => {});
  // tocou na notificação da ligação (web): abre a conversa
  const q = new URLSearchParams(location.search).get('call');
  if (q) { openDm(q); history.replaceState(null, '', location.pathname + location.hash); }
  if (native) {
    const check = () => native.openedFrom().then((r) => r?.dmId && openDm(r.dmId)).catch(() => {});
    check();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }
}

/** avisa o servidor: tocar ('ring') ou parar ('cancel') nos celulares dos outros */
export function callPush(dmId, action) {
  return sb.functions.invoke('call-push', { body: { dmId, action } }).catch(() => {});
}
