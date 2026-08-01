import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { findStoreByOwnerId } from "../repositories/store.repository.js";

export const SELLER_SUBSCRIPTION_DAYS = 31;
export const SELLER_SUBSCRIPTION_GRACE_DAYS = 7;
export const SELLER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS = 7;

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

function asDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function cleanReference(value) {
  return String(value || "").trim().toLowerCase();
}

function lifecycleFor(row, at = new Date()) {
  const currentPeriodEnd = asDate(row?.current_period_end);
  const graceEnd =
    asDate(row?.grace_period_ends_at) ||
    (currentPeriodEnd ? addDays(currentPeriodEnd, SELLER_SUBSCRIPTION_GRACE_DAYS) : null);
  const renewalOpensAt = currentPeriodEnd
    ? addDays(currentPeriodEnd, -SELLER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS)
    : null;

  if (!row) {
    return {
      status: "inactive",
      databaseStatus: "inactive",
      isActive: false,
      isExpired: true,
      isGracePeriod: false,
      canRenew: true,
      canUseSellerTools: false,
      renewalOpensAt: null,
      gracePeriodEndsAt: null,
    };
  }

  if (["cancelled", "suspended"].includes(row.status)) {
    return {
      status: row.status,
      databaseStatus: row.status === "suspended" ? "cancelled" : row.status,
      isActive: false,
      isExpired: true,
      isGracePeriod: false,
      canRenew: row.status !== "suspended",
      canUseSellerTools: false,
      renewalOpensAt: renewalOpensAt?.toISOString() || null,
      gracePeriodEndsAt: graceEnd?.toISOString() || null,
    };
  }

  if (!currentPeriodEnd) {
    return {
      status: row.status === "expired" ? "expired" : "inactive",
      databaseStatus: row.status === "expired" ? "expired" : "inactive",
      isActive: false,
      isExpired: true,
      isGracePeriod: false,
      canRenew: true,
      canUseSellerTools: false,
      renewalOpensAt: null,
      gracePeriodEndsAt: null,
    };
  }

  const now = at.getTime();
  if (now < currentPeriodEnd.getTime()) {
    const inRenewalWindow = renewalOpensAt ? now >= renewalOpensAt.getTime() : true;
    return {
      status: inRenewalWindow ? "renewal_due" : "active",
      databaseStatus: "active",
      isActive: true,
      isExpired: false,
      isGracePeriod: false,
      canRenew: inRenewalWindow,
      canUseSellerTools: true,
      renewalOpensAt: renewalOpensAt?.toISOString() || null,
      gracePeriodEndsAt: graceEnd?.toISOString() || null,
    };
  }

  if (graceEnd && now < graceEnd.getTime()) {
    return {
      status: "grace_period",
      databaseStatus: "past_due",
      isActive: true,
      isExpired: false,
      isGracePeriod: true,
      canRenew: true,
      canUseSellerTools: true,
      renewalOpensAt: renewalOpensAt?.toISOString() || null,
      gracePeriodEndsAt: graceEnd.toISOString(),
    };
  }

  return {
    status: "expired",
    databaseStatus: "expired",
    isActive: false,
    isExpired: true,
    isGracePeriod: false,
    canRenew: true,
    canUseSellerTools: false,
    renewalOpensAt: renewalOpensAt?.toISOString() || null,
    gracePeriodEndsAt: graceEnd?.toISOString() || null,
  };
}

function syncDatabaseStatus(row) {
  if (!row || ["inactive", "cancelled"].includes(row.status)) return row;

  const lifecycle = lifecycleFor(row);
  if (lifecycle.databaseStatus !== row.status) {
    db.prepare("UPDATE seller_subscriptions SET status = ?, updated_at = ? WHERE id = ?").run(
      lifecycle.databaseStatus,
      nowIso(),
      row.id,
    );
    return db.prepare("SELECT * FROM seller_subscriptions WHERE id = ?").get(row.id);
  }

  return row;
}

export function serializeSubscription(row) {
  const lifecycle = lifecycleFor(row);

  if (!row) {
    return {
      id: "",
      planName: "Seller Monthly",
      amountKobo: env.sellerMonthlyFeeKobo,
      amount: env.sellerMonthlyFeeKobo / 100,
      status: lifecycle.status,
      startsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextRenewalAt: null,
      gracePeriodEndsAt: null,
      renewalOpensAt: null,
      lastPaymentAt: null,
      lastPaymentReference: "",
      isActive: false,
      isExpired: true,
      isGracePeriod: false,
      canRenew: true,
      canUseSellerTools: false,
      billingCycleDays: SELLER_SUBSCRIPTION_DAYS,
      graceDays: SELLER_SUBSCRIPTION_GRACE_DAYS,
    };
  }

  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id || null,
    planName: row.plan_name,
    amountKobo: row.amount_kobo,
    amount: row.amount_kobo / 100,
    status: lifecycle.status,
    databaseStatus: lifecycle.databaseStatus,
    startsAt: row.starts_at || null,
    currentPeriodStart: row.current_period_start || null,
    currentPeriodEnd: row.current_period_end || null,
    nextRenewalAt: row.next_renewal_at || null,
    gracePeriodEndsAt: lifecycle.gracePeriodEndsAt,
    renewalOpensAt: lifecycle.renewalOpensAt,
    lastPaymentAt: row.last_payment_at || null,
    lastPaymentReference: row.last_payment_reference || "",
    isActive: lifecycle.isActive,
    isExpired: lifecycle.isExpired,
    isGracePeriod: lifecycle.isGracePeriod,
    canRenew: lifecycle.canRenew,
    canUseSellerTools: lifecycle.canUseSellerTools,
    billingCycleDays: SELLER_SUBSCRIPTION_DAYS,
    graceDays: SELLER_SUBSCRIPTION_GRACE_DAYS,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getSellerSubscription(userId) {
  const row = syncDatabaseStatus(
    db.prepare("SELECT * FROM seller_subscriptions WHERE user_id = ?").get(userId),
  );
  return serializeSubscription(row);
}

export function ensureSellerSubscription(userId) {
  const store = findStoreByOwnerId(userId);
  const existing = db.prepare("SELECT * FROM seller_subscriptions WHERE user_id = ?").get(userId);

  if (existing) {
    const synced = syncDatabaseStatus(existing);
    const nextStoreId = store?.id || synced.store_id || null;

    if (Number(synced.amount_kobo || 0) !== env.sellerMonthlyFeeKobo || synced.store_id !== nextStoreId) {
      db.prepare(`
        UPDATE seller_subscriptions
        SET amount_kobo = ?, store_id = ?, updated_at = ?
        WHERE id = ?
      `).run(env.sellerMonthlyFeeKobo, nextStoreId, nowIso(), synced.id);
      return getSellerSubscription(userId);
    }

    return serializeSubscription(synced);
  }

  const now = new Date();
  const id = createId("sub");
  const active = env.autoActivateSellerSubscription;
  const periodEnd = active ? addDays(now, SELLER_SUBSCRIPTION_DAYS) : null;
  const graceEnd = periodEnd ? addDays(periodEnd, SELLER_SUBSCRIPTION_GRACE_DAYS) : null;

  db.prepare(`
    INSERT INTO seller_subscriptions (
      id, user_id, store_id, plan_name, amount_kobo, status, starts_at,
      current_period_start, current_period_end, next_renewal_at,
      grace_period_ends_at, last_payment_at, last_payment_reference,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'Seller Monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    store?.id || null,
    env.sellerMonthlyFeeKobo,
    active ? "active" : "inactive",
    active ? now.toISOString() : null,
    active ? now.toISOString() : null,
    active ? periodEnd.toISOString() : null,
    active ? periodEnd.toISOString() : null,
    active ? graceEnd.toISOString() : null,
    active ? now.toISOString() : null,
    active ? "development-auto-activation" : "",
    now.toISOString(),
    now.toISOString(),
  );

  if (active) {
    db.prepare(`
      INSERT INTO seller_subscription_events (id, subscription_id, event_type, amount_kobo, note, created_at)
      VALUES (?, ?, 'activated', ?, 'Development auto-activation. Replace with real payment verification before production.', ?)
    `).run(createId("sse"), id, env.sellerMonthlyFeeKobo, now.toISOString());
  }

  return getSellerSubscription(userId);
}

export function activateSellerSubscriptionForDevelopment(userId) {
  if (env.isProduction) {
    throw new HttpError(403, "Seller subscription activation must go through payment verification in production.");
  }

  return renewSellerSubscriptionFromPayment(userId, `dev-${Date.now()}`, {
    paidAt: new Date().toISOString(),
    amountKobo: env.sellerMonthlyFeeKobo,
    note: "Development subscription renewal.",
  });
}

export function renewSellerSubscriptionFromPayment(userId, paymentReference, options = {}) {
  ensureSellerSubscription(userId);
  const row = db.prepare("SELECT * FROM seller_subscriptions WHERE user_id = ?").get(userId);
  const reference = String(paymentReference || `payment-${Date.now()}`).slice(0, 160);

  if (cleanReference(row?.last_payment_reference) === cleanReference(reference)) {
    return getSellerSubscription(userId);
  }

  const paidAt = asDate(options.paidAt) || new Date();
  const existingEnd = asDate(row.current_period_end);
  const periodStart =
    existingEnd && existingEnd.getTime() > paidAt.getTime() ? existingEnd : paidAt;
  const periodEnd = addDays(periodStart, SELLER_SUBSCRIPTION_DAYS);
  const graceEnd = addDays(periodEnd, SELLER_SUBSCRIPTION_GRACE_DAYS);
  const amountKobo = Number(options.amountKobo || env.sellerMonthlyFeeKobo);
  const now = nowIso();

  transaction(() => {
    db.prepare(`
      UPDATE seller_subscriptions
      SET status = 'active',
          starts_at = COALESCE(starts_at, ?),
          current_period_start = ?,
          current_period_end = ?,
          next_renewal_at = ?,
          grace_period_ends_at = ?,
          last_payment_at = ?,
          last_payment_reference = ?,
          amount_kobo = ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(
      paidAt.toISOString(),
      periodStart.toISOString(),
      periodEnd.toISOString(),
      periodEnd.toISOString(),
      graceEnd.toISOString(),
      paidAt.toISOString(),
      reference,
      amountKobo,
      now,
      userId,
    );

    db.prepare(`
      INSERT INTO seller_subscription_events (id, subscription_id, event_type, amount_kobo, note, created_at)
      VALUES (?, ?, 'renewed', ?, ?, ?)
    `).run(
      createId("sse"),
      row.id,
      amountKobo,
      options.note || `Seller subscription payment verified: ${reference}.`,
      now,
    );
  });

  return getSellerSubscription(userId);
}

export function assertSellerSubscriptionCanStartCheckout(userId) {
  const subscription = ensureSellerSubscription(userId);
  if (subscription.isActive && !subscription.canRenew) {
    throw new HttpError(
      409,
      "Your seller subscription is still active. Renewal opens 7 days before expiry.",
      {
        renewalOpensAt: subscription.renewalOpensAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    );
  }
  return subscription;
}

export function assertSellerSubscriptionActive(userId) {
  const subscription = ensureSellerSubscription(userId);
  if (!subscription.canUseSellerTools) {
    throw new HttpError(402, "Your seller monthly subscription is inactive. Renew the ₦1,999 monthly fee before publishing new listings.");
  }
  return subscription;
}
