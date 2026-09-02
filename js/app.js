// ============================================================
// app.js — ponto de entrada: autenticação, estado global,
// navegação entre abas e wiring dos módulos de UI.
// ============================================================

import { auth, googleProvider } from './firebase-config.js';
import {
  onAuthStateChanged, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import * as DB from './db.js';
import * as Dashboard from './ui-dashboard.js';
import * as Brasil from './ui-brasil.js';
import * as Mundo from './ui-mundo.js';
import * as Viagens from './ui-viagens.js';
import { initModal } from './ui-modal-cidade.js';
import { mostrarToast } from './util.js';

// ---------- Estado global (um único objeto, mutado nos campos) ----------

const state = {
  user: null,
  estadosGeo: null,
  paisesGeo: null,
  contagemUF: {},
  cidadesBR: [],
  paises: [],
  cidadesMundo: [],
  viagens: []
};

const abasIniciadas = { brasil: false, mundo: false };
let listenersAtivos = [];

// ---------- Dados estáticos (geojson leve) ----------

async function carregarDadosEstaticos() {
  const [estados, contagem] = await Promise.all([
    fetch('data/estados-br.json').then((r) => r.json()),
    fetch('data/contagem-municipios-uf.json').then((r) => r.json())
  ]);
  state.estadosGeo = estados;
  state.contagemUF = contagem;
}

// Países do mundo (258 territórios, ~360 KB) só é baixado quando a aba
// Mundo é aberta pela primeira vez — não precisa disso pra ver a tela inicial.
let carregandoPaises = null;
async function carregarPaisesGeo() {
  if (state.paisesGeo) return;
  if (!carregandoPaises) carregandoPaises = fetch('data/paises-mundo.json').then((r) => r.json());
  state.paisesGeo = await carregandoPaises;
}

function usuarioLabel() {
  const u = auth.currentUser;
  if (!u) return 'desconhecido';
  return u.displayName ? u.displayName.split(' ')[0] : u.email;
}

// ---------- Re-render central ----------

function atualizarTudo() {
  Dashboard.atualizarStats(state);
  Dashboard.atualizarKPIs(state);
  Dashboard.renderRecentes(state);
  Brasil.atualizar(state);
  Mundo.atualizar(state);
  Viagens.atualizar(state);
}

function iniciarListenersFirestore() {
  listenersAtivos.push(DB.observarCidadesBR((lista) => { state.cidadesBR = lista; atualizarTudo(); }));
  listenersAtivos.push(DB.observarPaises((lista) => { state.paises = lista; atualizarTudo(); }));
  listenersAtivos.push(DB.observarCidadesMundo((lista) => { state.cidadesMundo = lista; atualizarTudo(); }));
  listenersAtivos.push(DB.observarViagens((lista) => { state.viagens = lista; atualizarTudo(); }));
}

function pararListenersFirestore() {
  listenersAtivos.forEach((unsub) => unsub());
  listenersAtivos = [];
}

// ---------- Navegação entre abas ----------

const TITULOS_ABA = {
  dashboard: ['REGISTRO DE VIAGENS', 'Nosso Mapa'],
  brasil: ['EXPLORANDO', 'Brasil'],
  mundo: ['EXPLORANDO', 'Mundo'],
  viagens: ['ROTEIROS', 'Viagens']
};

async function irParaAba(nome) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('ativa'));
  document.getElementById(`tab-${nome}`).classList.add('ativa');
  document.querySelectorAll('nav.bottom-nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.tab === nome));
  document.getElementById('appbar-eyebrow').textContent = TITULOS_ABA[nome][0];
  document.getElementById('appbar-titulo').textContent = TITULOS_ABA[nome][1];

  if (nome === 'brasil' && !abasIniciadas.brasil) {
    Brasil.iniciarMapaCompleto(state);
    Brasil.ligarControlesEstado(state);
    Brasil.renderListaEstados(state);
    abasIniciadas.brasil = true;
  } else if (nome === 'brasil') {
    Brasil.aoMostrarAbaBrasil();
  }

  if (nome === 'mundo' && !abasIniciadas.mundo) {
    abasIniciadas.mundo = true;
    try {
      await carregarPaisesGeo();
    } catch (err) {
      mostrarToast('Erro ao carregar dados do mundo: ' + err.message);
      abasIniciadas.mundo = false;
      return;
    }
    Mundo.iniciarMapaCompleto(state);
    Mundo.ligarControles(state);
    Mundo.renderListaPaises(state);
  } else if (nome === 'mundo') {
    Mundo.aoMostrarAbaMundo();
  }
}

function fecharDetalhe(nome) {
  if (nome === 'brasil') Brasil.fecharEstado();
  if (nome === 'mundo') Mundo.fecharPais();
  if (nome === 'viagens') Viagens.fecharDetalheOuForm();
}

document.addEventListener('click', (e) => {
  const btnTab = e.target.closest('[data-tab]');
  if (btnTab) { irParaAba(btnTab.dataset.tab); return; }
  const btnIr = e.target.closest('[data-ir-para]');
  if (btnIr) { irParaAba(btnIr.dataset.irPara); return; }
  const btnVoltar = e.target.closest('[data-voltar]');
  if (btnVoltar) { fecharDetalhe(btnVoltar.dataset.voltar); return; }
});

// ---------- Autenticação ----------

document.getElementById('btn-login-google').onclick = async () => {
  const elErro = document.getElementById('login-erro');
  elErro.classList.add('hidden');
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    elErro.textContent = 'Não foi possível entrar: ' + err.message;
    elErro.classList.remove('hidden');
  }
};

document.getElementById('btn-avatar').onclick = () => {
  if (confirm('Sair da conta?')) signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.user = user;
    document.getElementById('tela-login').classList.add('hidden');
    document.getElementById('app').classList.add('ativo');
    document.getElementById('appbar-sub').textContent = `Olá, ${usuarioLabel()}`;
    if (user.photoURL) document.getElementById('btn-avatar').style.backgroundImage = `url('${user.photoURL}')`;

    try {
      if (!state.estadosGeo) await carregarDadosEstaticos();
    } catch (err) {
      mostrarToast('Erro ao carregar dados do mapa: ' + err.message);
      return;
    }

    iniciarListenersFirestore();
  } else {
    state.user = null;
    pararListenersFirestore();
    document.getElementById('app').classList.remove('ativo');
    document.getElementById('tela-login').classList.remove('hidden');
  }
});

// ---------- Wiring dos módulos ----------

Dashboard.iniciar(() => irParaAba('brasil'));

initModal({
  aoSalvarBR: (dados) => DB.salvarCidadeBR({ ...dados, registradoPor: usuarioLabel() }),
  aoExcluirBR: (ibgeCode) => DB.excluirCidadeBR(ibgeCode),
  aoSalvarMundo: (dados) => DB.salvarCidadeMundo({ ...dados, registradoPor: usuarioLabel() }),
  aoExcluirMundo: (id) => DB.excluirCidadeMundo(id)
});

Mundo.iniciar({
  aoSalvarPais: (dadosPais) => DB.salvarPais({ ...dadosPais, registradoPor: usuarioLabel() })
});

Viagens.iniciar(state, {
  aoSalvarViagem: (dados) => DB.salvarViagem({ ...dados, registradoPor: usuarioLabel() }),
  aoExcluirViagem: (id) => DB.excluirViagem(id)
});

// ---------- Service worker (PWA offline) ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
