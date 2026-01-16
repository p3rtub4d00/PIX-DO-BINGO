const CACHE_NAME = 'bingo-pix-v2'; // Mudei para v2 para forçar atualização
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/imagens/icon-192.png',
  '/imagens/icon-512.png'
];

// Instalação: Força o novo Service Worker a assumir imediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Ativação: Limpa caches antigos (Isso resolve o problema do F5)
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

// Estratégia: Network First (Tenta baixar novo, se der erro usa cache)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a internet funcionar, atualiza o cache com o arquivo novo
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        // Se estiver offline, usa o cache
        return caches.match(event.request);
      })
  );
});
