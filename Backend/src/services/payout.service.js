import { assertSettlementReady } from './fulfillment.service.js';
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createNotification } from "./notification.service.js";

const RETURN_WINDOW_DAYS = Number(process.env.RETURN_WINDOW_DAYS || 2);

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function platformFeeFromSubtotal(subtotalKobo) {
  const percent = Number(env.platformFeePercent || 5);
  return Math.round((Number(subtotalKobo || 0) * percent) / (100 + percent));
}

function insertPayoutEvent(payoutId, eventType, note = "") {
  db.prepare(`
    INSERT INTO payout_events (id, payout_id, event_type, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(createId("pev"), payoutId, eventType, clean(note, 700), nowIso());
}

function serializePayout(row) {
  if (!row) return null;

  return {
    id: row.id,
    orderId: row.order_id || null,
    usedOrderId: row.used_order_id || null,
    sellerId: row.seller_id,
    sourceType: row.source_type,
    grossAmountKobo: row.gross_amount_kobo,
    grossAmount: row.gross_amount_kobo / 100,
    platformFeeKobo: row.platform_fee_kobo,
    platformFee: row.platform_fee_kobo / 100,
    deliveryFeeKobo: row.delivery_fee_kobo,
    deliveryFee: row.delivery_fee_kobo / 100,
    sellerAmountKobo: row.seller_amount_kobo,
    sellerAmount: row.seller_amount_kobo / 100,
    status: row.status,
    holdReason: row.hold_reason || "",
    releaseAfter: row.release_after || null,
    releasedAt: row.released_at || null,
    payoutAccount: row.bank_name
      ? {
          bankName: row.bank_name,
          accountName: row.account_name || "",
          accountNumberMasked: row.account_number_masked || "",
          accountLast4: row.account_last4 || "",
          payoutVerified: Boolean(row.payout_verified),
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ensurePayoutForStoreOrder(orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new HttpError(404, "Store order was not found for payout.");

  const existing = db
    .prepare("SELECT * FROM payouts WHERE source_type = 'store_order' AND order_id = ?")
    .get(orderId);
  if (existing) return serializePayout(existing);

  const now = nowIso();
  const terms=db.prepare('SELECT * FROM order_financial_terms WHERE order_id=?').get(order.id);
  const platformFeeKobo = terms?.platform_fee_kobo ?? platformFeeFromSubtotal(order.subtotal_kobo);
  const sellerAmountKobo = terms?.seller_amount_kobo ?? Math.max(0, Number(order.subtotal_kobo || 0) + Number(order.delivery_fee_kobo || 0) - platformFeeKobo);

  db.prepare(`
    INSERT INTO payouts (
      id, order_id, used_order_id, seller_id, source_type, gross_amount_kobo,
      platform_fee_kobo, delivery_fee_kobo, seller_amount_kobo, status,
      hold_reason, release_after, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'store_order', ?, ?, ?, ?, 'on_hold', ?, NULL, ?, ?)
  `).run(
    createId("pou"),
    order.id,
    order.seller_id,
    order.subtotal_kobo,
    platformFeeKobo,
    order.delivery_fee_kobo || 0,
    sellerAmountKobo,
    "Waiting for buyer confirmation of every package.",
    now,
    now,
  );

  db.prepare("UPDATE orders SET payout_status = 'on_hold', updated_at = ? WHERE id = ?").run(now, order.id);
  const created = db.prepare("SELECT * FROM payouts WHERE source_type = 'store_order' AND order_id = ?").get(orderId);
  insertPayoutEvent(created.id, "created", "Payout hold created after platform payment.");
  return serializePayout(created);
}

export function ensurePayoutForUsedOrder(orderId) {
  const order = db.prepare("SELECT * FROM used_market_orders WHERE id = ?").get(orderId);
  if (!order) throw new HttpError(404, "Used Market order was not found for payout.");

  const existing = db
    .prepare("SELECT * FROM payouts WHERE source_type = 'used_order' AND used_order_id = ?")
    .get(orderId);
  if (existing) return serializePayout(existing);

  const now = nowIso();
  const sellerAmountKobo = Number(order.item_price_kobo || 0);

  db.prepare(`
    INSERT INTO payouts (
      id, order_id, used_order_id, seller_id, source_type, gross_amount_kobo,
      platform_fee_kobo, delivery_fee_kobo, seller_amount_kobo, status,
      hold_reason, release_after, created_at, updated_at
    ) VALUES (?, NULL, ?, ?, 'used_order', ?, ?, ?, ?, 'on_hold', ?, NULL, ?, ?)
  `).run(
    createId("pou"),
    order.id,
    order.seller_id,
    order.item_price_kobo || 0,
    order.protection_fee_kobo || 0,
    order.delivery_fee_kobo || 0,
    sellerAmountKobo,
    "Waiting for buyer confirmation of every package.",
    now,
    now,
  );

  db.prepare("UPDATE used_market_orders SET payout_status = 'on_hold', updated_at = ? WHERE id = ?").run(now, order.id);
  const created = db.prepare("SELECT * FROM payouts WHERE source_type = 'used_order' AND used_order_id = ?").get(orderId);
  insertPayoutEvent(created.id, "created", "Used Market payout hold created after protected payment.");
  return serializePayout(created);
}

export function markPayoutDeliveryVerified({ sourceType = "store_order", orderId, actorId = "", note = "" }) {
  const table = sourceType === "used_order" ? "used_market_orders" : "orders";
  const idColumn = sourceType === "used_order" ? "used_order_id" : "order_id";
  const payout = db
    .prepare(`SELECT * FROM payouts WHERE source_type = ? AND ${idColumn} = ?`)
    .get(sourceType, orderId);

  if (!payout) return null;

  const releaseAfter = addDaysIso(RETURN_WINDOW_DAYS);
  const now = nowIso();

  transaction(() => {
    db.prepare(`
      UPDATE payouts
      SET status = 'return_window',
          hold_reason = ?,
          release_after = ?,
          updated_at = ?
      WHERE id = ?
    `).run(`Delivery verified. ${RETURN_WINDOW_DAYS}-day return window is active.`, releaseAfter, now, payout.id);

    db.prepare(`
      UPDATE ${table}
      SET payout_status = 'return_window',
          return_window_ends_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(releaseAfter, now, orderId);

    insertPayoutEvent(payout.id, "delivery_verified", note || `Delivery verified by ${actorId || "system"}.`);
  });

  return serializePayout(db.prepare("SELECT * FROM payouts WHERE id = ?").get(payout.id));
}

export function listSellerPayouts(userId) {
  return db
    .prepare("SELECT * FROM payouts WHERE seller_id = ? ORDER BY created_at DESC LIMIT 120")
    .all(userId)
    .map(serializePayout);
}

export function adminListPayouts({ status = "" } = {}) {
  const params = [];
  let where = "WHERE 1 = 1";
  if (status) {
    where += " AND payouts.status = ?";
    params.push(status);
  }

  return db
    .prepare(`
      SELECT payouts.*, users.name AS seller_name, users.email AS seller_email,
             payout_accounts.bank_name, payout_accounts.account_name,
             payout_accounts.account_number_masked, payout_accounts.account_last4,
             payout_accounts.payout_verified
      FROM payouts
      JOIN users ON users.id = payouts.seller_id
      LEFT JOIN user_payout_accounts payout_accounts
        ON payout_accounts.user_id = payouts.seller_id
      ${where}
      ORDER BY payouts.created_at DESC
      LIMIT 250
    `)
    .all(...params)
    .map((row) => ({
      ...serializePayout(row),
      sellerName: row.seller_name,
      sellerEmail: row.seller_email,
    }));
}

export function adminUpdatePayout(auth, payoutId, input = {}) {
  if (!auth || auth.role !== "admin") throw new HttpError(403, "Only admins can update payouts.");
  const payout = db.prepare("SELECT * FROM payouts WHERE id = ?").get(payoutId);
  if (!payout) throw new HttpError(404, "Payout was not found.");

  if (["released", "refunded"].includes(payout.status)) throw new HttpError(409, "A settled payout cannot be reopened.");
  const transfer = db.prepare("SELECT status FROM settlement_transfers WHERE payout_id=?").get(payoutId);
  if (transfer) throw new HttpError(409, "A submitted transfer requires provider reconciliation before any payout change.");
  const action = clean(input.action || input.status, 40);
  const note = clean(input.note || "", 700);
  const now = nowIso();
  let status = payout.status;
  let releasedAt = payout.released_at || null;

  if (['release','released','eligible'].includes(action)) {
    if(payout.source_type !== 'store_order') throw new HttpError(409,'Historical payouts require reconciliation.');
    assertSettlementReady(payout.order_id);
  }
  if (action === "release" || action === "released") {
    throw new HttpError(409,'Use a verified payout transfer; a manual status change cannot release money.');

  } else if (action === "hold" || action === "blocked") {
    status = "blocked";
  } else if (action === "eligible") {
    status = "eligible";
  } else if (action === "refund" || action === "refunded") {
    throw new HttpError(409, "Refunds require provider reconciliation; a manual status change cannot refund money.");
  } else {
    throw new HttpError(422, "Choose release, hold, eligible, or refund.");
  }

  transaction(() => {
    db.prepare(`
      UPDATE payouts
      SET status = ?, hold_reason = ?, released_at = ?, updated_at = ?
      WHERE id = ?
    `).run(status, note || payout.hold_reason || "", releasedAt, now, payout.id);

    const table = payout.source_type === "used_order" ? "used_market_orders" : "orders";
    const orderId = payout.source_type === "used_order" ? payout.used_order_id : payout.order_id;
    db.prepare(`UPDATE ${table} SET payout_status = ?, updated_at = ? WHERE id = ?`).run(status, now, orderId);

    insertPayoutEvent(payout.id, status, note || `Admin changed payout to ${status}.`);
    createNotification({
      userId: payout.seller_id,
      type: "admin",
      title: "Payout status updated",
      body: note || `Your payout is now ${status}.`,
      actionLabel: "View orders",
      actionPath: "/orders",
    });
  });

  return serializePayout(db.prepare("SELECT * FROM payouts WHERE id = ?").get(payout.id));
}
