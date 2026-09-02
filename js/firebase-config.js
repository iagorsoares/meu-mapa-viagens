// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// Preencha com os dados do SEU projeto:
// Firebase Console > Configurações do projeto (⚙️) > Geral > Seus apps > SDK setup and configuration
// (veja o passo a passo no SETUP.md, parte 2)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWQxI0-WuHjP2LZSd7TaaYawDWHzr1vXY",
  authDomain: "nosso-mapa-viagens.firebaseapp.com",
  projectId: "nosso-mapa-viagens",
  storageBucket: "nosso-mapa-viagens.firebasestorage.app",
  messagingSenderId: "821374665533",
  appId: "1:821374665533:web:66baf5d4c89f5a8f8abb54"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
