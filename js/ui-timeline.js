// ============================================================
// Aba Timeline: histórico das visitas em ordem cronológica.
// Agrupado por ano e mês, com marcos ("primeira vez neste estado")
// e um resumo no topo.
// ============================================================

import { formatarData, nomePaisPT } from './util.js';
import { abrirCidadeBR, abrirCidadeMundo } from './ui-modal-cidade.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

let filtroAtual = 'tudo';
let estadoRef = null;

export function iniciar(state) {
  estadoRef = state;
  document.querySelectorAll('[data-filtro-tl]').forEach((chip) => {
    chip.onclick = () => {
      filtroAtual = chip.dataset.filtroTl;
      document.querySelectorAll('[data-filtro-tl]').forEach((c) => c.classList.toggle('ativo', c === chip));
      atualizar(estadoRef);
    };
  });
}

/** Junta cidades do Brasil e do mundo numa lista única de visitas. */
function montarVisitas(state) {
  const br = state.cidadesBR.map((c) => ({
    tipo: 'br', id: c.id, nome: c.nome, local: c.uf, data: c.dataVisita,
    foto: c.fotos?.[0], qtdFotos: c.fotos?.length || 0, registro: c, grupo: c.uf
  }));

  const mundo = state.cidadesMundo.map((c) => {
    const pais = state.paises.find((p) => p.id === c.paisIso2);
    const nomePais = nomePaisPT(c.paisIso2, pais?.nome || c.paisIso2);
    return {
      tipo: 'mundo', id: c.id, nome: c.nome, local: nomePais, data: c.dataVisita,
      foto: c.fotos?.[0], qtdFotos: c.fotos?.length || 0, registro: c,
      grupo: c.paisIso2, paisNome: nomePais
    };
  });

  let todas = [...br, ...mundo];
  if (filtroAtual === 'br') todas = todas.filter((v) => v.tipo === 'br');
  if (filtroAtual === 'mundo') todas = todas.filter((v) => v.tipo === 'mundo');

  // Marca a primeira visita de cada estado/país (na ordem cronológica real).
  const jaVisto = new Set();
  [...todas].filter((v) => v.data).sort((a, b) => a.data.localeCompare(b.data)).forEach((v) => {
    if (!jaVisto.has(v.grupo)) { jaVisto.add(v.grupo); v.estreia = true; }
  });

  // Exibição: mais recente primeiro; sem data vai pro fim.
  todas.sort((a, b) => {
    if (!a.data && !b.data) return a.nome.localeCompare(b.nome, 'pt-BR');
    if (!a.data) return 1;
    if (!b.data) return -1;
    return b.data.localeCompare(a.data);
  });

  return todas;
}

export function atualizar(state) {
  estadoRef = state;
  const visitas = montarVisitas(state);
  renderResumo(state, visitas);
  renderLista(visitas);
}

function renderResumo(state, visitas) {
  const cont = document.getElementById('timeline-resumo');
  if (!cont) return;

  const comData = visitas.filter((v) => v.data);
  if (!visitas.length) { cont.innerHTML = ''; return; }

  const estados = new Set(visitas.filter((v) => v.tipo === 'br').map((v) => v.grupo)).size;
  const paises = new Set(visitas.filter((v) => v.tipo === 'mundo').map((v) => v.grupo)).size;
  const fotos = visitas.reduce((soma, v) => soma + v.qtdFotos, 0);

  let periodo = '—';
  if (comData.length) {
    const primeira = comData[comData.length - 1].data.slice(0, 4);
    const ultima = comData[0].data.slice(0, 4);
    periodo = primeira === ultima ? primeira : `${primeira}–${ultima}`;
  }

  cont.innerHTML = `
    <div class="tl-resumo">
      <div class="tl-resumo-item"><div class="n">${visitas.length}</div><div class="l">CIDADES</div></div>
      <div class="tl-resumo-item"><div class="n">${estados || paises}</div><div class="l">${estados ? 'ESTADOS' : 'PAÍSES'}</div></div>
      <div class="tl-resumo-item"><div class="n">${fotos}</div><div class="l">FOTOS</div></div>
      <div class="tl-resumo-item"><div class="n">${periodo}</div><div class="l">PERÍODO</div></div>
    </div>`;
}

function renderLista(visitas) {
  const cont = document.getElementById('timeline-lista');
  if (!cont) return;

  if (!visitas.length) {
    cont.innerHTML = '<div class="vazio"><div class="ic">🗓️</div><p>Nenhuma visita registrada ainda.<br>Cada cidade que vocês registrarem aparece aqui, em ordem.</p></div>';
    return;
  }

  // Agrupa por ano e, dentro do ano, por mês.
  const blocos = [];
  let anoAtual = null, mesAtual = null;

  for (const v of visitas) {
    const ano = v.data ? v.data.slice(0, 4) : 'sem-data';
    const mes = v.data ? v.data.slice(5, 7) : null;

    if (ano !== anoAtual) {
      anoAtual = ano; mesAtual = null;
      const doAno = visitas.filter((x) => (x.data ? x.data.slice(0, 4) : 'sem-data') === ano);
      blocos.push({ tipo: 'ano', ano, qtd: doAno.length });
    }
    if (mes !== mesAtual) {
      mesAtual = mes;
      if (mes) blocos.push({ tipo: 'mes', rotulo: MESES[parseInt(mes, 10) - 1] });
    }
    blocos.push({ tipo: 'visita', v });
  }

  const itens = [];
  cont.innerHTML = blocos.map((b) => {
    if (b.tipo === 'ano') {
      const titulo = b.ano === 'sem-data' ? 'Sem data registrada' : b.ano;
      return `<div class="tl-ano"><span class="tl-ano-num">${titulo}</span><span class="tl-ano-qtd">${b.qtd} ${b.qtd === 1 ? 'cidade' : 'cidades'}</span></div>`;
    }
    if (b.tipo === 'mes') return `<div class="tl-mes">${b.rotulo}</div>`;

    const v = b.v;
    const idx = itens.push(v) - 1;
    return `
      <div class="tl-item" data-idx="${idx}">
        <div class="tl-marco"></div>
        <div class="tl-card">
          <div class="tl-thumb" ${v.foto ? `style="background-image:url('${v.foto}')"` : ''}>${v.foto ? '' : (v.tipo === 'br' ? '🏛️' : '📍')}</div>
          <div class="tl-info">
            <div class="tl-nome">${v.nome}</div>
            <div class="tl-sub">${v.local}${v.data ? ' · ' + formatarData(v.data) : ''}</div>
            ${v.estreia ? `<div class="tl-estreia">✦ primeira vez ${v.tipo === 'br' ? 'neste estado' : 'neste país'}</div>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  cont.querySelectorAll('.tl-item').forEach((el) => {
    const v = itens[parseInt(el.dataset.idx, 10)];
    el.onclick = () => {
      if (v.tipo === 'br') abrirCidadeBR(null, v.registro.uf, v.registro);
      else abrirCidadeMundo(v.registro.paisIso2, v.paisNome, null, v.registro);
    };
  });
}
