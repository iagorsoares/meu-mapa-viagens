// ============================================================
// Aba Brasil: mapa de estados coloridos por % visitado,
// drill-down para municípios de um estado.
// ============================================================

import { corPorPercentual, normalizar, debounce, formatarData } from './util.js';
import { abrirCidadeBR } from './ui-modal-cidade.js';

let mapaFull = null, camadaFull = null;
let mapaEstado = null, camadaMunicipios = null;

let siglaAtual = null;
let geoMunicipiosAtual = null;
let filtroMunicipioAtual = 'todas';
const cacheMunicipios = {}; // sigla -> FeatureCollection

// O limiar de zoom para mostrar os nomes é calculado por estado, com base no
// tamanho MÉDIO DOS MUNICÍPIOS (não no tamanho do estado). Ancorar no estado
// penalizava os menores: PR e SC já abrem num zoom mais fechado, então exigiam
// muito mais zoom que RS/MG pra ver o mesmo tanto de nome. Assim o critério
// passa a ser "cada município já está grande o bastante na tela pra caber um
// rótulo", que se comporta igual em qualquer estado.
let zoomLimiarNomes = null;
const LARGURA_ALVO_MUNICIPIO_PX = 85; // quanto um município médio precisa ocupar na tela

/** Zoom em que o município médio desse estado passa a ocupar ~LARGURA_ALVO_MUNICIPIO_PX na tela. */
function calcularZoomLimiar(bounds, qtdMunicipios) {
  const larguraGraus = Math.abs(bounds.getEast() - bounds.getWest());
  const alturaGraus = Math.abs(bounds.getNorth() - bounds.getSouth());
  const areaGraus = Math.max(larguraGraus * alturaGraus, 1e-6);
  const larguraMediaMunicipio = Math.sqrt(areaGraus / Math.max(qtdMunicipios, 1));
  // No Web Mercator, 1 grau de longitude = 256 * 2^zoom / 360 pixels.
  return Math.log2((LARGURA_ALVO_MUNICIPIO_PX * 360) / (256 * larguraMediaMunicipio));
}

// ---------- Estatísticas ----------

export function statsDoEstado(state, sigla) {
  const total = state.contagemUF[sigla] || 0;
  const visitadas = state.cidadesBR.filter((c) => c.uf === sigla).length;
  const pct = total ? Math.round((visitadas / total) * 100) : 0;
  return { total, visitadas, faltam: Math.max(total - visitadas, 0), pct };
}

function estiloEstado(state) {
  return (feature) => ({
    fillColor: corPorPercentual(statsDoEstado(state, feature.properties.sigla).pct),
    color: '#ffffff', weight: 1.4, fillOpacity: 0.92
  });
}

// ---------- Mapa completo (aba Brasil) ----------

export function iniciarMapaCompleto(state) {
  mapaFull = L.map('mapa-brasil-full', { attributionControl: false, preferCanvas: true });
  camadaFull = L.geoJSON(state.estadosGeo, {
    style: estiloEstado(state),
    onEachFeature: (feature, layer) => {
      layer.on('click', () => abrirEstado(state, feature.properties.sigla));
    }
  }).addTo(mapaFull);
  mapaFull.fitBounds(camadaFull.getBounds(), { padding: [6, 6] });
  mapaFull.setMinZoom(mapaFull.getZoom());
  setTimeout(() => mapaFull.invalidateSize(), 60);
}

export function aoMostrarAbaBrasil() {
  if (mapaFull) setTimeout(() => mapaFull.invalidateSize(), 60);
}

// ---------- Atualização reativa (dados do Firestore mudaram) ----------

export function atualizar(state) {
  if (camadaFull) camadaFull.setStyle(estiloEstado(state));
  renderListaEstados(state, document.getElementById('busca-estado')?.value || '');
  if (siglaAtual) {
    atualizarKPIsEstado(state, siglaAtual);
    if (camadaMunicipios) camadaMunicipios.setStyle(estiloMunicipio(state));
    renderListaMunicipios(state);
  }
}

// ---------- Lista de estados ----------

export function renderListaEstados(state, filtroBusca = '') {
  const cont = document.getElementById('lista-estados');
  if (!cont) return;

  const estados = state.estadosGeo.features
    .map((f) => ({ sigla: f.properties.sigla, nome: f.properties.name, ...statsDoEstado(state, f.properties.sigla) }))
    .filter((e) => !filtroBusca || normalizar(e.nome).includes(normalizar(filtroBusca)) || normalizar(e.sigla).includes(normalizar(filtroBusca)))
    .sort((a, b) => b.pct - a.pct || a.nome.localeCompare(b.nome, 'pt-BR'));

  if (!estados.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🔍</div><p>Nenhum estado encontrado.</p></div>';
    return;
  }

  cont.innerHTML = estados.map((e) => `
    <div class="lista-row" data-sigla="${e.sigla}">
      <div class="badge ${e.visitadas === 0 ? 'zero' : ''}">${e.sigla}</div>
      <div class="linha-info">
        <div class="nome">${e.nome}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${e.pct}%"></div></div>
      </div>
      <div class="linha-pct">${e.pct}%</div>
      <div class="linha-seta">›</div>
    </div>`).join('');

  cont.querySelectorAll('.lista-row').forEach((row) => {
    row.onclick = () => abrirEstado(state, row.dataset.sigla);
  });
}

// ---------- Drill-down: estado ----------

async function carregarMunicipios(sigla) {
  if (cacheMunicipios[sigla]) return cacheMunicipios[sigla];
  const resp = await fetch(`data/municipios/${sigla.toLowerCase()}.json`);
  if (!resp.ok) throw new Error('Não consegui carregar os municípios de ' + sigla);
  const geo = await resp.json();
  cacheMunicipios[sigla] = geo;
  return geo;
}

function estiloMunicipio(state) {
  return (feature) => {
    const visitado = state.cidadesBR.some((c) => c.id === feature.properties.id);
    return {
      fillColor: visitado ? '#009966' : '#EDECE6',
      color: '#ffffff', weight: 1, fillOpacity: visitado ? 0.92 : 0.7
    };
  };
}

export async function abrirEstado(state, sigla) {
  siglaAtual = sigla;
  document.getElementById('brasil-lista-view').classList.add('hidden');
  document.getElementById('brasil-estado-view').classList.remove('hidden');

  const feature = state.estadosGeo.features.find((f) => f.properties.sigla === sigla);
  document.getElementById('estado-badge').textContent = sigla;
  document.getElementById('estado-nome').textContent = feature.properties.name;
  document.getElementById('estado-sub').textContent = `${state.contagemUF[sigla] || 0} municípios`;
  atualizarKPIsEstado(state, sigla);

  document.getElementById('busca-municipio').value = '';
  filtroMunicipioAtual = 'todas';
  document.querySelectorAll('[data-filtro-mun]').forEach((c) => c.classList.toggle('ativo', c.dataset.filtroMun === 'todas'));
  document.getElementById('lista-municipios').innerHTML = '<div class="vazio"><span class="loading-dot"></span></div>';

  if (!mapaEstado) mapaEstado = L.map('mapa-estado-detalhe', { attributionControl: false, preferCanvas: true });
  if (camadaMunicipios) { mapaEstado.removeLayer(camadaMunicipios); camadaMunicipios = null; }

  try {
    geoMunicipiosAtual = await carregarMunicipios(sigla);
  } catch (err) {
    document.getElementById('lista-municipios').innerHTML = `<div class="vazio"><p>${err.message}</p></div>`;
    return;
  }

  camadaMunicipios = L.geoJSON(geoMunicipiosAtual, {
    style: estiloMunicipio(state),
    onEachFeature: (feat, layer) => {
      layer.on('click', () => onCliqueMunicipio(state, feat, sigla));
      layer.bindTooltip(feat.properties.name, { permanent: true, direction: 'center', className: 'municipio-label' });
    }
  }).addTo(mapaEstado);

  // Esconde os nomes de imediato — só reaparecem quando o zoom passar do
  // limite (senão dá um "flash" de todos os nomes enquanto o mapa se ajusta).
  const painelNomes = mapaEstado.getPane('tooltipPane');
  if (painelNomes) painelNomes.style.display = 'none';

  mapaEstado.off('zoomend', onZoomMudouEstado);
  mapaEstado.on('zoomend', onZoomMudouEstado);

  // Importante: só calcula o enquadramento (fitBounds) DEPOIS que o contêiner
  // já tem o tamanho real — se calcular antes (contêiner recém-exibido, ainda
  // sem layout), o Leaflet erra o zoom e libera os nomes cedo demais.
  const camadaRef = camadaMunicipios;
  const qtdMunicipios = geoMunicipiosAtual.features.length;
  setTimeout(() => {
    mapaEstado.invalidateSize();
    const bounds = camadaRef.getBounds();
    mapaEstado.fitBounds(bounds, { padding: [8, 8] });
    zoomLimiarNomes = calcularZoomLimiar(bounds, qtdMunicipios);
    atualizarVisibilidadeNomes(mapaEstado);
  }, 80);

  renderListaMunicipios(state);
}

function onZoomMudouEstado() {
  atualizarVisibilidadeNomes(mapaEstado);
}

function atualizarVisibilidadeNomes(mapa) {
  if (!mapa || zoomLimiarNomes == null) return;
  const mostrar = mapa.getZoom() >= zoomLimiarNomes;
  // Esconde/mostra o painel inteiro onde o Leaflet desenha os rótulos.
  // (Não dá pra fazer isso só por CSS: o Leaflet define a opacidade de cada
  // tooltip como estilo inline, o que sobrepõe qualquer regra da folha de estilo.)
  const painel = mapa.getPane('tooltipPane');
  if (painel) painel.style.display = mostrar ? '' : 'none';
}

export function fecharEstado() {
  document.getElementById('brasil-estado-view').classList.add('hidden');
  document.getElementById('brasil-lista-view').classList.remove('hidden');
  siglaAtual = null;
}

function atualizarKPIsEstado(state, sigla) {
  const { visitadas, faltam, pct } = statsDoEstado(state, sigla);
  document.getElementById('estado-kpi-visitadas').textContent = visitadas;
  document.getElementById('estado-kpi-faltam').textContent = faltam;
  document.getElementById('estado-kpi-pct').textContent = pct + '%';
}

function onCliqueMunicipio(state, feature, sigla) {
  const registro = state.cidadesBR.find((c) => c.id === feature.properties.id);
  abrirCidadeBR(feature, sigla, registro || null);
}

// ---------- Lista de municípios (dentro do estado) ----------

export function renderListaMunicipios(state) {
  const cont = document.getElementById('lista-municipios');
  if (!cont || !geoMunicipiosAtual) return;

  const busca = document.getElementById('busca-municipio').value;

  let itens = geoMunicipiosAtual.features.map((f) => {
    const registro = state.cidadesBR.find((c) => c.id === f.properties.id);
    return { feature: f, nome: f.properties.name, registro };
  });

  if (filtroMunicipioAtual === 'visitadas') itens = itens.filter((i) => i.registro);
  if (filtroMunicipioAtual === 'faltam') itens = itens.filter((i) => !i.registro);
  if (busca) itens = itens.filter((i) => normalizar(i.nome).includes(normalizar(busca)));

  itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (!itens.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🏙️</div><p>Nenhum município encontrado.</p></div>';
    return;
  }

  cont.innerHTML = itens.map((i) => `
    <div class="cidade-card ${i.registro ? '' : 'nao-visitada'}" data-id="${i.feature.properties.id}">
      <div class="cidade-thumb" ${i.registro?.fotos?.[0] ? `style="background-image:url('${i.registro.fotos[0]}')"` : ''}>
        ${i.registro?.fotos?.[0] ? '' : '🏛️'}
      </div>
      <div>
        <div class="nome">${i.nome}</div>
        <div class="meta">${i.registro ? (i.registro.dataVisita ? formatarData(i.registro.dataVisita) : 'data não registrada') + ' · ' + (i.registro.fotos?.length || 0) + ' fotos' : 'ainda não visitada'}</div>
      </div>
    </div>`).join('');

  cont.querySelectorAll('.cidade-card').forEach((card) => {
    card.onclick = () => {
      const item = itens.find((i) => i.feature.properties.id === card.dataset.id);
      abrirCidadeBR(item.feature, siglaAtual, item.registro || null);
    };
  });
}

// ---------- Listeners estáticos (busca e filtros dentro do estado) ----------

export function ligarControlesEstado(state) {
  document.getElementById('busca-municipio').addEventListener('input', debounce(() => {
    renderListaMunicipios(state);
  }, 150));

  document.querySelectorAll('[data-filtro-mun]').forEach((chip) => {
    chip.onclick = () => {
      filtroMunicipioAtual = chip.dataset.filtroMun;
      document.querySelectorAll('[data-filtro-mun]').forEach((c) => c.classList.toggle('ativo', c === chip));
      renderListaMunicipios(state);
    };
  });

  document.getElementById('busca-estado').addEventListener('input', debounce((e) => {
    renderListaEstados(state, e.target.value);
  }, 150));
}
