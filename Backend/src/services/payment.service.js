import { applyTransfer } from './settlement.service.js';
import crypto from "node:crypto";
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import {
  assertSellerSubscriptionCanStartCheckout,
  renewSellerSubscriptionFromPayment,
} from "./subscription.service.js";
import {
  ensurePayoutForStoreOrder,
  ensurePayoutForUsedOrder,
} from "./payout.service.js";
import { syncOrderReadinessForDispatch } from "./logistics.service.js";

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function nowIso() {
  return new Date().toISOString();
}

function reference(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function parseMetadata(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function stringifyMetadata(row, patch = {}) {
  return JSON.stringify({
    ...parseMetadata(row?.metadata),
    ...patch,
  });
}

function parseProviderMetadata(data = {}) {
  const metadata = data?.metadata;

  if (!metadata) return {};

  if (typeof metadata === "string") {
    return parseMetadata(metadata);
  }

  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata;
  }

  return {};
}

function expectedTargetIdForPayment(row) {
  if (row.purpose === "store_order") return row.order_id || "";
  if (row.purpose === "used_order") return row.used_order_id || "";
  if (row.purpose === "seller_subscription") {
    return row.subscription_id || row.user_id || "";
  }
  return "";
}

function assertPaystackTransactionMatches(row, data = {}) {
  const metadata = parseProviderMetadata(data);
  const paidAmountKobo = Number(data.amount || 0);
  const currency = String(data.currency || "NGN").toUpperCase();
  const expectedTargetId = expectedTargetIdForPayment(row);
  const mismatches = [];

  if (String(data.reference || "") !== String(row.reference)) {
    mismatches.push("reference");
  }

  if (paidAmountKobo !== Number(row.amount_kobo)) {
    mismatches.push("amount");
  }

  if (currency !== String(row.currency || "NGN").toUpperCase()) {
    mismatches.push("currency");
  }

  if (String(metadata.app || "") !== "gleenc") {
    mismatches.push("app metadata");
  }

  if (String(metadata.purpose || "") !== String(row.purpose || "")) {
    mismatches.push("purpose metadata");
  }

  if (String(metadata.userId || "") !== String(row.user_id || "")) {
    mismatches.push("user metadata");
  }

  if (expectedTargetId && String(metadata.targetId || "") !== String(expectedTargetId)) {
    mismatches.push("target metadata");
  }

  if (mismatches.length) {
    throw new HttpError(
      422,
      `Payment verification mismatch (${mismatches.join(", ")}). Please contact support.`,
    );
  }
}

function getPaymentRedirectPath(row) {
  if (!row) return "/orders";

  if (row.purpose === "used_order" && row.used_order_id) {
    return `/used-orders/${row.used_order_id}`;
  }

  if (row.purpose === "seller_subscription") {
    return "/seller/onboarding";
  }

  if (row.purpose === "store_order" && row.order_id) {
    return `/orders/${row.order_id}`;
  }

  return "/orders";
}

function getPaymentSuccessPath(row) {
  if (!row) return "/orders";

  const referenceParam = encodeURIComponent(row.reference || "");

  if (row.purpose === "store_order") {
    return `/order-success?paymentRef=${referenceParam}`;
  }

  if (row.purpose === "used_order" && row.used_order_id) {
    return `/used-orders/${row.used_order_id}?paymentRef=${referenceParam}`;
  }

  if (row.purpose === "seller_subscription") {
    return `/seller/onboarding?paymentRef=${referenceParam}`;
  }

  return getPaymentRedirectPath(row);
}

function getStoreOrderPaymentSummary(row) {
  if (!row?.order_id) return null;

  const order = db
    .prepare(`
      SELECT orders.id, orders.order_code, orders.status, orders.payment_status,
             orders.total_kobo, orders.created_at, stores.name AS store_name
      FROM orders
      JOIN stores ON stores.id = orders.store_id
      WHERE orders.id = ? AND orders.buyer_id = ?
    `)
    .get(row.order_id, row.user_id);

  if (!order) return null;

  const items = db
    .prepare(`
      SELECT product_id, product_name, product_image_url, quantity, total_kobo
      FROM order_items
      WHERE order_id = ?
      ORDER BY created_at ASC
    `)
    .all(order.id)
    .map((item) => ({
      productId: item.product_id || "",
      name: item.product_name || "",
      imageUrl: item.product_image_url || null,
      quantity: Number(item.quantity || 0),
      totalKobo: Number(item.total_kobo || 0),
      total: Number(item.total_kobo || 0) / 100,
    }));

  return {
    type: "store_order",
    orderId: order.id,
    orderCode: order.order_code,
    status: order.status,
    paymentStatus: order.payment_status,
    storeName: order.store_name || "",
    totalKobo: Number(order.total_kobo || 0),
    total: Number(order.total_kobo || 0) / 100,
    createdAt: order.created_at,
    items,
  };
}

function getUsedOrderPaymentSummary(row) {
  if (!row?.used_order_id) return null;

  const order = db
    .prepare(`
      SELECT used_market_orders.id, used_market_orders.order_code,
             used_market_orders.status, used_market_orders.payment_status,
             used_market_orders.total_kobo, used_market_orders.created_at,
             used_listings.name AS listing_name,
             used_listings.image_urls AS listing_image_urls
      FROM used_market_orders
      JOIN used_listings ON used_listings.id = used_market_orders.listing_id
      WHERE used_market_orders.id = ? AND used_market_orders.buyer_id = ?
    `)
    .get(row.used_order_id, row.user_id);

  if (!order) return null;

  let imageUrl = null;
  try {
    const images = JSON.parse(order.listing_image_urls || "[]");
    imageUrl = Array.isArray(images) ? images[0] || null : null;
  } catch {
    imageUrl = null;
  }

  return {
    type: "used_order",
    orderId: order.id,
    orderCode: order.order_code,
    status: order.status,
    paymentStatus: order.payment_status,
    listingName: order.listing_name || "",
    totalKobo: Number(order.total_kobo || 0),
    total: Number(order.total_kobo || 0) / 100,
    createdAt: order.created_at,
    items: [
      {
        name: order.listing_name || "",
        imageUrl,
        quantity: 1,
        totalKobo: Number(order.total_kobo || 0),
        total: Number(order.total_kobo || 0) / 100,
      },
    ],
  };
}

function getPaymentSummary(row) {
  if (row?.purpose === "store_order") return getStoreOrderPaymentSummary(row);
  if (row?.purpose === "used_order") return getUsedOrderPaymentSummary(row);
  if (row?.purpose === "seller_subscription") {
    return {
      type: "seller_subscription",
      status: row.status,
      totalKobo: Number(row.amount_kobo || 0),
      total: Number(row.amount_kobo || 0) / 100,
      createdAt: row.created_at,
    };
  }
  return null;
}

function serializePayment(row, options = {}) {
  if (!row) return null;

  const metadata = parseMetadata(row.metadata);
  const payment = {
    id: row.id,
    reference: row.reference,
    provider: row.provider,
    purpose: row.purpose,
    orderId: row.order_id || null,
    usedOrderId: row.used_order_id || null,
    subscriptionId: row.subscription_id || null,
    amountKobo: row.amount_kobo,
    amount: row.amount_kobo / 100,
    currency: row.currency,
    status: row.status,
    authorizationUrl: options.publicView ? "" : row.authorization_url,
    providerReference: options.publicView ? "" : row.provider_reference || "",
    providerStatus: metadata.providerStatus || "",
    redirectPath: getPaymentRedirectPath(row),
    successPath: getPaymentSuccessPath(row),
    summary: options.includeSummary ? getPaymentSummary(row) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (!options.publicView) {
    payment.userId = row.user_id;
  }

  return payment;
}

function findPaymentByReference(paymentReference) {
  return db
    .prepare("SELECT * FROM payment_transactions WHERE reference = ?")
    .get(paymentReference);
}

function findUser(userId) {
  const user = db
    .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
    .get(userId);

  if (!user) {
    throw new HttpError(404, "User account was not found.");
  }

  if (!user.email) {
    throw new HttpError(422, "Your account email is required before payment.");
  }

  return user;
}

function findStoreForSeller(userId) {
  return db
    .prepare("SELECT id, name, slug FROM stores WHERE owner_id = ?")
    .get(userId);
}

function findRecentPendingSellerSubscriptionPayment(userId) {
  const cutoff = new Date(Date.now() - 45 * 60 * 1_000).toISOString();
  return db
    .prepare(`
      SELECT *
      FROM payment_transactions
      WHERE user_id = ?
        AND purpose = 'seller_subscription'
        AND status = 'initialized'
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(userId, cutoff);
}

function createLocalAuthorizationUrl(paymentReference) {
  return `${env.frontendUrl}/payment/callback?reference=${encodeURIComponent(paymentReference)}`;
}

function requirePaystackConfig() {
  if (!env.paystackSecretKey) {
    throw new HttpError(500, "Paystack secret key is not configured.");
  }

  if (env.paystackMode === "test") {
    if (!env.paystackSecretKey.startsWith("sk_test_")) {
      throw new HttpError(
        500,
        "PAYSTACK_MODE=test requires a Paystack test secret key that starts with sk_test_.",
      );
    }
    if (env.isProduction && !env.allowPaystackTestKeysInProduction) {
      throw new HttpError(
        500,
        "Production Paystack test mode requires ALLOW_PAYSTACK_TEST_KEYS_IN_PRODUCTION=true.",
      );
    }
    return;
  }

  if (env.paystackMode === "live") {
    if (!env.paystackSecretKey.startsWith("sk_live_")) {
      throw new HttpError(
        500,
        "PAYSTACK_MODE=live requires a Paystack live secret key that starts with sk_live_.",
      );
    }
    return;
  }

  if (
    env.isProduction &&
    !env.paystackSecretKey.startsWith("sk_live_") &&
    !(
      env.allowPaystackTestKeysInProduction &&
      env.paystackSecretKey.startsWith("sk_test_")
    )
  ) {
    throw new HttpError(
      500,
      "Production Paystack payments must use a live secret key, or set PAYSTACK_MODE=test while testing with sk_test_ keys.",
    );
  }

  if (
    !env.isProduction &&
    !env.paystackSecretKey.startsWith("sk_test_") &&
    !env.paystackSecretKey.startsWith("sk_live_")
  ) {
    throw new HttpError(
      500,
      "Paystack secret key must start with sk_test_ or sk_live_.",
    );
  }
}

async function paystackRequest(path, options = {}) {
  requirePaystackConfig();

  let response;

  try {
    response = await fetch(`${env.paystackBaseUrl || "https://api.paystack.co"}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${env.paystackSecretKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new HttpError(
      502,
      "Payment checkout could not be started because Paystack could not be reached. Please try again shortly.",
      {
        provider: "paystack",
        reason: error?.code || error?.name || "network_error",
      },
    );
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.status === false) {
    throw new HttpError(
      response.status || 502,
      body.message || "Paystack request failed.",
      body,
    );
  }

  return body;
}

function getPaystackCallbackUrl() {
  return (
    env.paystackCallbackUrl ||
    `${env.frontendUrl || "http://localhost:5173"}/payment/callback`
  );
}

async function initializeWithPaystack({
  user,
  paymentReference,
  amountKobo,
  purpose,
  targetId,
}) {
  const response = await paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      amount: String(amountKobo),
      currency: "NGN",
      reference: paymentReference,
      callback_url: getPaystackCallbackUrl(),
      metadata: {
        app: "gleenc",
        purpose,
        targetId,
        userId: user.id,
        userName: user.name || "",
      },
    }),
  });

  if (!response?.data?.authorization_url) {
    throw new HttpError(502, "Paystack did not return a payment checkout link.");
  }

  return {
    authorizationUrl: response.data.authorization_url,
    accessCode: response.data.access_code || "",
  };
}

function insertPaymentTransaction({
  paymentReference,
  provider,
  purpose,
  orderId,
  usedOrderId,
  subscriptionId,
  userId,
  amountKobo,
  authorizationUrl,
  metadata = {},
}) {
  const now = nowIso();

  db.prepare(`
    INSERT INTO payment_transactions (
      id,
      reference,
      provider,
      purpose,
      order_id,
      used_order_id,
      subscription_id,
      user_id,
      amount_kobo,
      currency,
      status,
      authorization_url,
      provider_reference,
      metadata,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NGN', 'initialized', ?, '', ?, ?, ?)
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
    JSON.stringify(metadata),
    now,
    now,
  );
}

function getStoreOrderForPayment(userId, orderId, { payAtDelivery = false } = {}) {
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ?")
    .get(orderId, userId);

  if (!order) {
    throw new HttpError(404, "Order was not found.");
  }

  if (order.payment_status === "paid") {
    throw new HttpError(422, "This order has already been paid.");
  }

  if (order.payment_method === "pay_on_delivery" && !payAtDelivery) {
    throw new HttpError(422, "Use the Pay at Delivery payment step after the seller confirms this order.");
  }

  if (
    payAtDelivery &&
    (order.payment_method !== "pay_on_delivery" ||
      !["seller_confirmed", "ready_for_delivery", "out_for_delivery"].includes(order.status))
  ) {
    throw new HttpError(422, "Pay at Delivery can only open after seller confirmation or rider pickup.");
  }

  const payableStatuses = new Set([
    "pending_payment",
    "seller_confirmed",
    "processing",
    "ready_for_delivery",
    "out_for_delivery",
  ]);

  if (!payableStatuses.has(order.status)) {
    throw new HttpError(422, "This order is not awaiting payment.");
  }

  if (Number(order.total_kobo || 0) <= 0) {
    throw new HttpError(422, "Payment amount must be greater than zero.");
  }

  return order;
}

function getUsedOrderForPayment(userId, orderId) {
  const order = db
    .prepare("SELECT * FROM used_market_orders WHERE id = ? AND buyer_id = ?")
    .get(orderId, userId);

  if (!order) {
    throw new HttpError(404, "Used Market order was not found.");
  }

  if (order.payment_status === "paid") {
    throw new HttpError(422, "This used order has already been paid.");
  }

  if (order.status !== "pending_payment") {
    throw new HttpError(422, "This protected order is not awaiting payment.");
  }

  if (Number(order.total_kobo || 0) <= 0) {
    throw new HttpError(422, "Payment amount must be greater than zero.");
  }

  return order;
}

function insertOrderEvent(orderId, status, label, note = "") {
  db.prepare(`
    INSERT INTO order_events (id, order_id, status, label, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("evt"), orderId, status, label, note, nowIso());
}

function clearPurchasedCartLines(row) {
  if (!row?.order_id || !row?.user_id) return;

  const productIds = db
    .prepare("SELECT product_id FROM order_items WHERE order_id = ?")
    .all(row.order_id)
    .map((item) => item.product_id)
    .filter(Boolean);

  if (!productIds.length) return;

  const placeholders = productIds.map(() => "?").join(", ");

  db.prepare(`
    DELETE FROM cart_items
    WHERE user_id = ?
      AND product_id IN (${placeholders})
  `).run(row.user_id, ...productIds);
}

function insertUsedOrderEvent(orderId, status, label, note = "") {
  db.prepare(`
    INSERT INTO used_market_order_events (id, order_id, status, label, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("uev"), orderId, status, label, note, nowIso());
}

function markStoreOrderPaid(row) {
  if (!row.order_id) return;

  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ?")
    .get(row.order_id, row.user_id);

  if (!order) {
    throw new HttpError(404, "Order connected to this payment was not found.");
  }

  if (order.payment_status === "paid") {
    return;
  }

  const now = nowIso();
  const nextStatus = order.status === "pending_payment" ? "paid" : order.status;
  const nextStage4Status =
    order.payment_method === "pay_on_delivery"
      ? "pay_at_delivery_paid"
      : "paid";

  db.prepare(`
    UPDATE orders
    SET status = ?,
        payment_status = 'paid',
        stage4_payment_status = 'paid',
        stage4_status = ?,
        delivery_status = CASE
          WHEN delivery_status = 'out_for_delivery' THEN 'buyer_code_unlocked'
          ELSE delivery_status
        END,
        payout_status = 'on_hold',
        updated_at = ?
    WHERE id = ?
  `).run(nextStatus, nextStage4Status, now, order.id);

  db.prepare(`
    UPDATE rider_assignments
    SET payment_status = 'paid',
        payment_confirmed_at = COALESCE(payment_confirmed_at, ?),
        updated_at = ?
    WHERE order_type = 'store_order' AND order_id = ?
  `).run(now, now, order.id);

  insertOrderEvent(
    order.id,
    "paid",
    "Payment confirmed",
    `Paystack payment verified. Reference: ${row.reference}`,
  );
  clearPurchasedCartLines(row);
  ensurePayoutForStoreOrder(order.id);

}

function markUsedOrderPaid(row) {
  if (!row.used_order_id) return;

  const order = db
    .prepare("SELECT * FROM used_market_orders WHERE id = ? AND buyer_id = ?")
    .get(row.used_order_id, row.user_id);

  if (!order) {
    throw new HttpError(404, "Used Market order connected to this payment was not found.");
  }

  if (order.payment_status === "paid") {
    return;
  }

  const now = nowIso();

  db.prepare(`
    UPDATE used_market_orders
    SET status = 'paid',
        payment_status = 'paid',
        stage4_payment_status = 'paid',
        stage4_status = 'paid',
        payout_status = 'on_hold',
        updated_at = ?
    WHERE id = ?
  `).run(now, order.id);

  db.prepare(`
    UPDATE rider_assignments
    SET payment_status = 'paid',
        payment_confirmed_at = COALESCE(payment_confirmed_at, ?),
        updated_at = ?
    WHERE order_type = 'used_order' AND order_id = ?
  `).run(now, now, order.id);

  db.prepare(`
    UPDATE used_listings
    SET status = CASE
          WHEN COALESCE(reserved_quantity, 0) >= COALESCE(quantity, 1) THEN 'sold'
          ELSE 'active'
        END,
        updated_at = ?
    WHERE id = ?
  `).run(now, order.listing_id);

  insertUsedOrderEvent(
    order.id,
    "paid",
    "Payment recorded",
    `Paystack protected payment verified. Reference: ${row.reference}`,
  );
  ensurePayoutForUsedOrder(order.id);
}

function applySuccessfulPayment(row, providerResponse = {}) {
  if (row.purpose === "store_order") {
    markStoreOrderPaid(row);
    return;
  }

  if (row.purpose === "used_order") {
    markUsedOrderPaid(row);
    return;
  }

  if (row.purpose === "seller_subscription") {
    renewSellerSubscriptionFromPayment(row.user_id, row.reference, {
      paidAt: providerResponse?.data?.paid_at || providerResponse?.data?.paidAt || nowIso(),
      amountKobo: row.amount_kobo,
      note: `Paystack seller subscription payment verified. Reference: ${row.reference}`,
    });
    return;
  }

  throw new HttpError(422, "Payment purpose is not supported.");
}

function internalStatusFromPaystackStatus(providerStatus) {
  if (providerStatus === "success") return "paid";
  if (providerStatus === "abandoned") return "cancelled";
  if (providerStatus === "failed" || providerStatus === "reversed") return "failed";
  return "initialized";
}

function updatePaymentFromProvider(row, providerResponse, internalStatus) {
  const data = providerResponse?.data || {};
  const providerStatus = String(data.status || "");
  const providerReference = String(data.id || data.reference || row.provider_reference || "");
  const now = nowIso();

  db.prepare(`
    UPDATE payment_transactions
    SET status = ?,
        provider_reference = ?,
        metadata = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    internalStatus,
    providerReference,
    stringifyMetadata(row, {
      providerStatus,
      gatewayResponse: data.gateway_response || "",
      channel: data.channel || "",
      paidAt: data.paid_at || null,
      verifiedAt: now,
      paystackResponse: providerResponse,
    }),
    now,
    row.id,
  );
}

function recordPaymentEvent({ row = null, reference = "", eventType, providerStatus = "", payload = {} }) {
  db.prepare(`
    INSERT INTO payment_events (
      id, payment_id, reference, event_type, provider, provider_status, raw_payload, created_at
    ) VALUES (?, ?, ?, ?, 'paystack', ?, ?, ?)
  `).run(
    createId("pev"),
    row?.id || null,
    reference || row?.reference || "",
    eventType,
    providerStatus,
    JSON.stringify(payload || {}),
    nowIso(),
  );
}

function rawPayloadHash(rawBody, payload) {
  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(
        typeof rawBody === "string" && rawBody
          ? rawBody
          : JSON.stringify(payload || {}),
        "utf8",
      );

  return crypto.createHash("sha256").update(body).digest("hex");
}

function reserveWebhookEvent({ provider, eventId, reference = "", rawBody = null, payload = {} }) {
  const cleanEventId = clean(eventId, 240);

  if (!cleanEventId) {
    throw new HttpError(422, "Webhook event ID is required.");
  }

  const result = db.prepare(`
    INSERT INTO processed_webhook_events (
      id, provider, event_id, reference, payload_hash, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, event_id) DO NOTHING
  `).run(
    createId("whk"),
    provider,
    cleanEventId,
    clean(reference, 240),
    rawPayloadHash(rawBody, payload),
    nowIso(),
  );

  return result.changes === 0;
}

function verifyPaystackWebhookSignature(rawBody, signature) {
  if (!env.paystackSecretKey) return false;
  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody || ""), "utf8");
  const expected = crypto
    .createHmac("sha512", env.paystackSecretKey)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || "")));
  } catch {
    return false;
  }
}

async function verifyPaymentRow(row) {
  if (row.status === "paid") {
    return findPaymentByReference(row.reference);
  }

  if (row.provider === "local") {
    if (env.isProduction) {
      throw new HttpError(403, "Local payment verification is disabled in production.");
    }

    transaction(() => {
      applySuccessfulPayment(row, {
        data: {
          status: "success",
          paid_at: nowIso(),
        },
      });

      db.prepare(`
        UPDATE payment_transactions
        SET status = 'paid',
            provider_reference = ?,
            metadata = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        `local-verified-${Date.now()}`,
        stringifyMetadata(row, {
          providerStatus: "success",
          verifiedAt: nowIso(),
        }),
        nowIso(),
        row.id,
      );
    });

    return findPaymentByReference(row.reference);
  }

  if (row.provider !== "paystack") {
    throw new HttpError(422, "Unsupported payment provider.");
  }

  const providerResponse = await paystackRequest(
    `/transaction/verify/${encodeURIComponent(row.reference)}`,
    { method: "GET" },
  );

  const data = providerResponse?.data || {};
  const providerStatus = String(data.status || "");
  const internalStatus = internalStatusFromPaystackStatus(providerStatus);

  if (providerStatus === "success") {
    try {
      assertPaystackTransactionMatches(row, data);
    } catch (error) {
      updatePaymentFromProvider(row, providerResponse, "failed");
      throw error;
    }

    transaction(() => {
      applySuccessfulPayment(row, providerResponse);
      updatePaymentFromProvider(row, providerResponse, "paid");
    });

    return findPaymentByReference(row.reference);
  }

  updatePaymentFromProvider(row, providerResponse, internalStatus);
  return findPaymentByReference(row.reference);
}

export async function initializePayment(userId, input) {
  if(input?.purpose === "used_order") throw new HttpError(410, "Used Market is no longer available.");
  const user = findUser(userId);
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
  let prefix = "GLK-PAY";

  if (purpose === "store_order") {
    const order = getStoreOrderForPayment(userId, targetId, {
      payAtDelivery: Boolean(input?.payAtDelivery),
    });
    orderId = order.id;
    amountKobo = order.total_kobo;
    prefix = "GLK-PAY";
  }

  if (purpose === "used_order") {
    const order = getUsedOrderForPayment(userId, targetId);
    usedOrderId = order.id;
    amountKobo = order.total_kobo;
    prefix = "GUM-PAY";
  }

  if (purpose === "seller_subscription") {
    if (user.role !== "seller") {
      throw new HttpError(403, "Only seller accounts can activate seller subscriptions.");
    }

    const subscription = assertSellerSubscriptionCanStartCheckout(userId);
    const existingPending = findRecentPendingSellerSubscriptionPayment(userId);
    if (existingPending) {
      if (existingPending.provider === "paystack") {
        const checkedPayment = await verifyPaymentRow(existingPending);
        if (checkedPayment?.status === "initialized") {
          return serializePayment(checkedPayment);
        }
      } else if (!env.isProduction) {
        return serializePayment(existingPending);
      }
    }

    const store = findStoreForSeller(userId);
    subscriptionId = subscription.id || null;
    amountKobo = subscription.amountKobo || env.sellerMonthlyFeeKobo;
    prefix = "GLK-SUB";

    if (!store) {
      throw new HttpError(422, "Complete your seller profile before activating a subscription.");
    }
  }

  const paymentReference = reference(prefix);
  const provider = env.paymentProvider || "local";

  if (env.isProduction && provider !== "paystack") {
    throw new HttpError(500, "Production payments must use Paystack verification.");
  }

  let authorizationUrl = "";
  let paystackAccessCode = "";

  if (provider === "paystack") {
    const paystack = await initializeWithPaystack({
      user,
      paymentReference,
      amountKobo,
      purpose,
      targetId: targetId || subscriptionId || userId,
    });

    authorizationUrl = paystack.authorizationUrl;
    paystackAccessCode = paystack.accessCode;
  } else {
    authorizationUrl = createLocalAuthorizationUrl(paymentReference);
  }

  insertPaymentTransaction({
    paymentReference,
    provider,
    purpose,
    orderId,
    usedOrderId,
    subscriptionId,
    userId,
    amountKobo,
    authorizationUrl,
    metadata: {
      targetId: targetId || subscriptionId || userId,
      sellerId: purpose === "seller_subscription" ? user.id : "",
      sellerEmail: purpose === "seller_subscription" ? user.email : "",
      storeId: purpose === "seller_subscription" ? findStoreForSeller(userId)?.id || "" : "",
      subscriptionId: subscriptionId || "",
      expectedAmountKobo: amountKobo,
      paystackAccessCode,
      initializedAt: nowIso(),
    },
  });

  return serializePayment(findPaymentByReference(paymentReference));
}

export async function initializePayAtDeliveryPayment(userId, orderId) {
  throw new HttpError(410, "Payment on delivery has been removed. Pay at checkout.");
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ?")
    .get(clean(orderId, 160), userId);

  if (!order) throw new HttpError(404, "Order was not found.");
  if (order.payment_method !== "pay_on_delivery") {
    throw new HttpError(422, "This order was not created as Pay at Delivery.");
  }
  if (order.payment_status === "paid") {
    throw new HttpError(422, "This order has already been paid.");
  }
  if (!["seller_confirmed", "ready_for_delivery", "out_for_delivery"].includes(order.status)) {
    throw new HttpError(422, "Pay at Delivery can only open after seller confirmation/rider pickup.");
  }

  return initializePayment(userId, {
    purpose: "store_order",
    targetId: order.id,
    payAtDelivery: true,
  });
}

export async function verifyPayment(userId, paymentReference) {
  const row = findPaymentByReference(clean(paymentReference, 200));

  if (!row) {
    throw new HttpError(404, "Payment reference was not found.");
  }

  if (row.user_id !== userId) {
    throw new HttpError(403, "This payment does not belong to your account.");
  }

  if (row.purpose === "seller_subscription") {
    const user = findUser(userId);
    if (user.role !== "seller") {
      throw new HttpError(403, "Seller subscription payments require a seller account.");
    }
  }

  return serializePayment(await verifyPaymentRow(row), { includeSummary: true });
}

export async function verifyPublicPayment(paymentReference, viewerUserId = "") {
  const row = findPaymentByReference(clean(paymentReference, 200));

  if (!row) {
    throw new HttpError(404, "Payment reference was not found.");
  }

  const payment = await verifyPaymentRow(row);
  const isOwner = Boolean(viewerUserId && payment.user_id === viewerUserId);

  return serializePayment(payment, {
    publicView: true,
    includeSummary: payment.status === "paid" && isOwner,
  });
}

export async function handlePaystackWebhook({ rawBody, body, signature }) {
  const payload = body && typeof body === "object" && !Buffer.isBuffer(body)
    ? body
    : JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "{}"));

  const raw = rawBody || JSON.stringify(payload);
  if (!verifyPaystackWebhookSignature(raw, signature)) {
    throw new HttpError(401, "Invalid Paystack webhook signature.");
  }

  const eventType = String(payload?.event || "");
  if(eventType.startsWith("transfer.")) return applyTransfer(payload.data);
  const data = payload?.data || {};
  const paymentReference = clean(data.reference || payload?.reference || "", 200);
  const row = paymentReference ? findPaymentByReference(paymentReference) : null;
  const providerStatus = String(data.status || "");
  const eventId = clean(
    payload?.id ||
      payload?.event_id ||
      data?.id ||
      `${eventType || "paystack"}:${paymentReference}:${providerStatus}`,
    240,
  );

  const duplicate = reserveWebhookEvent({
    provider: "paystack",
    eventId,
    reference: paymentReference,
    rawBody,
    payload,
  });

  if (duplicate) {
    return {
      received: true,
      duplicate: true,
      payment: row ? serializePayment(row) : null,
    };
  }

  recordPaymentEvent({
    row,
    reference: paymentReference,
    eventType: eventType || "unknown",
    providerStatus,
    payload,
  });

  if (!row) {
    return { received: true, ignored: true, reason: "payment_not_found" };
  }

  if (row.status === "paid") {
    return { received: true, payment: serializePayment(row), idempotent: true };
  }

  if (eventType !== "charge.success" || providerStatus !== "success") {
    const internalStatus = internalStatusFromPaystackStatus(providerStatus);
    updatePaymentFromProvider(row, { data }, internalStatus);
    return { received: true, payment: serializePayment(findPaymentByReference(row.reference)) };
  }

  try {
    assertPaystackTransactionMatches(row, data);
  } catch (error) {
    updatePaymentFromProvider(row, { data }, "failed");
    throw error;
  }

  transaction(() => {
    applySuccessfulPayment(row, { data });
    updatePaymentFromProvider(row, { data }, "paid");
  });

  return { received: true, payment: serializePayment(findPaymentByReference(row.reference)) };
}
