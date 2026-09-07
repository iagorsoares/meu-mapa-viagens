// ============================================================
// Aba Mundo: países visitados destacados no mapa-múndi. Cada
// país guarda uma lista de anos visitados (sem cidades/fotos —
// isso já é feito com detalhe na aba Brasil). O Brasil não entra
// nesse fluxo, é o país de origem, não "visitado".
// ============================================================

import { normalizar, debounce, mostrarToast, quandoMapaTiverTamanho, travarNavegacao, nomePaisPT, aplicarReservaBandeiras } from './util.js';
import { enviarFoto, urlMiniatura } from './upload.js';
import { abrirLightbox } from './ui-lightbox.js';

let cbs = null; // { aoSalvarPais(dadosPais) }
let mapaFull = null, camadaFull = null;
let mapaPais = null, camadaContornoPais = null;
let isoAtual = null;

export function iniciar(callbacks) {
  cbs = callbacks;
}

function estiloPais(state) {
  return (feature) => {
    if (feature.properties.iso2 === 'BR') {
      return { fillColor: '#6D9EF5', color: '#ffffff', weight: 0.8, fillOpacity: 0.75 };
    }
    const visitado = state.paises.some((p) => p.id === feature.properties.iso2);
    return {
      fillColor: visitado ? '#009966' : '#EDECE6',
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

  quandoMapaTiverTamanho(mapaFull, () => {
    // Impede arrastar o mundo pra fora da tela (mais folga que nos outros
    // mapas, pra ainda dar pra circular bem pelo globo).
    mapaFull.setMaxBounds(L.latLngBounds([-85, -180], [85, 180]).pad(0.1));
    mapaFull.options.maxBoundsViscosity = 0.6;
  });
}

export function aoMostrarAbaMundo() {
  if (mapaFull) setTimeout(() => mapaFull.invalidateSize(), 60);
}

export function atualizar(state) {
  if (camadaFull) camadaFull.setStyle(estiloPais(state));
  renderListaPaises(state, document.getElementById('busca-pais')?.value || '');
  if (isoAtual) { renderAnosPais(state); renderFotosPais(state); }
}

function onCliquePais(state, feature) {
  const iso2 = feature.properties.iso2;

  if (iso2 === 'BR') {
    mostrarToast('O Brasil tem a própria aba, com estados e municípios');
    return;
  }

  const jaVisitado = state.paises.some((p) => p.id === iso2);
  if (!jaVisitado) {
    const nomePt = nomePaisPT(iso2, feature.properties.name);
    if (confirm(`Marcar ${nomePt} como visitado?`)) {
      cbs.aoSalvarPais({ iso2, iso3: feature.properties.iso3, nome: nomePt });
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
    .filter((p) => p.id !== 'BR')
    .map((p) => ({ ...p, nomeExibido: nomePaisPT(p.id, p.nome) }))
    .filter((p) => !filtroBusca || normalizar(p.nomeExibido).includes(normalizar(filtroBusca)))
    .sort((a, b) => a.nomeExibido.localeCompare(b.nomeExibido, 'pt-BR'));

  if (!visitados.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🌎</div><p>Nenhum país registrado ainda.<br>Toque em um país no mapa pra começar.</p></div>';
    return;
  }

  cont.innerHTML = visitados.map((p) => {
    const anos = (p.anos || []).slice().sort();
    const resumo = anos.length ? anos.join(', ') : 'ano não registrado';
    return `
    <div class="lista-row" data-iso="${p.id}">
      <div class="badge-bandeira"><img src="bandeiras-paises/${p.id.toLowerCase()}.png" alt="" loading="lazy" data-bandeira-iso="${p.id}"></div>
      <div class="linha-info">
        <div class="nome">${p.nomeExibido}</div>
        <div class="meta mono" style="font-size:10.5px;color:var(--muted);margin-top:2px;">${resumo}</div>
      </div>
      <div class="linha-seta">›</div>
    </div>`;
  }).join('');

  aplicarReservaBandeiras(cont);

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
  const elBadgePais = document.getElementById('pais-badge');
  elBadgePais.innerHTML = `<img src="bandeiras-paises/${iso2.toLowerCase()}.png" alt="" data-bandeira-iso="${iso2}">`;
  aplicarReservaBandeiras(elBadgePais);
  document.getElementById('pais-nome').textContent = nomePaisPT(iso2, pais?.nome || feature?.properties.name || iso2);
  document.getElementById('input-novo-ano').value = '';

  if (!mapaPais) mapaPais = L.map('mapa-pais-detalhe', { attributionControl: false, preferCanvas: true, zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false });
  if (camadaContornoPais) mapaPais.removeLayer(camadaContornoPais);

  if (feature) {
    camadaContornoPais = L.geoJSON(feature, { style: { fillColor: '#009966', color: '#155EEF', weight: 1.5, fillOpacity: .18 } }).addTo(mapaPais);
    const camadaRef = camadaContornoPais;
    const isoDestaChamada = iso2;
    quandoMapaTiverTamanho(mapaPais, () => {
      if (isoAtual !== isoDestaChamada) return;
      mapaPais.fitBounds(camadaRef.getBounds(), { padding: [12, 12] });
    });
  }

  renderAnosPais(state);
  renderFotosPais(state);
}

export function fecharPais() {
  document.getElementById('mundo-pais-view').classList.add('hidden');
  document.getElementById('mundo-lista-view').classList.remove('hidden');
  isoAtual = null;
}

function renderAnosPais(state) {
  const cont = document.getElementById('lista-anos-pais');
  if (!cont) return;
  const pais = state.paises.find((p) => p.id === isoAtual);
  const anos = (pais?.anos || []).slice().sort();

  if (!anos.length) {
    cont.innerHTML = '<div class="vazio" style="padding:16px;"><p>Nenhum ano registrado ainda.</p></div>';
  } else {
    cont.innerHTML = anos.map((ano) => `
      <div class="ano-chip" data-ano="${ano}">
        <span>${ano}</span>
        <button type="button" aria-label="Remover ${ano}">✕</button>
      </div>`).join('');

    cont.querySelectorAll('.ano-chip button').forEach((btn) => {
      btn.onclick = () => {
        const ano = parseInt(btn.closest('.ano-chip').dataset.ano, 10);
        const novosAnos = anos.filter((a) => a !== ano);
        cbs.aoSalvarPais({ iso2: isoAtual, anos: novosAnos });
      };
    });
  }
}

const MAX_FOTOS_PAIS = 3;

/** Fotos e legendas do país, no mesmo formato das fichas de cidade. */
function renderFotosPais(state) {
  const pais = state.paises.find((p) => p.id === isoAtual);
  const fotos = pais?.fotos || [];
  const legendas = pais?.legendas || [];

  document.querySelectorAll('[data-slot-pais]').forEach((slot) => {
    const i = parseInt(slot.dataset.slotPais, 10);
    const url = fotos[i];

    slot.querySelector('img')?.remove();
    slot.querySelector('.remover')?.remove();
    slot.classList.remove('enviando');
    const span = slot.querySelector('span');
    if (span) span.textContent = '＋';

    if (!url) return;

    const img = document.createElement('img');
    img.src = urlMiniatura(url, 240);
    img.onclick = (e) => { e.preventDefault(); abrirLightbox(fotos.filter(Boolean), url); };
    slot.appendChild(img);

    const btn = document.createElement('button');
    btn.className = 'remover';
    btn.textContent = '✕';
    btn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const novas = fotos.slice(); const novasLeg = legendas.slice();
      novas[i] = null; novasLeg[i] = '';
      cbs.aoSalvarPais({ iso2: isoAtual, fotos: novas, legendas: novasLeg });
    };
    slot.appendChild(btn);
  });

  // Uma legenda por foto existente.
  const contLeg = document.getElementById('legendas-pais');
  if (!contLeg) return;
  const comFoto = fotos.map((u, i) => ({ u, i })).filter((x) => x.u);
  contLeg.innerHTML = comFoto.map(({ i }) => `
    <input class="busca-input legenda-pais" data-legenda-pais="${i}"
           style="margin-top:8px;margin-bottom:0;"
           placeholder="Legenda da foto ${i + 1}..." value="${(legendas[i] || '').replace(/"/g, '&quot;')}">`).join('');

  contLeg.querySelectorAll('.legenda-pais').forEach((input) => {
    input.onchange = () => {
      const i = parseInt(input.dataset.legendaPais, 10);
      const novasLeg = legendas.slice();
      novasLeg[i] = input.value.trim();
      cbs.aoSalvarPais({ iso2: isoAtual, legendas: novasLeg });
    };
  });
}

async function onFotoPaisEscolhida(slot, input, state) {
  const arquivo = input.files[0];
  if (!arquivo) return;
  const i = parseInt(slot.dataset.slotPais, 10);

  slot.classList.add('enviando');
  const span = slot.querySelector('span');
  if (span) span.textContent = '...';

  try {
    const { url } = await enviarFoto(arquivo);
    const pais = state.paises.find((p) => p.id === isoAtual);
    const fotos = (pais?.fotos || []).slice();
    while (fotos.length < MAX_FOTOS_PAIS) fotos.push(null);
    fotos[i] = url;
    await cbs.aoSalvarPais({ iso2: isoAtual, fotos });
  } catch (err) {
    mostrarToast(err.message || 'Erro ao enviar foto');
    slot.classList.remove('enviando');
    if (span) span.textContent = '＋';
  }
  input.value = '';
}

function onAddAno(state) {
  const input = document.getElementById('input-novo-ano');
  const ano = parseInt(input.value, 10);
  const anoMax = new Date().getFullYear();

  if (!ano || ano < 1950 || ano > anoMax) {
    mostrarToast(`Digite um ano entre 1950 e ${anoMax}`);
    return;
  }

  const pais = state.paises.find((p) => p.id === isoAtual);
  const anosAtuais = pais?.anos || [];
  if (anosAtuais.includes(ano)) {
    mostrarToast('Esse ano já está na lista');
    return;
  }

  cbs.aoSalvarPais({ iso2: isoAtual, anos: [...anosAtuais, ano].sort() });
  input.value = '';
}

// ---------- Controles estáticos ----------

export function ligarControles(state) {
  document.getElementById('busca-pais').addEventListener('input', debounce((e) => {
    renderListaPaises(state, e.target.value);
  }, 150));

  document.getElementById('btn-add-pais').onclick = () => {
    document.getElementById('busca-pais').focus();
  };

  document.querySelectorAll('[data-slot-pais]').forEach((slot) => {
    const input = slot.querySelector('input[type=file]');
    input.onchange = () => onFotoPaisEscolhida(slot, input, state);
  });

  document.getElementById('btn-add-ano').onclick = () => onAddAno(state);
  document.getElementById('input-novo-ano').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAddAno(state);
  });
}
