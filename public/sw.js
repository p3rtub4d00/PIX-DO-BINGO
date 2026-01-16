const CACHE_NAME = 'bingo-pix-v5-final'; // Mudei a versão para forçar atualização
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

// Instalação
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Ativação e Limpeza
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

// Interceptação de Rede (AQUI ESTA A CORREÇÃO)
self.addEventListener('fetch', (event) => {
  
  // 1. REGRA DE OURO: Se não for GET, NÃO MEXA!
  // Isso impede o erro "Request method 'POST' is unsupported"
  if (event.request.method !== 'GET') {
    return; 
  }

  // 2. Ignora Socket.io (Comunicação em tempo real não pode ser cacheada)
  const url = event.request.url;
  if (url.includes('/socket.io/') || url.includes('transport=polling')) {
    return;
  }

  // 3. Lógica padrão: Tenta cache, se não tiver, baixa da rede
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          (response) => {
            // Verifica se a resposta é válida antes de tentar salvar
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
