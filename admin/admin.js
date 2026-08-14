import { appCheckSiteKey, firebaseConfig } from "../firebase-config.js";

const FIREBASE_VERSION = "12.16.0";
const FUNCTIONS_REGION = "southamerica-east1";
const PLAN_NAME = "Meu Treino Pro";
const STATUS_LABELS = Object.freeze({
  active: "Ativo",
  pending: "Aguardando",
  paused: "Pausado",
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
  calls: null,
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

function inputDate(value) {
  const date = value && Number(value) > Date.now() ? new Date(Number(value)) : new Date(Date.now() + 30 * 86400000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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
  if (code.includes("permission-denied")) return "Esta conta não possui permissão para administrar os acessos.";
  if (code.includes("unauthenticated")) return "Sua sessão expirou. Entre novamente.";
  if (code.includes("failed-precondition")) return error?.message || "Confira os dados e tente novamente.";
  if (code.includes("invalid-argument")) return error?.message || "Os dados enviados são inválidos.";
  if (code.includes("unavailable")) return "O Firebase está indisponível no momento. Tente novamente.";
  return error?.message || "Não foi possível concluir esta ação.";
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
  root.innerHTML = `
    <section class="login-page">
      <div class="denied-card">
        <div class="login-logo">${icon("lock")}</div>
        <p class="eyebrow">ACESSO NEGADO</p>
        <h1>Conta sem permissão</h1>
        <p>${escapeHtml(state.error || "Use a conta configurada como administradora nas Functions do Firebase.")}</p>
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
    buttons.push(`<button class="action-button action-primary" data-action="access" data-uid="${escapeHtml(user.uid)}">Gerenciar</button>`);
    if (!isAdminSelf) buttons.push(`<button class="action-button action-warning" data-action="status" data-status="paused" data-uid="${escapeHtml(user.uid)}">Pausar</button>`);
  } else {
    buttons.push(`<button class="action-button action-primary" data-action="access" data-uid="${escapeHtml(user.uid)}">${user.status === "expired" ? "Renovar" : "Ativar"}</button>`);
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
  const expiry = user.expiresAt ? `Até ${formatDate(user.expiresAt)}` : "Vencimento não definido";
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
      <div class="plan-cell"><strong>${PLAN_NAME}</strong><span>${escapeHtml(expiry)} • ${paid}/12 pagas</span></div>
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
    ["paused", "Pausados"], ["expired", "Vencidos"], ["cancelled", "Cancelados"],
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
        <div class="metric"><span>Bloqueados</span><strong>${blocked}</strong><small>Aguardando, pausados ou vencidos</small></div>
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
        ${visibleUsers.length ? visibleUsers.map(userRow).join("") : '<div class="empty-state"><strong>Nenhum usuário encontrado</strong><span>Ajuste a busca ou o filtro selecionado.</span></div>'}
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
      <div class="modal-head"><div><p class="eyebrow">LIBERAR ACESSO</p><h2>${user.status === "active" ? "Gerenciar assinatura" : "Ativar usuário"}</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <div class="plan-display"><span>PLANO ÚNICO<strong>${PLAN_NAME}</strong></span><b>PRO</b></div>
      <label class="field"><span>Data de vencimento</span><input name="expiresAt" type="date" value="${inputDate(user.expiresAt)}" required></label>
      <div class="duration-options">
        <button type="button" class="duration-button" data-duration="30">+ 30 dias</button>
        <button type="button" class="duration-button" data-duration="90">+ 90 dias</button>
        <button type="button" class="duration-button" data-duration="365">+ 1 ano</button>
      </div>
      <label class="field"><span>Observação interna</span><textarea name="note" maxlength="240" placeholder="Ex.: pagamento confirmado">${escapeHtml(user.note || "")}</textarea></label>
      <div class="modal-actions"><button type="button" data-action="close-modal">Voltar</button><button class="confirm" type="submit">${user.status === "active" ? "Salvar alterações" : "Ativar acesso"}</button></div>
    </form>`);
}

function openStatusModal(user, status) {
  const pausing = status === "paused";
  modalShell(`
    <form data-form="status" data-uid="${escapeHtml(user.uid)}" data-status="${status}">
      <div class="modal-head"><div><p class="eyebrow">ALTERAR ACESSO</p><h2>${pausing ? "Pausar usuário" : "Cancelar acesso"}</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <p class="modal-copy${pausing ? "" : " danger-note"}">${pausing ? "O usuário perderá o acesso agora, mas os treinos e a data de vencimento serão preservados para uma futura reativação." : "O login será desativado e as sessões serão revogadas. Os dados serão preservados até que você escolha excluí-los."}</p>
      <label class="field"><span>Observação interna</span><textarea name="note" maxlength="240">${escapeHtml(user.note || "")}</textarea></label>
      <div class="modal-actions"><button type="button" data-action="close-modal">Voltar</button><button class="${pausing ? "confirm" : "danger"}" type="submit">${pausing ? "Confirmar pausa" : "Cancelar acesso"}</button></div>
    </form>`);
}

function openDeleteModal(user) {
  modalShell(`
    <form data-form="delete" data-uid="${escapeHtml(user.uid)}">
      <div class="modal-head"><div><p class="eyebrow">EXCLUSÃO DEFINITIVA</p><h2>Excluir usuário</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <p class="modal-copy danger-note">Esta ação exclui o login e os dados de treino armazenados no Firebase. Ela não poderá ser desfeita.</p>
      <label class="field"><span>Digite o e-mail para confirmar</span><input name="confirmEmail" type="email" autocomplete="off" placeholder="${escapeHtml(user.email || "")}" required></label>
      <div class="modal-actions"><button type="button" data-action="close-modal">Voltar</button><button class="danger" type="submit">Excluir definitivamente</button></div>
    </form>`);
}

function openBillingModal(user) {
  const installments = Array.isArray(user.billing?.installments) ? user.billing.installments : [];
  const paid = installments.filter((installment) => installment.status === "paid").length;
  const list = installments.length
    ? installments.map((installment) => {
      const isPaid = installment.status === "paid";
      return `<div class="admin-installment"><span>${String(installment.number).padStart(2, "0")}</span><div><strong>Parcela ${installment.number}</strong><small>${formatDate(installment.dueAt)} • R$ 29,99</small></div><b class="${isPaid ? "paid" : "pending"}">${isPaid ? "PAGA" : "PENDENTE"}</b><button type="button" class="action-button ${isPaid ? "action-warning" : "action-primary"}" data-action="set-installment" data-uid="${escapeHtml(user.uid)}" data-installment="${installment.number}" data-status="${isPaid ? "pending" : "paid"}">${isPaid ? "Reabrir" : "Marcar paga"}</button></div>`;
    }).join("")
    : '<div class="billing-empty"><strong>Parcelamento ainda não criado</strong><span>Ative o acesso para gerar as 12 parcelas de R$ 29,99.</span></div>';

  modalShell(`
    <div data-billing-modal data-uid="${escapeHtml(user.uid)}">
      <div class="modal-head"><div><p class="eyebrow">FINANCEIRO</p><h2>Parcelas do usuário</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></div>
      <div class="modal-user"><strong>${escapeHtml(user.displayName || "Usuário sem nome")}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <div class="plan-display"><span>PLANO ÚNICO<strong>${PLAN_NAME}</strong></span><b>${paid}/12 PAGAS</b></div>
      <div class="admin-installment-list">${list}</div>
      <p class="modal-copy">O QR Code Pix continuará em configuração até você vincular a conta de recebimento. Aqui você já pode controlar manualmente os pagamentos.</p>
      <div class="modal-actions"><button type="button" data-action="close-modal">Fechar</button><button type="button" class="confirm" data-action="access" data-uid="${escapeHtml(user.uid)}">Gerenciar acesso</button></div>
    </div>`);
}

async function refreshUsers({ quiet = false } = {}) {
  if (!state.user || !state.calls) return;
  if (!quiet) {
    state.refreshing = true;
    if (state.users.length) render();
  }
  try {
    const result = await state.calls.listUsers();
    state.users = Array.isArray(result.data?.users) ? result.data.users : [];
    state.generatedAt = result.data?.generatedAt || Date.now();
    state.truncated = Boolean(result.data?.truncated);
    state.denied = false;
    state.error = "";
  } catch (error) {
    console.error("Central de acessos:", error);
    const message = friendlyError(error);
    if (String(error?.code || "").includes("permission-denied")) {
      state.denied = true;
      state.error = message;
    } else if (!quiet) {
      showToast(message, true);
    }
  } finally {
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
    if (user) runMutation(actionNode, () => state.calls.setInstallment({
      uid: user.uid,
      installmentNumber,
      status: nextStatus,
    }), nextStatus === "paid" ? "Parcela marcada como paga." : "Parcela reaberta.");
  }
  const duration = event.target.closest("[data-duration]")?.dataset.duration;
  if (duration) {
    const date = new Date(Date.now() + Number(duration) * 86400000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    const input = overlay.querySelector('input[name="expiresAt"]');
    if (input) input.value = local.toISOString().slice(0, 10);
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
    const expiresAt = new Date(`${data.get("expiresAt")}T23:59:59`).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      showToast("Escolha uma data de vencimento futura.", true);
      return;
    }
    await runMutation(submit, () => state.calls.setAccess({
      uid: user.uid,
      status: "active",
      plan: "pro",
      expiresAt,
      note: String(data.get("note") || ""),
    }), `Acesso de ${user.displayName || user.email} ativado.`);
    return;
  }

  if (form.dataset.form === "status") {
    const data = new FormData(form);
    const nextStatus = form.dataset.status;
    await runMutation(submit, () => state.calls.setAccess({
      uid: user.uid,
      status: nextStatus,
      plan: "pro",
      expiresAt: user.expiresAt || null,
      note: String(data.get("note") || ""),
    }), nextStatus === "paused" ? "Acesso pausado." : "Acesso cancelado.");
    return;
  }

  if (form.dataset.form === "delete") {
    const confirmEmail = String(new FormData(form).get("confirmEmail") || "").trim();
    if (confirmEmail.toLowerCase() !== String(user.email || "").trim().toLowerCase()) {
      showToast("Digite exatamente o e-mail exibido para confirmar.", true);
      return;
    }
    await runMutation(submit, () => state.calls.deleteUser({ uid: user.uid, confirmEmail }), "Usuário e dados excluídos.");
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

  const [{ initializeApp }, authSdk, functionsSdk, appCheckSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-functions.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  if (String(appCheckSiteKey || "").trim()) {
    appCheckSdk.initializeAppCheck(app, {
      provider: new appCheckSdk.ReCaptchaEnterpriseProvider(String(appCheckSiteKey).trim()),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = authSdk.getAuth(app);
  const functions = functionsSdk.getFunctions(app, FUNCTIONS_REGION);
  state.auth = {
    instance: auth,
    GoogleAuthProvider: authSdk.GoogleAuthProvider,
    signInWithPopup: authSdk.signInWithPopup,
    signOut: authSdk.signOut,
  };
  state.calls = {
    listUsers: functionsSdk.httpsCallable(functions, "adminListUsers"),
    setAccess: functionsSdk.httpsCallable(functions, "adminSetAccess"),
    setInstallment: functionsSdk.httpsCallable(functions, "adminSetInstallment"),
    deleteUser: functionsSdk.httpsCallable(functions, "adminDeleteUser"),
  };

  authSdk.onAuthStateChanged(auth, async (user) => {
    clearInterval(state.refreshTimer);
    state.user = user;
    state.users = [];
    state.denied = false;
    state.error = "";
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
    }, 30000);
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
