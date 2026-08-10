import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "12.16.0";

function configIsReady(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

async function getBridge() {
  if (window.GymApp) return window.GymApp;
  await new Promise((resolve) => window.addEventListener("gym:bridge-ready", resolve, { once: true }));
  return window.GymApp;
}

function workoutId(workout) {
  return String(workout?.id || workout?.completedAt || `workout-${Date.now()}`).replaceAll("/", "-");
}

function mergeById(remoteItems = [], localItems = []) {
  const merged = new Map();
  remoteItems.forEach((item) => merged.set(String(item?.id || item?.completedAt || ""), item));
  localItems.forEach((item) => merged.set(String(item?.id || item?.completedAt || ""), item));
  merged.delete("");
  return [...merged.values()];
}

function isUntouchedLegacyProfile(profile) {
  if (!profile || typeof profile !== "object") return false;
  return Number(profile.weight) === 82
    && Number(profile.height) === 178
    && String(profile.goal || "") === "Hipertrofia"
    && Number(profile.frequency) === 6
    && !profile.photoDataUrl;
}

async function main() {
  const bridge = await getBridge();

  if (!configIsReady(firebaseConfig)) {
    bridge.setCloudStatus({ configured: false, authResolved: true, status: "local", user: null, message: "Firebase aguardando configuração" });
    window.GymCloud = Object.freeze({
      signIn: () => bridge.toast("Falta adicionar a configuração do seu projeto Firebase."),
      signOut: () => {},
    });
    return;
  }

  bridge.setCloudStatus({ configured: true, authResolved: false, status: "checking", message: "Verificando sua sessão" });

  const [{ initializeApp }, authSdk, firestoreSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
  ]);

  const {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut: firebaseSignOut,
  } = authSdk;
  const { getFirestore, doc, collection, getDoc, getDocs, setDoc, writeBatch, serverTimestamp } = firestoreSdk;

  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  let currentUser = null;
  let authResolved = false;
  let hydrated = false;
  let hydrationUserId = null;
  let knownRemoteWorkoutIds = new Set();
  let queue = Promise.resolve();
  let syncTimer = null;

  const userInfo = (user) => user ? {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
  } : null;

  const settingsRef = (uid) => doc(db, "users", uid, "app", "settings");
  const workoutsRef = (uid) => collection(db, "users", uid, "workouts");

  function setStatus(status, message) {
    bridge.setCloudStatus({ configured: true, authResolved, status, user: userInfo(currentUser), message });
  }

  function reportError(error, message = "Não foi possível sincronizar agora.") {
    console.error("Firebase sync:", error);
    setStatus("error", message);
    if (error?.code === "auth/unauthorized-domain") bridge.toast("Autorize o domínio publicado no Firebase Authentication.");
    else bridge.toast(message);
  }

  function enqueue(task) {
    queue = queue.then(task, task).catch((error) => reportError(error));
    return queue;
  }

  async function commitWorkoutDiff(snapshot, uid) {
    const localIds = new Set(snapshot.history.map(workoutId));
    const operations = [];

    snapshot.history.forEach((workout) => {
      const id = workoutId(workout);
      if (!knownRemoteWorkoutIds.has(id)) operations.push({ type: "set", id, workout });
    });
    knownRemoteWorkoutIds.forEach((id) => {
      if (!localIds.has(id)) operations.push({ type: "delete", id });
    });

    for (let offset = 0; offset < operations.length; offset += 400) {
      const batch = writeBatch(db);
      operations.slice(offset, offset + 400).forEach((operation) => {
        const ref = doc(db, "users", uid, "workouts", operation.id);
        if (operation.type === "delete") batch.delete(ref);
        else batch.set(ref, { ...operation.workout, ownerId: uid });
      });
      await batch.commit();
    }

    if (currentUser?.uid === uid) knownRemoteWorkoutIds = localIds;
  }

  async function pushLocalState(expectedUid = currentUser?.uid) {
    if (!expectedUid || currentUser?.uid !== expectedUid) return;
    if (!navigator.onLine) {
      setStatus("offline", "Offline • alterações seguras neste aparelho");
      return;
    }

    setStatus("syncing", "Salvando alterações");
    const snapshot = bridge.getSnapshot();
    await setDoc(settingsRef(expectedUid), {
      ownerId: expectedUid,
      profile: snapshot.profile,
      customTemplates: snapshot.customTemplates,
      updatedAt: snapshot.updatedAt || Date.now(),
      serverUpdatedAt: serverTimestamp(),
      schemaVersion: 2,
    });
    await commitWorkoutDiff(snapshot, expectedUid);
    if (currentUser?.uid === expectedUid) setStatus("synced", "Tudo sincronizado");
  }

  async function hydrateFromCloud(expectedUid = currentUser?.uid) {
    if (!expectedUid || currentUser?.uid !== expectedUid) return;
    if (!navigator.onLine) {
      setStatus("offline", "Offline • usando dados deste aparelho");
      return;
    }

    setStatus("syncing", "Buscando seus dados");
    const local = bridge.getSnapshot();
    const [settingsSnapshot, workoutsSnapshot] = await Promise.all([getDoc(settingsRef(expectedUid)), getDocs(workoutsRef(expectedUid))]);
    if (currentUser?.uid !== expectedUid) return;
    const remoteSettings = settingsSnapshot.exists() ? settingsSnapshot.data() : null;
    const remoteHistory = workoutsSnapshot.docs.map((item) => item.data());
    knownRemoteWorkoutIds = new Set(workoutsSnapshot.docs.map((item) => item.id));

    const remoteUpdatedAt = Number(remoteSettings?.updatedAt) || 0;
    const localIsNewer = Number(local.updatedAt) > remoteUpdatedAt;
    const remoteTemplates = remoteSettings?.customTemplates || [];
    const remoteProfileIsOnlyOldDemo = Number(remoteSettings?.schemaVersion || 1) < 2
      && remoteHistory.length === 0
      && remoteTemplates.length === 0
      && isUntouchedLegacyProfile(remoteSettings?.profile);
    const remoteProfile = remoteProfileIsOnlyOldDemo ? null : remoteSettings?.profile;
    const profile = localIsNewer ? local.profile : (remoteProfile || local.profile);
    const customTemplates = mergeById(remoteTemplates, local.customTemplates || []);
    const history = mergeById(remoteHistory, local.history || []).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    const updatedAt = Math.max(Number(local.updatedAt) || 0, remoteUpdatedAt);

    bridge.applySnapshot({ profile, customTemplates, history, updatedAt });
    hydrated = true;
    await pushLocalState(expectedUid);
  }

  function activateSignedInUser(user) {
    if (!user) return;
    const userChanged = currentUser?.uid !== user.uid;
    currentUser = user;
    authResolved = true;

    if (userChanged) {
      hydrated = false;
      knownRemoteWorkoutIds = new Set();
      bridge.activateUser(userInfo(user));
    }

    setStatus(hydrated ? "synced" : "syncing", hydrated ? "Tudo sincronizado" : "Buscando seus dados");
    if (!hydrated && hydrationUserId !== user.uid) {
      hydrationUserId = user.uid;
      enqueue(async () => {
        try {
          await hydrateFromCloud(user.uid);
        } finally {
          if (hydrationUserId === user.uid) hydrationUserId = null;
        }
      });
    }
  }

  async function signIn() {
    try {
      const result = await signInWithPopup(auth, provider);
      // Mesmo fluxo usado no projeto da Lara: popup em qualquer dispositivo.
      // O resultado também ativa a sessão imediatamente, enquanto o observer
      // continua sendo a fonte de verdade para recargas e sessões já existentes.
      if (result?.user) activateSignedInUser(result.user);
    } catch (error) {
      if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") return;
      if (error?.code === "auth/popup-blocked") {
        reportError(error, "Permita pop-ups para este site e tente entrar novamente.");
        return;
      }
      reportError(error, "Não foi possível entrar com Google.");
    }
  }

  async function signOut() {
    try {
      await firebaseSignOut(auth);
      bridge.toast("Conta desconectada. Seus dados locais continuam salvos.");
    } catch (error) {
      reportError(error, "Não foi possível desconectar agora.");
    }
  }

  window.GymCloud = Object.freeze({ signIn, signOut });

  window.addEventListener("gym:data-changed", () => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => enqueue(() => hydrated ? pushLocalState(uid) : hydrateFromCloud(uid)), 550);
  });

  window.addEventListener("offline", () => {
    if (currentUser) setStatus("offline", "Offline • alterações seguras neste aparelho");
  });

  window.addEventListener("online", () => {
    if (currentUser) {
      const uid = currentUser.uid;
      enqueue(() => hydrated ? pushLocalState(uid) : hydrateFromCloud(uid));
    }
  });

  onAuthStateChanged(auth, (user) => {
    authResolved = true;
    if (user) {
      activateSignedInUser(user);
      return;
    }
    currentUser = null;
    hydrated = false;
    hydrationUserId = null;
    knownRemoteWorkoutIds = new Set();
    setStatus("local", "Entre com Google para ativar a sincronização");
  });
}

main().catch(async (error) => {
  console.error("Firebase init:", error);
  const bridge = await getBridge();
  bridge.setCloudStatus({ configured: configIsReady(firebaseConfig), authResolved: true, status: "error", user: null, message: "Firebase indisponível" });
  window.GymCloud = Object.freeze({
    signIn: () => bridge.toast("Firebase indisponível. Recarregue o app e tente novamente."),
    signOut: () => {},
  });
});
