const CACHE_NAME = 'bingo-pix-v3'; // Mudei para v3 para forçar atualização imediata
const urlsToCache = [
  '/',
  '/index.html',
  '/espera.html',
  '/jogo.html',
  '/revendedor.html',
  '/style.css',
  '/jogo.css',
  '/script.js',
  '/espera.js',
  '/jogo.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); 
});

self.addEventListener('fetch', (event) => {
  // CORREÇÃO DO ERRO: 
  // 1. Ignora requisições que não sejam GET (POST, PUT, etc travam o cache)
  // 2. Ignora requisições do Socket.io (comunicação em tempo real)
  if (event.request.method !== 'GET' || event.request.url.includes('/socket.io/')) {
    return; 
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          (response) => {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return response;
          }
        );
      })
  );
});
