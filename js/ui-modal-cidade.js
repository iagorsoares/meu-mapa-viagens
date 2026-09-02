// ============================================================
// Modal compartilhado: registrar ou visualizar uma cidade,
// tanto do Brasil (município) quanto do Mundo.
//
// Duas telas dentro do mesmo painel:
//  - #cidade-view: cidade já registrada — nome, foto grande, botão Editar.
//  - #cidade-form: formulário (nova cidade, ou editar depois de tocar Editar).
// ============================================================

import { enviarFoto, urlMiniatura } from './upload.js';
import { mostrarToast, hojeISO, centroDaFeature, formatarData } from './util.js';

let callbacks = null;
let modo = null;              // 'br' | 'mundo'
let contexto = null;          // { feature, uf } ou { paisIso2, latLng, paisNome }
let registroExistente = null; // doc atual, se já visitada
let fotosAtuais = [null, null, null]; // { url } ou null por slot
let semData = false;          // true = "não lembro a data exata"

const overlay = () => document.getElementById('modal-cidade');
const elTitulo = () => document.getElementById('modal-cidade-titulo');
const elNomeMundo = () => document.getElementById('form-cidade-nome-mundo');
const elNomeBR = () => document.getElementById('form-cidade-nome-br');
const elData = () => document.getElementById('form-cidade-data');
const elBtnSemData = () => document.getElementById('btn-toggle-sem-data');
const elCampoMundo = () => document.getElementById('campo-select-cidade-mundo');
const elCampoBR = () => document.getElementById('campo-select-municipio');
const elBtnExcluir = () => document.getElementById('btn-excluir-cidade');
const elBtnSalvar = () => document.getElementById('btn-salvar-cidade');

const elView = () => document.getElementById('cidade-view');
const elForm = () => document.getElementById('cidade-form');
const elViewSub = () => document.getElementById('cidade-view-sub');
const elViewFoto = () => document.getElementById('cidade-view-foto');
const elViewThumbs = () => document.getElementById('cidade-view-thumbs');
const elBtnEditar = () => document.getElementById('btn-editar-cidade');

export function initModal(cbs) {
  callbacks = cbs;

  document.getElementById('modal-cidade-fechar').onclick = fechar;
  overlay().addEventListener('click', (e) => { if (e.target === overlay()) fechar(); });

  document.querySelectorAll('.foto-slot').forEach((slot) => {
    const input = slot.querySelector('input[type=file]');
    input.onchange = () => onFotoEscolhida(slot, input);
  });

  elBtnSemData().onclick = () => { semData = !semData; atualizarUiData(); };
  elBtnSalvar().onclick = onSalvar;
  elBtnExcluir().onclick = onExcluir;
  elBtnEditar().onclick = mostrarForm;

  // Lightbox
  document.getElementById('lightbox-fechar').onclick = fecharLightbox;
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') fecharLightbox();
  });
  document.getElementById('lightbox-anterior').onclick = () => navegarLightbox(-1);
  document.getElementById('lightbox-proxima').onclick = () => navegarLightbox(1);
}

// ---------- Abrir para Brasil ----------
// feature pode ser null quando já existe registro (edição não precisa do geojson).
export function abrirCidadeBR(feature, uf, registro) {
  modo = 'br';
  contexto = { feature, uf };
  registroExistente = registro || null;

  const nome = registro ? registro.nome : feature.properties.name;

  elCampoBR().classList.remove('hidden');
  elCampoMundo().classList.add('hidden');
  elNomeBR().value = nome;

  abrirComum(nome, uf);
}

// ---------- Abrir para Mundo ----------
export function abrirCidadeMundo(paisIso2, paisNome, latLng, registro) {
  modo = 'mundo';
  contexto = { paisIso2, paisNome, latLng };
  registroExistente = registro || null;

  elCampoMundo().classList.remove('hidden');
  elCampoBR().classList.add('hidden');
  elNomeMundo().value = registro ? registro.nome : '';
  elNomeMundo().disabled = false;

  abrirComum(registro ? registro.nome : `Nova cidade — ${paisNome}`, paisNome);
}

function abrirComum(nome, subInfo) {
  // Prepara os campos do formulário (necessário mesmo em modo visualização,
  // pra já ficar pronto se a pessoa tocar em Editar).
  semData = !!registroExistente && !registroExistente.dataVisita;
  elData().value = registroExistente ? (registroExistente.dataVisita || '') : hojeISO();
  atualizarUiData();

  fotosAtuais = [null, null, null];
  const fotosSalvas = registroExistente?.fotos || [];
  fotosSalvas.forEach((url, i) => { if (i < 3) fotosAtuais[i] = { url }; });
  renderFotos();

  elBtnExcluir().classList.toggle('hidden', !registroExistente);

  overlay().classList.add('aberto');

  if (registroExistente) {
    mostrarView(nome, subInfo);
  } else {
    mostrarForm();
    elTitulo().textContent = `＋ ${nome}`;
  }
}

// ---------- Alternar visualização / formulário ----------

function mostrarView(nome, subInfo) {
  elTitulo().textContent = nome;
  const dataTexto = registroExistente?.dataVisita ? formatarData(registroExistente.dataVisita) : 'data não registrada';
  elViewSub().textContent = `${subInfo} · ${dataTexto}`;

  const validas = fotosValidas();
  const fotoPrincipal = elViewFoto();
  fotoPrincipal.innerHTML = validas.length ? '' : '<span>🏛️</span>';
  if (validas.length) {
    const img = document.createElement('img');
    img.src = urlMiniatura(validas[0].url, 640);
    img.onclick = () => abrirLightboxPorUrl(validas[0].url);
    fotoPrincipal.appendChild(img);
  }

  const thumbsCont = elViewThumbs();
  thumbsCont.innerHTML = '';
  validas.slice(1).forEach((foto) => {
    const img = document.createElement('img');
    img.src = urlMiniatura(foto.url, 120);
    img.onclick = () => abrirLightboxPorUrl(foto.url);
    thumbsCont.appendChild(img);
  });

  elView().classList.remove('hidden');
  elForm().classList.add('hidden');
}

function mostrarForm() {
  const nomeAtual = modo === 'br' ? elNomeBR().value : (elNomeMundo().value || contexto.paisNome);
  elTitulo().textContent = registroExistente ? `✏️ ${nomeAtual}` : `＋ ${nomeAtual}`;
  elView().classList.add('hidden');
  elForm().classList.remove('hidden');
}

function atualizarUiData() {
  elData().disabled = semData;
  if (semData) {
    elData().value = '';
    elBtnSemData().textContent = 'Informar data';
    elBtnSemData().classList.add('ativo');
  } else {
    if (!elData().value) elData().value = hojeISO();
    elBtnSemData().textContent = 'Não lembro a data exata';
    elBtnSemData().classList.remove('ativo');
  }
}

function fechar() {
  overlay().classList.remove('aberto');
  modo = null; contexto = null; registroExistente = null;
}

// ---------- Fotos (modo formulário) ----------

function renderFotos() {
  document.querySelectorAll('.foto-slot').forEach((slot, i) => {
    const existente = slot.querySelector('img');
    if (existente) existente.remove();
    const removerBtn = slot.querySelector('.remover');
    if (removerBtn) removerBtn.remove();
    slot.classList.remove('enviando');
    slot.querySelector('span') && (slot.querySelector('span').textContent = '＋');

    const foto = fotosAtuais[i];
    if (foto?.url) {
      const img = document.createElement('img');
      img.src = urlMiniatura(foto.url, 240);
      img.onclick = (e) => { e.preventDefault(); abrirLightbox(i); };
      slot.appendChild(img);

      const btn = document.createElement('button');
      btn.className = 'remover';
      btn.textContent = '✕';
      btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fotosAtuais[i] = null; renderFotos(); };
      slot.appendChild(btn);
    }
  });
}

async function onFotoEscolhida(slot, input) {
  const arquivo = input.files[0];
  if (!arquivo) return;
  const i = parseInt(slot.dataset.slot, 10);

  slot.classList.add('enviando');
  const span = slot.querySelector('span');
  if (span) span.textContent = '...';

  try {
    const resultado = await enviarFoto(arquivo);
    fotosAtuais[i] = { url: resultado.url };
    renderFotos();
  } catch (err) {
    mostrarToast(err.message || 'Erro ao enviar foto');
    slot.classList.remove('enviando');
    if (span) span.textContent = '＋';
  }
  input.value = '';
}

// ---------- Lightbox ----------
let lightboxIndex = 0;

function fotosValidas() {
  return fotosAtuais.filter(Boolean);
}

function abrirLightbox(indexClicado) {
  const validas = fotosValidas();
  const foto = fotosAtuais[indexClicado];
  lightboxIndex = validas.indexOf(foto);
  document.getElementById('lightbox-img').src = foto.url;
  document.getElementById('lightbox').classList.add('aberto');
}

function abrirLightboxPorUrl(url) {
  const validas = fotosValidas();
  lightboxIndex = validas.findIndex((f) => f.url === url);
  if (lightboxIndex < 0) lightboxIndex = 0;
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('aberto');
}

function navegarLightbox(delta) {
  const validas = fotosValidas();
  if (!validas.length) return;
  lightboxIndex = (lightboxIndex + delta + validas.length) % validas.length;
  document.getElementById('lightbox-img').src = validas[lightboxIndex].url;
}

function fecharLightbox() {
  document.getElementById('lightbox').classList.remove('aberto');
}

// ---------- Salvar / excluir ----------

async function onSalvar() {
  const data = semData ? null : elData().value;
  if (!semData && !data) { mostrarToast('Escolha a data ou toque em "não lembro a data exata"'); return; }

  const fotos = fotosValidas().map((f) => f.url);
  elBtnSalvar().disabled = true;
  elBtnSalvar().textContent = 'Salvando...';

  try {
    if (modo === 'br') {
      let ibgeCode, nome, uf, lat, lng;
      if (registroExistente) {
        // Editando: reaproveita os dados já salvos, não precisa do geojson do município.
        ({ id: ibgeCode, nome, uf, lat, lng } = registroExistente);
      } else {
        const { feature, uf: ufContexto } = contexto;
        const centro = centroDaFeature(feature);
        ibgeCode = feature.properties.id;
        nome = feature.properties.name;
        uf = ufContexto;
        lat = centro.lat;
        lng = centro.lng;
      }
      await callbacks.aoSalvarBR({ ibgeCode, nome, uf, lat, lng, dataVisita: data, fotos, viagemId: registroExistente?.viagemId || null });
    } else {
      const nome = elNomeMundo().value.trim();
      if (!nome) { mostrarToast('Digite o nome da cidade'); elBtnSalvar().disabled = false; elBtnSalvar().textContent = 'Salvar'; return; }
      const latLng = registroExistente
        ? { lat: registroExistente.lat, lng: registroExistente.lng }
        : contexto.latLng;
      await callbacks.aoSalvarMundo({
        id: registroExistente?.id || null,
        nome,
        paisIso2: contexto.paisIso2,
        lat: latLng.lat,
        lng: latLng.lng,
        dataVisita: data,
        fotos,
        viagemId: registroExistente?.viagemId || null
      });
    }
    mostrarToast('Cidade salva ✓');
    fechar();
  } catch (err) {
    mostrarToast(err.message || 'Erro ao salvar');
  } finally {
    elBtnSalvar().disabled = false;
    elBtnSalvar().textContent = 'Salvar';
  }
}

async function onExcluir() {
  if (!registroExistente) return;
  if (!confirm('Excluir o registro desta cidade? As fotos e a data serão perdidas.')) return;
  try {
    if (modo === 'br') await callbacks.aoExcluirBR(registroExistente.id);
    else await callbacks.aoExcluirMundo(registroExistente.id);
    mostrarToast('Registro excluído');
    fechar();
  } catch (err) {
    mostrarToast(err.message || 'Erro ao excluir');
  }
}
