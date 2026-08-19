// Cole aqui o objeto de configuração do seu app Web copiado do Firebase Console.
// Essa configuração identifica o projeto no cliente; a proteção dos dados é feita
// pelo Firebase Authentication + regras do Firestore em firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDsPd-VxkpX069_Bn2n_AV0nUj9h3Kx-Ww",
  authDomain: "treino-346bb.firebaseapp.com",
  projectId: "treino-346bb",
  storageBucket: "treino-346bb.firebasestorage.app",
  messagingSenderId: "907215064509",
  appId: "1:907215064509:web:cf5bc3cbe3ca0f2086d6d4",
};

// Opcional: chave pública de um App Check com reCAPTCHA Enterprise.
// Deixe vazio até registrar todos os domínios publicados no Firebase App Check.
// Banco Firestore usado por TODO o projeto (app + painel administrativo).
// Este projeto usa o banco NOMEADO "default" (sem parênteses), conforme o banco existente no Firebase Console.
// Não trocar por "(default)" neste projeto, pois são IDs diferentes.
export const firestoreDatabaseId = "default";

export const appCheckSiteKey = "";
