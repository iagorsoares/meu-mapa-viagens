// ============================================================
// Camada de dados — todo o app fala com o Firestore só por aqui.
// Coleções compartilhadas (não por usuário): o que um registra,
// o outro vê em tempo real via onSnapshot.
// ============================================================

import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
  addDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// ---------- Brasil: cidades_br (doc id = código IBGE do município) ----------

export function observarCidadesBR(callback) {
  return onSnapshot(collection(db, 'cidades_br'), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

export async function salvarCidadeBR(dados) {
  // dados: { ibgeCode, nome, uf, lat, lng, dataVisita, fotos, viagemId, registradoPor }
  const ref = doc(db, 'cidades_br', String(dados.ibgeCode));
  await setDoc(ref, { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
  return dados.ibgeCode;
}

export async function excluirCidadeBR(ibgeCode) {
  await deleteDoc(doc(db, 'cidades_br', String(ibgeCode)));
}

// ---------- Mundo: países visitados (doc id = ISO2) ----------

export function observarPaises(callback) {
  return onSnapshot(collection(db, 'paises'), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

export async function salvarPais(dados) {
  // dados: { iso2, iso3, nome, registradoPor }
  const ref = doc(db, 'paises', dados.iso2);
  await setDoc(ref, { ...dados, visitado: true, atualizadoEm: serverTimestamp() }, { merge: true });
  return dados.iso2;
}

export async function excluirPais(iso2) {
  await deleteDoc(doc(db, 'paises', iso2));
}

// ---------- Mundo: cidades dentro de cada país (doc id = automático) ----------

export function observarCidadesMundo(callback) {
  return onSnapshot(collection(db, 'cidades_mundo'), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

export async function salvarCidadeMundo(dados) {
  // dados: { id?, nome, paisIso2, lat, lng, dataVisita, fotos, viagemId, registradoPor }
  if (dados.id) {
    const { id, ...resto } = dados;
    await updateDoc(doc(db, 'cidades_mundo', id), { ...resto, atualizadoEm: serverTimestamp() });
    return id;
  }
  const refNova = await addDoc(collection(db, 'cidades_mundo'), { ...dados, criadoEm: serverTimestamp() });
  return refNova.id;
}

export async function excluirCidadeMundo(id) {
  await deleteDoc(doc(db, 'cidades_mundo', id));
}

// ---------- Viagens / roteiros (doc id = automático) ----------

export function observarViagens(callback) {
  return onSnapshot(collection(db, 'viagens'), (snap) => {
    const lista = [];
    snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
    callback(lista);
  });
}

export async function salvarViagem(dados) {
  // dados: { id?, titulo, dataInicio, paradas:[{tipo,nome,uf|pais,lat,lng,ibgeCode?}], registradoPor }
  if (dados.id) {
    const { id, ...resto } = dados;
    await updateDoc(doc(db, 'viagens', id), resto);
    return id;
  }
  const refNova = await addDoc(collection(db, 'viagens'), { ...dados, criadoEm: serverTimestamp() });
  return refNova.id;
}

export async function excluirViagem(id) {
  await deleteDoc(doc(db, 'viagens', id));
}
