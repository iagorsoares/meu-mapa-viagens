// ============================================================
// Funções pequenas usadas em vários lugares do app.
// ============================================================

export function mostrarToast(mensagem) {
  const el = document.getElementById('toast');
  el.textContent = mensagem;
  el.classList.add('mostrar');
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => el.classList.remove('mostrar'), 2600);
}

export function formatarData(isoString) {
  if (!isoString) return '';
  const [ano, mes, dia] = isoString.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${dia} ${meses[parseInt(mes, 10) - 1]} ${ano}`;
}

export function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Cor da escala de progresso (usada no mapa e nas barras). */
export function corPorPercentual(pct) {
  if (pct <= 0) return '#EDECE6';
  if (pct < 50) return '#9FDFC4';
  if (pct < 90) return '#009966';
  return '#00432F';
}

export function debounce(fn, atraso = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), atraso);
  };
}

export function normalizar(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Centro aproximado (centro da bounding box) de uma feature GeoJSON — leve, sem libs extras. */
export function centroDaFeature(feature) {
  const camada = L.geoJSON(feature);
  const centro = camada.getBounds().getCenter();
  return { lat: centro.lat, lng: centro.lng };
}

/** Remove acentuação e deixa maiúsculo — usado nos badges (ex: sigla do estado). */
export function iniciais(texto, tamanho = 2) {
  return (texto || '').slice(0, tamanho).toUpperCase();
}

/** Emoji de bandeira a partir do código ISO2 do país (ex: "BR" -> 🇧🇷). */
export function bandeiraEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return '🏳️';
  const base = 127397;
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => base + c.charCodeAt(0)));
}

/**
 * Só executa o callback quando o contêiner do mapa realmente tiver tamanho na
 * tela. Sem isso, enquadrar um mapa cujo contêiner acabou de sair do "escondido"
 * (tamanho 0x0) resulta num mapa em branco.
 */
export function quandoMapaTiverTamanho(mapa, callback, tentativasRestantes = 30) {
  const el = mapa.getContainer();
  if (el.clientWidth > 0 && el.clientHeight > 0) {
    mapa.invalidateSize();
    callback();
    return;
  }
  if (tentativasRestantes <= 0) { mapa.invalidateSize(); callback(); return; }
  requestAnimationFrame(() => quandoMapaTiverTamanho(mapa, callback, tentativasRestantes - 1));
}

/** Impede arrastar/afastar o mapa até o conteúdo sumir da tela. */
export function travarNavegacao(mapa, bounds, folga = 0.35) {
  mapa.setMaxBounds(bounds.pad(folga));
  mapa.setMinZoom(mapa.getZoom());
  // Resistência parcial: segura o arrasto perto da borda sem dar a sensação
  // de mapa "duro"/travado (1.0 trava seco, 0 deixa arrastar livre e só volta
  // ao soltar).
  mapa.options.maxBoundsViscosity = 0.6;
}

// Nome do país em português. O GeoJSON traz os nomes em inglês ("Germany"),
// então usamos o tradutor de regiões que já vem no próprio navegador — sem
// precisar embutir nenhuma tabela de tradução no app.
let _tradutorPaises = null;
try {
  _tradutorPaises = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
} catch (e) {
  _tradutorPaises = null; // navegador antigo: cai no nome original
}

export function nomePaisPT(iso2, nomeOriginal = '') {
  if (!iso2) return nomeOriginal;
  try {
    const traduzido = _tradutorPaises?.of(iso2.toUpperCase());
    // Quando não conhece o código, o Intl devolve o próprio código de volta.
    if (traduzido && traduzido.toUpperCase() !== iso2.toUpperCase()) return traduzido;
  } catch (e) { /* ignora e usa o original */ }
  return nomeOriginal || iso2;
}

/**
 * Bandeiras de países são arquivos de imagem, e só mantemos no app as dos
 * países já visitados. Se algum dia um país novo for marcado antes de sua
 * bandeira ser adicionada, a imagem falharia e apareceria um ícone quebrado —
 * aqui trocamos por um emoji de bandeira, que funciona para qualquer país.
 */
export function aplicarReservaBandeiras(container) {
  if (!container) return;
  container.querySelectorAll('img[data-bandeira-iso]').forEach((img) => {
    img.onerror = () => {
      const substituto = document.createElement('span');
      substituto.className = 'bandeira-emoji';
      substituto.textContent = bandeiraEmoji(img.dataset.bandeiraIso);
      img.replaceWith(substituto);
    };
  });
}
