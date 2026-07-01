import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { ensureSellerSubscription } from "./subscription.service.js";

const SUPPORTED_PURPOSES = new Set([
  "store_order",
  "used_order",
  "seller_subscription",
]);

const PAYSTACK_SUCCESS_STATUS = "success";

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => clean(value, 180)).filter(Boolean))];
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function generateReference(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function localAuthorizationUrl(paymentReference) {
  return `${env.frontendUrl}/payment/callback?reference=${encodeURIComponent(
    paymentReference,
  )}&provider=local`;
}

function ensurePaymentTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'local',
      purpose TEXT NOT NULL CHECK (purpose IN ('store_order', 'used_order', 'seller_subscription')),
      order_id TEXT,
      used_order_id TEXT,
      subscription_id TEXT,
      user_id TEXT NOT NULL,
      amount_kobo INTEGER NOT NULL CHECK (amount_kobo >= 0),
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'initialized',
      authorization_url TEXT NOT NULL DEFAULT '',
      access_code TEXT NOT NULL DEFAULT '',
      provider_reference TEXT NOT NULL DEFAULT '',
      provider_status TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      provider_response TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      verified_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS payment_transactions_user_id_idx
      ON payment_transactions(user_id);

    CREATE INDEX IF NOT EXISTS payment_transactions_reference_idx
      ON payment_transactions(reference);

    CREATE INDEX IF NOT EXISTS payment_transactions_order_id_idx
      ON payment_transactions(order_id);

    CREATE INDEX IF NOT EXISTS payment_transactions_used_order_id_idx
      ON payment_transactions(used_order_id);

    CREATE INDEX IF NOT EXISTS payment_transactions_subscription_id_idx
      ON payment_transactions(subscription_id);
  `);

  ensurePaymentColumn("access_code", "TEXT NOT NULL DEFAULT ''");
  ensurePaymentColumn("provider_status", "TEXT NOT NULL DEFAULT ''");
  ensurePaymentColumn("provider_response", "TEXT NOT NULL DEFAULT '{}'");
  ensurePaymentColumn("verified_at", "TEXT");
}

function ensurePaymentColumn(column, definition) {
  const columns = db.prepare("PRAGMA table_info(payment_transactions)").all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE payment_transactions ADD COLUMN ${column} ${definition}`);
  }
}

ensurePaymentTable();

function serializePayment(row) {
  if (!row) return null;

  const metadata = parseJson(row.metadata, {});

  return {
    id: row.id,
    reference: row.reference,
    provider: row.provider,
    purpose: row.purpose,
    orderId: row.order_id || null,
    orderIds: Array.isArray(metadata.orderIds)
      ? metadata.orderIds
      : row.order_id
        ? [row.order_id]
        : [],
    usedOrderId: row.used_order_id || null,
    subscriptionId: row.subscription_id || null,
    userId: row.user_id,
    amountKobo: row.amount_kobo,
    amount: row.amount_kobo / 100,
    currency: row.currency,
    status: row.status,
    authorizationUrl: row.authorization_url,
    accessCode: row.access_code || "",
    providerReference: row.provider_reference || "",
    providerStatus: row.provider_status || "",
    redirectPath: metadata.redirectPath || redirectPathForPayment(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at || null,
  };
}

function findPaymentByReference(paymentReference) {
  return db
    .prepare("SELECT * FROM payment_transactions WHERE reference = ?")
    .get(paymentReference);
}

function getUser(userId) {
  const user = db
    .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
    .get(userId);

  if (!user) {
    throw new HttpError(404, "User account was not found.");
  }

  return user;
}

function requirePaystackSecret() {
  if (!env.paystackSecretKey) {
    throw new HttpError(
      500,
      "Paystack secret key is not configured. Add PAYSTACK_SECRET_KEY to Backend/.env.",
    );
  }

  if (!env.isProduction && !env.paystackSecretKey.startsWith("sk_test_")) {
    throw new HttpError(
      500,
      "Use your Paystack test secret key locally. It should start with sk_test_.",
    );
  }
}

async function paystackRequest(path, options = {}) {
  requirePaystackSecret();

  const response = await fetch(`${env.paystackBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.paystackSecretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

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

async function initializeWithPaystack({ user, reference, amountKobo, purpose, metadata }) {
  const result = await paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      amount: String(amountKobo),
      currency: "NGN",
      reference,
      callback_url: env.paystackCallbackUrl,
      metadata: {
        app: "gleank",
        userId: user.id,
        userName: user.name,
        purpose,
        ...metadata,
      },
    }),
  });

  if (!result?.data?.authorization_url || !result?.data?.access_code) {
    throw new HttpError(502, "Paystack did not return a checkout link.");
  }

  return {
    authorizationUrl: result.data.authorization_url,
    accessCode: result.data.access_code,
    providerReference: result.data.reference || reference,
    providerResponse: result,
  };
}

function paymentPrefix(purpose) {
  if (purpose === "used_order") return "GUM-PAY";
  if (purpose === "seller_subscription") return "GLK-SUB";
  return "GLK-PAY";
}

function normalizeInput(input) {
  const purpose = clean(input?.purpose, 80);

  if (!SUPPORTED_PURPOSES.has(purpose)) {
    throw new HttpError(422, "Payment purpose is not supported.");
  }

  const targetIds = uniqueStrings(
    Array.isArray(input?.targetIds)
      ? input.targetIds
      : [input?.targetId || input?.orderId || input?.usedOrderId],
  );

  if (purpose !== "seller_subscription" && targetIds.length === 0) {
    throw new HttpError(422, "Payment target is required.");
  }

  return { purpose, targetIds };
}

function getStoreOrdersForPayment(userId, targetIds) {
  const placeholders = targetIds.map(() => "?").join(",");
  const orders = db
    .prepare(
      `
        SELECT * FROM orders
        WHERE id IN (${placeholders})
          AND buyer_id = ?
      `,
    )
    .all(...targetIds, userId);

  if (orders.length !== targetIds.length) {
    throw new HttpError(404, "One or more orders were not found.");
  }

  const invalid = orders.find(
    (order) => order.status !== "pending_payment" || order.payment_status === "paid",
  );

  if (invalid) {
    throw new HttpError(422, "One or more orders are not awaiting payment.");
  }

  return orders;
}

function getUsedOrderForPayment(userId, orderId) {
  const order = db
    .prepare(
      `
        SELECT * FROM used_market_orders
        WHERE id = ? AND buyer_id = ?
      `,
    )
    .get(orderId, userId);

  if (!order) {
    throw new HttpError(404, "Used Market order was not found.");
  }

  if (order.status !== "pending_payment" || order.payment_status === "paid") {
    throw new HttpError(422, "This protected order is not awaiting payment.");
  }

  return order;
}

function getSubscriptionForPayment(userId) {
  const user = getUser(userId);

  if (user.role !== "seller" && user.role !== "admin") {
    throw new HttpError(403, "Only seller accounts can pay seller subscription.");
  }

  const subscription = ensureSellerSubscription(userId);

  return {
    id: subscription.id || null,
    amountKobo: subscription.amountKobo || env.sellerMonthlyFeeKobo,
  };
}

function savePayment({
  reference,
  provider,
  purpose,
  orderId,
  usedOrderId,
  subscriptionId,
  userId,
  amountKobo,
  authorizationUrl,
  accessCode,
  providerReference,
  providerStatus,
  metadata,
  providerResponse,
}) {
  const now = nowIso();

  db.prepare(
    `
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
        access_code,
        provider_reference,
        provider_status,
        metadata,
        provider_response,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NGN', 'initialized', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    createId("pay"),
    reference,
    provider,
    purpose,
    orderId || null,
    usedOrderId || null,
    subscriptionId || null,
    userId,
    amountKobo,
    authorizationUrl,
    accessCode || "",
    providerReference || "",
    providerStatus || "",
    JSON.stringify(metadata || {}),
    JSON.stringify(providerResponse || {}),
    now,
    now,
  );

  return findPaymentByReference(reference);
}

export async function initializePayment(userId, input) {
  const { purpose, targetIds } = normalizeInput(input);
  const user = getUser(userId);

  let amountKobo = 0;
  let orderId = null;
  let usedOrderId = null;
  let subscriptionId = null;
  let metadata = {};

  if (purpose === "store_order") {
    const orders = getStoreOrdersForPayment(userId, targetIds);
    amountKobo = orders.reduce((total, order) => total + order.total_kobo, 0);
    orderId = orders[0]?.id || null;
    metadata = {
      orderIds: orders.map((order) => order.id),
      orderCodes: orders.map((order) => order.order_code),
      redirectPath: `/order-success?ref=${encodeURIComponent(
        orders.map((order) => order.order_code).join(","),
      )}`,
    };
  }

  if (purpose === "used_order") {
    const order = getUsedOrderForPayment(userId, targetIds[0]);
    amountKobo = order.total_kobo;
    usedOrderId = order.id;
    metadata = {
      usedOrderId: order.id,
      orderCode: order.order_code,
      listingId: order.listing_id,
      redirectPath: `/used-orders/${order.id}`,
    };
  }

  if (purpose === "seller_subscription") {
    const subscription = getSubscriptionForPayment(userId);
    amountKobo = subscription.amountKobo;
    subscriptionId = subscription.id;
    metadata = {
      subscriptionId,
      planName: "Campus Seller Monthly",
      redirectPath: "/seller-subscription",
    };
  }

  if (amountKobo <= 0) {
    throw new HttpError(422, "Payment amount must be greater than zero.");
  }

  const provider = env.paymentProvider === "paystack" ? "paystack" : "local";
  const reference = generateReference(paymentPrefix(purpose));

  let initialized = {
    authorizationUrl: localAuthorizationUrl(reference),
    accessCode: "",
    providerReference: provider === "local" ? reference : "",
    providerStatus: "initialized",
    providerResponse: {},
  };

  if (provider === "paystack") {
    initialized = await initializeWithPaystack({
      user,
      reference,
      amountKobo,
      purpose,
      metadata,
    });
  }

  const row = savePayment({
    reference,
    provider,
    purpose,
    orderId,
    usedOrderId,
    subscriptionId,
    userId,
    amountKobo,
    authorizationUrl: initialized.authorizationUrl,
    accessCode: initialized.accessCode,
    providerReference: initialized.providerReference,
    providerStatus: initialized.providerStatus,
    metadata,
    providerResponse: initialized.providerResponse,
  });

  return serializePayment(row);
}

function paymentOrderIds(row) {
  const metadata = parseJson(row.metadata, {});
  if (Array.isArray(metadata.orderIds)) {
    return uniqueStrings(metadata.orderIds);
  }
  return row.order_id ? [row.order_id] : [];
}

function redirectPathForPayment(row) {
  const metadata = parseJson(row.metadata, {});

  if (metadata.redirectPath) {
    return metadata.redirectPath;
  }

  if (row.purpose === "store_order") {
    const orderIds = paymentOrderIds(row);
    if (orderIds.length === 0) return "/orders";

    const placeholders = orderIds.map(() => "?").join(",");
    const orders = db
      .prepare(`SELECT order_code FROM orders WHERE id IN (${placeholders})`)
      .all(...orderIds);

    const refs = orders.map((order) => order.order_code).join(",");
    return refs ? `/order-success?ref=${encodeURIComponent(refs)}` : "/orders";
  }

  if (row.purpose === "used_order") {
    return row.used_order_id ? `/used-orders/${row.used_order_id}` : "/used-market";
  }

  if (row.purpose === "seller_subscription") {
    return "/seller-subscription";
  }

  return "/orders";
}

function insertStoreOrderEvent(orderId, note) {
  db.prepare(
    `
      INSERT INTO order_events (id, order_id, status, label, note, created_at)
      VALUES (?, ?, 'paid', 'Payment confirmed', ?, ?)
    `,
  ).run(createId("evt"), orderId, note, nowIso());
}

function insertUsedOrderEvent(orderId, note) {
  db.prepare(
    `
      INSERT INTO used_market_order_events (id, order_id, status, label, note, created_at)
      VALUES (?, ?, 'paid', 'Payment recorded', ?, ?)
    `,
  ).run(createId("uev"), orderId, note, nowIso());
}

function applyStoreOrderPayment(row) {
  const orderIds = paymentOrderIds(row);
  const now = nowIso();

  for (const orderId of orderIds) {
    const order = db
      .prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ?")
      .get(orderId, row.user_id);

    if (!order || order.payment_status === "paid") continue;

    db.prepare(
      `
        UPDATE orders
        SET status = 'paid',
            payment_status = 'paid',
            updated_at = ?
        WHERE id = ?
      `,
    ).run(now, order.id);

    insertStoreOrderEvent(
      order.id,
      `Payment verified through ${row.provider}. Reference: ${row.reference}`,
    );
  }
}

function applyUsedOrderPayment(row) {
  const now = nowIso();
  const order = db
    .prepare("SELECT * FROM used_market_orders WHERE id = ? AND buyer_id = ?")
    .get(row.used_order_id, row.user_id);

  if (!order) {
    throw new HttpError(404, "Used Market order was not found.");
  }

  if (order.payment_status === "paid") return;

  db.prepare(
    `
      UPDATE used_market_orders
      SET status = 'paid',
          payment_status = 'paid',
          updated_at = ?
      WHERE id = ?
    `,
  ).run(now, order.id);

  db.prepare(
    "UPDATE used_listings SET status = 'sold', updated_at = ? WHERE id = ?",
  ).run(now, order.listing_id);

  insertUsedOrderEvent(
    order.id,
    `Protected payment verified through ${row.provider}. Reference: ${row.reference}`,
  );
}

function applySellerSubscriptionPayment(row) {
  ensureSellerSubscription(row.user_id);

  const subscription = db
    .prepare("SELECT * FROM seller_subscriptions WHERE user_id = ?")
    .get(row.user_id);

  if (!subscription) {
    throw new HttpError(404, "Seller subscription was not found.");
  }

  const now = new Date();
  const currentEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const periodStart = currentEnd && currentEnd > now ? currentEnd : now;
  const periodEnd = addDays(periodStart, 30);
  const currentTime = now.toISOString();

  db.prepare(
    `
      UPDATE seller_subscriptions
      SET status = 'active',
          starts_at = COALESCE(starts_at, ?),
          current_period_start = ?,
          current_period_end = ?,
          next_renewal_at = ?,
          last_payment_reference = ?,
          amount_kobo = ?,
          updated_at = ?
      WHERE user_id = ?
    `,
  ).run(
    currentTime,
    periodStart.toISOString(),
    periodEnd.toISOString(),
    periodEnd.toISOString(),
    row.reference,
    row.amount_kobo,
    currentTime,
    row.user_id,
  );

  db.prepare(
    `
      INSERT INTO seller_subscription_events (
        id,
        subscription_id,
        event_type,
        amount_kobo,
        note,
        created_at
      ) VALUES (?, ?, 'renewed', ?, ?, ?)
    `,
  ).run(
    createId("sse"),
    subscription.id,
    row.amount_kobo,
    `Seller subscription payment verified through ${row.provider}. Reference: ${row.reference}`,
    currentTime,
  );
}

function applySuccessfulPayment(row) {
  if (row.purpose === "store_order") {
    applyStoreOrderPayment(row);
    return;
  }

  if (row.purpose === "used_order") {
    applyUsedOrderPayment(row);
    return;
  }

  if (row.purpose === "seller_subscription") {
    applySellerSubscriptionPayment(row);
    return;
  }

  throw new HttpError(422, "Unsupported payment purpose.");
}

function markPaymentFailed(row, providerStatus, providerResponse) {
  const now = nowIso();

  db.prepare(
    `
      UPDATE payment_transactions
      SET status = 'failed',
          provider_status = ?,
          provider_response = ?,
          updated_at = ?,
          verified_at = ?
      WHERE id = ?
    `,
  ).run(
    providerStatus || "failed",
    JSON.stringify(providerResponse || {}),
    now,
    now,
    row.id,
  );
}

function markPaymentPaid(row, providerStatus, providerResponse) {
  const now = nowIso();

  db.prepare(
    `
      UPDATE payment_transactions
      SET status = 'paid',
          provider_status = ?,
          provider_response = ?,
          provider_reference = COALESCE(NULLIF(provider_reference, ''), ?),
          updated_at = ?,
          verified_at = ?
      WHERE id = ?
    `,
  ).run(
    providerStatus || PAYSTACK_SUCCESS_STATUS,
    JSON.stringify(providerResponse || {}),
    providerResponse?.data?.reference || row.reference,
    now,
    now,
    row.id,
  );
}

async function verifyWithPaystack(row) {
  const result = await paystackRequest(
    `/transaction/verify/${encodeURIComponent(row.reference)}`,
    { method: "GET" },
  );

  const providerStatus = String(result?.data?.status || "failed");
  const paidAmount = Number(result?.data?.amount || 0);

  if (paidAmount !== row.amount_kobo) {
    markPaymentFailed(row, "amount_mismatch", result);
    throw new HttpError(
      422,
      "Payment amount mismatch. Please contact Gleank support.",
    );
  }

  if (providerStatus !== PAYSTACK_SUCCESS_STATUS) {
    markPaymentFailed(row, providerStatus, result);
    return {
      ok: false,
      providerStatus,
      providerResponse: result,
    };
  }

  return {
    ok: true,
    providerStatus,
    providerResponse: result,
  };
}

function verifyLocalPayment(row) {
  if (env.isProduction) {
    throw new HttpError(403, "Local payment verification is disabled in production.");
  }

  return {
    ok: true,
    providerStatus: "local_success",
    providerResponse: {
      status: true,
      message: "Local development payment verified.",
      data: {
        reference: row.reference,
        amount: row.amount_kobo,
        status: "success",
      },
    },
  };
}

export async function verifyPayment(userId, paymentReference) {
  const reference = clean(paymentReference, 200);

  if (!reference) {
    throw new HttpError(422, "Payment reference is required.");
  }

  const row = findPaymentByReference(reference);

  if (!row) {
    throw new HttpError(404, "Payment reference was not found.");
  }

  if (row.user_id !== userId) {
    throw new HttpError(403, "This payment does not belong to your account.");
  }

  if (row.status === "paid") {
    return serializePayment(row);
  }

  const verification =
    row.provider === "paystack"
      ? await verifyWithPaystack(row)
      : verifyLocalPayment(row);

  if (!verification.ok) {
    return serializePayment(findPaymentByReference(reference));
  }

  transaction(() => {
    applySuccessfulPayment(row);
    markPaymentPaid(row, verification.providerStatus, verification.providerResponse);
  });

  return serializePayment(findPaymentByReference(reference));
}
