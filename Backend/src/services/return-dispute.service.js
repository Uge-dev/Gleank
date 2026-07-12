import { db, transaction } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createNotification, createNotificationForUsers } from "./notification.service.js";

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function safeJsonArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").slice(0, 10);
  }
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

function serializeReturn(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    usedOrderId: row.used_order_id || null,
    requesterId: row.requester_id,
    sellerId: row.seller_id,
    sourceType: row.source_type,
    reason: row.reason || "",
    description: row.description || "",
    evidenceUrls: safeJsonArray(row.evidence_urls),
    status: row.status,
    sellerResponse: row.seller_response || "",
    adminNote: row.admin_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeDispute(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    usedOrderId: row.used_order_id || null,
    returnRequestId: row.return_request_id || null,
    openedBy: row.opened_by,
    sellerId: row.seller_id,
    sourceType: row.source_type,
    reason: row.reason || "",
    status: row.status,
    adminDecision: row.admin_decision || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadOrderForUser(auth, sourceType, orderId) {
  const table = sourceType === "used_order" ? "used_market_orders" : "orders";
  const order = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  const userId = auth.user_id || auth.id;
  if (auth.role !== "admin" && order.buyer_id !== userId && order.seller_id !== userId) {
    throw new HttpError(403, "You do not have access to this order.");
  }
  return order;
}

function canOpenReturn(order) {
  return ["delivered", "completed"].includes(order.status) && order.payment_status === "paid";
}

function insertStoreEvent(orderId, status, label, note) {
  db.prepare(`
    INSERT INTO order_events (id, order_id, status, label, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("evt"), orderId, status, label, note, nowIso());
}

function insertUsedEvent(orderId, status, label, note) {
  db.prepare(`
    INSERT INTO used_market_order_events (id, order_id, status, label, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("uev"), orderId, status, label, note, nowIso());
}

function insertOrderEvent(sourceType, orderId, note) {
  if (sourceType === "used_order") {
    insertUsedEvent(orderId, "disputed", "Return/dispute opened", note);
    return;
  }
  insertStoreEvent(orderId, "disputed", "Return/dispute opened", note);
}

export function createReturnRequest(auth, orderId, input = {}) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  const sourceType = input.sourceType === "used_order" ? "used_order" : "store_order";
  const order = loadOrderForUser(auth, sourceType, orderId);
  const userId = auth.user_id || auth.id;

  if (order.buyer_id !== userId && auth.role !== "admin") {
    throw new HttpError(403, "Only the buyer can request a return.");
  }

  if (!canOpenReturn(order)) {
    throw new HttpError(422, "Returns can only be opened after paid delivery is confirmed.");
  }

  const existing = db
    .prepare(`
      SELECT * FROM return_requests
      WHERE source_type = ?
        AND ${sourceType === "used_order" ? "used_order_id" : "order_id"} = ?
        AND status IN ('open', 'seller_review', 'admin_review')
      LIMIT 1
    `)
    .get(sourceType, order.id);

  if (existing) return serializeReturn(existing);

  const id = createId("ret");
  const now = nowIso();
  const evidenceUrls = safeJsonArray(input.evidenceUrls || input.evidence_urls || []);

  transaction(() => {
    db.prepare(`
      INSERT INTO return_requests (
        id, order_id, used_order_id, requester_id, seller_id, source_type,
        reason, description, evidence_urls, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(
      id,
      sourceType === "store_order" ? order.id : null,
      sourceType === "used_order" ? order.id : null,
      userId,
      order.seller_id,
      sourceType,
      clean(input.reason, 180),
      clean(input.description, 1600),
      JSON.stringify(evidenceUrls),
      now,
      now,
    );

    const table = sourceType === "used_order" ? "used_market_orders" : "orders";
    db.prepare(`UPDATE ${table} SET status = 'disputed', payout_status = 'blocked', updated_at = ? WHERE id = ?`).run(now, order.id);
    db.prepare(`
      UPDATE payouts
      SET status = 'blocked', hold_reason = ?, updated_at = ?
      WHERE source_type = ?
        AND ${sourceType === "used_order" ? "used_order_id" : "order_id"} = ?
    `).run("Return request opened by buyer.", now, sourceType, order.id);

    insertOrderEvent(sourceType, order.id, clean(input.reason || "Buyer opened a return request.", 500));
    createNotification({
      userId: order.seller_id,
      type: "order",
      title: "Return request opened",
      body: clean(input.reason || "A buyer opened a return request.", 500),
      actionLabel: "Review order",
      actionPath: sourceType === "used_order" ? `/used-orders/${order.id}` : `/orders/${order.id}`,
    });
  });

  return serializeReturn(db.prepare("SELECT * FROM return_requests WHERE id = ?").get(id));
}

export function respondToReturnRequest(auth, returnId, input = {}) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  const row = db.prepare("SELECT * FROM return_requests WHERE id = ?").get(returnId);
  if (!row) throw new HttpError(404, "Return request was not found.");
  const userId = auth.user_id || auth.id;
  if (auth.role !== "admin" && row.seller_id !== userId) {
    throw new HttpError(403, "Only the seller or admin can respond to this return.");
  }

  const status = input.status === "approved" ? "approved" : input.status === "rejected" ? "rejected" : "admin_review";
  const now = nowIso();
  db.prepare(`
    UPDATE return_requests
    SET status = ?, seller_response = ?, updated_at = ?
    WHERE id = ?
  `).run(status, clean(input.response || input.sellerResponse || "", 1200), now, returnId);

  createNotification({
    userId: row.requester_id,
    type: "order",
    title: "Return request updated",
    body: `Your return request is now ${status}.`,
    actionLabel: "View order",
    actionPath: row.source_type === "used_order" ? `/used-orders/${row.used_order_id}` : `/orders/${row.order_id}`,
  });

  return serializeReturn(db.prepare("SELECT * FROM return_requests WHERE id = ?").get(returnId));
}

export function createDispute(auth, orderId, input = {}) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  const sourceType = input.sourceType === "used_order" ? "used_order" : "store_order";
  const order = loadOrderForUser(auth, sourceType, orderId);
  const userId = auth.user_id || auth.id;
  const now = nowIso();
  const id = createId("dsp");

  transaction(() => {
    db.prepare(`
      INSERT INTO disputes (
        id, order_id, used_order_id, return_request_id, opened_by, seller_id,
        source_type, reason, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(
      id,
      sourceType === "store_order" ? order.id : null,
      sourceType === "used_order" ? order.id : null,
      clean(input.returnRequestId || "", 140) || null,
      userId,
      order.seller_id,
      sourceType,
      clean(input.reason, 1000),
      now,
      now,
    );

    const table = sourceType === "used_order" ? "used_market_orders" : "orders";
    db.prepare(`UPDATE ${table} SET status = 'disputed', payout_status = 'blocked', updated_at = ? WHERE id = ?`).run(now, order.id);
    db.prepare(`
      UPDATE payouts
      SET status = 'blocked', hold_reason = ?, updated_at = ?
      WHERE source_type = ?
        AND ${sourceType === "used_order" ? "used_order_id" : "order_id"} = ?
    `).run("Dispute opened.", now, sourceType, order.id);

    insertOrderEvent(sourceType, order.id, clean(input.reason || "Dispute opened.", 500));
    createNotificationForUsers([order.buyer_id, order.seller_id], {
      type: "order",
      title: "Dispute opened",
      body: clean(input.reason || "This order is now under admin review.", 500),
      actionLabel: "View order",
      actionPath: sourceType === "used_order" ? `/used-orders/${order.id}` : `/orders/${order.id}`,
    });
  });

  return serializeDispute(db.prepare("SELECT * FROM disputes WHERE id = ?").get(id));
}

export function addDisputeEvidence(auth, disputeId, input = {}) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  const dispute = db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId);
  if (!dispute) throw new HttpError(404, "Dispute was not found.");
  const userId = auth.user_id || auth.id;
  const sourceOrder = dispute.source_type === "used_order"
    ? db.prepare("SELECT buyer_id, seller_id FROM used_market_orders WHERE id = ?").get(dispute.used_order_id)
    : db.prepare("SELECT buyer_id, seller_id FROM orders WHERE id = ?").get(dispute.order_id);
  if (auth.role !== "admin" && sourceOrder?.buyer_id !== userId && sourceOrder?.seller_id !== userId) {
    throw new HttpError(403, "You do not have access to this dispute.");
  }

  const now = nowIso();
  db.prepare(`
    INSERT INTO dispute_evidence (
      id, dispute_id, submitted_by, evidence_type, body, file_urls, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("dev"),
    disputeId,
    userId,
    clean(input.evidenceType || "text", 60),
    clean(input.body || "", 1600),
    JSON.stringify(safeJsonArray(input.fileUrls || input.file_urls || [])),
    now,
  );

  db.prepare("UPDATE disputes SET status = 'reviewing', updated_at = ? WHERE id = ?").run(now, disputeId);
  return {
    dispute: serializeDispute(db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId)),
    evidence: db.prepare("SELECT * FROM dispute_evidence WHERE dispute_id = ? ORDER BY created_at DESC LIMIT 20").all(disputeId),
  };
}

export function adminListDisputes({ status = "" } = {}) {
  const params = [];
  let where = "WHERE 1 = 1";
  if (status) {
    where += " AND disputes.status = ?";
    params.push(status);
  }
  return db
    .prepare(`
      SELECT disputes.*, opener.name AS opened_by_name, seller.name AS seller_name
      FROM disputes
      JOIN users opener ON opener.id = disputes.opened_by
      JOIN users seller ON seller.id = disputes.seller_id
      ${where}
      ORDER BY disputes.created_at DESC
      LIMIT 250
    `)
    .all(...params)
    .map((row) => ({
      ...serializeDispute(row),
      openedByName: row.opened_by_name,
      sellerName: row.seller_name,
    }));
}

export function adminDecideDispute(auth, disputeId, input = {}) {
  if (!auth || auth.role !== "admin") throw new HttpError(403, "Only admins can decide disputes.");
  const dispute = db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId);
  if (!dispute) throw new HttpError(404, "Dispute was not found.");

  const decision = clean(input.decision || input.status, 80);
  const note = clean(input.note || input.adminDecision || "", 1600);
  const now = nowIso();
  let status = "reviewing";
  if (["buyer", "resolved_buyer", "refund", "refunded"].includes(decision)) status = decision === "refunded" ? "refunded" : "resolved_buyer";
  if (["seller", "resolved_seller", "dismiss", "dismissed"].includes(decision)) status = decision === "dismissed" ? "dismissed" : "resolved_seller";

  transaction(() => {
    db.prepare(`
      UPDATE disputes
      SET status = ?, admin_decision = ?, updated_at = ?
      WHERE id = ?
    `).run(status, note, now, dispute.id);

    const table = dispute.source_type === "used_order" ? "used_market_orders" : "orders";
    const orderId = dispute.source_type === "used_order" ? dispute.used_order_id : dispute.order_id;
    const orderStatus = status === "resolved_seller" || status === "dismissed" ? "completed" : "disputed";
    const payoutStatus = status === "resolved_seller" || status === "dismissed" ? "eligible" : "blocked";
    db.prepare(`UPDATE ${table} SET status = ?, payout_status = ?, updated_at = ? WHERE id = ?`).run(orderStatus, payoutStatus, now, orderId);
    db.prepare(`
      UPDATE payouts
      SET status = ?, hold_reason = ?, updated_at = ?
      WHERE source_type = ?
        AND ${dispute.source_type === "used_order" ? "used_order_id" : "order_id"} = ?
    `).run(payoutStatus, note, now, dispute.source_type, orderId);
  });

  return serializeDispute(db.prepare("SELECT * FROM disputes WHERE id = ?").get(dispute.id));
}

export function listOrderReturns(auth, orderId, sourceType = "store_order") {
  loadOrderForUser(auth, sourceType, orderId);
  const idColumn = sourceType === "used_order" ? "used_order_id" : "order_id";
  return db
    .prepare(`SELECT * FROM return_requests WHERE source_type = ? AND ${idColumn} = ? ORDER BY created_at DESC`)
    .all(sourceType, orderId)
    .map(serializeReturn);
}
