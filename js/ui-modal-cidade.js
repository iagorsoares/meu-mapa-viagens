// ============================================================
// Modal compartilhado: registrar ou visualizar uma cidade,
// tanto do Brasil (município) quanto do Mundo.
// ============================================================

import { enviarFoto, urlMiniatura } from './upload.js';
import { mostrarToast, hojeISO, centroDaFeature } from './util.js';

let callbacks = null;
let modo = null;              // 'br' | 'mundo'
let contexto = null;          // { feature, uf } ou { paisIso2, latLng, paisNome }
let registroExistente = null; // doc atual, se já visitada
let fotosAtuais = [null, null, null]; // { url } ou null por slot

const overlay = () => document.getElementById('modal-cidade');
const elTitulo = () => document.getElementById('modal-cidade-titulo');
const elNomeMundo = () => document.getElementById('form-cidade-nome-mundo');
const elNomeBR = () => document.getElementById('form-cidade-nome-br');
const elData = () => document.getElementById('form-cidade-data');
const elCampoMundo = () => document.getElementById('campo-select-cidade-mundo');
const elCampoBR = () => document.getElementById('campo-select-municipio');
const elBtnExcluir = () => document.getElementById('btn-excluir-cidade');
const elBtnSalvar = () => document.getElementById('btn-salvar-cidade');

export function initModal(cbs) {
  callbacks = cbs;

  document.getElementById('modal-cidade-fechar').onclick = fechar;
  overlay().addEventListener('click', (e) => { if (e.target === overlay()) fechar(); });

  document.querySelectorAll('.foto-slot').forEach((slot) => {
    const input = slot.querySelector('input[type=file]');
    input.onchange = () => onFotoEscolhida(slot, input);
  });

  elBtnSalvar().onclick = onSalvar;
  elBtnExcluir().onclick = onExcluir;

  // Lightbox
  document.getElementById('lightbox-fechar').onclick = fecharLightbox;
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') fecharLightbox();
  });
  document.getElementById('lightbox-anterior').onclick = () => navegarLightbox(-1);
  document.getElementById('lightbox-proxima').onclick = () => navegarLightbox(1);
}

// ---------- Abrir para Brasil ----------
export function abrirCidadeBR(feature, uf, registro) {
  modo = 'br';
  contexto = { feature, uf };
  registroExistente = registro || null;

  elCampoBR().classList.remove('hidden');
  elCampoMundo().classList.add('hidden');
  elNomeBR().value = feature.properties.name;

  abrirComum(feature.properties.name);
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

  abrirComum(registro ? registro.nome : `Nova cidade — ${paisNome}`);
}

function abrirComum(tituloBase) {
  elTitulo().textContent = registroExistente ? `✏️ ${tituloBase}` : `＋ ${tituloBase}`;
  elData().value = registroExistente ? registroExistente.dataVisita : hojeISO();

  fotosAtuais = [null, null, null];
  const fotosSalvas = registroExistente?.fotos || [];
  fotosSalvas.forEach((url, i) => { if (i < 3) fotosAtuais[i] = { url }; });
  renderFotos();

  elBtnExcluir().classList.toggle('hidden', !registroExistente);
  overlay().classList.add('aberto');
}

function fechar() {
  overlay().classList.remove('aberto');
  modo = null; contexto = null; registroExistente = null;
}

// ---------- Fotos ----------

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
  const data = elData().value;
  if (!data) { mostrarToast('Escolha a data da visita'); return; }

  const fotos = fotosValidas().map((f) => f.url);
  elBtnSalvar().disabled = true;
  elBtnSalvar().textContent = 'Salvando...';

  try {
    if (modo === 'br') {
      const { feature, uf } = contexto;
      const centro = centroDaFeature(feature);
      await callbacks.aoSalvarBR({
        ibgeCode: feature.properties.id,
        nome: feature.properties.name,
        uf,
        lat: centro.lat,
        lng: centro.lng,
        dataVisita: data,
        fotos,
        viagemId: registroExistente?.viagemId || null
      });
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
