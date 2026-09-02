// ============================================================
// Aba Viagens: roteiros que ligam, em ordem, cidades já
// registradas no Brasil e/ou no Mundo.
//
// As paradas do formulário NÃO ficam num array paralelo por índice
// (isso quebra quando uma parada do meio é removida) — a ordem e a
// seleção são lidas direto do DOM na hora de salvar.
// ============================================================

import { formatarData, mostrarToast, hojeISO } from './util.js';

let cbs = null; // { aoSalvarViagem(dados), aoExcluirViagem(id) }
let mapaDetalhe = null, camadaRota = null;
let viagemAtual = null;

export function iniciar(state, callbacks) {
  cbs = callbacks;
  document.getElementById('btn-nova-viagem').onclick = () => abrirForm(state);
  document.getElementById('btn-add-parada').onclick = () => adicionarLinhaParada(state);
  document.getElementById('btn-salvar-viagem').onclick = () => onSalvar(state);
  document.getElementById('btn-excluir-viagem').onclick = () => onExcluir();
}

export function atualizar(state) {
  renderListaViagens(state);
  if (viagemAtual) {
    const atualizada = state.viagens.find((v) => v.id === viagemAtual.id);
    if (atualizada) abrirDetalhe(state, atualizada.id, true);
  }
}

// ---------- Lista ----------

function renderListaViagens(state) {
  const cont = document.getElementById('lista-viagens');
  if (!cont) return;

  if (!state.viagens.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🚗</div><p>Nenhum roteiro ainda.<br>Registre o primeiro trajeto de vocês.</p></div>';
    return;
  }

  cont.innerHTML = state.viagens.map((v) => `
    <div class="viagem-card" data-id="${v.id}">
      <div class="titulo">${v.titulo}</div>
      <div class="data mono">${v.dataInicio ? formatarData(v.dataInicio) : ''}</div>
      <div class="rota-preview">${(v.paradas || []).map((p) => p.nome).join(' → ')}</div>
    </div>`).join('');

  cont.querySelectorAll('.viagem-card').forEach((card) => {
    card.onclick = () => abrirDetalhe(state, card.dataset.id);
  });
}

// ---------- Detalhe ----------

function abrirDetalhe(state, id, mantendoView = false) {
  const viagem = state.viagens.find((v) => v.id === id);
  if (!viagem) return;
  viagemAtual = viagem;

  if (!mantendoView) {
    document.getElementById('viagens-lista-view').classList.add('hidden');
    document.getElementById('viagens-form-view').classList.add('hidden');
    document.getElementById('viagens-detalhe-view').classList.remove('hidden');
  }

  document.getElementById('viagem-titulo').textContent = viagem.titulo;
  document.getElementById('viagem-datas').textContent = viagem.dataInicio ? formatarData(viagem.dataInicio) : '';

  const paradas = viagem.paradas || [];
  document.getElementById('viagem-paradas').innerHTML = paradas.map((p, i) => `
    <div class="rota-parada">
      <b>${i + 1}. ${p.nome}</b>
      <div class="sub">${p.uf || p.pais || ''}</div>
    </div>`).join('');

  if (!mapaDetalhe) mapaDetalhe = L.map('mapa-viagem-detalhe', { attributionControl: false, preferCanvas: true });
  if (camadaRota) { mapaDetalhe.removeLayer(camadaRota); camadaRota = null; }

  const pontosValidos = paradas.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (pontosValidos.length) {
    const grupo = L.layerGroup();
    L.polyline(pontosValidos.map((p) => [p.lat, p.lng]), { color: '#155EEF', weight: 3.5, dashArray: '1,8', lineCap: 'round' }).addTo(grupo);
    pontosValidos.forEach((p, i) => {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: '', html: '<div class="pin-cidade" style="display:flex;align-items:center;justify-content:center;"></div>', iconSize: [26, 26], iconAnchor: [13, 26] })
      }).bindPopup(`<b>${i + 1}. ${p.nome}</b>`).addTo(grupo);
    });
    camadaRota = grupo.addTo(mapaDetalhe);
    mapaDetalhe.fitBounds(camadaRota.getBounds(), { padding: [24, 24] });
  } else {
    mapaDetalhe.setView([-14.2, -51.9], 3);
  }
  setTimeout(() => mapaDetalhe.invalidateSize(), 80);
}

export function fecharDetalheOuForm() {
  document.getElementById('viagens-detalhe-view').classList.add('hidden');
  document.getElementById('viagens-form-view').classList.add('hidden');
  document.getElementById('viagens-lista-view').classList.remove('hidden');
  viagemAtual = null;
}

async function onExcluir() {
  if (!viagemAtual) return;
  if (!confirm(`Excluir o roteiro "${viagemAtual.titulo}"? As cidades continuam registradas, só o trajeto será apagado.`)) return;
  await cbs.aoExcluirViagem(viagemAtual.id);
  mostrarToast('Roteiro excluído');
  fecharDetalheOuForm();
}

// ---------- Formulário: novo roteiro ----------

function abrirForm(state) {
  document.getElementById('viagens-lista-view').classList.add('hidden');
  document.getElementById('viagens-detalhe-view').classList.add('hidden');
  document.getElementById('viagens-form-view').classList.remove('hidden');

  document.getElementById('form-viagem-titulo').value = '';
  document.getElementById('form-viagem-data').value = hojeISO();
  document.getElementById('form-viagem-paradas').innerHTML = '';
  adicionarLinhaParada(state);
  adicionarLinhaParada(state);
}

/** Cidades disponíveis pra virar parada, já registradas em Brasil ou Mundo. */
function opcoesCidades(state) {
  const br = state.cidadesBR.map((c) => ({
    chave: `br:${c.id}`, nome: c.nome, sub: c.uf, lat: c.lat, lng: c.lng, tipo: 'br', uf: c.uf
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const mundo = state.cidadesMundo.map((c) => {
    const pais = state.paises.find((p) => p.id === c.paisIso2);
    return { chave: `mundo:${c.id}`, nome: c.nome, sub: pais?.nome || c.paisIso2, lat: c.lat, lng: c.lng, tipo: 'mundo', pais: pais?.nome || c.paisIso2 };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return { br, mundo };
}

function adicionarLinhaParada(state) {
  const { br, mundo } = opcoesCidades(state);
  const cont = document.getElementById('form-viagem-paradas');

  if (!br.length && !mundo.length) {
    mostrarToast('Registre cidades no Brasil ou Mundo antes de criar um roteiro');
    return;
  }

  const linha = document.createElement('div');
  linha.className = 'parada-form-row';
  linha.innerHTML = `
    <select>
      <option value="">Selecione a cidade...</option>
      ${br.length ? `<optgroup label="Brasil">${br.map((c) => `<option value="${c.chave}">${c.nome} — ${c.sub}</option>`).join('')}</optgroup>` : ''}
      ${mundo.length ? `<optgroup label="Mundo">${mundo.map((c) => `<option value="${c.chave}">${c.nome} — ${c.sub}</option>`).join('')}</optgroup>` : ''}
    </select>
    <button class="remover-parada" type="button">✕</button>`;

  linha.querySelector('.remover-parada').onclick = () => linha.remove();
  cont.appendChild(linha);
}

/** Lê a ordem e a seleção atuais direto do DOM — sem depender de índices guardados. */
function lerParadasDoFormulario(state) {
  const { br, mundo } = opcoesCidades(state);
  const todasPorChave = new Map([...br, ...mundo].map((c) => [c.chave, c]));

  return [...document.querySelectorAll('#form-viagem-paradas select')]
    .map((select) => todasPorChave.get(select.value))
    .filter(Boolean);
}

async function onSalvar(state) {
  const titulo = document.getElementById('form-viagem-titulo').value.trim();
  const data = document.getElementById('form-viagem-data').value;
  const selecionadas = lerParadasDoFormulario(state);

  if (!titulo) { mostrarToast('Dê um título ao roteiro'); return; }
  if (selecionadas.length < 2) { mostrarToast('Escolha pelo menos 2 paradas'); return; }

  const paradas = selecionadas.map((p) => ({
    nome: p.nome, lat: p.lat, lng: p.lng, tipo: p.tipo, uf: p.uf || null, pais: p.pais || null
  }));

  const btn = document.getElementById('btn-salvar-viagem');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await cbs.aoSalvarViagem({ titulo, dataInicio: data, paradas });
    mostrarToast('Roteiro salvo ✓');
    fecharDetalheOuForm();
  } catch (err) {
    mostrarToast(err.message || 'Erro ao salvar roteiro');
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar roteiro';
  }
}
