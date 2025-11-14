const CACHE_NAME = 'onhouse-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './nova-logo.png',
  './natal.jpeg',
  './leitura-agua.png',
  // se tiver outros assets (css, imagens), adicione aqui
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Para requisições da API, use a estratégia "Network-First"
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Se a requisição for bem-sucedida, clone e guarde no cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request)) // Se a rede falhar, use o cache
    );
    return;
  }

  // Para todos os outros assets (HTML, imagens, etc.), use "Cache-First"
  event.respondWith(caches.match(request).then(response => response || fetch(request)));
});
