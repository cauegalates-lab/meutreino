const STORE_KEY = "meu-treino-historico-v1";
const CUSTOM_KEY = "meu-treino-personalizados-v2";
const PROFILE_KEY = "meu-treino-perfil-v2";
const SYNC_META_KEY = "meu-treino-sync-meta-v1";
const LOCAL_OWNER_KEY = "meu-treino-owner-v1";
const INSTALL_ONBOARDING_KEY = "meu-treino-install-onboarding-v1";
const DATA_SCHEMA_VERSION = 2;
const WEEK_DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const DEFAULT_TRAINING_DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const USER_AGENT = navigator.userAgent || "";
const IS_IOS = /iPad|iPhone|iPod/i.test(USER_AGENT) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/i.test(USER_AGENT);
const IS_IOS_SAFARI = IS_IOS && /Safari/i.test(USER_AGENT) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(USER_AGENT);
let activeStorageUid = "";
let installPromptEvent = null;
let installOnboardingDismissed = readInstallOnboardingPreference();
let installSuccessShown = false;
let installPromptWaitExpired = !IS_ANDROID;

const legacyTemplates = [
  {
    name: "Peito + Tríceps", group: "Peito e braços", day: "SEG", color: "#ff8a3d", duration: 55,
    exercises: [
      ["Supino reto", "4 séries alvo • Descanso 120s", 82, 8, "Último: 78 kg × 8", "+4 kg"],
      ["Supino inclinado", "3 séries alvo • Descanso 90s", 30, 10, "Último: 28 kg × 10", "+2 kg"],
      ["Crucifixo máquina", "3 séries alvo • Descanso 60s", 50, 12, "Último: 45 kg × 12", "+5 kg"],
      ["Tríceps corda", "3 séries alvo • Descanso 60s", 33, 12, "Último: 30 kg × 12", "+3 kg"],
      ["Tríceps testa", "3 séries alvo • Descanso 75s", 22, 10, "Último: 20 kg × 10", "+2 kg"],
      ["Mergulho", "3 séries alvo • Descanso 75s", 0, 14, "Último: peso corporal × 12", "+2 reps"],
    ],
  },
  {
    name: "Costas + Bíceps", group: "Costas e braços", day: "TER", color: "#a7f432", duration: 50,
    exercises: [
      ["Puxada alta", "4 séries alvo • Descanso 90s", 45, 12, "Último: 50 kg × 10", "+5 kg", "assets/puxada-alta.png"],
      ["Remada baixa", "3 séries alvo • Descanso 90s", 50, 10, "Último: 50 kg × 10", "+5 kg", "assets/remada-baixa.png"],
      ["Remada unilateral", "3 séries alvo • Descanso 75s", 28, 10, "Último: 26 kg × 10", "+2 kg"],
      ["Pulldown", "3 séries alvo • Descanso 60s", 35, 12, "Último: 32 kg × 12", "+3 kg"],
      ["Rosca direta", "3 séries alvo • Descanso 75s", 27, 10, "Último: 25 kg × 10", "+2 kg"],
      ["Rosca martelo", "3 séries alvo • Descanso 60s", 14, 10, "Último: 12 kg × 10", "+2 kg"],
    ],
  },
  {
    name: "Pernas completo", group: "Inferiores", day: "QUA", color: "#65d9ff", duration: 65,
    exercises: [
      ["Agachamento livre", "4 séries alvo • Descanso 150s", 110, 8, "Último: 105 kg × 8", "+5 kg"],
      ["Leg press", "4 séries alvo • Descanso 120s", 190, 10, "Último: 180 kg × 10", "+10 kg"],
      ["Cadeira extensora", "3 séries alvo • Descanso 60s", 60, 12, "Último: 55 kg × 12", "+5 kg"],
      ["Mesa flexora", "3 séries alvo • Descanso 60s", 45, 12, "Último: 42 kg × 12", "+3 kg"],
      ["Stiff", "3 séries alvo • Descanso 90s", 66, 10, "Último: 62 kg × 10", "+4 kg"],
      ["Afundo", "3 séries alvo • Descanso 75s", 20, 10, "Último: 18 kg × 10", "+2 kg"],
      ["Panturrilha em pé", "4 séries alvo • Descanso 45s", 65, 15, "Último: 60 kg × 15", "+5 kg"],
    ],
  },
  {
    name: "Ombros + Trapézio", group: "Ombros", day: "QUI", color: "#ad92ff", duration: 45,
    exercises: [
      ["Desenvolvimento", "4 séries alvo • Descanso 90s", 26, 9, "Último: 24 kg × 9", "+2 kg"],
      ["Elevação lateral", "4 séries alvo • Descanso 60s", 10, 14, "Último: 10 kg × 12", "+2 reps"],
      ["Crucifixo inverso", "3 séries alvo • Descanso 60s", 38, 12, "Último: 35 kg × 12", "+3 kg"],
      ["Elevação frontal", "3 séries alvo • Descanso 60s", 12, 10, "Último: 10 kg × 10", "+2 kg"],
      ["Encolhimento", "4 séries alvo • Descanso 75s", 36, 12, "Último: 34 kg × 12", "+2 kg"],
    ],
  },
  {
    name: "Costas + Bíceps", group: "Costas e braços", day: "SEX", color: "#a7f432", duration: 50,
    exercises: [],
  },
  {
    name: "Cardio + Core", group: "Condicionamento", day: "SÁB", color: "#ffda5c", duration: 40,
    exercises: [
      ["Esteira", "20 min • Ritmo moderado", 0, 20, "Último: 18 minutos", "+2 min"],
      ["Abdominal máquina", "4 séries alvo • Descanso 45s", 40, 15, "Último: 35 kg × 15", "+5 kg"],
      ["Prancha", "3 séries alvo • Descanso 45s", 0, 60, "Último: 50 segundos", "+10 s"],
      ["Elevação de pernas", "3 séries alvo • Descanso 45s", 0, 14, "Último: 12 reps", "+2 reps"],
      ["Bike", "10 min • Ritmo forte", 0, 10, "Último: 8 minutos", "+2 min"],
    ],
  },
];

legacyTemplates[4].exercises = legacyTemplates[1].exercises;

const restTemplate = { name: "Descanso", group: "Recuperação", day: "DOM", color: "#7b858a", duration: 0, exercises: [] };

const state = {
  view: "home",
  selectedDay: "SEX",
  history: [],
  customTemplates: [],
  profile: defaultProfile(),
  active: null,
  metric: "carga",
  progressExercise: "Supino reto",
  timerId: null,
  restId: null,
  restSeconds: 0,
  cloud: { configured: true, authResolved: false, status: "checking", user: null, message: "Verificando sua sessão" },
};

const viewRoot = document.getElementById("view");
const navRoot = document.getElementById("bottom-nav");
const overlayRoot = document.getElementById("overlay-root");
const toastRoot = document.getElementById("toast-root");
const launchSplash = document.getElementById("launch-splash");

function readInstallOnboardingPreference() {
  try { return localStorage.getItem(INSTALL_ONBOARDING_KEY) === "done"; }
  catch { return false; }
}

function rememberInstallOnboarding() {
  installOnboardingDismissed = true;
  try { localStorage.setItem(INSTALL_ONBOARDING_KEY, "done"); } catch {}
}

function completeAppInstall() {
  rememberInstallOnboarding();
  overlayRoot.innerHTML = "";
  render();
  if (!installSuccessShown) {
    installSuccessShown = true;
    showToast("Meu Treino instalado. Abra pelo novo ícone.");
  }
}

function isStandaloneApp() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
}

function isMobileInstallTarget() {
  return IS_IOS || IS_ANDROID;
}

function installOnboardingActive() {
  return isMobileInstallTarget() && !isStandaloneApp() && !installOnboardingDismissed;
}

function dismissLaunchSplash() {
  if (!launchSplash) return;
  const isStandaloneLaunch = document.documentElement.classList.contains("standalone-launch");
  if (!isStandaloneLaunch) {
    launchSplash.remove();
    return;
  }
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    launchSplash.classList.add("is-leaving");
    window.setTimeout(() => {
      launchSplash.remove();
      document.documentElement.classList.remove("standalone-launch");
    }, reducedMotion ? 20 : 320);
  }, reducedMotion ? 250 : 1250);
}

function icon(name, className = "") {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function renderInstallScreen() {
  navRoot.innerHTML = "";
  navRoot.style.display = "none";
  const platform = IS_IOS ? "iPhone" : "Android";
  const preparingInstaller = IS_ANDROID && !installPromptEvent && !installPromptWaitExpired;
  viewRoot.innerHTML = `<div class="install-screen">
    <section class="install-shell" aria-labelledby="install-title">
      <div class="install-app-icon"><img src="assets/icon.svg" alt=""></div>
      <p class="install-kicker">MEU TREINO</p>
      <h1 id="install-title">Seu treino sempre à mão.</h1>
      <p class="install-copy">Instale no ${platform} para abrir em tela cheia e acessar rapidamente durante o treino.</p>
      <div class="install-benefits" aria-label="Vantagens da instalação">
        <span>${icon("check")} Ícone direto na tela inicial</span>
        <span>${icon("check")} Experiência em tela cheia</span>
        <span>${icon("check")} Acesso rápido aos seus treinos</span>
      </div>
      <button class="install-primary" data-action="install-app" ${preparingInstaller ? "disabled" : ""}>${preparingInstaller ? '<span class="install-button-spinner" aria-hidden="true"></span>' : icon("download")}<span>${preparingInstaller ? "Preparando instalação..." : "Instalar no celular"}</span>${icon("chevron")}</button>
      <button class="install-skip" data-action="continue-browser">Continuar pelo navegador</button>
      <small>Gratuito e sem precisar da App Store ou Play Store.</small>
    </section>
  </div>`;
}

function showInstallGuide() {
  const iosBrowserStep = IS_IOS_SAFARI ? "" : `<div class="install-step"><b>1</b><span><strong>Abra este link no Safari</strong><small>Use a opção “Abrir no Safari” do seu navegador atual.</small></span>${icon("compass")}</div>`;
  const firstNumber = IS_IOS_SAFARI ? 1 : 2;
  const guide = IS_IOS
    ? `${iosBrowserStep}
       <div class="install-step"><b>${firstNumber}</b><span><strong>Toque em Compartilhar</strong><small>É o ícone de uma seta saindo de um quadrado.</small></span>${icon("share")}</div>
       <div class="install-step"><b>${firstNumber + 1}</b><span><strong>Adicionar à Tela de Início</strong><small>Role o menu até encontrar essa opção.</small></span>${icon("home")}</div>
       <div class="install-step"><b>${firstNumber + 2}</b><span><strong>Confirme em Adicionar</strong><small>Se aparecer, mantenha “Abrir como App da Web” ativado.</small></span>${icon("check")}</div>`
    : `<div class="install-step"><b>1</b><span><strong>Abra este link no Chrome</strong><small>O instalador precisa ser aberto pelo navegador do Google.</small></span>${icon("compass")}</div>
       <div class="install-step"><b>2</b><span><strong>Abra o menu do navegador</strong><small>Toque nos três pontos no canto da tela.</small></span>${icon("more")}</div>
       <div class="install-step"><b>3</b><span><strong>Escolha Instalar app</strong><small>Em alguns celulares aparece como “Adicionar à tela inicial”.</small></span>${icon("download")}</div>`;

  overlayRoot.innerHTML = `<div class="modal-backdrop install-guide-backdrop"><section class="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title"><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button><span class="install-guide-icon">${icon(IS_IOS ? "share" : "download")}</span><p class="eyebrow">INSTALAÇÃO</p><h2 id="install-guide-title">${IS_IOS ? "Instalar no iPhone" : "Instalar no Android"}</h2><p>${IS_IOS ? "A Apple exige esta confirmação pelo menu do Safari." : "O instalador automático não abriu neste navegador. Faça assim:"}</p><div class="install-steps">${guide}</div><button class="primary-button install-guide-button" data-action="close-modal"><span class="button-label">Entendi</span><span class="button-icon">${icon("check")}</span></button></section></div>`;
}

async function requestAppInstall() {
  if (!installPromptEvent) {
    showInstallGuide();
    return;
  }

  const prompt = installPromptEvent;
  installPromptEvent = null;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice?.outcome === "accepted") {
      completeAppInstall();
    } else {
      showToast("Instalação cancelada. Você pode tentar novamente depois.");
    }
  } catch (error) {
    console.error("App install:", error);
    showInstallGuide();
  }
}

function googleMark() {
  return `<svg class="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.5l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9Z"/></svg>`;
}

function profilePhotoUrl() {
  return state.profile.photoDataUrl || state.cloud.user?.photoURL || "";
}

function profileDisplayName() {
  const googleName = String(state.cloud.user?.displayName || "").trim();
  if (googleName) return googleName;
  const emailName = String(state.cloud.user?.email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
  return emailName || "Atleta";
}

function profileFirstName() {
  return profileDisplayName().split(/\s+/).filter(Boolean)[0] || "Atleta";
}

function currentGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function profileAvatarContent() {
  const photo = profilePhotoUrl();
  const initials = profileDisplayName().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CG";
  return photo ? `<img src="${escapeHtml(photo)}" alt="" />` : escapeHtml(initials);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function storageKey(baseKey, uid = activeStorageUid) {
  return uid ? `${baseKey}:user:${uid}` : baseKey;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadHistory(uid = activeStorageUid) {
  const parsed = readJson(storageKey(STORE_KEY, uid), []);
  return Array.isArray(parsed) ? parsed : [];
}

function loadCustomTemplates(uid = activeStorageUid) {
  const parsed = readJson(storageKey(CUSTOM_KEY, uid), []);
  return Array.isArray(parsed) ? parsed : [];
}

function defaultProfile() {
  return {
    weight: 0,
    height: 0,
    goal: "",
    frequency: 0,
    trainingDays: [],
    photoDataUrl: "",
    settings: { autoRest: true, vibration: true, defaultRest: 90 },
  };
}

function normalizeProfile(profile = {}) {
  const fallback = defaultProfile();
  const legacyFrequency = Math.min(7, Math.max(0, Number(profile.frequency) || 0));
  const requestedDays = Array.isArray(profile.trainingDays)
    ? profile.trainingDays
    : WEEK_DAYS.slice(0, legacyFrequency);
  const trainingDays = WEEK_DAYS.filter((day) => requestedDays.includes(day));
  return {
    ...fallback,
    ...profile,
    weight: Math.max(0, Number(profile.weight) || 0),
    height: Math.max(0, Number(profile.height) || 0),
    goal: String(profile.goal || "").trim(),
    frequency: trainingDays.length,
    trainingDays,
    settings: { ...fallback.settings, ...(profile.settings || {}) },
  };
}

function loadProfile(uid = activeStorageUid) {
  return normalizeProfile(readJson(storageKey(PROFILE_KEY, uid), {}));
}

function localUpdatedAt(uid = activeStorageUid) {
  return Number(readJson(storageKey(SYNC_META_KEY, uid), {}).updatedAt) || 0;
}

function markDataChanged(scope) {
  if (!activeStorageUid) return;
  const updatedAt = Date.now();
  try {
    localStorage.setItem(storageKey(SYNC_META_KEY), JSON.stringify({ updatedAt, schemaVersion: DATA_SCHEMA_VERSION }));
  } catch {}
  window.dispatchEvent(new CustomEvent("gym:data-changed", { detail: { scope, updatedAt } }));
}

function persistHistory() {
  try {
    localStorage.setItem(storageKey(STORE_KEY), JSON.stringify(state.history));
  } catch {
    showToast("Não foi possível salvar neste navegador.");
  }
  markDataChanged("history");
}

function persistCustomTemplates() {
  try {
    localStorage.setItem(storageKey(CUSTOM_KEY), JSON.stringify(state.customTemplates));
  } catch {
    showToast("Não foi possível salvar seus treinos personalizados.");
  }
  markDataChanged("templates");
}

function persistProfile() {
  try {
    localStorage.setItem(storageKey(PROFILE_KEY), JSON.stringify(state.profile));
  } catch {
    showToast("Não foi possível salvar seu perfil.");
  }
  markDataChanged("profile");
}

function getCloudSnapshot() {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    updatedAt: localUpdatedAt(),
    profile: state.profile,
    customTemplates: state.customTemplates,
    history: state.history,
  };
}

function applyCloudSnapshot(payload = {}, options = {}) {
  if (Array.isArray(payload.history)) {
    state.history = [...payload.history].sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  }
  if (Array.isArray(payload.customTemplates)) state.customTemplates = payload.customTemplates;
  if (payload.profile && typeof payload.profile === "object") state.profile = normalizeProfile({ ...state.profile, ...payload.profile });
  const updatedAt = Math.max(localUpdatedAt(), Number(payload.updatedAt) || 0);
  try {
    localStorage.setItem(storageKey(STORE_KEY), JSON.stringify(state.history));
    localStorage.setItem(storageKey(CUSTOM_KEY), JSON.stringify(state.customTemplates));
    localStorage.setItem(storageKey(PROFILE_KEY), JSON.stringify(state.profile));
    localStorage.setItem(storageKey(SYNC_META_KEY), JSON.stringify({ updatedAt, schemaVersion: DATA_SCHEMA_VERSION }));
  } catch {}
  render();
  if (options.notify) showToast(options.notify);
}

function legacyTemplateCopies() {
  return legacyTemplates.map((template, index) => ({
    ...template,
    id: `legacy-routine-${index + 1}`,
    custom: true,
    exercises: template.exercises.map((exercise) => [...exercise]),
  }));
}

function scopedDataExists(uid) {
  try {
    return [STORE_KEY, CUSTOM_KEY, PROFILE_KEY, SYNC_META_KEY]
      .some((key) => localStorage.getItem(storageKey(key, uid)) !== null);
  } catch {
    return false;
  }
}

function legacyDataIsPersonalized() {
  if (loadHistory("").length > 0 || loadCustomTemplates("").length > 0) return true;
  const profile = readJson(PROFILE_KEY, null);
  if (!profile || typeof profile !== "object") return false;
  const days = Array.isArray(profile.trainingDays) ? profile.trainingDays : DEFAULT_TRAINING_DAYS;
  const untouchedDays = days.length === DEFAULT_TRAINING_DAYS.length
    && DEFAULT_TRAINING_DAYS.every((day) => days.includes(day));
  const settings = profile.settings || {};
  const untouchedSettings = settings.autoRest !== false
    && settings.vibration !== false
    && (!settings.defaultRest || Number(settings.defaultRest) === 90);
  return Number(profile.weight) !== 82
    || Number(profile.height) !== 178
    || String(profile.goal || "Hipertrofia") !== "Hipertrofia"
    || Number(profile.frequency || 6) !== 6
    || Boolean(profile.photoDataUrl)
    || !untouchedDays
    || !untouchedSettings;
}

function saveActiveAccount(updatedAt = 0) {
  try {
    localStorage.setItem(storageKey(STORE_KEY), JSON.stringify(state.history));
    localStorage.setItem(storageKey(CUSTOM_KEY), JSON.stringify(state.customTemplates));
    localStorage.setItem(storageKey(PROFILE_KEY), JSON.stringify(state.profile));
    localStorage.setItem(storageKey(SYNC_META_KEY), JSON.stringify({ updatedAt, schemaVersion: DATA_SCHEMA_VERSION }));
  } catch {}
}

function activateCloudUser(userOrUid) {
  const uid = typeof userOrUid === "string" ? userOrUid : userOrUid?.uid;
  if (!uid) return;

  let legacyOwner = null;
  try { legacyOwner = localStorage.getItem(LOCAL_OWNER_KEY); } catch {}
  const hasScopedData = scopedDataExists(uid);
  const shouldMigrateLegacy = !hasScopedData
    && legacyDataIsPersonalized()
    && (legacyOwner === uid || !legacyOwner);
  activeStorageUid = uid;

  if (hasScopedData) {
    state.history = loadHistory(uid);
    state.customTemplates = loadCustomTemplates(uid);
    state.profile = loadProfile(uid);
  } else if (shouldMigrateLegacy) {
    state.history = loadHistory("");
    const savedTemplates = loadCustomTemplates("");
    state.customTemplates = state.history.length
      ? [...savedTemplates, ...legacyTemplateCopies()]
      : savedTemplates;
    state.profile = loadProfile("");
    saveActiveAccount(localUpdatedAt(""));
  } else {
    state.history = [];
    state.customTemplates = [];
    state.profile = defaultProfile();
    saveActiveAccount(0);
  }

  state.active = null;
  state.restSeconds = 0;
  state.progressExercise = "";
  try { localStorage.setItem(LOCAL_OWNER_KEY, uid); } catch {}
}

function authGateActive() {
  return state.cloud.configured && (!state.cloud.authResolved || !state.cloud.user);
}

function setCloudStatus(next = {}) {
  const previousConfigured = state.cloud.configured;
  const previousResolved = state.cloud.authResolved;
  const previousUserId = state.cloud.user?.uid || null;
  state.cloud = { ...state.cloud, ...next };
  const nextUserId = state.cloud.user?.uid || null;
  const authChanged = previousConfigured !== state.cloud.configured || previousResolved !== state.cloud.authResolved || previousUserId !== nextUserId;
  if (authChanged) { render(); return; }
  if (installOnboardingActive()) { renderInstallScreen(); return; }
  if (authGateActive()) { renderAuthScreen(); return; }
  if (!state.active && state.view === "perfil" && !overlayRoot.innerHTML) renderProfile();
}

function allTemplates() {
  return [...state.customTemplates];
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatWeight(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonthWorkouts() {
  const now = new Date();
  return state.history.filter((item) => {
    const date = new Date(item.completedAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
}

function workoutStreak() {
  if (!state.history.length) return 0;
  const days = new Set(state.history.map((item) => dateKey(new Date(item.completedAt))));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function personalRecords() {
  const records = new Map();
  state.history.forEach((workout) => workout.exercises?.forEach((exercise) => {
    exercise.sets?.forEach((set) => {
      const weight = Number(set.weight) || 0;
      const reps = Number(set.reps) || 0;
      const current = records.get(exercise.name);
      if (!current || weight > current.weight || (weight === current.weight && reps > current.reps)) {
        records.set(exercise.name, { name: exercise.name, weight, reps, date: workout.completedAt });
      }
    });
  }));
  return [...records.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function buildWeek() {
  const names = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayDistance = now.getDay() === 0 ? -6 : 1 - now.getDay();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayStart);
    date.setDate(todayStart.getDate() + mondayDistance + index);
    return {
      key: names[date.getDay()],
      date: date.getDate(),
      iso: dateKey(date),
      today: dateKey(date) === dateKey(todayStart),
      past: date < todayStart,
    };
  });
}

function templateForDay(day) {
  const trainingDays = state.profile.trainingDays || [];
  if (!trainingDays.length) {
    return { ...restTemplate, name: "Crie seu primeiro treino", group: "Sua rotina", day, needsSetup: true };
  }
  if (!trainingDays.includes(day)) return { ...restTemplate, day };
  return state.customTemplates.find((template) => template.day === day)
    || { ...restTemplate, name: "Treino não configurado", group: "Sua rotina", day, needsSetup: true };
}

function currentWeekTemplate() {
  return templateForDay(state.selectedDay);
}

function getCoachInsight() {
  const template = currentWeekTemplate();
  if (template.needsSetup) return { title: "Monte sua rotina", text: "Crie um treino com seus exercícios, séries e cargas.", value: "CRIAR" };
  const first = template.exercises?.[0];
  if (!first) return { title: "Recuperação também é progresso", text: "Priorize sono, mobilidade e hidratação hoje.", value: "DESCANSO" };
  const name = first[0];
  const previous = lastExerciseRecord(name);
  if (!previous?.sets?.length) return { title: `Registre seu ${name}`, text: "Defina a carga durante o treino e acompanhe sua evolução pelo histórico.", value: "COMEÇAR" };
  const max = Math.max(...previous.sets.map((set) => Number(set.weight) || 0));
  return { title: `Último registro: ${name}`, text: `Seu último máximo foi ${formatWeight(max)} kg. A carga de hoje é definida por você.`, value: "HISTÓRICO" };
}

function exerciseHistoryFor(name) {
  return state.history.flatMap((workout) => {
    const exercise = workout.exercises?.find((item) => item.name === name);
    if (!exercise?.sets?.length) return [];
    const max = Math.max(...exercise.sets.map((set) => Number(set.weight) || 0));
    const reps = Math.max(...exercise.sets.map((set) => Number(set.reps) || 0));
    const volume = exercise.sets.reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
    return [{ date: workout.completedAt, max, reps, volume }];
  });
}

function lastExerciseRecord(exerciseName) {
  for (const workout of state.history) {
    const exercise = workout.exercises?.find((item) => item.name === exerciseName);
    if (exercise) return exercise;
  }
  return null;
}

function createExercises(template) {
  return template.exercises.map((preset, exerciseIndex) => {
    const [name, note, defaultWeight, defaultReps] = preset;
    const image = preset[6];
    const customSetCount = preset[7];
    const previous = lastExerciseRecord(name);
    const setCount = Number(customSetCount) || (exerciseIndex === 0 || /Agachamento|Leg press|Desenvolvimento/.test(name) ? 4 : 3);
    const sets = Array.from({ length: setCount }, (_, setIndex) => {
      const oldSet = previous?.sets?.[setIndex];
      const weight = oldSet ? Number(oldSet.weight) : template.custom ? Math.max(0, Number(defaultWeight) || 0) : 0;
      const reps = oldSet ? Number(oldSet.reps) : Math.max(1, defaultReps - (setIndex > 1 ? 2 : 0));
      return { weight, reps, done: false };
    });
    const previousMax = previous?.sets?.length ? Math.max(...previous.sets.map((set) => Number(set.weight) || 0)) : null;
    const restMatch = String(note || "").match(/Descanso\s+(\d+)s/i);
    return {
      name, note, last: previousMax !== null ? `Último: ${formatWeight(previousMax)} kg` : "Sem registro anterior",
      image, sets, noteText: "", restSeconds: Number(restMatch?.[1]) || 90,
    };
  });
}

function renderNav() {
  if (state.active) {
    navRoot.innerHTML = "";
    navRoot.style.display = "none";
    return;
  }
  navRoot.style.display = "grid";
  const items = [
    ["home", "Hoje", "home"],
    ["treinos", "Treinos", "dumbbell"],
    ["progresso", "Progresso", "chart"],
    ["perfil", "Perfil", "user"],
  ];
  navRoot.innerHTML = `
    ${items.slice(0,2).map(([view,label,ico]) => `<button class="nav-item ${state.view === view ? "active" : ""}" data-action="nav" data-view="${view}">${icon(ico)}<span>${label}</span></button>`).join("")}
    <button class="nav-add" data-action="quick-start" aria-label="Iniciar treino rápido">${icon("plus")}</button>
    ${items.slice(2).map(([view,label,ico]) => `<button class="nav-item ${state.view === view ? "active" : ""}" data-action="nav" data-view="${view}">${icon(ico)}<span>${label}</span></button>`).join("")}`;
}

function renderAuthScreen() {
  navRoot.innerHTML = "";
  navRoot.style.display = "none";
  const checking = !state.cloud.authResolved;
  const failed = state.cloud.status === "error";
  viewRoot.innerHTML = `<div class="auth-screen">
    <section class="auth-shell" aria-live="polite">
      <div class="auth-brand-mark">${icon("dumbbell")}</div>
      <p class="auth-kicker">MEU TREINO</p>
      <h1>${checking ? "Preparando seu treino" : failed ? "Tente entrar novamente" : "Seu treino, do seu jeito."}</h1>
      <p class="auth-copy">${checking ? "Carregando sua conta..." : "Entre para acessar seus treinos e acompanhar sua evolução."}</p>
      ${checking ? `<div class="auth-loading"><span class="auth-spinner"></span><small>Conectando</small></div>` : `<button class="google-login-button" data-action="cloud-login">${googleMark()}<span>Continuar com Google</span></button>`}
      <p class="auth-footnote">Seus treinos ficam privados e salvos na sua conta.</p>
    </section>
  </div>`;
}

function render() {
  if (installOnboardingActive()) { renderInstallScreen(); return; }
  if (authGateActive()) { renderAuthScreen(); return; }
  renderNav();
  if (state.active) renderActiveWorkout();
  else if (state.view === "home") renderHome();
  else if (state.view === "treinos") renderWorkouts();
  else if (state.view === "progresso") renderProgress();
  else renderProfile();
}

function renderHome() {
  const week = buildWeek();
  const today = week.find((day) => day.today)?.key || "SEX";
  if (!state.selectedDay) state.selectedDay = today;
  const selected = currentWeekTemplate();
  const monthlyNew = currentMonthWorkouts();
  const monthVolume = monthlyNew.reduce((sum, item) => sum + (Number(item.totalVolume) || 0), 0);
  const streak = workoutStreak();
  const completedDates = new Set(state.history.map((item) => dateKey(new Date(item.completedAt))));
  const insight = getCoachInsight();
  const greeting = currentGreeting();
  const firstName = profileFirstName();
  const hasWorkout = selected.exercises.length > 0;
  const needsSetup = Boolean(selected.needsSetup);

  viewRoot.innerHTML = `<div class="screen-page home-page">
    <header class="welcome-header">
      <div><p class="eyebrow">${escapeHtml(greeting.toUpperCase())}</p><h1>${escapeHtml(greeting)}, <span>${escapeHtml(firstName)}</span></h1><p>Foco no hoje, resultado no amanhã.</p></div>
      <button class="avatar" data-action="nav" data-view="perfil" aria-label="Abrir perfil">${profileAvatarContent()}</button>
    </header>
    <section class="today-card">
      <img class="today-photo" src="assets/hero-costas.png" alt="Atleta em treino de costas" />
      <div class="today-overlay"></div>
      <div class="today-content">
        <div class="today-kicker">${icon(hasWorkout ? "dumbbell" : needsSetup ? "plus" : "fire")} ${hasWorkout ? "TREINO DE HOJE" : needsSetup ? "PRIMEIRO PASSO" : "RECUPERAÇÃO"}</div>
        <h2>${escapeHtml(selected.name)}</h2>
        <div class="today-meta">${hasWorkout ? `<span>${icon("dumbbell")} ${selected.exercises.length} exercícios</span><span>${icon("clock")} ${selected.duration} min</span>` : needsSetup ? `<span>${icon("activity")} Personalize exercícios, séries e cargas</span>` : `<span>${icon("activity")} Mobilidade leve e recuperação</span>`}</div>
        <button class="primary-button" ${hasWorkout ? 'data-action="start-day"' : needsSetup ? 'data-action="open-builder"' : "disabled"}><span class="button-label">${hasWorkout ? "Iniciar treino" : needsSetup ? "Criar treino" : "Descanso programado"}</span><span class="button-icon">${icon(hasWorkout ? "chevron" : needsSetup ? "plus" : "check")}</span></button>
      </div>
    </section>
    <section class="week-card">
      <div class="section-heading"><span>Semana</span><button data-action="nav" data-view="treinos">Ver calendário</button></div>
      <div class="week-grid">
        ${week.map((day) => `<button class="${state.selectedDay === day.key ? "selected " : ""}${day.today ? "today" : ""}" data-action="select-day" data-day="${day.key}">
          <span class="week-name">${day.key}</span><span class="week-date">${day.date}</span><span class="week-dot ${completedDates.has(day.iso) ? "complete" : ""}">${completedDates.has(day.iso) ? icon("check") : day.today ? day.date : ""}</span>
        </button>`).join("")}
      </div>
    </section>
    <section class="metrics-grid">
      <article class="metric-card">${icon("chart","metric-blue")}<span>Treinos no mês</span><strong>${monthlyNew.length}</strong><small>Concluídos</small></article>
      <article class="metric-card">${icon("fire","metric-orange")}<span>Sequência</span><strong>${streak} ${streak === 1 ? "dia" : "dias"}</strong><small>Treinos consecutivos</small></article>
      <article class="metric-card">${icon("target","metric-purple")}<span>Volume</span><strong>${formatNumber(monthVolume)}<em> kg</em></strong><small>Total levantado</small></article>
    </section>
    <button class="coach-card" data-action="nav" data-view="progresso"><span class="coach-icon">${icon("trending")}</span><span><small>INSIGHT DO TREINO</small><strong>${escapeHtml(insight.title)}</strong><em>${escapeHtml(insight.text)}</em></span><b>${escapeHtml(insight.value)}</b></button>
    <button class="streak-card" data-action="nav" data-view="progresso"><span class="streak-icon">${icon("bolt")}</span><span><strong>${streak > 1 ? `Sequência de ${streak} dias ativa!` : "Seu próximo treino começa a sequência."}</strong><small>${streak > 1 ? "Mantenha o ritmo e respeite sua recuperação." : "Consistência é construída um treino por vez."}</small></span>${icon("chevron")}</button>
  </div>`;
}

function renderWorkouts() {
  const week = buildWeek();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date());
  const recent = state.history.slice(0,4);
  const routineTemplates = allTemplates();
  viewRoot.innerHTML = `<div class="screen-page workouts-page">
    <header class="page-header"><div><p class="eyebrow">SUA ROTINA</p><h1>Meus treinos</h1><p>Planeje a semana e registre cada evolução.</p></div><button class="builder-button" data-action="open-builder">${icon("plus")} Novo</button></header>
    <div class="month-strip"><div>${icon("calendar")}<span>${escapeHtml(month[0].toUpperCase()+month.slice(1))}</span></div><strong>${currentMonthWorkouts().length} treinos</strong></div>
    <section class="routine-list">
      ${routineTemplates.length ? routineTemplates.map((template,index) => {
        const day = week.find((item) => item.key === template.day);
        return `<article class="routine-card"><div class="routine-day" style="--accent:${template.color}"><span>${template.day}</span><strong>${day?.date ?? index+3}</strong></div><div class="routine-info"><span>${escapeHtml(template.group)}${template.custom ? ' • <b>PERSONALIZADO</b>' : ''}</span><h2>${escapeHtml(template.name)}</h2><div>${icon("dumbbell")} ${template.exercises.length} exercícios ${icon("clock")} ${template.duration} min</div></div><div class="routine-controls">${template.custom ? `<button class="routine-delete" data-action="ask-delete-template" data-index="${index}" aria-label="Excluir ${escapeHtml(template.name)}">${icon("trash")}</button>` : ""}<button class="routine-play" data-action="start-template" data-index="${index}" aria-label="Iniciar ${escapeHtml(template.name)}">${icon("play")}</button></div></article>`;
      }).join("") : `<div class="empty-list">${icon("dumbbell")}<span><strong>Sua rotina começa aqui</strong><small>Toque em Novo para criar seu primeiro treino.</small></span></div>`}
    </section>
    <div class="history-title"><h2>Histórico recente</h2>${icon("history")}</div>
    <section class="history-list">${recent.length ? recent.map((workout) => historyRow(workout)).join("") : `<div class="empty-list">${icon("history")}<span><strong>Nenhum treino concluído ainda</strong><small>Finalize seu primeiro treino para começar o histórico.</small></span></div>`}</section>
  </div>`;
}

function historyRow(workout) {
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(workout.completedAt));
  return `<article class="history-row"><span class="history-check">${icon("check")}</span><div><strong>${escapeHtml(workout.name)}</strong><small>${date} • ${Math.max(1,Math.round((workout.durationSeconds||0)/60))} min</small></div><span>${formatNumber(workout.totalVolume)} kg</span></article>`;
}

function progressExerciseNames() {
  const names = new Set();
  allTemplates().forEach((template) => template.exercises.forEach((exercise) => names.add(exercise[0])));
  state.history.forEach((workout) => workout.exercises?.forEach((exercise) => names.add(exercise.name)));
  return [...names];
}

function getProgressSeries() {
  const name = state.progressExercise;
  return [...state.history].reverse().flatMap((workout) => {
    const exercise = workout.exercises?.find((item) => item.name === name);
    if (!exercise) return [];
    let value;
    if (state.metric === "reps") value = Math.max(...exercise.sets.map((set) => Number(set.reps)||0));
    else if (state.metric === "volume") value = Math.round(exercise.sets.reduce((sum,set)=>sum+(Number(set.weight)||0)*(Number(set.reps)||0),0)/100)/10;
    else value = Math.max(...exercise.sets.map((set)=>Number(set.weight)||0));
    return [{ value, date: workout.completedAt }];
  }).slice(-7);
}

function renderProgress() {
  const exerciseNames = progressExerciseNames();
  if (!exerciseNames.includes(state.progressExercise)) state.progressExercise = exerciseNames[0] || "";
  const series = getProgressSeries();
  const hasData = series.length > 0;
  const values = series.map((item) => item.value);
  const minValue = hasData ? Math.min(...values) : 0;
  const maxValue = hasData ? Math.max(...values) : 0;
  const floor = hasData ? minValue * .88 : 0;
  const ceiling = hasData ? maxValue * 1.09 || 1 : 1;
  const range = Math.max(.001, ceiling - floor);
  const points = series.map((item,index)=>({ x:series.length === 1 ? 160 : 18 + index * (276 / (series.length - 1)), y:150-((item.value-floor)/range)*105, value:item.value, date:item.date }));
  const pointString = points.map((point)=>`${point.x},${point.y}`).join(" ");
  const record = hasData ? Math.max(...values) : 0;
  const gain = hasData ? record - values[0] : 0;
  const growth = hasData && values[0] ? (gain/values[0])*100 : 0;
  const suffix = state.metric === "carga" ? " kg" : state.metric === "volume" ? "k" : "";
  const display = (value) => state.metric === "volume" ? Number(value).toFixed(1).replace(".",",") : formatNumber(value);
  const exerciseHistory = exerciseHistoryFor(state.progressExercise).slice(0, 4);
  const records = personalRecords().slice(0, 2);
  const monthCount = currentMonthWorkouts().length;
  const monthGoal = Math.max(4, Number(state.profile.frequency || 5) * 4);
  const monthProgress = Math.min(100, Math.round((monthCount / monthGoal) * 100));
  const trainedDays = new Set(state.history.map((workout) => dateKey(new Date(workout.completedAt))));
  const heatDays = Array.from({ length: 28 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (27 - index));
    return trainedDays.has(dateKey(day));
  });
  const progressBadge = series.length > 1 ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1).replace(".",",")}%` : "NOVO";

  viewRoot.innerHTML = `<div class="screen-page progress-page">
    <header class="page-header compact"><div><p class="eyebrow">EVOLUÇÃO</p><h1>Seu progresso</h1><p>Cada treino deixa uma marca.</p></div><span class="progress-badge">${icon(hasData ? "trending" : "activity")} ${progressBadge}</span></header>
    <div class="segmented-control" role="tablist">
      <button class="${state.metric === "carga" ? "active" : ""}" data-action="metric" data-metric="carga">${icon("trending")} Carga máxima</button>
      <button class="${state.metric === "volume" ? "active" : ""}" data-action="metric" data-metric="volume">${icon("target")} Volume</button>
      <button class="${state.metric === "reps" ? "active" : ""}" data-action="metric" data-metric="reps">${icon("activity")} Repetições</button>
    </div>
    <div class="exercise-select-wrap"><label for="progress-exercise">Exercício</label><select id="progress-exercise" class="exercise-select" ${exerciseNames.length ? "" : "disabled"}>${exerciseNames.length ? exerciseNames.map((name)=>`<option ${name===state.progressExercise?"selected":""}>${escapeHtml(name)}</option>`).join("") : '<option>Nenhum exercício registrado</option>'}</select></div>
    <section class="progress-chart-card">
      <div class="chart-head"><div><span>EXERCÍCIO</span><h2>${escapeHtml(state.progressExercise || "Sem registros")}</h2></div><div><strong>${hasData ? `${display(record)}${suffix}` : "—"}</strong><small>${hasData ? "Máxima atual" : "Sem registros"}</small></div></div>
      <div class="chart-wrap">${hasData ? `<svg viewBox="0 0 320 175" role="img" aria-label="Gráfico de evolução de ${escapeHtml(state.progressExercise)}"><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#a7f432" stop-opacity=".24"/><stop offset="100%" stop-color="#a7f432" stop-opacity="0"/></linearGradient></defs>${[46,81,116,151].map((y)=>`<line x1="12" x2="308" y1="${y}" y2="${y}" class="chart-grid-line"/>`).join("")}${points.length > 1 ? `<polygon points="18,158 ${pointString} 294,158" fill="url(#areaFill)"/><polyline points="${pointString}" class="chart-line"/>` : ""}${points.map((point)=>`<circle cx="${point.x}" cy="${point.y}" r="4.6" class="chart-dot"/><text x="${point.x}" y="172" text-anchor="middle" class="chart-label">${new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit"}).format(new Date(point.date))}</text>`).join("")}</svg>` : `<div class="chart-empty">${icon("chart")}<strong>Seu gráfico começa no primeiro treino</strong><small>Crie um treino e registre suas séries para acompanhar a evolução real.</small></div>`}</div>
    </section>
    <section class="progress-stats">
      <article>${icon("trophy","yellow")}<span>Recorde</span><strong>${hasData ? `${display(record)}${suffix}` : "—"}</strong><small>Melhor marca</small></article>
      <article>${icon("trending","lime")}<span>Evolução</span><strong>${hasData ? `${gain >= 0 ? "+" : ""}${display(gain)}${suffix}` : "—"}</strong><small>Desde o início</small></article>
      <article>${icon("chart","blue")}<span>Crescimento</span><strong>${hasData ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1).replace(".",",")}%` : "—"}</strong><small>Desde o início</small></article>
    </section>
    <section class="progress-bottom-grid">
      <article class="records-card"><div class="mini-card-title"><span>Recordes recentes</span>${icon("award")}</div>${records.length ? records.map((item,index)=>`<div class="record-row"><span class="record-icon ${index ? "cyan" : ""}">${icon("dumbbell")}</span><div><small>${escapeHtml(item.name)}</small><strong>${formatWeight(item.weight)} kg${item.reps ? ` × ${item.reps}` : ""}</strong></div><em>Melhor marca</em></div>`).join("") : `<div class="mini-empty">Registre séries para criar seus recordes.</div>`}</article>
      <article class="consistency-card"><div class="mini-card-title"><span>Consistência</span>${icon("fire")}</div><div class="consistency-days">últimos 28 dias</div><div class="heatmap">${heatDays.map((trained)=>`<span class="${trained ? "" : "off"}"></span>`).join("")}</div><strong>${monthCount} ${monthCount === 1 ? "treino" : "treinos"} este mês</strong><small>Meta: ${monthGoal} treinos</small><div class="mini-progress"><i style="width:${monthProgress}%"></i></div></article>
    </section>
    <section class="exercise-history-card"><div class="mini-card-title"><span>Histórico do exercício</span>${icon("history")}</div>${exerciseHistory.length ? exerciseHistory.map((item,index)=>`<div class="exercise-history-row"><span>${new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short"}).format(new Date(item.date))}</span><strong>${formatWeight(item.max)} kg × ${item.reps}</strong><em>${formatNumber(item.volume)} kg volume</em>${index===0?'<b>ÚLTIMO</b>':''}</div>`).join("") : `<div class="empty-history">${icon("dumbbell")}<span><strong>Ainda sem registros reais</strong><small>Conclua este exercício em um treino e o histórico aparecerá aqui automaticamente.</small></span></div>`}</section>
  </div>`;
}

function renderProfile() {
  const profile = state.profile;
  const records = personalRecords().length;
  const streak = workoutStreak();
  const settings = profile.settings || {};
  const accountLabel = state.cloud.user?.email || state.cloud.user?.displayName || "Conta Google conectada";
  const canOfferInstall = isMobileInstallTarget() && !isStandaloneApp();
  const trainingDaysLabel = profile.trainingDays?.length ? profile.trainingDays.join(" • ") : "Nenhum dia definido";
  const settingsLabel = `${Number(settings.defaultRest) || 90}s padrão • ${settings.autoRest === false ? "descanso manual" : "descanso automático"}`;
  const goalLabel = profile.goal || "Objetivo não definido";
  const frequencyLabel = profile.frequency ? `${profile.frequency}x por semana` : "Defina seus dias";
  const physicalLabel = profile.weight || profile.height
    ? `${profile.weight ? `${formatWeight(profile.weight)} kg` : "Peso não informado"} • ${profile.height ? `${formatNumber(profile.height)} cm` : "Altura não informada"}`
    : "Dados ainda não informados";
  const workoutsPerLevel = 5;
  const level = Math.floor(state.history.length / workoutsPerLevel) + 1;
  const levelProgress = Math.round(((state.history.length % workoutsPerLevel) / workoutsPerLevel) * 100);
  const remaining = workoutsPerLevel - (state.history.length % workoutsPerLevel);
  const levelTitle = state.history.length === 0 ? "Começando agora" : state.history.length < 5 ? "Construindo constância" : state.history.length < 20 ? "Atleta consistente" : "Ritmo avançado";
  viewRoot.innerHTML = `<div class="screen-page profile-page">
    <header class="profile-hero"><input class="profile-photo-input" id="profile-photo-input" type="file" accept="image/*" aria-label="Escolher foto de perfil"><button class="profile-avatar" data-action="change-avatar" aria-label="Alterar foto de perfil">${profileAvatarContent()}<span class="profile-avatar-edit">${icon("camera")}</span></button><p class="eyebrow">SEU PERFIL</p><h1>${escapeHtml(profileDisplayName())}</h1><p>Constância vence motivação.</p></header>
    <section class="profile-stats"><article><strong>${state.history.length}</strong><span>Treinos</span></article><article><strong>${streak}</strong><span>Sequência</span></article><article><strong>${records}</strong><span>Recordes</span></article></section>
    <section class="profile-card">
      <button data-action="edit-profile">${`<span class="profile-option-icon">${icon("target")}</span>`}<span><strong>Minha meta</strong><small>${escapeHtml(goalLabel)} • ${escapeHtml(frequencyLabel)}</small></span>${icon("chevron")}</button>
      <button data-action="edit-profile">${`<span class="profile-option-icon">${icon("activity")}</span>`}<span><strong>Dados físicos</strong><small>${escapeHtml(physicalLabel)}</small></span>${icon("chevron")}</button>
      <button data-action="edit-training-days">${`<span class="profile-option-icon">${icon("calendar")}</span>`}<span><strong>Dias de treino</strong><small>${escapeHtml(trainingDaysLabel)}</small></span>${icon("chevron")}</button>
      <button data-action="edit-settings">${`<span class="profile-option-icon">${icon("settings")}</span>`}<span><strong>Configurações</strong><small>${escapeHtml(settingsLabel)}</small></span>${icon("chevron")}</button>
      ${canOfferInstall ? `<button data-action="install-app"><span class="profile-option-icon">${icon("download")}</span><span><strong>Instalar aplicativo</strong><small>Adicionar à tela inicial</small></span>${icon("chevron")}</button>` : ""}
      <button data-action="cloud-logout">${`<span class="profile-option-icon">${icon("user")}</span>`}<span><strong>Conta Google</strong><small>${escapeHtml(accountLabel)}</small></span>${icon("log-out")}</button>
    </section>
    <section class="level-card"><div><span>NÍVEL ${level}</span><h2>${escapeHtml(levelTitle)}</h2><p>${state.history.length ? `Mais ${remaining} ${remaining === 1 ? "treino" : "treinos"} para o próximo nível.` : "Conclua seu primeiro treino para evoluir."}</p></div><div class="level-ring">${levelProgress}%</div></section>
  </div>`;
}

function renderActiveWorkout() {
  const active = state.active;
  const completedSets = active.exercises.reduce((sum,exercise)=>sum+exercise.sets.filter((set)=>set.done).length,0);
  const totalSets = active.exercises.reduce((sum,exercise)=>sum+exercise.sets.length,0);
  const progress = Math.max(4, (completedSets/totalSets)*100);
  viewRoot.innerHTML = `<div class="active-workout-screen">
    <header class="workout-header"><button class="round-button" data-action="back-workout" aria-label="Voltar">${icon("arrow-left")}</button><div><h1>${escapeHtml(active.template.name)}</h1><span>${completedSets} de ${totalSets} séries concluídas</span></div><button class="round-button" aria-label="Mais opções">${icon("more")}</button></header>
    <section class="timer-block"><span class="timer-icon">${icon("clock")}</span><strong id="workout-elapsed">${formatDuration(active.elapsed)}</strong><small>TEMPO DE TREINO</small></section>
    <div class="workout-progress"><i style="width:${progress}%"></i></div>
    <div class="exercise-list">${active.exercises.map((exercise,exerciseIndex)=>exerciseCard(exercise,exerciseIndex)).join("")}</div>
    ${state.restSeconds>0?`<div class="rest-timer"><span>${icon("clock")} Descanso <strong id="rest-value">${formatDuration(state.restSeconds)}</strong></span><div><button data-action="rest-plus">+30s</button><button data-action="skip-rest">Pular</button></div></div>`:""}
    <div class="finish-bar"><button class="finish-button" data-action="finish-workout">Finalizar treino <span>${icon("check")}</span></button></div>
  </div>`;
}

function exerciseCard(exercise, exerciseIndex) {
  const done = exercise.sets.every((set)=>set.done);
  return `<section class="exercise-card">
    <div class="exercise-head"><div class="exercise-visual">${exercise.image?`<img src="${exercise.image}" alt="${escapeHtml(exercise.name)}"/>`:icon("dumbbell")}</div><div><h2>${escapeHtml(exercise.name)}</h2><p>${escapeHtml(exercise.note)}</p></div><span class="exercise-complete ${done?"done":""}">${icon("check")}</span></div>
    <div class="set-table-head"><span>SÉRIE</span><span>CARGA</span><span>REPS</span><span>OK</span></div>
    <div class="set-list">${exercise.sets.map((set,setIndex)=>`<div class="set-row ${set.done?"done":""}"><span class="set-number">${setIndex+1}</span><div class="weight-control"><button data-action="weight-step" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-delta="-2.5" aria-label="Diminuir 2,5 kg">−</button><label><input type="number" inputmode="decimal" min="0" step="0.5" value="${set.weight}" data-action="set-input" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-field="weight" aria-label="Carga da série ${setIndex+1} de ${escapeHtml(exercise.name)}"><em>kg</em></label><button data-action="weight-step" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-delta="2.5" aria-label="Aumentar 2,5 kg">+</button></div><label><input type="number" inputmode="numeric" min="1" step="1" value="${set.reps}" data-action="set-input" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-field="reps" aria-label="Repetições da série ${setIndex+1} de ${escapeHtml(exercise.name)}"><em>reps</em></label><button data-action="toggle-set" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="${set.done?"Desmarcar":"Concluir"} série">${icon("check")}</button></div>`).join("")}</div>
    <button class="add-set-button" data-action="add-set" data-exercise="${exerciseIndex}">${icon("plus")} Adicionar série</button>
    <div class="exercise-footer"><span>${escapeHtml(exercise.last)}</span><strong>${icon("history")} ${exercise.last === "Sem registro anterior" ? "Preencha sua carga" : "Seu último registro"}</strong></div>
    <textarea class="exercise-note-input" rows="1" data-action="exercise-note" data-exercise="${exerciseIndex}" placeholder="Adicionar anotação sobre execução, dor, ajuste...">${escapeHtml(exercise.noteText || "")}</textarea>
  </section>`;
}

function startWorkout(template) {
  stopTimers();
  state.active = { template, exercises: createExercises(template), elapsed: 0, startedAt: Date.now() };
  state.restSeconds = 0;
  state.timerId = setInterval(() => {
    if (!state.active) return;
    state.active.elapsed += 1;
    const node = document.getElementById("workout-elapsed");
    if (node) node.textContent = formatDuration(state.active.elapsed);
  },1000);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopTimers() {
  if (state.timerId) clearInterval(state.timerId);
  if (state.restId) clearInterval(state.restId);
  state.timerId = null;
  state.restId = null;
}

function startRest(seconds = 90) {
  if (state.restId) clearInterval(state.restId);
  state.restSeconds = seconds;
  state.restId = setInterval(() => {
    state.restSeconds = Math.max(0,state.restSeconds-1);
    const node = document.getElementById("rest-value");
    if (node) node.textContent = formatDuration(state.restSeconds);
    if (state.restSeconds <= 0) {
      clearInterval(state.restId);
      state.restId = null;
      renderActiveWorkout();
      if (state.profile.settings?.vibration !== false && navigator.vibrate) navigator.vibrate([160, 80, 160]);
      showToast("Descanso concluído. Próxima série!");
    }
  },1000);
}

function liveVolume() {
  return state.active.exercises.reduce((total,exercise)=>total+exercise.sets.filter((set)=>set.done).reduce((sum,set)=>sum+(Number(set.weight)||0)*(Number(set.reps)||0),0),0);
}

function finishWorkout() {
  const active = state.active;
  const completed = active.exercises.flatMap((exercise)=>exercise.sets.filter((set)=>set.done));
  if (!completed.length) {
    showToast("Conclua pelo menos uma série antes de finalizar.");
    return;
  }
  const volume = liveVolume();
  const record = {
    id: Date.now(), name: active.template.name, group: active.template.group,
    completedAt: new Date().toISOString(), durationSeconds: active.elapsed, totalVolume: volume,
    exercises: active.exercises.map((exercise)=>({ name: exercise.name, note: exercise.noteText || "", sets: exercise.sets.filter((set)=>set.done).map((set)=>({ weight:Number(set.weight)||0, reps:Number(set.reps)||0 })) })).filter((exercise)=>exercise.sets.length),
  };
  state.history.unshift(record);
  persistHistory();
  stopTimers();
  const summary = { duration: active.elapsed, volume, sets: completed.length };
  state.active = null;
  state.restSeconds = 0;
  state.view = "home";
  render();
  showSummary(summary);
}

function showSummary(summary) {
  overlayRoot.innerHTML = `<div class="modal-backdrop"><div class="summary-modal" role="dialog" aria-modal="true" aria-label="Resumo do treino"><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button><span class="summary-trophy">${icon("trophy")}</span><p class="eyebrow">TREINO CONCLUÍDO</p><h2>Mandou bem, ${escapeHtml(profileFirstName())}!</h2><p>Mais um treino registrado e mais um passo na sua evolução.</p><div class="summary-grid"><div>${icon("clock")}<strong>${Math.max(1,Math.round(summary.duration/60))} min</strong><span>Duração</span></div><div>${icon("dumbbell")}<strong>${formatNumber(summary.volume)} kg</strong><span>Volume</span></div><div>${icon("check")}<strong>${summary.sets}</strong><span>Séries</span></div></div><button class="primary-button modal-button" data-action="summary-progress"><span class="button-label">Ver meu progresso</span><span class="button-icon">${icon("chevron")}</span></button></div></div>`;
}

function showToast(message) {
  toastRoot.innerHTML = `<div class="toast">${icon("activity")} ${escapeHtml(message)}</div>`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(()=>{ toastRoot.innerHTML=""; },2600);
}

function builderExerciseRow(index) {
  const defaultRest = Math.max(15, Number(state.profile.settings?.defaultRest) || 90);
  return `<div class="builder-exercise" data-builder-row><div class="builder-exercise-title"><span>Exercício ${index + 1}</span><button type="button" data-action="remove-builder-exercise" aria-label="Remover exercício">×</button></div><input class="field-wide" name="exercise_name" placeholder="Ex.: Supino reto" autocomplete="off"><div class="builder-mini-grid"><label>Séries<input name="exercise_sets" type="number" min="1" max="10" value="3"></label><label>Reps<input name="exercise_reps" type="number" min="1" max="100" value="10"></label><label>Carga kg<input name="exercise_weight" type="number" min="0" step="0.5" value="0"></label><label>Descanso<input name="exercise_rest" type="number" min="15" step="15" value="${defaultRest}"></label></div></div>`;
}

function showWorkoutBuilder() {
  overlayRoot.innerHTML = `<div class="modal-backdrop builder-backdrop"><form class="builder-modal" id="workout-builder-form"><button class="modal-close" type="button" data-action="close-modal" aria-label="Fechar">×</button><p class="eyebrow">NOVO TREINO</p><h2>Monte sua rotina</h2><p>Defina o dia, os exercícios e a base de carga. Você poderá ajustar tudo durante o treino.</p><div class="builder-form-grid"><label class="wide">Nome do treino<input name="workout_name" required maxlength="36" placeholder="Ex.: Upper A"></label><label>Dia<select name="workout_day">${WEEK_DAYS.map((day) => `<option ${day === state.selectedDay ? "selected" : ""}>${day}</option>`).join("")}</select></label><label>Duração<input name="workout_duration" type="number" min="10" max="180" value="50"></label><label class="wide">Grupo<select name="workout_group"><option>Peito e braços</option><option>Costas e braços</option><option>Inferiores</option><option>Ombros</option><option>Full body</option><option>Condicionamento</option><option>Personalizado</option></select></label></div><div class="builder-section-head"><strong>Exercícios</strong><button type="button" data-action="add-builder-exercise">${icon("plus")} Adicionar</button></div><div id="builder-exercise-list">${builderExerciseRow(0)}${builderExerciseRow(1)}${builderExerciseRow(2)}</div><button class="primary-button builder-save" type="submit"><span class="button-label">Salvar treino</span><span class="button-icon">${icon("check")}</span></button></form></div>`;
}

function showDeleteTemplateConfirmation(index) {
  const template = allTemplates()[index];
  if (!template?.custom) return;
  overlayRoot.innerHTML = `<div class="modal-backdrop"><div class="confirm-modal" role="dialog" aria-modal="true"><h2>Excluir “${escapeHtml(template.name)}”?</h2><p>O histórico dos treinos concluídos continua salvo; apenas esta rotina personalizada será removida.</p><div class="confirm-actions"><button data-action="close-modal">Cancelar</button><button class="danger" data-action="delete-template" data-id="${escapeHtml(template.id)}">Excluir</button></div></div></div>`;
}

function showProfileEditor() {
  const profile = state.profile;
  overlayRoot.innerHTML = `<div class="modal-backdrop"><form class="builder-modal profile-editor" id="profile-form"><button class="modal-close" type="button" data-action="close-modal" aria-label="Fechar">×</button><p class="eyebrow">PERFIL FÍSICO</p><h2>Seus dados</h2><p>Peso, altura e objetivo ficam salvos automaticamente na sua conta. A frequência é definida em Dias de treino.</p><div class="builder-form-grid"><label>Peso (kg)<input name="weight" type="number" min="30" max="300" step="0.1" value="${profile.weight || ""}" placeholder="Ex.: 82"></label><label>Altura (cm)<input name="height" type="number" min="120" max="230" value="${profile.height || ""}" placeholder="Ex.: 178"></label><label class="wide">Objetivo<select name="goal"><option value="" ${profile.goal ? "" : "selected"} disabled>Selecione seu objetivo</option><option ${profile.goal === "Hipertrofia" ? "selected" : ""}>Hipertrofia</option><option ${profile.goal === "Força" ? "selected" : ""}>Força</option><option ${profile.goal === "Emagrecimento" ? "selected" : ""}>Emagrecimento</option><option ${profile.goal === "Condicionamento" ? "selected" : ""}>Condicionamento</option></select></label></div><button class="primary-button builder-save" type="submit"><span class="button-label">Salvar perfil</span><span class="button-icon">${icon("check")}</span></button></form></div>`;
}

function showTrainingDaysEditor() {
  const selected = new Set(state.profile.trainingDays || DEFAULT_TRAINING_DAYS);
  const labels = { SEG: "Seg", TER: "Ter", QUA: "Qua", QUI: "Qui", SEX: "Sex", "SÁB": "Sáb", DOM: "Dom" };
  overlayRoot.innerHTML = `<div class="modal-backdrop"><form class="builder-modal profile-editor" id="training-days-form"><button class="modal-close" type="button" data-action="close-modal" aria-label="Fechar">×</button><p class="eyebrow">ROTINA SEMANAL</p><h2>Dias de treino</h2><p>Marque os dias em que você normalmente treina. Os demais aparecem como recuperação na semana.</p><fieldset class="training-days-fieldset"><legend>Selecione pelo menos um dia</legend><div class="training-days-grid">${WEEK_DAYS.map((day) => `<label class="training-day-toggle"><input type="checkbox" name="training_days" value="${day}" ${selected.has(day) ? "checked" : ""}><span>${labels[day]}</span></label>`).join("")}</div></fieldset><div class="settings-note">${icon("check")} Essa preferência é salva automaticamente.</div><button class="primary-button builder-save" type="submit"><span class="button-label">Salvar dias</span><span class="button-icon">${icon("check")}</span></button></form></div>`;
}

function showSettingsEditor() {
  const settings = state.profile.settings || {};
  const defaultRest = Number(settings.defaultRest) || 90;
  const restOptions = [45, 60, 75, 90, 120, 150];
  overlayRoot.innerHTML = `<div class="modal-backdrop"><form class="builder-modal profile-editor settings-editor" id="settings-form"><button class="modal-close" type="button" data-action="close-modal" aria-label="Fechar">×</button><p class="eyebrow">PREFERÊNCIAS</p><h2>Configurações</h2><p>Ajuste como o app se comporta durante o treino.</p><div class="settings-stack"><label class="settings-select-row"><span><strong>Descanso padrão</strong><small>Usado ao criar novos exercícios</small></span><select name="default_rest" aria-label="Descanso padrão">${restOptions.map((seconds) => `<option value="${seconds}" ${seconds === defaultRest ? "selected" : ""}>${seconds}s</option>`).join("")}</select></label><label class="settings-toggle-row"><span><strong>Descanso automático</strong><small>Inicia o contador ao concluir uma série</small></span><input type="checkbox" name="auto_rest" ${settings.autoRest === false ? "" : "checked"} aria-label="Descanso automático"><i aria-hidden="true"></i></label><label class="settings-toggle-row"><span><strong>Vibração</strong><small>Avisa quando o descanso terminar</small></span><input type="checkbox" name="vibration" ${settings.vibration === false ? "" : "checked"} aria-label="Vibração ao terminar descanso"><i aria-hidden="true"></i></label></div><div class="settings-note">${icon("check")} Preferências salvas automaticamente.</div><button class="primary-button builder-save" type="submit"><span class="button-label">Salvar configurações</span><span class="button-icon">${icon("check")}</span></button></form></div>`;
}

function renderProfilePhoto(image, size = 240, quality = 0.82) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  context.fillStyle = "#111416";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}

async function updateProfilePhoto(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    showToast("Escolha uma imagem válida.");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast("Escolha uma foto de até 12 MB.");
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const preview = new Image();
      preview.onload = () => resolve(preview);
      preview.onerror = () => reject(new Error("Imagem inválida"));
      preview.src = objectUrl;
    });
    let photoDataUrl = renderProfilePhoto(image);
    if (photoDataUrl.length > 240000) photoDataUrl = renderProfilePhoto(image, 180, 0.72);
    state.profile = normalizeProfile({ ...state.profile, photoDataUrl });
    persistProfile();
    renderProfile();
    showToast("Foto de perfil atualizada.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "install-app") { await requestAppInstall(); return; }
  if (action === "continue-browser") { rememberInstallOnboarding(); overlayRoot.innerHTML = ""; render(); return; }
  if (action === "nav") { state.view = button.dataset.view; render(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "select-day") { state.selectedDay = button.dataset.day; renderHome(); }
  if (action === "start-day") startWorkout(currentWeekTemplate());
  if (action === "quick-start") {
    const template = currentWeekTemplate();
    if (template.needsSetup) showWorkoutBuilder();
    else if (template.exercises.length) startWorkout(template);
    else showToast("Hoje está marcado como descanso.");
  }
  if (action === "start-template") startWorkout(allTemplates()[Number(button.dataset.index)]);
  if (action === "open-builder") showWorkoutBuilder();
  if (action === "add-builder-exercise") {
    const list = document.getElementById("builder-exercise-list");
    if (list) list.insertAdjacentHTML("beforeend", builderExerciseRow(list.querySelectorAll("[data-builder-row]").length));
  }
  if (action === "remove-builder-exercise") {
    const rows = document.querySelectorAll("[data-builder-row]");
    if (rows.length <= 1) showToast("O treino precisa ter pelo menos um exercício.");
    else button.closest("[data-builder-row]")?.remove();
  }
  if (action === "ask-delete-template") showDeleteTemplateConfirmation(Number(button.dataset.index));
  if (action === "delete-template") {
    state.customTemplates = state.customTemplates.filter((template) => template.id !== button.dataset.id);
    persistCustomTemplates(); overlayRoot.innerHTML = ""; renderWorkouts(); showToast("Treino personalizado removido.");
  }
  if (action === "change-avatar") document.getElementById("profile-photo-input")?.click();
  if (action === "edit-profile") showProfileEditor();
  if (action === "edit-training-days") showTrainingDaysEditor();
  if (action === "edit-settings") showSettingsEditor();
  if (action === "back-workout") { stopTimers(); state.active = null; state.restSeconds = 0; render(); window.scrollTo({top:0}); }
  if (action === "toggle-set") {
    const ex = Number(button.dataset.exercise), setIndex = Number(button.dataset.set);
    const set = state.active.exercises[ex].sets[setIndex];
    set.done = !set.done;
    if (set.done && state.profile.settings?.autoRest !== false) startRest(state.active.exercises[ex].restSeconds || 90); else if (!set.done && state.restSeconds) { state.restSeconds = 0; if(state.restId)clearInterval(state.restId); state.restId=null; }
    renderActiveWorkout();
  }
  if (action === "add-set") {
    const ex = Number(button.dataset.exercise), exercise = state.active.exercises[ex], last = exercise.sets[exercise.sets.length-1] || {weight:0,reps:10};
    exercise.sets.push({weight:last.weight,reps:last.reps,done:false}); renderActiveWorkout();
  }
  if (action === "weight-step") {
    const ex = Number(button.dataset.exercise), setIndex = Number(button.dataset.set), delta = Number(button.dataset.delta);
    const set = state.active.exercises[ex].sets[setIndex];
    set.weight = Math.max(0, Math.round((Number(set.weight) + delta) * 2) / 2); renderActiveWorkout();
  }
  if (action === "skip-rest") { state.restSeconds=0; if(state.restId)clearInterval(state.restId); state.restId=null; renderActiveWorkout(); }
  if (action === "rest-plus") { state.restSeconds += 30; const node=document.getElementById("rest-value"); if(node)node.textContent=formatDuration(state.restSeconds); }
  if (action === "finish-workout") finishWorkout();
  if (action === "metric") { state.metric = button.dataset.metric; renderProgress(); }
  if (action === "close-modal") overlayRoot.innerHTML = "";
  if (action === "summary-progress") { overlayRoot.innerHTML=""; state.view="progresso"; render(); window.scrollTo({top:0,behavior:"smooth"}); }
  if (action === "cloud-login") {
    if (window.GymCloud?.signIn) window.GymCloud.signIn();
    else showToast("Firebase ainda não foi configurado neste projeto.");
  }
  if (action === "cloud-logout") {
    if (window.GymCloud?.signOut) window.GymCloud.signOut();
  }
});

document.addEventListener("input", (event) => {
  const input = event.target.closest('input[data-action="set-input"]');
  if (input && state.active) {
    const ex = Number(input.dataset.exercise), setIndex = Number(input.dataset.set), field = input.dataset.field;
    const value = Math.max(0,Number(input.value)||0);
    state.active.exercises[ex].sets[setIndex][field] = value;
  }
  const note = event.target.closest('textarea[data-action="exercise-note"]');
  if (note && state.active) state.active.exercises[Number(note.dataset.exercise)].noteText = note.value.slice(0, 240);
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "workout-builder-form") {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const rows = [...form.querySelectorAll("[data-builder-row]")];
    const exercises = rows.flatMap((row) => {
      const name = row.querySelector('[name="exercise_name"]').value.trim();
      if (!name) return [];
      const sets = Math.max(1, Number(row.querySelector('[name="exercise_sets"]').value) || 3);
      const reps = Math.max(1, Number(row.querySelector('[name="exercise_reps"]').value) || 10);
      const weight = Math.max(0, Number(row.querySelector('[name="exercise_weight"]').value) || 0);
      const rest = Math.max(15, Number(row.querySelector('[name="exercise_rest"]').value) || 90);
      return [[name, `${sets} séries alvo • Descanso ${rest}s`, weight, reps, "Primeiro treino", "Base inicial", null, sets]];
    });
    if (!exercises.length) { showToast("Adicione pelo menos um exercício."); return; }
    const group = String(data.get("workout_group") || "Personalizado");
    const colors = { "Peito e braços":"#ff8a3d", "Costas e braços":"#a7f432", "Inferiores":"#65d9ff", "Ombros":"#ad92ff", "Full body":"#ffda5c", "Condicionamento":"#70e3c3", "Personalizado":"#a7f432" };
    const template = { id:`custom-${Date.now()}`, custom:true, name:String(data.get("workout_name")||"Meu treino").trim().slice(0,36), group, day:String(data.get("workout_day")||"SEG"), color:colors[group]||"#a7f432", duration:Math.max(10,Number(data.get("workout_duration"))||50), exercises };
    state.customTemplates.unshift(template);
    if (!state.profile.trainingDays.includes(template.day)) {
      const trainingDays = WEEK_DAYS.filter((day) => [...state.profile.trainingDays, template.day].includes(day));
      state.profile = normalizeProfile({ ...state.profile, trainingDays });
      persistProfile();
    }
    persistCustomTemplates(); overlayRoot.innerHTML=""; state.view="treinos"; render(); showToast("Treino personalizado criado.");
  }
  if (event.target.id === "profile-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    const weight = Number(data.get("weight")) || 0;
    const height = Number(data.get("height")) || 0;
    state.profile = normalizeProfile({ ...state.profile, weight:weight ? Math.max(30,weight) : 0, height:height ? Math.max(120,height) : 0, goal:String(data.get("goal")||"") });
    persistProfile(); overlayRoot.innerHTML=""; renderProfile(); showToast("Perfil atualizado.");
  }
  if (event.target.id === "training-days-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    const selectedDays = WEEK_DAYS.filter((day) => data.getAll("training_days").includes(day));
    if (!selectedDays.length) { showToast("Selecione pelo menos um dia de treino."); return; }
    state.profile = normalizeProfile({ ...state.profile, trainingDays:selectedDays, frequency:selectedDays.length });
    persistProfile(); overlayRoot.innerHTML=""; renderProfile(); showToast("Dias de treino atualizados.");
  }
  if (event.target.id === "settings-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    state.profile = normalizeProfile({ ...state.profile, settings:{ ...state.profile.settings, defaultRest:Math.max(15,Number(data.get("default_rest"))||90), autoRest:data.has("auto_rest"), vibration:data.has("vibration") } });
    persistProfile(); overlayRoot.innerHTML=""; renderProfile(); showToast("Configurações atualizadas.");
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "progress-exercise") { state.progressExercise = event.target.value; renderProgress(); }
  if (event.target.id === "profile-photo-input") {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    updateProfilePhoto(file).catch((error) => {
      console.error("Profile photo:", error);
      showToast("Não consegui ler essa foto. Tente JPG, PNG ou WebP.");
    }).finally(() => { input.value = ""; });
  }
});

window.addEventListener("beforeunload", stopTimers);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPromptEvent = event;
  installPromptWaitExpired = true;
  if (installOnboardingActive()) renderInstallScreen();
});
window.addEventListener("appinstalled", () => {
  installPromptEvent = null;
  completeAppInstall();
});

window.GymApp = Object.freeze({
  getSnapshot: getCloudSnapshot,
  applySnapshot: applyCloudSnapshot,
  activateUser: activateCloudUser,
  setCloudStatus,
  toast: showToast,
});
window.dispatchEvent(new Event("gym:bridge-ready"));

const firstWeek = buildWeek();
state.selectedDay = firstWeek.find((day)=>day.today)?.key || "SEX";
render();
dismissLaunchSplash();

if (IS_ANDROID && installOnboardingActive()) {
  window.setTimeout(() => {
    installPromptWaitExpired = true;
    if (installOnboardingActive()) renderInstallScreen();
  }, 2200);
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker
    .register("service-worker.js", { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(()=>{});
}
