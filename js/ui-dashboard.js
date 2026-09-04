// ============================================================
// Aba Início: estatísticas gerais e últimos registros.
// ============================================================

import { formatarData } from './util.js';
import { abrirCidadeBR, abrirCidadeMundo } from './ui-modal-cidade.js';

const REGIAO_POR_UF = {
  AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul'
};
const TOTAL_REGIOES = 5;

export function iniciar(aoTocarFab) {
  document.getElementById('btn-fab-dashboard').onclick = aoTocarFab;
}

export function atualizarStats(state) {
  const estadosComVisita = new Set(state.cidadesBR.map((c) => c.uf)).size;
  document.getElementById('stat-estados').textContent = estadosComVisita;
  document.getElementById('stat-cidades-br').textContent = state.cidadesBR.length;
  document.getElementById('stat-paises').textContent = state.paises.length;
}

export function atualizarKPIs(state) {
  const regioesVisitadas = new Set(state.cidadesBR.map((c) => REGIAO_POR_UF[c.uf]).filter(Boolean));
  document.getElementById('kpi-regioes').textContent = `${regioesVisitadas.size}/${TOTAL_REGIOES}`;
  document.getElementById('kpi-paises').textContent = state.paises.length;
  document.getElementById('kpi-cidades-br').textContent = state.cidadesBR.length;
}

export function renderRecentes(state) {
  const cont = document.getElementById('dashboard-recentes');
  if (!cont) return;

  const brItens = state.cidadesBR.map((c) => ({ tipo: 'br', nome: c.nome, sub: c.uf, data: c.dataVisita, foto: c.fotos?.[0], registro: c }));
  const mundoItens = state.cidadesMundo.map((c) => {
    const pais = state.paises.find((p) => p.id === c.paisIso2);
    return { tipo: 'mundo', nome: c.nome, sub: pais?.nome || c.paisIso2, data: c.dataVisita, foto: c.fotos?.[0], registro: c, paisNome: pais?.nome || c.paisIso2 };
  });

  const recentes = [...brItens, ...mundoItens]
    .filter((i) => i.data)
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 6);

  if (!recentes.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🧭</div><p>Nenhuma visita com data registrada ainda.<br>Bora começar!</p></div>';
    return;
  }

  cont.innerHTML = recentes.map((i, idx) => `
    <div class="cidade-card" data-idx="${idx}">
      <div class="cidade-thumb" ${i.foto ? `style="background-image:url('${i.foto}')"` : ''}>${i.foto ? '' : '📍'}</div>
      <div>
        <div class="nome">${i.nome} <span style="color:var(--muted);font-weight:500;">· ${i.sub}</span></div>
        <div class="meta">${formatarData(i.data)}</div>
      </div>
    </div>`).join('');

  cont.querySelectorAll('.cidade-card').forEach((card) => {
    const i = recentes[parseInt(card.dataset.idx, 10)];
    card.onclick = () => {
      if (i.tipo === 'br') abrirCidadeBR(null, i.registro.uf, i.registro);
      else abrirCidadeMundo(i.registro.paisIso2, i.paisNome, null, i.registro);
    };
  });
}
