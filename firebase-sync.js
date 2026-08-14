import { appCheckSiteKey, firebaseConfig } from "./firebase-config.js";

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

  const [{ initializeApp }, authSdk, firestoreSdk, appCheckSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`),
  ]);

  const {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut: firebaseSignOut,
  } = authSdk;
  const { getFirestore, doc, collection, getDoc, getDocs, setDoc, writeBatch, serverTimestamp, onSnapshot } = firestoreSdk;

  const firebaseApp = initializeApp(firebaseConfig);
  if (String(appCheckSiteKey || "").trim()) {
    appCheckSdk.initializeAppCheck(firebaseApp, {
      provider: new appCheckSdk.ReCaptchaEnterpriseProvider(String(appCheckSiteKey).trim()),
      isTokenAutoRefreshEnabled: true,
    });
  }
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
  let unsubscribeAccess = null;
  let presenceTimer = null;
  let accessAllowed = false;

  const userInfo = (user) => user ? {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
  } : null;

  const settingsRef = (uid) => doc(db, "users", uid, "app", "settings");
  const workoutsRef = (uid) => collection(db, "users", uid, "workouts");
  const accessRef = (uid) => doc(db, "access", uid);
  const presenceRef = (uid) => doc(db, "presence", uid);

  async function ensureAccessRegistration(user) {
    const reference = accessRef(user.uid);
    const snapshot = await getDoc(reference);
    if (snapshot.exists()) {
      // Contas que ficaram como "aguardando" na versão anterior também são
      // liberadas nesta migração. Bloqueios manuais não são alterados.
      if (snapshot.data()?.status === "pending") {
        await setDoc(reference, {
          email: user.email || "",
          displayName: user.displayName || "",
          photoURL: user.photoURL || "",
          status: "active",
          expiresAt: null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      return;
    }

    // Novas contas entram liberadas. Depois disso, apenas a conta
    // administradora pode alterar este documento para bloquear ou liberar.
    await setDoc(reference, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      plan: "pro",
      status: "active",
      expiresAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  function setStatus(status, message, extra = {}) {
    bridge.setCloudStatus({ configured: true, authResolved, status, user: userInfo(currentUser), message, ...extra });
  }

  function reportError(error, message = "Não foi possível salvar na nuvem agora.") {
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
    if (!expectedUid || currentUser?.uid !== expectedUid || !accessAllowed) return;
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
    if (currentUser?.uid === expectedUid) setStatus("synced", "Dados salvos");
  }

  async function hydrateFromCloud(expectedUid = currentUser?.uid) {
    if (!expectedUid || currentUser?.uid !== expectedUid || !accessAllowed) return;
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

  function timestampMillis(value) {
    if (!value) return null;
    if (typeof value.toMillis === "function") return value.toMillis();
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function normalizeBilling(value) {
    if (!value || !Array.isArray(value.installments)) return null;
    return {
      plan: "pro",
      planName: "Meu Treino Pro",
      amountCents: 2999,
      totalInstallments: 12,
      startedAt: timestampMillis(value.startedAt),
      installments: value.installments.slice(0, 12).map((installment, index) => ({
        number: Number(installment?.number) || index + 1,
        amountCents: Number(installment?.amountCents) || 2999,
        dueAt: timestampMillis(installment?.dueAt),
        status: installment?.status === "paid" ? "paid" : "pending",
        paidAt: timestampMillis(installment?.paidAt),
        pixCode: String(installment?.pixCode || ""),
        qrCodeUrl: String(installment?.qrCodeUrl || ""),
      })),
    };
  }

  function normalizeAccess(snapshot) {
    const data = snapshot.exists() ? snapshot.data() : {};
    const expiresAt = timestampMillis(data.expiresAt);
    const storedStatus = ["active", "paused", "cancelled", "pending"].includes(data.status) ? data.status : "pending";
    return {
      status: storedStatus,
      allowed: storedStatus === "active",
      plan: String(data.plan || ""),
      expiresAt,
      billing: normalizeBilling(data.billing),
    };
  }

  async function updatePresence(online, uid = currentUser?.uid) {
    if (!uid || currentUser?.uid !== uid) return;
    try {
      await setDoc(presenceRef(uid), {
        uid,
        online: Boolean(online),
        lastSeen: serverTimestamp(),
        displayName: currentUser.displayName || "",
        email: currentUser.email || "",
        photoURL: currentUser.photoURL || "",
      }, { merge: true });
    } catch (error) {
      console.warn("Firebase presence:", error?.code || error);
    }
  }

  function stopPresence(markOffline = false) {
    const uid = currentUser?.uid;
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = null;
    if (markOffline && uid) updatePresence(false, uid);
  }

  function startPresence(uid) {
    stopPresence(false);
    const publish = () => updatePresence(document.visibilityState === "visible" && navigator.onLine, uid);
    publish();
    presenceTimer = window.setInterval(publish, 60000);
  }

  function stopAccessObserver() {
    if (typeof unsubscribeAccess === "function") unsubscribeAccess();
    unsubscribeAccess = null;
  }

  function beginHydration(uid) {
    if (hydrated || hydrationUserId === uid || !accessAllowed) return;
    hydrationUserId = uid;
    enqueue(async () => {
      try {
        await hydrateFromCloud(uid);
      } finally {
        if (hydrationUserId === uid) hydrationUserId = null;
      }
    });
  }

  function observeAccess(user) {
    stopAccessObserver();
    accessAllowed = false;
    setStatus("checking", "Validando seu acesso", {
      accessResolved: false,
      access: { status: "checking", allowed: false, plan: "", expiresAt: null, billing: null },
    });

    unsubscribeAccess = onSnapshot(accessRef(user.uid), (snapshot) => {
      if (currentUser?.uid !== user.uid) return;
      const access = normalizeAccess(snapshot);
      accessAllowed = access.allowed;
      setStatus(access.allowed ? (hydrated ? "synced" : "syncing") : "blocked", access.allowed ? (hydrated ? "Dados salvos" : "Buscando seus dados") : "Acesso indisponível", {
        accessResolved: true,
        access,
      });
      if (access.allowed) {
        startPresence(user.uid);
        beginHydration(user.uid);
      } else {
        stopPresence(true);
      }
    }, (error) => {
      console.error("Firebase access:", error);
      accessAllowed = false;
      stopPresence(false);
      setStatus("error", "Não foi possível validar seu acesso", {
        accessResolved: true,
        access: { status: "error", allowed: false, plan: "", expiresAt: null, billing: null },
      });
    });
    ensureAccessRegistration(user).catch((error) => {
      console.error("Firebase registration:", error);
      if (currentUser?.uid !== user.uid) return;
      setStatus("error", "Não foi possível cadastrar seu acesso", {
        accessResolved: true,
        access: { status: "error", allowed: false, plan: "", expiresAt: null, billing: null },
      });
    });
  }

  function activateSignedInUser(user) {
    if (!user) return;
    const userChanged = currentUser?.uid !== user.uid;
    if (userChanged) {
      stopPresence(true);
      stopAccessObserver();
    }
    currentUser = user;
    authResolved = true;

    if (userChanged) {
      hydrated = false;
      hydrationUserId = null;
      knownRemoteWorkoutIds = new Set();
      bridge.activateUser(userInfo(user));
      observeAccess(user);
    } else if (!unsubscribeAccess) {
      observeAccess(user);
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
      if (error?.code === "auth/user-disabled") {
        reportError(error, "Esta conta está pausada ou cancelada.");
        return;
      }
      reportError(error, "Não foi possível entrar com Google.");
    }
  }

  async function signOut() {
    try {
      await updatePresence(false);
      await firebaseSignOut(auth);
      bridge.toast("Conta desconectada. Seus dados locais continuam salvos.");
    } catch (error) {
      reportError(error, "Não foi possível desconectar agora.");
    }
  }

  window.GymCloud = Object.freeze({ signIn, signOut });

  window.addEventListener("gym:data-changed", () => {
    if (!currentUser || !accessAllowed) return;
    const uid = currentUser.uid;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => enqueue(() => hydrated ? pushLocalState(uid) : hydrateFromCloud(uid)), 550);
  });

  window.addEventListener("offline", () => {
    if (currentUser && accessAllowed) {
      updatePresence(false);
      setStatus("offline", "Offline • alterações seguras neste aparelho");
    }
  });

  window.addEventListener("online", () => {
    if (currentUser && accessAllowed) {
      const uid = currentUser.uid;
      updatePresence(document.visibilityState === "visible", uid);
      enqueue(() => hydrated ? pushLocalState(uid) : hydrateFromCloud(uid));
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (currentUser && accessAllowed) updatePresence(document.visibilityState === "visible" && navigator.onLine);
  });

  window.addEventListener("pagehide", () => {
    if (currentUser && accessAllowed) updatePresence(false);
  });

  onAuthStateChanged(auth, (user) => {
    authResolved = true;
    if (user) {
      activateSignedInUser(user);
      return;
    }
    stopPresence(false);
    stopAccessObserver();
    accessAllowed = false;
    currentUser = null;
    hydrated = false;
    hydrationUserId = null;
    knownRemoteWorkoutIds = new Set();
    setStatus("local", "Entre com Google para acessar seus dados", {
      accessResolved: false,
      access: { status: "checking", allowed: false, plan: "", expiresAt: null, billing: null },
    });
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
