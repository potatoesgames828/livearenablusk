/* LIVE ARENA — Service Worker
 * Política segura: cacheia SOMENTE recursos estáticos imutáveis (/_next/static, /icons).
 * Nunca cacheia /api, /overlay, páginas autenticadas ou respostas com cookies,
 * evitando que dados privados de um usuário fiquem disponíveis para outro. */
const VERSION = 'la-static-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll([OFFLINE_URL, '/icons/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }
  // Navegação: sempre rede; offline mostra página estática genérica (sem dados).
  if (req.mode === 'navigate' && !url.pathname.startsWith('/overlay')) {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
