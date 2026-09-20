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

// Medidas aproximadas do rótulo em pixels (font-size 7px, peso 600, Inter),
// usadas só pra checar se dois nomes iriam se sobrepor na tela.
const LARGURA_CARACTERE_PX = 4.2;
const ALTURA_ROTULO_PX = 11;
const FOLGA_ENTRE_ROTULOS_PX = 3;

// Âncoras dos nomes, calculadas uma vez por estado aberto.
let rotulosDoEstado = [];

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
  rotulosDoEstado = [];
  zoomLimiarNomes = null;

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
    prepararRotulos(geoMunicipiosAtual);
    zoomLimiarNomes = calcularZoomLimiar(bounds, qtdMunicipios);
    atualizarNomesVisiveis();
  });

  renderListaMunicipios(state);
}

function onMapaEstadoMoveu() {
  atualizarNomesVisiveis();
}

// ---------- Onde colocar o nome de cada município ----------
//
// A versão anterior colocava o nome no meio do RETÂNGULO que envolve o
// município, recortado pela tela. Com bastante zoom, o retângulo de vários
// municípios vizinhos cobre a tela inteira — e aí todos os nomes iam parar no
// mesmo ponto, o centro da tela. Era esse o empilhamento de nomes.
//
// Agora cada nome é ancorado num ponto que está DENTRO do próprio município
// (não no retângulo). Como dois municípios não se sobrepõem, dois nomes nunca
// mais caem no mesmo lugar. Por cima disso, um nome só é desenhado se não
// encostar em outro que já foi desenhado.

/** Anéis externos da feature (serve pra Polygon e MultiPolygon). */
function aneisDaFeature(geometria) {
  if (!geometria) return [];
  if (geometria.type === 'Polygon') return (geometria.coordinates || []).slice(0, 1).filter(Boolean);
  if (geometria.type === 'MultiPolygon') return (geometria.coordinates || []).map((p) => p && p[0]).filter(Boolean);
  return [];
}

function areaDoAnel(anel) {
  let soma = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    soma += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
  }
  return Math.abs(soma / 2);
}

function pontoDentroDoAnel(lng, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if ((yi > lat) !== (yj > lat)) {
      const x = xi + ((lat - yi) * (xj - xi)) / (yj - yi);
      if (x > lng) dentro = !dentro;
    }
  }
  return dentro;
}

/** Trechos de uma linha horizontal (numa latitude) que caem dentro do anel. */
function faixasNaLatitude(anel, lat) {
  const cortes = [];
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if ((yi > lat) !== (yj > lat)) {
      cortes.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
    }
  }
  cortes.sort((a, b) => a - b);
  const faixas = [];
  for (let i = 0; i + 1 < cortes.length; i += 2) faixas.push([cortes[i], cortes[i + 1]]);
  return faixas;
}

/**
 * Ponto fixo garantidamente dentro do município: o centroide, quando ele cai
 * dentro do contorno; senão o meio do trecho mais largo na altura do centroide
 * (municípios em forma de C ou de L têm o centroide fora de si mesmos).
 */
function pontoInternoDoAnel(anel) {
  let cx = 0, cy = 0, area2 = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const f = anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
    area2 += f;
    cx += (anel[j][0] + anel[i][0]) * f;
    cy += (anel[j][1] + anel[i][1]) * f;
  }

  let latRef = null;
  if (area2 !== 0) {
    const a = area2 / 2;
    const lng = cx / (6 * a), lat = cy / (6 * a);
    if (isFinite(lng) && isFinite(lat)) {
      if (pontoDentroDoAnel(lng, lat, anel)) return { lat, lng };
      latRef = lat;
    }
  }
  if (latRef == null) {
    let sul = Infinity, norte = -Infinity;
    for (const [, y] of anel) { if (y < sul) sul = y; if (y > norte) norte = y; }
    if (!isFinite(sul) || !isFinite(norte)) return null;
    latRef = (sul + norte) / 2;
  }

  let melhor = null;
  for (const faixa of faixasNaLatitude(anel, latRef)) {
    if (!melhor || faixa[1] - faixa[0] > melhor[1] - melhor[0]) melhor = faixa;
  }
  return melhor ? { lat: latRef, lng: (melhor[0] + melhor[1]) / 2 } : null;
}

/** Calcula uma vez, por estado, a âncora e os limites de cada município. */
function prepararRotulos(geo) {
  rotulosDoEstado = [];
  if (!geo || !geo.features) return;

  for (const feature of geo.features) {
    const aneis = aneisDaFeature(feature.geometry);
    if (!aneis.length) continue;

    let principal = aneis[0], maiorArea = -1;
    for (const anel of aneis) {
      const a = areaDoAnel(anel);
      if (a > maiorArea) { maiorArea = a; principal = anel; }
    }

    const ancora = pontoInternoDoAnel(principal);
    if (!ancora) continue;

    let sul = Infinity, norte = -Infinity, oeste = Infinity, leste = -Infinity;
    for (const anel of aneis) {
      for (const [x, y] of anel) {
        if (y < sul) sul = y;
        if (y > norte) norte = y;
        if (x < oeste) oeste = x;
        if (x > leste) leste = x;
      }
    }

    rotulosDoEstado.push({
      nome: feature.properties.name,
      lat: ancora.lat, lng: ancora.lng,
      sul, norte, oeste, leste, aneis
    });
  }
}

/**
 * Quando o município é maior que a tela, a âncora fixa fica fora de vista.
 * Aqui procuramos um ponto que esteja dentro do município E dentro da tela:
 * cortamos o município numa linha horizontal e pegamos o meio do trecho mais
 * largo que aparece. Como os municípios não se sobrepõem, o ponto de cada um
 * continua sendo só dele.
 */
function pontoInternoNaTela(municipio, sulV, norteV, oesteV, lesteV) {
  const sul = Math.max(municipio.sul, sulV);
  const norte = Math.min(municipio.norte, norteV);
  if (sul > norte) return null;

  const alturaVisivel = norte - sul;
  const tentativas = [sul + alturaVisivel * 0.5, sul + alturaVisivel * 0.3, sul + alturaVisivel * 0.7];

  for (const lat of tentativas) {
    let melhor = null;
    for (const anel of municipio.aneis) {
      for (const faixa of faixasNaLatitude(anel, lat)) {
        const ini = Math.max(faixa[0], oesteV);
        const fim = Math.min(faixa[1], lesteV);
        if (fim <= ini) continue;
        if (!melhor || fim - ini > melhor[1] - melhor[0]) melhor = [ini, fim];
      }
    }
    if (melhor) return { lat, lng: (melhor[0] + melhor[1]) / 2 };
  }
  return null;
}

function rotuloEncosta(colocados, x, y, largura, altura) {
  for (const o of colocados) {
    if (Math.abs(x - o.x) < (largura + o.largura) / 2 + FOLGA_ENTRE_ROTULOS_PX &&
        Math.abs(y - o.y) < (altura + o.altura) / 2 + FOLGA_ENTRE_ROTULOS_PX) {
      return true;
    }
  }
  return false;
}

/**
 * Cria rótulo APENAS para os municípios que estão na tela agora, e só quando o
 * zoom passa do limiar. Criar os rótulos de todos de uma vez (496 no RS, 853 em
 * MG) fazia o Leaflet reposicionar centenas de elementos a cada arrastar/zoom —
 * era isso que deixava o mapa travado e lento pra abrir.
 */
function atualizarNomesVisiveis() {
  if (!mapaEstado || zoomLimiarNomes == null) return;

  if (!camadaNomes) camadaNomes = L.layerGroup().addTo(mapaEstado);
  camadaNomes.clearLayers();

  if (!rotulosDoEstado.length) return;
  if (mapaEstado.getZoom() < zoomLimiarNomes) return;

  const areaVisivel = mapaEstado.getBounds();
  const sulV = areaVisivel.getSouth(), norteV = areaVisivel.getNorth();
  const oesteV = areaVisivel.getWest(), lesteV = areaVisivel.getEast();
  const centro = areaVisivel.getCenter();

  // Quanto vale um pixel em graus, pra manter o nome longe da beirada da tela
  // (um nome centrado na borda apareceria cortado pela metade).
  const tela = mapaEstado.getSize();
  const grausPorPxLng = (lesteV - oesteV) / Math.max(tela.x, 1);
  const grausPorPxLat = (norteV - sulV) / Math.max(tela.y, 1);

  const candidatos = [];
  for (const m of rotulosDoEstado) {
    if (m.norte < sulV || m.sul > norteV || m.leste < oesteV || m.oeste > lesteV) continue;

    const largura = Math.max(m.nome.length * LARGURA_CARACTERE_PX, 16);

    let lat = m.lat, lng = m.lng;
    if (lat < sulV || lat > norteV || lng < oesteV || lng > lesteV) {
      // Município maior que a tela: procura um ponto interno já afastado das
      // bordas, senão o nome sai pela metade.
      const margemX = Math.min(largura / 2 + 4, tela.x * 0.3) * grausPorPxLng;
      const margemY = Math.min(ALTURA_ROTULO_PX / 2 + 4, tela.y * 0.3) * grausPorPxLat;
      const alternativo = pontoInternoNaTela(
        m, sulV + margemY, norteV - margemY, oesteV + margemX, lesteV - margemX
      );
      if (!alternativo) continue;
      lat = alternativo.lat;
      lng = alternativo.lng;
    }

    const dLat = lat - centro.lat, dLng = lng - centro.lng;
    candidatos.push({ nome: m.nome, lat, lng, largura, distancia: dLat * dLat + dLng * dLng });
  }

  // Do centro da tela pra fora: o que você está olhando ganha o nome primeiro,
  // e quem sobrar sem espaço fica de fora em vez de escrever por cima.
  candidatos.sort((a, b) => a.distancia - b.distancia);

  const colocados = [];
  for (const c of candidatos) {
    if (colocados.length >= MAX_NOMES_NA_TELA) break;

    const p = mapaEstado.latLngToContainerPoint(L.latLng(c.lat, c.lng));

    // Fora da tela ou cortado pela borda: melhor não desenhar do que desenhar
    // um nome pela metade.
    if (p.x - c.largura / 2 < 1 || p.x + c.largura / 2 > tela.x - 1) continue;
    if (p.y - ALTURA_ROTULO_PX / 2 < 1 || p.y + ALTURA_ROTULO_PX / 2 > tela.y - 1) continue;

    if (rotuloEncosta(colocados, p.x, p.y, c.largura, ALTURA_ROTULO_PX)) continue;
    colocados.push({ x: p.x, y: p.y, largura: c.largura, altura: ALTURA_ROTULO_PX });

    camadaNomes.addLayer(
      L.tooltip({ permanent: true, direction: 'center', className: 'municipio-label', interactive: false })
        .setLatLng(L.latLng(c.lat, c.lng))
        .setContent(c.nome)
    );
  }
}

export function fecharEstado() {
  document.getElementById('brasil-estado-view').classList.add('hidden');
  document.getElementById('brasil-lista-view').classList.remove('hidden');
  siglaAtual = null;
  if (camadaNomes) camadaNomes.clearLayers();
  rotulosDoEstado = [];
  zoomLimiarNomes = null;
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
