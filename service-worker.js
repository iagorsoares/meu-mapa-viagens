// Service worker simples: cacheia o "shell" do app (HTML/CSS/JS/dados geográficos)
// para abrir rápido e funcionar offline na estrada. Dados do Firebase/Cloudinary
// NÃO são cacheados aqui (precisam de rede para ficarem atualizados/sincronizados).

const CACHE_NOME = 'nosso-mapa-v1';

const ARQUIVOS_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/firebase-config.js',
  './js/cloudinary-config.js',
  './js/db.js',
  './js/upload.js',
  './js/ui-dashboard.js',
  './js/ui-brasil.js',
  './js/ui-mundo.js',
  './js/ui-viagens.js',
  './js/ui-modal-cidade.js',
  './data/estados-br.json',
  './data/paises-mundo.json',
  './data/contagem-municipios-uf.json'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NOME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  // Nunca interceptar chamadas ao Firebase/Firestore/Cloudinary/Google — sempre rede.
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('accounts.google.com')
  ) {
    return;
  }

  // Municípios (data/municipios/*.json): cache-first, mas atualiza em segundo plano.
  if (url.pathname.includes('/data/municipios/')) {
    evento.respondWith(
      caches.open(CACHE_NOME).then(async (cache) => {
        const emCache = await cache.match(evento.request);
        const buscaRede = fetch(evento.request)
          .then((resp) => {
            cache.put(evento.request, resp.clone());
            return resp;
          })
          .catch(() => emCache);
        return emCache || buscaRede;
      })
    );
    return;
  }

  // Shell do app: cache-first com fallback de rede.
  evento.respondWith(
    caches.match(evento.request).then((resp) => resp || fetch(evento.request))
  );
});
