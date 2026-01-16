const CACHE_NAME = 'bingo-pix-v4'; // Mudei para v4 para forçar limpeza
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
  // *** AQUI ESTÁ A CORREÇÃO DO ERRO DO CONSOLE ***
  
  // 1. Ignora qualquer requisição que NÃO seja GET (como POST do login/socket)
  if (event.request.method !== 'GET') {
    return; 
  }

  // 2. Ignora explicitamente o Socket.io e APIs (não devem ser cacheados)
  const url = event.request.url;
  if (url.includes('/socket.io/') || url.includes('transport=polling')) {
    return;
  }

  // Lógica normal de cache para arquivos estáticos
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          (response) => {
            // Verifica se a resposta é válida antes de cachear
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
