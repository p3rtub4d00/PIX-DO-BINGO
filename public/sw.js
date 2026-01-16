const CACHE_NAME = 'bingo-pix-v6-final-oficial'; // Versão nova para limpar tudo
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
  // 1. Ignora POST (Erro do console)
  if (event.request.method !== 'GET') {
    return; 
  }
  // 2. Ignora Socket
  const url = event.request.url;
  if (url.includes('/socket.io/') || url.includes('transport=polling')) {
    return;
  }
  // 3. Cache padrão
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;
        return fetch(event.request).then((response) => {
            if(!response || response.status !== 200 || response.type !== 'basic') return response;
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, responseToCache); });
            return response;
        });
      })
  );
});
