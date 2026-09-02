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
  if (pct <= 0) return '#E4EAF4';
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
