// ============================================================
// Visualizador de fotos em tela cheia, compartilhado entre as
// telas (ficha de cidade e detalhe de país).
// ============================================================

let fotos = [];   // lista de URLs
let indice = 0;

export function initLightbox() {
  document.getElementById('lightbox-fechar').onclick = fecharLightbox;
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') fecharLightbox();
  });
  document.getElementById('lightbox-anterior').onclick = () => navegar(-1);
  document.getElementById('lightbox-proxima').onclick = () => navegar(1);
}

/** Abre a galeria mostrando a foto indicada. */
export function abrirLightbox(listaUrls, urlOuIndice = 0) {
  fotos = (listaUrls || []).filter(Boolean);
  if (!fotos.length) return;

  indice = typeof urlOuIndice === 'string' ? fotos.indexOf(urlOuIndice) : urlOuIndice;
  if (indice < 0) indice = 0;

  document.getElementById('lightbox-img').src = fotos[indice];
  document.getElementById('lightbox').classList.add('aberto');
  atualizarSetas();
}

function navegar(passo) {
  if (!fotos.length) return;
  indice = (indice + passo + fotos.length) % fotos.length;
  document.getElementById('lightbox-img').src = fotos[indice];
}

function atualizarSetas() {
  // Com uma foto só, as setas não fazem sentido.
  const mostrar = fotos.length > 1;
  document.getElementById('lightbox-anterior').style.display = mostrar ? '' : 'none';
  document.getElementById('lightbox-proxima').style.display = mostrar ? '' : 'none';
}

export function fecharLightbox() {
  document.getElementById('lightbox').classList.remove('aberto');
}
