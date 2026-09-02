// Service worker: prioriza sempre a versão mais nova quando há internet
// (essencial enquanto o app está em desenvolvimento/ajustes) e só usa o
// que está guardado quando o celular está sem sinal, na estrada.
//
// CACHE_NOME muda a cada ajuste importante — isso força os celulares a
// descartarem a cópia antiga e buscarem a nova assim que reconectarem.

const CACHE_NOME = 'nosso-mapa-v2';

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
  './js/util.js',
  './js/ui-dashboard.js',
  './js/ui-brasil.js',
  './js/ui-mundo.js',
  './js/ui-viagens.js',
  './js/ui-modal-cidade.js',
  './data/estados-br.json',
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

  // Municípios (data/municipios/*.json): cache-first, mas atualiza em segundo plano
  // (esses dados quase nunca mudam, então vale priorizar velocidade aqui).
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

  // Resto do shell (HTML/CSS/JS/dados de estados): rede primeiro, cache só
  // como reserva se estiver offline. Assim, qualquer atualização enviada
  // pro GitHub aparece na próxima vez que abrir o app com internet.
  evento.respondWith(
    fetch(evento.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(evento.request, copia));
        return resp;
      })
      .catch(() => caches.match(evento.request))
  );
});
