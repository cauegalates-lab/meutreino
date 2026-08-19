const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { defineString } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

const ADMIN_EMAIL = defineString("ADMIN_EMAIL");
const auth = getAuth();
const db = getFirestore("default");
const ONLINE_WINDOW_MS = 150000;
const VALID_ACCESS_STATUSES = new Set(["active", "paused", "cancelled"]);
const PLAN_ID = "pro";
const PLAN_NAME = "Meu Treino Pro";
const INSTALLMENT_COUNT = 12;
const INSTALLMENT_AMOUNT_CENTS = 2999;

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function timestampMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function addUtcMonths(value, months) {
  const source = new Date(value);
  const day = source.getUTCDate();
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result.getTime();
}

function createBillingSchedule(startAt = Date.now()) {
  return {
    plan: PLAN_ID,
    planName: PLAN_NAME,
    amountCents: INSTALLMENT_AMOUNT_CENTS,
    totalInstallments: INSTALLMENT_COUNT,
    startedAt: Timestamp.fromMillis(startAt),
    installments: Array.from({ length: INSTALLMENT_COUNT }, (_, index) => ({
      number: index + 1,
      amountCents: INSTALLMENT_AMOUNT_CENTS,
      dueAt: Timestamp.fromMillis(addUtcMonths(startAt, index)),
      status: "pending",
      paidAt: null,
      pixCode: "",
      qrCodeUrl: "",
    })),
  };
}

function serializeBilling(value) {
  const installments = Array.isArray(value?.installments) ? value.installments : [];
  return {
    plan: PLAN_ID,
    planName: PLAN_NAME,
    amountCents: INSTALLMENT_AMOUNT_CENTS,
    totalInstallments: INSTALLMENT_COUNT,
    startedAt: timestampMillis(value?.startedAt),
    installments: installments.slice(0, INSTALLMENT_COUNT).map((installment, index) => ({
      number: Number(installment?.number) || index + 1,
      amountCents: Number(installment?.amountCents) || INSTALLMENT_AMOUNT_CENTS,
      dueAt: timestampMillis(installment?.dueAt),
      status: installment?.status === "paid" ? "paid" : "pending",
      paidAt: timestampMillis(installment?.paidAt),
      pixCode: String(installment?.pixCode || ""),
      qrCodeUrl: String(installment?.qrCodeUrl || ""),
    })),
  };
}

function publicError(error) {
  if (error instanceof HttpsError) return error;
  console.error("Admin function:", error);
  return new HttpsError("internal", "Não foi possível concluir esta ação agora.");
}

async function assertAdmin(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre com a conta administradora.");

  const uid = request.auth.uid;
  const email = normalizedEmail(request.auth.token.email);
  if (request.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "A conta administradora precisa ter o e-mail verificado.");
  const configuredEmail = normalizedEmail(ADMIN_EMAIL.value());
  const hasClaim = request.auth.token.admin === true;
  const [adminSnapshot, legacyAdminSnapshot] = await Promise.all([
    db.collection("admins").doc(uid).get(),
    db.collection("admin").doc(uid).get(),
  ]);
  const registeredAdmin = (adminSnapshot.exists && adminSnapshot.data()?.enabled === true)
    || (legacyAdminSnapshot.exists && legacyAdminSnapshot.data()?.valor === true);
  const isBootstrapAdmin = Boolean(configuredEmail && email === configuredEmail);

  if (!hasClaim && !registeredAdmin && !isBootstrapAdmin) {
    throw new HttpsError("permission-denied", "Esta conta não possui acesso à central.");
  }

  if (isBootstrapAdmin && (!hasClaim || !registeredAdmin)) {
    const user = await auth.getUser(uid);
    await Promise.all([
      auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true }),
      db.collection("admins").doc(uid).set({
        uid,
        email,
        enabled: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
  }

  return { uid, email };
}

async function writeAudit(admin, action, target, details = {}) {
  await db.collection("adminAudit").add({
    action,
    targetUid: target.uid,
    targetEmail: target.email || "",
    adminUid: admin.uid,
    adminEmail: admin.email,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function deleteKnownUserData(uid) {
  const userRef = db.collection("users").doc(uid);
  if (typeof db.recursiveDelete === "function") {
    await db.recursiveDelete(userRef);
    return;
  }

  const [workouts, appDocs] = await Promise.all([
    userRef.collection("workouts").get(),
    userRef.collection("app").get(),
  ]);
  const docs = [...workouts.docs, ...appDocs.docs];
  for (let offset = 0; offset < docs.length; offset += 400) {
    const batch = db.batch();
    docs.slice(offset, offset + 400).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  await userRef.delete().catch(() => {});
}

exports.registerCurrentUser = onCall(async (request) => {
  try {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre com sua conta Google.");
    if (request.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "O e-mail da conta precisa estar verificado.");
    const uid = request.auth.uid;
    const accessDocument = db.collection("access").doc(uid);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(accessDocument);
      if (snapshot.exists) return;
      transaction.create(accessDocument, {
        uid,
        email: String(request.auth.token.email || ""),
        displayName: String(request.auth.token.name || ""),
        photoURL: String(request.auth.token.picture || ""),
        plan: PLAN_ID,
        status: "active",
        expiresAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, status: "active", plan: PLAN_ID };
  } catch (error) {
    throw publicError(error);
  }
});

exports.adminListUsers = onCall(async (request) => {
  try {
    await assertAdmin(request);
    const [usersResult, accessSnapshot, presenceSnapshot, notesSnapshot] = await Promise.all([
      auth.listUsers(1000),
      db.collection("access").get(),
      db.collection("presence").get(),
      db.collection("adminNotes").get(),
    ]);

    const accessByUid = new Map(accessSnapshot.docs.map((item) => [item.id, item.data()]));
    const presenceByUid = new Map(presenceSnapshot.docs.map((item) => [item.id, item.data()]));
    const notesByUid = new Map(notesSnapshot.docs.map((item) => [item.id, item.data()]));
    const now = Date.now();
    const users = usersResult.users.map((user) => {
      const access = accessByUid.get(user.uid) || {};
      const presence = presenceByUid.get(user.uid) || {};
      const expiresAt = timestampMillis(access.expiresAt);
      const lastSeenAt = timestampMillis(presence.lastSeen);
      const storedStatus = ["active", "paused", "cancelled", "pending"].includes(access.status) ? access.status : "pending";
      const expired = storedStatus === "active" && expiresAt && expiresAt <= now;
      const status = expired ? "expired" : storedStatus;
      const online = Boolean(presence.online && lastSeenAt && now - lastSeenAt <= ONLINE_WINDOW_MS && status === "active" && !user.disabled);

      return {
        uid: user.uid,
        displayName: user.displayName || presence.displayName || "",
        email: user.email || presence.email || "",
        photoURL: user.photoURL || presence.photoURL || "",
        disabled: Boolean(user.disabled),
        emailVerified: Boolean(user.emailVerified),
        createdAt: user.metadata.creationTime || null,
        lastLoginAt: user.metadata.lastSignInTime || null,
        lastSeenAt,
        online,
        status,
        plan: PLAN_ID,
        expiresAt,
        note: String(notesByUid.get(user.uid)?.note || ""),
        billing: serializeBilling(access.billing),
      };
    });

    users.sort((a, b) => Number(b.online) - Number(a.online) || new Date(b.lastLoginAt || 0) - new Date(a.lastLoginAt || 0));
    return { users, generatedAt: now, truncated: Boolean(usersResult.pageToken) };
  } catch (error) {
    throw publicError(error);
  }
});

exports.adminSetAccess = onCall(async (request) => {
  try {
    const admin = await assertAdmin(request);
    const uid = String(request.data?.uid || "").trim();
    const status = String(request.data?.status || "").trim();
    const note = String(request.data?.note || "").trim().slice(0, 240);
    if (!uid || !VALID_ACCESS_STATUSES.has(status)) throw new HttpsError("invalid-argument", "Usuário ou situação inválida.");
    if (uid === admin.uid && status !== "active") throw new HttpsError("failed-precondition", "A conta administradora não pode bloquear a si mesma.");

    const user = await auth.getUser(uid);
    const accessDocument = db.collection("access").doc(uid);
    const existingSnapshot = await accessDocument.get();
    const existing = existingSnapshot.exists ? existingSnapshot.data() : {};
    let expiresAt = timestampMillis(request.data?.expiresAt) || timestampMillis(existing.expiresAt);
    if (status === "active" && !expiresAt) expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    const payload = {
      uid,
      email: user.email || "",
      displayName: user.displayName || "",
      plan: PLAN_ID,
      status,
      expiresAt: expiresAt ? Timestamp.fromMillis(expiresAt) : null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.uid,
    };
    if (!existingSnapshot.exists) payload.createdAt = FieldValue.serverTimestamp();
    if (status === "active") payload.activatedAt = FieldValue.serverTimestamp();
    if (status === "active" && !Array.isArray(existing?.billing?.installments)) {
      payload.billing = createBillingSchedule(Date.now());
    }

    await Promise.all([
      accessDocument.set(payload, { merge: true }),
      db.collection("adminNotes").doc(uid).set({
        uid,
        note,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
      }, { merge: true }),
    ]);
    const shouldDisable = status === "paused" || status === "cancelled";
    await auth.updateUser(uid, { disabled: shouldDisable });
    if (shouldDisable) await auth.revokeRefreshTokens(uid);
    await writeAudit(admin, `access.${status}`, { uid, email: user.email || "" }, { plan: PLAN_ID, expiresAt, note });

    return { ok: true, uid, status, plan: PLAN_ID, expiresAt, disabled: shouldDisable };
  } catch (error) {
    throw publicError(error);
  }
});

exports.adminSetInstallment = onCall(async (request) => {
  try {
    const admin = await assertAdmin(request);
    const uid = String(request.data?.uid || "").trim();
    const installmentNumber = Number(request.data?.installmentNumber);
    const status = String(request.data?.status || "").trim();
    if (!uid || !Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > INSTALLMENT_COUNT) {
      throw new HttpsError("invalid-argument", "Parcela inválida.");
    }
    if (!["pending", "paid"].includes(status)) throw new HttpsError("invalid-argument", "Situação de pagamento inválida.");

    const user = await auth.getUser(uid);
    const accessDocument = db.collection("access").doc(uid);
    let updatedInstallment = null;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(accessDocument);
      if (!snapshot.exists) throw new HttpsError("failed-precondition", "Ative o usuário antes de gerenciar parcelas.");
      const access = snapshot.data();
      const billing = access.billing && Array.isArray(access.billing.installments)
        ? access.billing
        : createBillingSchedule(Date.now());
      const installments = [...billing.installments];
      const index = installments.findIndex((item, itemIndex) => Number(item?.number || itemIndex + 1) === installmentNumber);
      if (index < 0) throw new HttpsError("not-found", "Parcela não encontrada.");
      updatedInstallment = {
        ...installments[index],
        status,
        paidAt: status === "paid" ? Timestamp.now() : null,
      };
      installments[index] = updatedInstallment;
      transaction.set(accessDocument, {
        billing: { ...billing, plan: PLAN_ID, planName: PLAN_NAME, installments },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
      }, { merge: true });
    });

    await writeAudit(admin, `installment.${status}`, { uid, email: user.email || "" }, {
      installmentNumber,
      amountCents: INSTALLMENT_AMOUNT_CENTS,
    });
    return { ok: true, uid, installmentNumber, status, paidAt: timestampMillis(updatedInstallment?.paidAt) };
  } catch (error) {
    throw publicError(error);
  }
});

exports.adminDeleteUser = onCall(async (request) => {
  try {
    const admin = await assertAdmin(request);
    const uid = String(request.data?.uid || "").trim();
    const confirmation = normalizedEmail(request.data?.confirmEmail);
    if (!uid) throw new HttpsError("invalid-argument", "Usuário inválido.");
    if (uid === admin.uid) throw new HttpsError("failed-precondition", "A conta administradora não pode excluir a si mesma.");

    const user = await auth.getUser(uid);
    const email = normalizedEmail(user.email);
    if (!email || confirmation !== email) throw new HttpsError("failed-precondition", "Digite o e-mail completo do usuário para confirmar.");

    await Promise.all([
      deleteKnownUserData(uid),
      db.collection("access").doc(uid).delete(),
      db.collection("presence").doc(uid).delete(),
      db.collection("adminNotes").doc(uid).delete(),
    ]);
    await auth.deleteUser(uid);
    await writeAudit(admin, "user.deleted", { uid, email }, { deletedData: true });
    return { ok: true, uid };
  } catch (error) {
    throw publicError(error);
  }
});
