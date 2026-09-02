// ============================================================
// Aba Início: estatísticas gerais e últimos registros.
// ============================================================

import { formatarData } from './util.js';

export function iniciar(aoTocarFab) {
  document.getElementById('btn-fab-dashboard').onclick = aoTocarFab;
}

export function atualizarStats(state) {
  const estadosComVisita = new Set(state.cidadesBR.map((c) => c.uf)).size;
  document.getElementById('stat-estados').textContent = estadosComVisita;
  document.getElementById('stat-cidades-br').textContent = state.cidadesBR.length;
  document.getElementById('stat-paises').textContent = state.paises.length;
}

export function renderRecentes(state) {
  const cont = document.getElementById('dashboard-recentes');
  if (!cont) return;

  const brItens = state.cidadesBR.map((c) => ({ nome: c.nome, sub: c.uf, data: c.dataVisita, foto: c.fotos?.[0] }));
  const mundoItens = state.cidadesMundo.map((c) => {
    const pais = state.paises.find((p) => p.id === c.paisIso2);
    return { nome: c.nome, sub: pais?.nome || c.paisIso2, data: c.dataVisita, foto: c.fotos?.[0] };
  });

  const recentes = [...brItens, ...mundoItens]
    .filter((i) => i.data)
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 6);

  if (!recentes.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🧭</div><p>Nenhuma cidade registrada ainda.<br>Bora começar!</p></div>';
    return;
  }

  cont.innerHTML = recentes.map((i) => `
    <div class="cidade-card">
      <div class="cidade-thumb" ${i.foto ? `style="background-image:url('${i.foto}')"` : ''}>${i.foto ? '' : '📍'}</div>
      <div>
        <div class="nome">${i.nome} <span style="color:var(--muted);font-weight:500;">· ${i.sub}</span></div>
        <div class="meta">${formatarData(i.data)}</div>
      </div>
    </div>`).join('');
}
