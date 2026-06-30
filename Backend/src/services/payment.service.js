import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { markOrderPaidLocally } from "./order.service.js";
import { markUsedOrderPaid } from "./used-order.service.js";
import {
  ensureSellerSubscription,
  renewSellerSubscriptionFromPayment,
} from "./subscription.service.js";

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function reference(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function serializePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    provider: row.provider,
    purpose: row.purpose,
    orderId: row.order_id || null,
    usedOrderId: row.used_order_id || null,
    subscriptionId: row.subscription_id || null,
    userId: row.user_id,
    amountKobo: row.amount_kobo,
    amount: row.amount_kobo / 100,
    currency: row.currency,
    status: row.status,
    authorizationUrl: row.authorization_url,
    providerReference: row.provider_reference || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findPaymentByReference(paymentReference) {
  return db
    .prepare("SELECT * FROM payment_transactions WHERE reference = ?")
    .get(paymentReference);
}

function createLocalAuthorizationUrl(paymentReference) {
  return `${env.frontendUrl}/payments/local/${encodeURIComponent(paymentReference)}`;
}

export function initializePayment(userId, input) {
  const purpose = clean(input?.purpose, 80);
  const targetId = clean(input?.targetId || input?.orderId || input?.usedOrderId, 160);

  if (!["store_order", "used_order", "seller_subscription"].includes(purpose)) {
    throw new HttpError(422, "Payment purpose is not supported.");
  }

  if (!targetId && purpose !== "seller_subscription") {
    throw new HttpError(422, "Payment target is required.");
  }

  let amountKobo = 0;
  let orderId = null;
  let usedOrderId = null;
  let subscriptionId = null;

  if (purpose === "store_order") {
    const order = db
      .prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ?")
      .get(targetId, userId);
    if (!order) throw new HttpError(404, "Order was not found.");
    if (order.status !== "pending_payment") throw new HttpError(422, "This order is not awaiting payment.");
    orderId = order.id;
    amountKobo = order.total_kobo;
  }

  if (purpose === "used_order") {
    const order = db
      .prepare("SELECT * FROM used_market_orders WHERE id = ? AND buyer_id = ?")
      .get(targetId, userId);
    if (!order) throw new HttpError(404, "Used Market order was not found.");
    if (order.status !== "pending_payment") throw new HttpError(422, "This protected order is not awaiting payment.");
    usedOrderId = order.id;
    amountKobo = order.total_kobo;
  }

  if (purpose === "seller_subscription") {
    const subscription = ensureSellerSubscription(userId);
    subscriptionId = subscription.id || null;
    amountKobo = subscription.amountKobo || env.sellerMonthlyFeeKobo;
  }

  const now = new Date().toISOString();
  const paymentReference = reference(
    purpose === "used_order" ? "GUM-PAY" : purpose === "seller_subscription" ? "GLK-SUB" : "GLK-PAY",
  );
  const provider = env.paymentProvider || "local";
  const authorizationUrl =
    provider === "local" ? createLocalAuthorizationUrl(paymentReference) : "";

  db.prepare(`
    INSERT INTO payment_transactions (
      id, reference, provider, purpose, order_id, used_order_id, subscription_id,
      user_id, amount_kobo, currency, status, authorization_url, metadata,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NGN', 'initialized', ?, ?, ?, ?)
  `).run(
    createId("pay"),
    paymentReference,
    provider,
    purpose,
    orderId,
    usedOrderId,
    subscriptionId,
    userId,
    amountKobo,
    authorizationUrl,
    JSON.stringify({ targetId }),
    now,
    now,
  );

  return serializePayment(findPaymentByReference(paymentReference));
}

export function verifyPayment(userId, paymentReference) {
  const row = findPaymentByReference(clean(paymentReference, 200));
  if (!row) throw new HttpError(404, "Payment reference was not found.");
  if (row.user_id !== userId) throw new HttpError(403, "This payment does not belong to your account.");

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE payment_transactions
    SET status = 'paid', provider_reference = ?, updated_at = ?
    WHERE id = ?
  `).run(
    row.provider === "local" ? `local-verified-${Date.now()}` : row.provider_reference,
    now,
    row.id,
  );

  if (row.purpose === "store_order" && row.order_id) {
    markOrderPaidLocally(userId, row.order_id, row.reference);
  }

  if (row.purpose === "used_order" && row.used_order_id) {
    markUsedOrderPaid(userId, row.used_order_id, row.reference);
  }

  if (row.purpose === "seller_subscription") {
    renewSellerSubscriptionFromPayment(userId, row.reference);
  }

  return serializePayment(findPaymentByReference(row.reference));
}
