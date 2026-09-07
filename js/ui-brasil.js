// ============================================================
// Aba Brasil: mapa de estados coloridos por % visitado,
// drill-down para municípios de um estado.
// ============================================================

import { corPorPercentual, normalizar, debounce, formatarData, quandoMapaTiverTamanho, travarNavegacao } from './util.js';
import { abrirCidadeBR } from './ui-modal-cidade.js';

let mapaFull = null, camadaFull = null;
let mapaEstado = null, camadaMunicipios = null, camadaNomes = null;

let siglaAtual = null;
let geoMunicipiosAtual = null;
let filtroMunicipioAtual = 'todas';
const cacheMunicipios = {}; // sigla -> FeatureCollection

const MUNICIPIOS_POR_PAGINA = 60;
let municipiosMostrados = MUNICIPIOS_POR_PAGINA;

// O limiar de zoom para mostrar os nomes é calculado por estado, com base no
// tamanho MÉDIO DOS MUNICÍPIOS (não no tamanho do estado). Ancorar no estado
// penalizava os menores: PR e SC já abrem num zoom mais fechado, então exigiam
// muito mais zoom que RS/MG pra ver o mesmo tanto de nome. Assim o critério
// passa a ser "cada município já está grande o bastante na tela pra caber um
// rótulo", que se comporta igual em qualquer estado.
let zoomLimiarNomes = null;
const LARGURA_ALVO_MUNICIPIO_PX = 85; // quanto um município médio precisa ocupar na tela
const MAX_NOMES_NA_TELA = 60; // teto de rótulos simultâneos, pra não pesar nem poluir

/** Zoom em que o município médio desse estado passa a ocupar ~LARGURA_ALVO_MUNICIPIO_PX na tela. */
function calcularZoomLimiar(bounds, qtdMunicipios) {
  const larguraGraus = Math.abs(bounds.getEast() - bounds.getWest());
  const alturaGraus = Math.abs(bounds.getNorth() - bounds.getSouth());
  const areaGraus = Math.max(larguraGraus * alturaGraus, 1e-6);
  const larguraMediaMunicipio = Math.sqrt(areaGraus / Math.max(qtdMunicipios, 1));
  // No Web Mercator, 1 grau de longitude = 256 * 2^zoom / 360 pixels.
  return Math.log2((LARGURA_ALVO_MUNICIPIO_PX * 360) / (256 * larguraMediaMunicipio));
}

// ---------- Índice de cidades visitadas ----------
// Antes, cada município do mapa e da lista fazia uma busca linear no array de
// cidades visitadas (853 municípios × N cidades em MG). Aqui montamos um índice
// uma vez por atualização de dados e reaproveitamos.
let _indiceCache = null, _indiceFonte = null;

function indiceCidades(state) {
  if (_indiceFonte === state.cidadesBR && _indiceCache) return _indiceCache;
  const porId = new Map();
  const porUF = new Map();
  for (const c of state.cidadesBR) {
    porId.set(c.id, c);
    porUF.set(c.uf, (porUF.get(c.uf) || 0) + 1);
  }
  _indiceCache = { porId, porUF };
  _indiceFonte = state.cidadesBR;
  return _indiceCache;
}

// ---------- Estatísticas ----------

export function statsDoEstado(state, sigla) {
  const total = state.contagemUF[sigla] || 0;
  const visitadas = indiceCidades(state).porUF.get(sigla) || 0;
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

  quandoMapaTiverTamanho(mapaFull, () => {
    const bounds = camadaFull.getBounds();
    mapaFull.fitBounds(bounds, { padding: [6, 6] });
    travarNavegacao(mapaFull, bounds);
  });
}

export function aoMostrarAbaBrasil() {
  if (mapaFull) setTimeout(() => mapaFull.invalidateSize(), 60);
}

// ---------- Atualização reativa (dados do Firestore mudaram) ----------

// São 4 escutas no Firestore (cidades BR, países, cidades mundo, viagens) e
// todas chamam isto. Sem agrupar, cada carga inicial redesenhava a tela 4×.
let atualizacaoAgendada = false;

export function atualizar(state) {
  if (atualizacaoAgendada) return;
  atualizacaoAgendada = true;
  requestAnimationFrame(() => {
    atualizacaoAgendada = false;
    aplicarAtualizacao(state);
  });
}

function aplicarAtualizacao(state) {
  if (camadaFull) camadaFull.setStyle(estiloEstado(state));
  renderListaEstados(state, document.getElementById('busca-estado')?.value || '');
  if (siglaAtual) {
    atualizarKPIsEstado(state, siglaAtual);
    if (camadaMunicipios) camadaMunicipios.setStyle(estiloMunicipio(state));
    renderListaMunicipios(state);
    atualizarNomesVisiveis();
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
      <div class="badge-bandeira ${e.visitadas === 0 ? 'zero' : ''}">
        <img src="bandeiras/${e.sigla.toLowerCase()}.png" alt="" loading="lazy">
      </div>
      <div class="linha-info">
        <div class="nome">${e.nome} <span class="uf-tag">${e.sigla}</span></div>
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
  const { porId } = indiceCidades(state);
  return (feature) => {
    const visitado = porId.has(feature.properties.id);
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
  document.getElementById('estado-badge').innerHTML = `<img src="bandeiras/${sigla.toLowerCase()}.png" alt="">`;
  document.getElementById('estado-nome').innerHTML = `${feature.properties.name} <span class="uf-tag">${sigla}</span>`;
  document.getElementById('estado-sub').textContent = `${state.contagemUF[sigla] || 0} municípios`;
  atualizarKPIsEstado(state, sigla);

  document.getElementById('busca-municipio').value = '';
  filtroMunicipioAtual = 'todas';
  municipiosMostrados = MUNICIPIOS_POR_PAGINA;
  document.querySelectorAll('[data-filtro-mun]').forEach((c) => c.classList.toggle('ativo', c.dataset.filtroMun === 'todas'));
  document.getElementById('lista-municipios').innerHTML = '<div class="vazio"><span class="loading-dot"></span></div>';

  // Limpa os nomes do estado anterior de imediato (senão ficam na tela até o
  // novo mapa terminar de se ajustar).
  if (camadaNomes) camadaNomes.clearLayers();

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
    }
  }).addTo(mapaEstado);

  mapaEstado.off('moveend', onMapaEstadoMoveu);
  mapaEstado.on('moveend', onMapaEstadoMoveu);

  // Importante: só calcula o enquadramento (fitBounds) DEPOIS que o contêiner
  // já tem o tamanho real — se calcular antes (contêiner recém-exibido, ainda
  // sem layout), o Leaflet erra o zoom e libera os nomes cedo demais.
  const camadaRef = camadaMunicipios;
  const qtdMunicipios = geoMunicipiosAtual.features.length;
  const siglaDestaChamada = sigla;
  quandoMapaTiverTamanho(mapaEstado, () => {
    // Se o usuário já trocou de estado enquanto esperávamos, não mexe no mapa.
    if (siglaAtual !== siglaDestaChamada) return;
    const bounds = camadaRef.getBounds();
    // Libera os limites antigos antes de reenquadrar (senão o estado anterior
    // ainda restringe o novo e o mapa pode abrir fora de vista).
    mapaEstado.setMinZoom(1);
    mapaEstado.setMaxBounds(null);
    mapaEstado.fitBounds(bounds, { padding: [8, 8] });
    travarNavegacao(mapaEstado, bounds);
    zoomLimiarNomes = calcularZoomLimiar(bounds, qtdMunicipios);
    atualizarNomesVisiveis();
  });

  renderListaMunicipios(state);
}

function onMapaEstadoMoveu() {
  atualizarNomesVisiveis();
}

/**
 * Cria rótulo APENAS para os municípios que estão na tela agora, e só quando o
 * zoom passa do limiar. Criar os rótulos de todos de uma vez (496 no RS, 853 em
 * MG) fazia o Leaflet reposicionar centenas de elementos a cada arrastar/zoom —
 * era isso que deixava o mapa travado e lento pra abrir.
 *
 * O rótulo é posicionado dentro da PARTE VISÍVEL do município: quando se dá
 * bastante zoom, o município fica maior que a tela e seu centro sai de vista —
 * era por isso que vários nomes simplesmente não apareciam.
 */
function atualizarNomesVisiveis() {
  if (!mapaEstado || !camadaMunicipios || zoomLimiarNomes == null) return;

  if (!camadaNomes) camadaNomes = L.layerGroup().addTo(mapaEstado);
  camadaNomes.clearLayers();

  if (mapaEstado.getZoom() < zoomLimiarNomes) return;

  const areaVisivel = mapaEstado.getBounds();
  const centroTela = areaVisivel.getCenter();
  const candidatos = [];

  camadaMunicipios.eachLayer((layer) => {
    const posicao = pontoVisivelDoMunicipio(layer.getBounds(), areaVisivel);
    if (!posicao) return;
    const dLat = posicao.lat - centroTela.lat;
    const dLng = posicao.lng - centroTela.lng;
    candidatos.push({ posicao, nome: layer.feature.properties.name, distancia: dLat * dLat + dLng * dLng });
  });

  // Se houver mais candidatos que o teto, mantém os mais próximos do centro da
  // tela — assim o corte nunca descarta um município que você está olhando.
  if (candidatos.length > MAX_NOMES_NA_TELA) {
    candidatos.sort((a, b) => a.distancia - b.distancia);
    candidatos.length = MAX_NOMES_NA_TELA;
  }

  for (const c of candidatos) {
    camadaNomes.addLayer(
      L.tooltip({ permanent: true, direction: 'center', className: 'municipio-label', interactive: false })
        .setLatLng(c.posicao)
        .setContent(c.nome)
    );
  }
}

/** Onde colocar o nome: no centro do município se ele estiver visível; senão, no meio do pedaço que aparece na tela. */
function pontoVisivelDoMunicipio(boundsMunicipio, areaVisivel) {
  if (!areaVisivel.intersects(boundsMunicipio)) return null;
  const centro = boundsMunicipio.getCenter();
  if (areaVisivel.contains(centro)) return centro;

  const sul = Math.max(boundsMunicipio.getSouth(), areaVisivel.getSouth());
  const norte = Math.min(boundsMunicipio.getNorth(), areaVisivel.getNorth());
  const oeste = Math.max(boundsMunicipio.getWest(), areaVisivel.getWest());
  const leste = Math.min(boundsMunicipio.getEast(), areaVisivel.getEast());
  if (sul > norte || oeste > leste) return null;
  return L.latLng((sul + norte) / 2, (oeste + leste) / 2);
}

export function fecharEstado() {
  document.getElementById('brasil-estado-view').classList.add('hidden');
  document.getElementById('brasil-lista-view').classList.remove('hidden');
  siglaAtual = null;
  if (camadaNomes) camadaNomes.clearLayers();
}

function atualizarKPIsEstado(state, sigla) {
  const { visitadas, faltam, pct } = statsDoEstado(state, sigla);
  document.getElementById('estado-kpi-visitadas').textContent = visitadas;
  document.getElementById('estado-kpi-faltam').textContent = faltam;
  document.getElementById('estado-kpi-pct').textContent = pct + '%';
}

function onCliqueMunicipio(state, feature, sigla) {
  const registro = indiceCidades(state).porId.get(feature.properties.id);
  abrirCidadeBR(feature, sigla, registro || null);
}

// ---------- Lista de municípios (dentro do estado) ----------

export function renderListaMunicipios(state) {
  const cont = document.getElementById('lista-municipios');
  if (!cont || !geoMunicipiosAtual) return;

  const busca = document.getElementById('busca-municipio').value;
  const { porId } = indiceCidades(state);

  let itens = geoMunicipiosAtual.features.map((f) => ({
    feature: f, nome: f.properties.name, registro: porId.get(f.properties.id)
  }));

  if (filtroMunicipioAtual === 'visitadas') itens = itens.filter((i) => i.registro);
  if (filtroMunicipioAtual === 'faltam') itens = itens.filter((i) => !i.registro);
  if (busca) itens = itens.filter((i) => normalizar(i.nome).includes(normalizar(busca)));

  itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (!itens.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🏙️</div><p>Nenhum município encontrado.</p></div>';
    return;
  }

  // Só desenha um pedaço por vez. Desenhar os 853 municípios de MG de uma vez
  // (cada um com foto e clique próprio) travava a tela e deixava a abertura do
  // estado lenta — ainda mais porque isso se repetia a cada atualização de dados.
  const visiveis = itens.slice(0, municipiosMostrados);
  const restantes = itens.length - visiveis.length;

  cont.innerHTML = visiveis.map((i) => `
    <div class="cidade-card ${i.registro ? '' : 'nao-visitada'}" data-id="${i.feature.properties.id}">
      <div class="cidade-thumb" ${i.registro?.fotos?.[0] ? `style="background-image:url('${i.registro.fotos[0]}')"` : ''}>
        ${i.registro?.fotos?.[0] ? '' : '🏛️'}
      </div>
      <div>
        <div class="nome">${i.nome}</div>
        <div class="meta">${i.registro ? (i.registro.dataVisita ? formatarData(i.registro.dataVisita) : 'data não registrada') + ' · ' + (i.registro.fotos?.length || 0) + ' fotos' : 'ainda não visitada'}</div>
      </div>
    </div>`).join('')
    + (restantes > 0
      ? `<button class="pill-btn ghost full" id="btn-mais-municipios">Mostrar mais ${Math.min(restantes, MUNICIPIOS_POR_PAGINA)} (faltam ${restantes})</button>`
      : '');

  const porIdItem = new Map(visiveis.map((i) => [i.feature.properties.id, i]));
  cont.querySelectorAll('.cidade-card').forEach((card) => {
    card.onclick = () => {
      const item = porIdItem.get(card.dataset.id);
      if (item) abrirCidadeBR(item.feature, siglaAtual, item.registro || null);
    };
  });

  const btnMais = document.getElementById('btn-mais-municipios');
  if (btnMais) btnMais.onclick = () => {
    municipiosMostrados += MUNICIPIOS_POR_PAGINA;
    renderListaMunicipios(state);
  };
}

// ---------- Listeners estáticos (busca e filtros dentro do estado) ----------

export function ligarControlesEstado(state) {
  document.getElementById('busca-municipio').addEventListener('input', debounce(() => {
    municipiosMostrados = MUNICIPIOS_POR_PAGINA;
    renderListaMunicipios(state);
  }, 150));

  document.querySelectorAll('[data-filtro-mun]').forEach((chip) => {
    chip.onclick = () => {
      filtroMunicipioAtual = chip.dataset.filtroMun;
      municipiosMostrados = MUNICIPIOS_POR_PAGINA;
      document.querySelectorAll('[data-filtro-mun]').forEach((c) => c.classList.toggle('ativo', c === chip));
      renderListaMunicipios(state);
    };
  });

  document.getElementById('busca-estado').addEventListener('input', debounce((e) => {
    renderListaEstados(state, e.target.value);
  }, 150));
}
