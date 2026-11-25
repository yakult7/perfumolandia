// Service worker da Perfumolandia: abre mesmo sem internet (última versão) e mantém tudo atualizado.
const CACHE = 'perfumolandia-v4';
const SHELL = ['./', './app/', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase e arquivos vão direto
  // rede primeiro; sem internet, usa o cache (navegação dentro do app cai no app)
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    } catch {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      if (e.request.mode === 'navigate') return caches.match(url.pathname.includes('/app/') ? './app/' : './');
      return Response.error();
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || './app/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if ('focus' in w) { w.postMessage({ type: 'open', url }); return w.focus(); }
    return self.clients.openWindow(url);
  })());
});

// ligação com o app fechado: o servidor (função call-push) manda o aviso e aqui vira notificação
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() || {}; } catch {}
  if (!d.dmId) return;
  const tag = 'call-' + d.dmId;
  const where = d.group ? ` em ${d.group}` : '';
  e.waitUntil((async () => {
    for (const n of await self.registration.getNotifications({ tag })) n.close();
    if (d.type === 'cancel') {
      return self.registration.showNotification('Chamada perdida', {
        body: `${d.name || 'Alguém'} ligou${where}`, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { url: './app/' },
      });
    }
    return self.registration.showNotification(`${d.name || 'Alguém'} está te ligando${where}`, {
      body: 'Toque para atender na Perfumolandia', tag, renotify: true, requireInteraction: true,
      icon: './icons/icon-192.png', badge: './icons/icon-192.png',
      vibrate: [800, 600, 800, 600, 800, 600, 800], data: { url: './app/?call=' + d.dmId },
    });
  })());
});
