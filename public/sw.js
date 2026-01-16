const CACHE_NAME = 'bingo-pix-V8-MASTER-FIX'; // Nova versão para forçar reset
const urlsToCache = [
  '/',
  '/index.html',
  '/espera.html',
  '/jogo.html',
  '/dashboard.html',
  '/style.css',
  '/jogo.css',
  '/dashboard.css',
  '/script.js',
  '/espera.js',
  '/jogo.js',
  '/dashboard.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Apaga caches antigos (V5, V6, fixPix, etc)
          if (cacheName !== CACHE_NAME) {
            console.log('Limpando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 1. Deixa passar tudo que não for GET (POSTs de compra, Sockets, etc)
  if (event.request.method !== 'GET') return;
  
  // 2. Ignora Socket.io completamente
  if (event.request.url.includes('/socket.io/')) return;

  // 3. Estratégia: Rede Primeiro (Garante sempre o arquivo mais novo)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return response;
      })
      .catch(() => caches.match(event.request)) // Só usa cache se estiver offline
  );
});
