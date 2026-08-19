import { appCheckSiteKey, firebaseConfig, firestoreDatabaseId } from "../firebase-config.js";

const BILLING = globalThis.MeuTreinoBilling;
if (!BILLING) throw new Error("Módulo financeiro não carregado.");

const FIREBASE_VERSION = "12.17.1";
const ADMIN_CACHE_KEY = "meutreino:admin-cache:v26";
const REQUEST_TIMEOUT_MS = 20000;
const { PLAN_NAME, PLAN_INSTALLMENTS, PLAN_INSTALLMENT_CENTS, INSTALLMENT_INTERVAL_DAYS } = BILLING;
const ONLINE_WINDOW_MS = 150000;
const STATUS_LABELS = Object.freeze({
  active: "Ativo",
  pending: "Aguardando",
  paused: "Bloqueado",
  cancelled: "Cancelado",
  expired: "Vencido",
});

const root = document.querySelector("#admin-app");
const overlay = document.querySelector("#admin-overlay");
const toastRoot = document.querySelector("#admin-toast");

const state = {
  auth: null,
  user: null,
  users: [],
  filter: "all",
  query: "",
  loading: true,
  refreshing: false,
  denied: false,
  error: "",
  generatedAt: null,
  truncated: false,
  refreshTimer: null,
  firestore: null,
  adminVerified: false,
  enrichRequestId: 0,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safePhoto(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}

function icon(name) {
  const paths = {
    dumbbell: '<path d="M6 7v10M3.5 9v6M18 7v10M20.5 9v6M6 12h12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    refresh: '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9a7 7 0 0 0-12-2L4 11M5.5 15a7 7 0 0 0 12 2l2.5-4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    shield: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.dumbbell}</svg>`;
}

function googleMark() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.01v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.55c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.54l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.95 12 5.95Z"/></svg>';
}

function configIsReady(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

function initials(user) {
  const source = String(user.displayName || user.email || "U").trim();
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)[0]}` : source.slice(0, 2)).toUpperCase();
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", includeTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function timestampMillis(value) {
  return BILLING.toMillis(value);
}

function formatCurrency(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
}

function createBillingSchedule() {
  const { Timestamp } = state.firestore;
  return BILLING.serializeForFirestore(BILLING.createSchedule(), (milliseconds) => Timestamp.fromMillis(milliseconds));
}

function serializeBilling(value) {
  if (!value || !Array.isArray(value.installments)) return null;
  return BILLING.normalizeSchedule(value);
}

function formatLastSeen(user) {
  if (user.online) return "Online agora";
  if (!user.lastSeenAt) return "Nunca entrou";
  const elapsed = Math.max(0, Date.now() - Number(user.lastSeenAt));
  if (elapsed < 60000) return "Visto agora";
  if (elapsed < 3600000) return `Há ${Math.floor(elapsed / 60000)} min`;
  if (elapsed < 86400000) return `Há ${Math.floor(elapsed / 3600000)} h`;
  return formatDate(user.lastSeenAt, true);
}

function friendlyError(error) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return "O Firestore negou a operação. Publique as regras desta versão e confirme seu UID em admin/{uid} com valor=true ou admins/{uid} com enabled=true.";
  if (code.includes("not-found")) return `O Firestore não encontrou o banco configurado (${firestoreDatabaseId || "default"}). Neste projeto ele deve ser default, sem parênteses, no Firebase treino-346bb.`;
  if (code.includes("auth/unauthorized-domain")) return "Autorize este domínio em Firebase Authentication > Settings > Authorized domains.";
  if (code.includes("auth/popup-blocked")) return "Permita pop-ups para este site e tente novamente.";
  if (code.includes("unauthenticated")) return "Sua sessão expirou. Entre novamente.";
  if (code.includes("failed-precondition")) return error?.message || "Confira os dados e tente novamente.";
  if (code.includes("invalid-argument")) return error?.message || "Os dados enviados são inválidos.";
  if (code.includes("client-timeout")) return "A conexão com o Firestore não respondeu. Atualize a página e tente novamente.";
  if (code.includes("unavailable")) return "O Firebase está indisponível no momento. Tente novamente.";
  return error?.message || "Não foi possível concluir esta ação.";
}

function withTimeout(promise, timeout = REQUEST_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        const error = new Error("A conexão com o Firebase demorou mais que o esperado.");
        error.code = "firestore/client-timeout";
        reject(error);
      }, timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}

function readAdminCache(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_CACHE_KEY) || "null");
    if (!parsed || parsed.uid !== uid || !Array.isArray(parsed.users)) return null;
    if (Date.now() - Number(parsed.generatedAt || 0) > 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAdminCache() {
  if (!state.user?.uid || !state.adminVerified) return;
  try {
    localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({
      uid: state.user.uid,
      generatedAt: state.generatedAt || Date.now(),
      users: state.users,
    }));
  } catch {}
}

function buildUsers(accessSnapshot, presenceSnapshot = null, notesSnapshot = null, previousUsers = []) {
  const previousByUid = new Map(previousUsers.map((user) => [user.uid, user]));
  const presenceByUid = new Map(presenceSnapshot?.docs?.map((item) => [item.id, item.data()]) || []);
  const notesByUid = new Map(notesSnapshot?.docs?.map((item) => [item.id, item.data()]) || []);
  const now = Date.now();

  return accessSnapshot.docs.map((item) => {
    const access = item.data();
    const presence = presenceByUid.get(item.id) || {};
    const previous = previousByUid.get(item.id) || {};
    const status = ["active", "paused", "cancelled", "pending"].includes(access.status) ? access.status : "active";
    const lastSeenAt = presenceSnapshot ? timestampMillis(presence.lastSeen) : previous.lastSeenAt || null;
    const online = presenceSnapshot
      ? Boolean(presence.online && lastSeenAt && now - lastSeenAt <= ONLINE_WINDOW_MS && status === "active")
      : Boolean(previous.online && previous.lastSeenAt && now - previous.lastSeenAt <= ONLINE_WINDOW_MS && status === "active");

    return {
      uid: item.id,
      displayName: String(access.displayName || presence.displayName || previous.displayName || ""),
      email: String(access.email || presence.email || previous.email || ""),
      photoURL: String(access.photoURL || presence.photoURL || previous.photoURL || ""),
      createdAt: timestampMillis(access.createdAt) || previous.createdAt || null,
      lastSeenAt,
      online,
      status,
      plan: "pro",
      expiresAt: null,
      note: notesSnapshot ? String(notesByUid.get(item.id)?.note || "") : String(previous.note || ""),
      billing: serializeBilling(access.billing),
    };
  }).sort((a, b) => Number(b.online) - Number(a.online) || Number(b.lastSeenAt || b.createdAt || 0) - Number(a.lastSeenAt || a.createdAt || 0));
}

let toastTimer = null;
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toastRoot.innerHTML = `<div class="toast${isError ? " error" : ""}">${escapeHtml(message)}</div>`;
  toastTimer = window.setTimeout(() => { toastRoot.innerHTML = ""; }, 4200);
}

function renderLoading() {
  root.innerHTML = '<section class="loading-page"><div class="spinner" role="status" aria-label="Carregando"></div></section>';
}

function renderLogin() {
  root.innerHTML = `
    <section class="login-page">
      <div class="login-card">
        <div class="login-logo">${icon("shield")}</div>
        <p class="eyebrow">ACESSO RESTRITO</p>
        <h1>Central de<br>acessos</h1>
        <p>Gerencie os usuários do ${PLAN_NAME} com a conta administradora cadastrada no Firebase.</p>
        <button class="google-button" data-action="sign-in">${googleMark()}<span>Entrar com Google</span></button>
        <small class="login-note">Somente administradores autorizados conseguem abrir esta área.</small>
      </div>
    </section>`;
}

function renderDenied() {
  const uid = state.user?.uid || "";
  root.innerHTML = `
    <section class="login-page">
      <div class="denied-card">
        <div class="login-logo">${icon("lock")}</div>
        <p class="eyebrow">ACESSO NEGADO</p>
        <h1>Conta sem permissão</h1>
        <p>${escapeHtml(state.error || "Cadastre este UID em admin com valor=true ou em admins com enabled=true.")}</p>
        ${uid ? `<small class="login-note">UID para cadastrar: ${escapeHtml(uid)}</small>` : ""}
        <button class="ghost-button" data-action="sign-out">Entrar com outra conta</button>
      </div>
    </section>`;
}

function filteredUsers() {
  const query = state.query.trim().toLocaleLowerCase("pt-BR");
  return state.users.filter((user) => {
    const matchesStatus = state.filter === "all"
      || (state.filter === "blocked" && user.status !== "active")
      || user.status === state.filter;
    const haystack = `${user.displayName || ""} ${user.email || ""}`.toLocaleLowerCase("pt-BR");
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function userActions(user) {
  const isAdminSelf = user.uid === state.user?.uid;
  const buttons = [];
  if (user.status === "active") {
    if (!isAdminSelf) buttons.push(`<button class="action-button action-warning" data-action="status" data-status="paused" data-uid="${escapeHtml(user.uid)}">Bloquear</button>`);
  } else {
    buttons.push(`<button class="action-button action-primary" data-action="access" data-uid="${escapeHtml(user.uid)}">Liberar</button>`);
  }
  if (!isAdminSelf && user.status !== "cancelled") {
    buttons.push(`<button class="action-button action-danger" data-action="status" data-status="cancelled" data-uid="${escapeHtml(user.uid)}">Cancelar</button>`);
  }
  if (!isAdminSelf && user.status === "cancelled") {
    buttons.push(`<button class="action-button action-danger" data-action="delete" data-uid="${escapeHtml(user.uid)}">Excluir</button>`);
  }
  buttons.push(`<button class="action-button" data-action="billing" data-uid="${escapeHtml(user.uid)}">Financeiro</button>`);
  return buttons.join("");
}

function userRow(user) {
  const photo = safePhoto(user.photoURL);
  const avatar = photo ? `<img src="${photo}" alt="" referrerpolicy="no-referrer">` : escapeHtml(initials(user));
  const status = STATUS_LABELS[user.status] || "Aguardando";
  const installments = Array.isArray(user.billing?.installments) ? user.billing.installments : [];
  const paid = installments.filter((installment) => installment.status === "paid").length;
  return `
    <article class="user-row">
      <div class="user-identity">
        <div class="user-avatar">${avatar}</div>
        <div class="user-copy">
          <strong>${escapeHtml(user.displayName || "Usuário sem nome")}${user.uid === state.user?.uid ? " · Você" : ""}</strong>
          <span>${escapeHtml(user.email || "E-mail não informado")}</span>
          <small>Cadastro: ${escapeHtml(formatDate(user.createdAt))}</small>
        </div>
      </div>
      <div class="presence ${user.online ? "online" : "offline"}"><i></i><span>${escapeHtml(formatLastSeen(user))}</span></div>
      <span class="status-badge status-${escapeHtml(user.status)}">${escapeHtml(status)}</span>
      <div class="plan-cell"><strong>${PLAN_NAME}</strong><span>Acesso manual • ${paid}/12 pagas</span></div>
      <div class="user-actions">${userActions(user)}</div>
    </article>`;
}

function renderDashboard() {
  const visibleUsers = filteredUsers();
  const online = state.users.filter((user) => user.online).length;
  const active = state.users.filter((user) => user.status === "active").length;
  const blocked = state.users.length - active;
  const adminPhoto = safePhoto(state.user?.photoURL);
  const filters = [
    ["all", "Todos"], ["active", "Ativos"], ["pending", "Aguardando"],
    ["paused", "Bloqueados"], ["cancelled", "Cancelados"],
  ];

  root.innerHTML = `
    <div class="admin-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">${icon("dumbbell")}</span>
          <span><strong>MEU TREINO PRO</strong><small>CENTRAL ADMINISTRATIVA</small></span>
        </div>
        <div class="admin-account">
          <span><strong>${escapeHtml(state.user?.displayName || "Administrador")}</strong><small>${escapeHtml(state.user?.email || "")}</small></span>
          <div class="user-avatar">${adminPhoto ? `<img src="${adminPhoto}" alt="" referrerpolicy="no-referrer">` : escapeHtml(initials(state.user || {}))}</div>
          <button class="ghost-button" data-action="sign-out">Sair</button>
        </div>
      </header>

      <section class="dashboard-head">
        <div>
          <p class="eyebrow">GESTÃO DE ASSINANTES</p>
          <h1>Central de acessos</h1>
          <p>Controle manual do plano único ${PLAN_NAME}.</p>
        </div>
        <div class="sync-state"><i></i><span>${state.refreshing ? "Atualizando…" : `Atualizado ${formatDate(state.generatedAt, true)}`}</span></div>
      </section>

      <section class="metrics" aria-label="Resumo">
        <div class="metric"><span>Usuários</span><strong>${state.users.length}</strong><small>Total cadastrado</small></div>
        <div class="metric online"><span>Online</span><strong>${online}</strong><small>Atividade recente no app</small></div>
        <div class="metric"><span>Acessos ativos</span><strong>${active}</strong><small>${PLAN_NAME}</small></div>
        <div class="metric"><span>Bloqueados</span><strong>${blocked}</strong><small>Aguardando, bloqueados ou cancelados</small></div>
      </section>

      <section class="toolbar">
        <label class="search-box">${icon("search")}<input type="search" value="${escapeHtml(state.query)}" data-search placeholder="Buscar por nome ou e-mail" autocomplete="off"></label>
        <div class="filters" aria-label="Filtrar usuários">
          ${filters.map(([value, label]) => `<button class="filter-button${state.filter === value ? " active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          <button class="filter-button" data-action="refresh">Atualizar</button>
        </div>
      </section>

      <section class="users-panel">
        <div class="users-head"><span>USUÁRIO</span><span>PRESENÇA</span><span>SITUAÇÃO</span><span>PLANO</span><span style="text-align:right">AÇÕES</span></div>
        ${visibleUsers.length ? visibleUsers.map(userRow).join("") : '<div class="empty-state"><strong>Nenhum usuário encontrado</strong><span>Novos usuários aparecem aqui automaticamente após o primeiro login com Google.</span></div>'}
      </section>
      ${state.truncated ? '<p class="login-note">A lista atingiu 1.000 contas. Paginação avançada poderá ser adicionada quando necessário.</p>' : ""}
    </div>`;
}

function render() {
  if (state.loading) return renderLoading();
  if (!state.user) return renderLogin();
  if (state.denied) return renderDenied();
  return renderDashboard();
}

function findUser(uid) {
  return state.users.find((user) => user.uid === uid) || null;
}

function closeModal() {
  overlay.innerHTML = "";
}

function modalShell(content) {
  overlay.innerHTML = `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true">${content}</section></div>`;
  window.setTimeout(() => overlay.querySelector("input, textarea, button")?.focus(), 0);
}

function openAccessModal(user) {
  modalShell(`
    <form data-form="access" data-uid="${escapeHtml(user.uid)}">
      <div class="modal-head"><div><p class="eyebrow">LIBERAR ACESSO</p><h2>Liberar usuário</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <div class="plan-display"><span>PLANO ÚNICO<strong>${PLAN_NAME}</strong></span><b>PRO</b></div>
      <p class="modal-copy">O acesso ficará liberado até você usar o botão <strong>Bloquear</strong>. Não existe vencimento automático.</p>
      <label class="field"><span>Observação interna</span><textarea name="note" maxlength="240" placeholder="Ex.: pagamento confirmado">${escapeHtml(user.note || "")}</textarea></label>
      <div class="modal-actions"><button type="button" data-action="close-modal">Voltar</button><button class="confirm" type="submit">Liberar acesso</button></div>
    </form>`);
}

function openStatusModal(user, status) {
  const pausing = status === "paused";
  modalShell(`
    <form data-form="status" data-uid="${escapeHtml(user.uid)}" data-status="${status}">
      <div class="modal-head"><div><p class="eyebrow">ALTERAR ACESSO</p><h2>${pausing ? "Bloquear usuário" : "Cancelar acesso"}</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <p class="modal-copy${pausing ? "" : " danger-note"}">${pausing ? "O aplicativo será bloqueado assim que o usuário estiver online. Os treinos permanecerão salvos para uma futura liberação." : "O acesso ao aplicativo será cancelado. A conta Google continuará registrada no Firebase Authentication e os treinos serão preservados."}</p>
      <label class="field"><span>Observação interna</span><textarea name="note" maxlength="240">${escapeHtml(user.note || "")}</textarea></label>
      <div class="modal-actions"><button type="button" data-action="close-modal">Voltar</button><button class="${pausing ? "confirm" : "danger"}" type="submit">${pausing ? "Confirmar bloqueio" : "Cancelar acesso"}</button></div>
    </form>`);
}

function openDeleteModal(user) {
  modalShell(`
    <form data-form="delete" data-uid="${escapeHtml(user.uid)}">
      <div class="modal-head"><div><p class="eyebrow">EXCLUIR DADOS</p><h2>Remover dados do usuário</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <p class="modal-copy danger-note">Esta ação apaga os treinos armazenados no Firestore e mantém o acesso cancelado. Para apagar também a conta da lista do Authentication, use o console do Firebase.</p>
      <label class="field"><span>Digite o e-mail para confirmar</span><input name="confirmEmail" type="email" autocomplete="off" placeholder="${escapeHtml(user.email || "")}" required></label>
      <div class="modal-actions"><button type="button" data-action="close-modal">Voltar</button><button class="danger" type="submit">Excluir dados e bloquear</button></div>
    </form>`);
}

function openBillingModal(user) {
  const billing = user.billing ? BILLING.normalizeSchedule(user.billing) : null;
  const installments = billing?.installments || [];
  const paid = installments.filter((installment) => installment.status === "paid").length;
  const scheduleInfo = billing?.firstPaymentAt
    ? `Data-base: ${formatDate(billing.firstPaymentAt)} • vencimentos a cada ${INSTALLMENT_INTERVAL_DAYS} dias.`
    : `A parcela 1 registra a data do primeiro pagamento. As demais vencem a cada ${INSTALLMENT_INTERVAL_DAYS} dias a partir dela.`;
  const list = installments.length
    ? installments.map((installment) => {
      const isPaid = installment.status === "paid";
      return `<div class="admin-installment"><span>${String(installment.number).padStart(2, "0")}</span><div><strong>Parcela ${installment.number}</strong><small>Vencimento: ${formatDate(installment.dueAt)} • ${formatCurrency(installment.amountCents)}</small></div><b class="${isPaid ? "paid" : "pending"}">${isPaid ? "PAGA" : "PENDENTE"}</b><button type="button" class="action-button ${isPaid ? "action-warning" : "action-primary"}" data-action="set-installment" data-uid="${escapeHtml(user.uid)}" data-installment="${installment.number}" data-status="${isPaid ? "pending" : "paid"}">${isPaid ? "Reabrir" : "Marcar paga"}</button></div>`;
    }).join("")
    : `<div class="billing-empty"><strong>Parcelamento ainda não criado</strong><span>Crie as ${PLAN_INSTALLMENTS} parcelas. Os vencimentos serão definidos quando a parcela 1 for paga.</span><button type="button" class="action-button action-primary" data-action="create-billing" data-uid="${escapeHtml(user.uid)}">Criar parcelas</button></div>`;

  modalShell(`
    <div data-billing-modal data-uid="${escapeHtml(user.uid)}">
      <div class="modal-head"><div><p class="eyebrow">FINANCEIRO</p><h2>Parcelas do usuário</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <div class="plan-display"><span>PLANO ÚNICO<strong>${PLAN_NAME}</strong><small>${PLAN_INSTALLMENTS} parcelas de ${formatCurrency(PLAN_INSTALLMENT_CENTS)}</small></span><b>${paid}/${PLAN_INSTALLMENTS} PAGAS</b></div>
      <p class="billing-schedule-info">${escapeHtml(scheduleInfo)}</p>
      <div class="admin-installment-list">${list}</div>
      <p class="modal-copy">O QR Code Pix continua separado da regra de vencimentos e pode ser configurado depois, sem alterar o calendário das parcelas.</p>
      <div class="modal-actions"><button type="button" data-action="close-modal">Fechar</button></div>
    </div>`);
}

function permissionError(message) {
  const error = new Error(message);
  error.code = "permission-denied";
  return error;
}

async function assertAdmin() {
  const { db, doc, getDoc } = state.firestore;
  const [snapshot, legacySnapshot] = await Promise.all([
    getDoc(doc(db, "admins", state.user.uid)),
    getDoc(doc(db, "admin", state.user.uid)),
  ]);
  const currentAdmin = snapshot.exists() && snapshot.data()?.enabled === true;
  const legacyAdmin = legacySnapshot.exists() && legacySnapshot.data()?.valor === true;
  if (!currentAdmin && !legacyAdmin) {
    throw permissionError("Esta conta não está cadastrada como administradora no Firestore.");
  }
}

async function writeAudit(action, user, details = {}) {
  const { db, collection, addDoc, serverTimestamp } = state.firestore;
  await addDoc(collection(db, "adminAudit"), {
    action,
    targetUid: user.uid,
    targetEmail: user.email || "",
    adminUid: state.user.uid,
    adminEmail: state.user.email || "",
    details,
    createdAt: serverTimestamp(),
  });
}

async function setAccess({ user, status, note = "" }) {
  if (!["active", "paused", "cancelled"].includes(status)) throw new Error("Situação de acesso inválida.");
  if (user.uid === state.user.uid && status !== "active") throw new Error("A conta administradora não pode bloquear a si mesma.");

  const { db, doc, getDoc, setDoc, serverTimestamp } = state.firestore;
  const reference = doc(db, "access", user.uid);
  const snapshot = await getDoc(reference);
  const existing = snapshot.exists() ? snapshot.data() : {};
  const payload = {
    uid: user.uid,
    email: user.email || existing.email || "",
    displayName: user.displayName || existing.displayName || "",
    photoURL: user.photoURL || existing.photoURL || "",
    plan: "pro",
    status,
    expiresAt: null,
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid,
  };
  if (!snapshot.exists()) payload.createdAt = serverTimestamp();
  if (status === "active") payload.activatedAt = serverTimestamp();
  if (status === "active" && !Array.isArray(existing?.billing?.installments)) {
    payload.billing = createBillingSchedule();
  }

  await Promise.all([
    setDoc(reference, payload, { merge: true }),
    setDoc(doc(db, "adminNotes", user.uid), {
      uid: user.uid,
      note: String(note || "").trim().slice(0, 240),
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
    }, { merge: true }),
  ]);
  await writeAudit(`access.${status}`, user, { mode: "manual" });
}

async function createBilling(user) {
  const { db, doc, setDoc, serverTimestamp } = state.firestore;
  await setDoc(doc(db, "access", user.uid), {
    billing: createBillingSchedule(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid,
  }, { merge: true });
  await writeAudit("billing.created", user, { installments: PLAN_INSTALLMENTS, amountCents: PLAN_INSTALLMENT_CENTS });
}

async function setInstallment({ user, installmentNumber, status }) {
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > PLAN_INSTALLMENTS) throw new Error("Parcela inválida.");
  if (!["pending", "paid"].includes(status)) throw new Error("Situação de pagamento inválida.");

  const { db, doc, runTransaction, serverTimestamp, Timestamp } = state.firestore;
  const reference = doc(db, "access", user.uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("Usuário não encontrado.");
    const access = snapshot.data();
    const current = access.billing && Array.isArray(access.billing.installments)
      ? access.billing
      : createBillingSchedule();
    const updated = BILLING.applyInstallmentStatus(current, installmentNumber, status, { now: Date.now() });
    transaction.set(reference, {
      billing: BILLING.serializeForFirestore(updated, (milliseconds) => Timestamp.fromMillis(milliseconds)),
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
    }, { merge: true });
  });
  await writeAudit(`installment.${status}`, user, { installmentNumber, amountCents: PLAN_INSTALLMENT_CENTS });
}

async function deleteUserData(user) {
  if (user.uid === state.user.uid) throw new Error("A conta administradora não pode excluir a si mesma.");
  const { db, doc, collection, getDocs, writeBatch, setDoc, serverTimestamp } = state.firestore;
  const [workouts, appDocuments] = await Promise.all([
    getDocs(collection(db, "users", user.uid, "workouts")),
    getDocs(collection(db, "users", user.uid, "app")),
  ]);
  const references = [
    ...workouts.docs.map((item) => item.ref),
    ...appDocuments.docs.map((item) => item.ref),
    doc(db, "presence", user.uid),
    doc(db, "adminNotes", user.uid),
  ];
  for (let offset = 0; offset < references.length; offset += 400) {
    const batch = writeBatch(db);
    references.slice(offset, offset + 400).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
  await setDoc(doc(db, "access", user.uid), {
    status: "cancelled",
    expiresAt: null,
    billing: null,
    dataRemovedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid,
  }, { merge: true });
  await writeAudit("user.data_removed", user, { authenticationRecordPreserved: true });
}

async function refreshUsers({ quiet = false } = {}) {
  if (!state.user || !state.firestore) return;
  if (!quiet) {
    state.refreshing = true;
    if (state.users.length) render();
  }

  const { db, collection, getDocs } = state.firestore;
  const accessPromise = withTimeout(getDocs(collection(db, "access")));

  try {
    if (!state.adminVerified) {
      await withTimeout(assertAdmin(), 7000);
      state.adminVerified = true;

      // Depois de validar a conta administradora, mostra o último resultado
      // imediatamente enquanto a leitura nova termina em segundo plano.
      const cached = readAdminCache(state.user.uid);
      if (cached?.users?.length) {
        state.users = cached.users;
        state.generatedAt = Number(cached.generatedAt) || Date.now();
        state.loading = false;
        render();
      }
    }

    const accessSnapshot = await accessPromise;
    state.users = buildUsers(accessSnapshot, null, null, state.users);
    state.generatedAt = Date.now();
    state.truncated = false;
    state.denied = false;
    state.error = "";
    state.loading = false;
    state.refreshing = false;
    writeAdminCache();
    render();

    // Presença e observações não atrasam mais a abertura do painel. Se uma
    // dessas leituras falhar, a lista principal continua disponível.
    const enrichRequestId = ++state.enrichRequestId;
    const userId = state.user.uid;
    Promise.allSettled([
      withTimeout(getDocs(collection(db, "presence")), 7000),
      withTimeout(getDocs(collection(db, "adminNotes")), 7000),
    ]).then(([presenceResult, notesResult]) => {
      if (state.user?.uid !== userId || enrichRequestId !== state.enrichRequestId) return;
      const presenceSnapshot = presenceResult.status === "fulfilled" ? presenceResult.value : null;
      const notesSnapshot = notesResult.status === "fulfilled" ? notesResult.value : null;
      if (!presenceSnapshot && !notesSnapshot) return;
      state.users = buildUsers(accessSnapshot, presenceSnapshot, notesSnapshot, state.users);
      state.generatedAt = Date.now();
      writeAdminCache();
      render();
    }).catch(() => {});
  } catch (error) {
    console.error("Central de acessos:", error);
    const message = friendlyError(error);
    if (String(error?.code || "").includes("permission-denied")) {
      state.adminVerified = false;
      state.denied = true;
      state.error = error?.message || message;
      state.users = [];
    } else if (!quiet) {
      showToast(message, true);
    }
    state.loading = false;
    state.refreshing = false;
    render();
  }
}

async function runMutation(button, task, successMessage) {
  const previous = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Salvando…";
  }
  try {
    await task();
    closeModal();
    showToast(successMessage);
    await refreshUsers({ quiet: true });
  } catch (error) {
    console.error("Central de acessos:", error);
    showToast(friendlyError(error), true);
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

root.addEventListener("input", (event) => {
  if (!event.target.matches("[data-search]")) return;
  state.query = event.target.value;
  const cursor = event.target.selectionStart;
  renderDashboard();
  const next = root.querySelector("[data-search]");
  next?.focus();
  next?.setSelectionRange(cursor, cursor);
});

root.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { action, uid, status, filter } = button.dataset;
  if (filter) {
    state.filter = filter;
    render();
    return;
  }
  if (action === "sign-in") {
    button.disabled = true;
    try {
      const provider = new state.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await state.auth.signInWithPopup(state.auth.instance, provider);
    } catch (error) {
      button.disabled = false;
      if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error?.code)) showToast(friendlyError(error), true);
    }
    return;
  }
  if (action === "sign-out") {
    await state.auth.signOut(state.auth.instance);
    return;
  }
  if (action === "refresh") {
    await refreshUsers();
    return;
  }
  const user = findUser(uid);
  if (!user) return;
  if (action === "access") openAccessModal(user);
  if (action === "status") openStatusModal(user, status);
  if (action === "delete") openDeleteModal(user);
  if (action === "billing") openBillingModal(user);
});

overlay.addEventListener("click", (event) => {
  const actionNode = event.target.closest("[data-action]");
  const action = actionNode?.dataset.action;
  if (action === "close-modal" || (action === "backdrop" && event.target.classList.contains("modal-backdrop"))) closeModal();
  if (action === "access" && actionNode?.dataset.uid) {
    const user = findUser(actionNode.dataset.uid);
    if (user) openAccessModal(user);
  }
  if (action === "set-installment") {
    const user = findUser(actionNode.dataset.uid);
    const installmentNumber = Number(actionNode.dataset.installment);
    const nextStatus = actionNode.dataset.status;
    if (user) runMutation(actionNode, () => setInstallment({
      user,
      installmentNumber,
      status: nextStatus,
    }), nextStatus === "paid" ? "Parcela marcada como paga." : "Parcela reaberta.");
  }
  if (action === "create-billing") {
    const user = findUser(actionNode.dataset.uid);
    if (user) runMutation(actionNode, () => createBilling(user), "Parcelas criadas.");
  }
});

overlay.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button[type="submit"]');
  const user = findUser(form.dataset.uid);
  if (!user) return closeModal();

  if (form.dataset.form === "access") {
    const data = new FormData(form);
    await runMutation(submit, () => setAccess({
      user,
      status: "active",
      note: String(data.get("note") || ""),
    }), `Acesso de ${user.displayName || user.email} liberado.`);
    return;
  }

  if (form.dataset.form === "status") {
    const data = new FormData(form);
    const nextStatus = form.dataset.status;
    await runMutation(submit, () => setAccess({
      user,
      status: nextStatus,
      note: String(data.get("note") || ""),
    }), nextStatus === "paused" ? "Acesso bloqueado." : "Acesso cancelado.");
    return;
  }

  if (form.dataset.form === "delete") {
    const confirmEmail = String(new FormData(form).get("confirmEmail") || "").trim();
    if (confirmEmail.toLowerCase() !== String(user.email || "").trim().toLowerCase()) {
      showToast("Digite exatamente o e-mail exibido para confirmar.", true);
      return;
    }
    await runMutation(submit, () => deleteUserData(user), "Dados removidos e acesso cancelado.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && overlay.innerHTML) closeModal();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.user && !state.denied) refreshUsers({ quiet: true });
});

async function main() {
  renderLoading();
  if (!configIsReady(firebaseConfig)) {
    state.loading = false;
    state.error = "Configure o Firebase antes de abrir a central.";
    state.denied = true;
    state.user = { displayName: "Administrador" };
    render();
    return;
  }

  // Usa o módulo oficial do Firestore disponibilizado pelo CDN do Firebase.
  // Long-polling evita travas de WebChannel em redes/proxies problemáticos.
  const [{ initializeApp }, authSdk, firestoreSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore-lite.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  if (String(appCheckSiteKey || "").trim()) {
    const appCheckSdk = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`);
    appCheckSdk.initializeAppCheck(app, {
      provider: new appCheckSdk.ReCaptchaEnterpriseProvider(String(appCheckSiteKey).trim()),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = authSdk.getAuth(app);
  // Firestore Lite usa REST puro e carrega bem mais rápido para este painel,
  // que só precisa de leituras/escritas pontuais.
  const databaseId = String(firestoreDatabaseId || "(default)").trim() || "(default)";
  const firestoreSettings = { ignoreUndefinedProperties: true };
  const db = databaseId === "(default)"
    ? firestoreSdk.initializeFirestore(app, firestoreSettings)
    : firestoreSdk.initializeFirestore(app, firestoreSettings, databaseId);
  state.auth = {
    instance: auth,
    GoogleAuthProvider: authSdk.GoogleAuthProvider,
    signInWithPopup: authSdk.signInWithPopup,
    signOut: authSdk.signOut,
  };
  state.firestore = {
    db,
    doc: firestoreSdk.doc,
    collection: firestoreSdk.collection,
    getDoc: firestoreSdk.getDoc,
    getDocs: firestoreSdk.getDocs,
    setDoc: firestoreSdk.setDoc,
    addDoc: firestoreSdk.addDoc,
    writeBatch: firestoreSdk.writeBatch,
    runTransaction: firestoreSdk.runTransaction,
    serverTimestamp: firestoreSdk.serverTimestamp,
    Timestamp: firestoreSdk.Timestamp,
  };

  authSdk.onAuthStateChanged(auth, async (user) => {
    clearInterval(state.refreshTimer);
    state.user = user;
    state.users = [];
    state.denied = false;
    state.error = "";
    state.adminVerified = false;
    state.enrichRequestId += 1;
    state.loading = false;
    if (!user) {
      render();
      return;
    }
    state.loading = true;
    render();
    await refreshUsers();
    state.refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && state.user && !state.denied) refreshUsers({ quiet: true });
    }, 45000);
  });
}

main().catch((error) => {
  console.error("Central de acessos:", error);
  state.loading = false;
  state.denied = true;
  state.user = { displayName: "Administrador" };
  state.error = "Não foi possível iniciar a central. Confira a conexão e a configuração do Firebase.";
  render();
});
