// ============================================================
// Aba Mundo: países visitados destacados no mapa-múndi,
// com cidades registradas dentro de cada país.
// ============================================================

import { normalizar, bandeiraEmoji, debounce, centroDaFeature } from './util.js';
import { abrirCidadeMundo } from './ui-modal-cidade.js';

let cbs = null; // { aoMarcarVisitado(dadosPais) }
let mapaFull = null, camadaFull = null;
let mapaPais = null, camadaCidadesPais = null, camadaContornoPais = null;
let isoAtual = null;

export function iniciar(callbacks) {
  cbs = callbacks;
}

function estiloPais(state) {
  return (feature) => {
    const visitado = state.paises.some((p) => p.id === feature.properties.iso2);
    return {
      fillColor: visitado ? '#009966' : '#E4EAF4',
      color: '#ffffff', weight: 0.8,
      fillOpacity: visitado ? 0.88 : 0.55
    };
  };
}

export function iniciarMapaCompleto(state) {
  mapaFull = L.map('mapa-mundo-full', { attributionControl: false, minZoom: 1, preferCanvas: true }).setView([15, 10], 1.4);
  camadaFull = L.geoJSON(state.paisesGeo, {
    style: estiloPais(state),
    onEachFeature: (feature, layer) => {
      layer.on('click', () => onCliquePais(state, feature));
    }
  }).addTo(mapaFull);
  setTimeout(() => mapaFull.invalidateSize(), 60);
}

export function aoMostrarAbaMundo() {
  if (mapaFull) setTimeout(() => mapaFull.invalidateSize(), 60);
}

export function atualizar(state) {
  if (camadaFull) camadaFull.setStyle(estiloPais(state));
  renderListaPaises(state, document.getElementById('busca-pais')?.value || '');
  if (isoAtual) {
    renderListaCidadesPais(state);
    if (camadaCidadesPais) atualizarPinosCidades(state);
  }
}

function onCliquePais(state, feature) {
  const iso2 = feature.properties.iso2;
  const jaVisitado = state.paises.some((p) => p.id === iso2);
  if (!jaVisitado) {
    if (confirm(`Marcar ${feature.properties.name} como visitado?`)) {
      cbs.aoMarcarVisitado({ iso2, iso3: feature.properties.iso3, nome: feature.properties.name });
      setTimeout(() => abrirPais(state, iso2), 300);
    }
    return;
  }
  abrirPais(state, iso2);
}

// ---------- Lista de países visitados ----------

export function renderListaPaises(state, filtroBusca = '') {
  const cont = document.getElementById('lista-paises');
  if (!cont) return;

  const visitados = state.paises
    .map((p) => ({ ...p, qtdCidades: state.cidadesMundo.filter((c) => c.paisIso2 === p.id).length }))
    .filter((p) => !filtroBusca || normalizar(p.nome).includes(normalizar(filtroBusca)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (!visitados.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🌎</div><p>Nenhum país registrado ainda.<br>Toque em um país no mapa pra começar.</p></div>';
    return;
  }

  cont.innerHTML = visitados.map((p) => `
    <div class="lista-row" data-iso="${p.id}">
      <div class="badge">${bandeiraEmoji(p.id)}</div>
      <div class="linha-info">
        <div class="nome">${p.nome}</div>
        <div class="meta mono" style="font-size:10.5px;color:var(--muted);margin-top:2px;">${p.qtdCidades} cidade${p.qtdCidades === 1 ? '' : 's'} registrada${p.qtdCidades === 1 ? '' : 's'}</div>
      </div>
      <div class="linha-seta">›</div>
    </div>`).join('');

  cont.querySelectorAll('.lista-row').forEach((row) => {
    row.onclick = () => abrirPais(state, row.dataset.iso);
  });
}

// ---------- Detalhe do país ----------

export function abrirPais(state, iso2) {
  isoAtual = iso2;
  document.getElementById('mundo-lista-view').classList.add('hidden');
  document.getElementById('mundo-pais-view').classList.remove('hidden');

  const pais = state.paises.find((p) => p.id === iso2);
  const feature = state.paisesGeo.features.find((f) => f.properties.iso2 === iso2);
  document.getElementById('pais-badge').textContent = bandeiraEmoji(iso2);
  document.getElementById('pais-nome').textContent = pais?.nome || feature?.properties.name || iso2;

  if (!mapaPais) mapaPais = L.map('mapa-pais-detalhe', { attributionControl: false, preferCanvas: true });
  if (camadaContornoPais) { mapaPais.removeLayer(camadaContornoPais); }
  if (camadaCidadesPais) { mapaPais.removeLayer(camadaCidadesPais); camadaCidadesPais = null; }

  if (feature) {
    camadaContornoPais = L.geoJSON(feature, { style: { fillColor: '#009966', color: '#155EEF', weight: 1.5, fillOpacity: .12 } }).addTo(mapaPais);
    mapaPais.fitBounds(camadaContornoPais.getBounds(), { padding: [12, 12] });
  }
  setTimeout(() => mapaPais.invalidateSize(), 80);

  mapaPais.off('click');
  mapaPais.on('click', (e) => {
    const nomePais = pais?.nome || feature?.properties.name || iso2;
    abrirCidadeMundo(iso2, nomePais, { lat: e.latlng.lat, lng: e.latlng.lng }, null);
  });

  document.getElementById('btn-add-cidade-pais').onclick = () => {
    const nomePais = pais?.nome || feature?.properties.name || iso2;
    const centro = feature ? centroDaFeature(feature) : { lat: 0, lng: 0 };
    abrirCidadeMundo(iso2, nomePais, centro, null);
  };

  atualizarPinosCidades(state);
  renderListaCidadesPais(state);
}

function atualizarPinosCidades(state) {
  if (camadaCidadesPais) { mapaPais.removeLayer(camadaCidadesPais); }
  const cidades = state.cidadesMundo.filter((c) => c.paisIso2 === isoAtual);
  camadaCidadesPais = L.layerGroup(
    cidades.map((c) => L.marker([c.lat, c.lng], {
      icon: L.divIcon({ className: '', html: '<div class="pin-cidade verde"></div>', iconSize: [26, 26], iconAnchor: [13, 26] })
    }).bindPopup(`<b>${c.nome}</b><br>${c.dataVisita || ''}`).on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      const pais = state.paises.find((p) => p.id === isoAtual);
      abrirCidadeMundo(isoAtual, pais?.nome || isoAtual, { lat: c.lat, lng: c.lng }, c);
    }))
  ).addTo(mapaPais);
}

export function fecharPais() {
  document.getElementById('mundo-pais-view').classList.add('hidden');
  document.getElementById('mundo-lista-view').classList.remove('hidden');
  isoAtual = null;
}

function renderListaCidadesPais(state) {
  const cont = document.getElementById('lista-cidades-pais');
  if (!cont) return;
  const cidades = state.cidadesMundo.filter((c) => c.paisIso2 === isoAtual)
    .sort((a, b) => (b.dataVisita || '').localeCompare(a.dataVisita || ''));

  if (!cidades.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">📍</div><p>Nenhuma cidade registrada aqui ainda.</p></div>';
    return;
  }

  cont.innerHTML = cidades.map((c) => `
    <div class="cidade-card" data-id="${c.id}">
      <div class="cidade-thumb" ${c.fotos?.[0] ? `style="background-image:url('${c.fotos[0]}')"` : ''}>${c.fotos?.[0] ? '' : '📍'}</div>
      <div>
        <div class="nome">${c.nome}</div>
        <div class="meta">${c.dataVisita || ''} · ${c.fotos?.length || 0} fotos</div>
      </div>
    </div>`).join('');

  cont.querySelectorAll('.cidade-card').forEach((card) => {
    card.onclick = () => {
      const c = cidades.find((x) => x.id === card.dataset.id);
      const pais = state.paises.find((p) => p.id === isoAtual);
      abrirCidadeMundo(isoAtual, pais?.nome || isoAtual, { lat: c.lat, lng: c.lng }, c);
    };
  });
}

// ---------- Controles estáticos ----------

export function ligarControles(state) {
  document.getElementById('busca-pais').addEventListener('input', debounce((e) => {
    renderListaPaises(state, e.target.value);
  }, 150));

  document.getElementById('btn-add-pais').onclick = () => {
    document.getElementById('busca-pais').focus();
  };
}
