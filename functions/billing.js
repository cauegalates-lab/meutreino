"use strict";

const PLAN_ID = "pro";
const PLAN_NAME = "Meu Treino Pro";
const PLAN_INSTALLMENTS = 12;
const PLAN_INSTALLMENT_CENTS = 2990;
const INSTALLMENT_INTERVAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const BILLING_SCHEMA_VERSION = 2;

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dueAtFor(firstPaymentAt, installmentIndex) {
  const anchor = toMillis(firstPaymentAt);
  if (!anchor) return null;
  return anchor + Math.max(0, Number(installmentIndex) || 0) * INSTALLMENT_INTERVAL_DAYS * DAY_MS;
}

function normalizedAnchor(value) {
  const explicit = toMillis(value?.firstPaymentAt);
  if (explicit) return explicit;
  const first = Array.isArray(value?.installments) ? value.installments[0] : null;
  if (first?.status === "paid") return toMillis(first.paidAt);
  return null;
}

function normalizeSchedule(value) {
  const source = value && typeof value === "object" ? value : {};
  const sourceInstallments = Array.isArray(source.installments) ? source.installments : [];
  const firstPaymentAt = normalizedAnchor(source);
  const installments = Array.from({ length: PLAN_INSTALLMENTS }, (_, index) => {
    const original = sourceInstallments[index] || {};
    const status = original.status === "paid" ? "paid" : "pending";
    return {
      number: index + 1,
      amountCents: PLAN_INSTALLMENT_CENTS,
      dueAt: firstPaymentAt ? dueAtFor(firstPaymentAt, index) : null,
      status,
      paidAt: status === "paid" ? toMillis(original.paidAt) : null,
      pixCode: String(original.pixCode || ""),
      qrCodeUrl: String(original.qrCodeUrl || ""),
    };
  });
  return {
    schemaVersion: BILLING_SCHEMA_VERSION,
    plan: PLAN_ID,
    planName: PLAN_NAME,
    amountCents: PLAN_INSTALLMENT_CENTS,
    totalInstallments: PLAN_INSTALLMENTS,
    firstPaymentAt,
    startedAt: firstPaymentAt,
    installments,
  };
}

function createSchedule() {
  return normalizeSchedule({ installments: [] });
}

function applyInstallmentStatus(value, installmentNumberValue, status, now = Date.now()) {
  const number = Number(installmentNumberValue);
  if (!Number.isInteger(number) || number < 1 || number > PLAN_INSTALLMENTS) throw new Error("Parcela inválida.");
  if (!["pending", "paid"].includes(status)) throw new Error("Situação de pagamento inválida.");

  const billing = normalizeSchedule(value);
  const installments = billing.installments.map((installment) => ({ ...installment }));
  if (number > 1 && status === "paid" && !billing.firstPaymentAt) {
    throw new Error("Marque a parcela 1 como paga primeiro. Ela define a data-base dos vencimentos.");
  }

  let firstPaymentAt = billing.firstPaymentAt;
  if (number === 1 && status === "paid") firstPaymentAt = now;
  if (number === 1 && status === "pending") {
    if (installments.slice(1).some((installment) => installment.status === "paid")) {
      throw new Error("Reabra as parcelas posteriores antes de reabrir a parcela 1.");
    }
    firstPaymentAt = null;
  }

  const target = installments[number - 1];
  target.status = status;
  target.paidAt = status === "paid" ? now : null;
  installments.forEach((installment, index) => {
    installment.amountCents = PLAN_INSTALLMENT_CENTS;
    installment.dueAt = firstPaymentAt ? dueAtFor(firstPaymentAt, index) : null;
  });

  return normalizeSchedule({ ...billing, firstPaymentAt, installments });
}

function toFirestore(value, Timestamp) {
  const billing = normalizeSchedule(value);
  const convert = (milliseconds) => milliseconds ? Timestamp.fromMillis(milliseconds) : null;
  return {
    ...billing,
    firstPaymentAt: convert(billing.firstPaymentAt),
    startedAt: convert(billing.firstPaymentAt),
    installments: billing.installments.map((installment) => ({
      ...installment,
      dueAt: convert(installment.dueAt),
      paidAt: convert(installment.paidAt),
    })),
  };
}

module.exports = {
  PLAN_ID,
  PLAN_NAME,
  PLAN_INSTALLMENTS,
  PLAN_INSTALLMENT_CENTS,
  INSTALLMENT_INTERVAL_DAYS,
  BILLING_SCHEMA_VERSION,
  toMillis,
  normalizeSchedule,
  createSchedule,
  applyInstallmentStatus,
  toFirestore,
};
