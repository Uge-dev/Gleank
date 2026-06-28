import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { findStoreByOwnerId } from "../repositories/store.repository.js";

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

export function serializeSubscription(row) {
  if (!row) {
    return {
      id: "",
      planName: "Campus Seller Monthly",
      amountKobo: env.sellerMonthlyFeeKobo,
      amount: env.sellerMonthlyFeeKobo / 100,
      status: "inactive",
      startsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextRenewalAt: null,
      isActive: false,
      isExpired: true,
    };
  }

  const activeUntil = row.current_period_end ? new Date(row.current_period_end).getTime() : 0;
  const isActive = row.status === "active" && activeUntil > Date.now();

  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id || null,
    planName: row.plan_name,
    amountKobo: row.amount_kobo,
    amount: row.amount_kobo / 100,
    status: isActive ? "active" : row.status === "active" ? "expired" : row.status,
    startsAt: row.starts_at || null,
    currentPeriodStart: row.current_period_start || null,
    currentPeriodEnd: row.current_period_end || null,
    nextRenewalAt: row.next_renewal_at || null,
    lastPaymentReference: row.last_payment_reference || "",
    isActive,
    isExpired: !isActive,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getSellerSubscription(userId) {
  const row = db.prepare("SELECT * FROM seller_subscriptions WHERE user_id = ?").get(userId);
  return serializeSubscription(row);
}

export function ensureSellerSubscription(userId) {
  const store = findStoreByOwnerId(userId);
  const existing = db.prepare("SELECT * FROM seller_subscriptions WHERE user_id = ?").get(userId);
  if (existing) return serializeSubscription(existing);

  const now = new Date();
  const id = createId("sub");
  const active = env.autoActivateSellerSubscription;
  const periodEnd = active ? addDays(now, 30) : null;

  db.prepare(`
    INSERT INTO seller_subscriptions (
      id, user_id, store_id, plan_name, amount_kobo, status, starts_at,
      current_period_start, current_period_end, next_renewal_at,
      last_payment_reference, created_at, updated_at
    ) VALUES (?, ?, ?, 'Campus Seller Monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  ensureSellerSubscription(userId);
  const row = db.prepare("SELECT * FROM seller_subscriptions WHERE user_id = ?").get(userId);
  const now = new Date();
  const periodEnd = addDays(now, 30);

  transaction(() => {
    db.prepare(`
      UPDATE seller_subscriptions
      SET status = 'active', starts_at = COALESCE(starts_at, ?),
          current_period_start = ?, current_period_end = ?, next_renewal_at = ?,
          last_payment_reference = ?, amount_kobo = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      now.toISOString(),
      now.toISOString(),
      periodEnd.toISOString(),
      periodEnd.toISOString(),
      `dev-${Date.now()}`,
      env.sellerMonthlyFeeKobo,
      now.toISOString(),
      userId,
    );

    db.prepare(`
      INSERT INTO seller_subscription_events (id, subscription_id, event_type, amount_kobo, note, created_at)
      VALUES (?, ?, 'renewed', ?, 'Development subscription renewal.', ?)
    `).run(createId("sse"), row.id, env.sellerMonthlyFeeKobo, now.toISOString());
  });

  return getSellerSubscription(userId);
}

export function assertSellerSubscriptionActive(userId) {
  const subscription = ensureSellerSubscription(userId);
  if (!subscription.isActive) {
    throw new HttpError(402, "Your seller monthly subscription is inactive. Renew the ₦3,000 monthly fee before publishing new listings.");
  }
  return subscription;
}
