import crypto from "node:crypto";
import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import { createNotification } from "./notification.service.js";
import { ensurePayoutForStoreOrder } from "./payout.service.js";

const now = () => new Date().toISOString();
const hash = (code) => crypto.createHash("sha256").update(code).digest("hex");
const key = () =>
  crypto
    .createHash("sha256")
    .update(
      (process.env.PACKAGE_LABEL_SECRET || env.jwtSecret) + ":package-label",
    )
    .digest();
function encrypt(code) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  return Buffer.concat([
    iv,
    cipher.update(code, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
function decrypt(value) {
  const data = Buffer.from(value, "base64");
  const cipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(),
    data.subarray(0, 12),
  );
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([
    cipher.update(data.subarray(12, -16)),
    cipher.final(),
  ]).toString("utf8");
}
export function ownedOrder(auth, orderId, actor = "either") {
  const row = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  if (
    !row ||
    (actor === "buyer"
      ? row.buyer_id !== auth.user_id
      : actor === "seller"
        ? row.seller_id !== auth.user_id
        : ![row.buyer_id, row.seller_id].includes(auth.user_id))
  )
    throw new HttpError(404, "Order was not found.");
  return row;
}
function paid(order) {
  if (order.payment_status !== "paid")
    throw new HttpError(422, "Payment must be confirmed before fulfillment.");
  if (["cancelled", "disputed"].includes(order.status))
    throw new HttpError(409, "Resolve this order before continuing.");
}
function audit(orderId, packageId, actor, event) {
  db.prepare(
    "INSERT INTO delivery_audit(id,order_id,package_id,actor_id,event,created_at) VALUES(?,?,?,?,?,?)",
  ).run(createId("audit"), orderId, packageId, actor, event, now());
}
function packages(orderId) {
  return db
    .prepare(
      "SELECT * FROM order_packages WHERE order_id=? ORDER BY created_at,id",
    )
    .all(orderId);
}
export function listPackages(auth, orderId) {
  const order = ownedOrder(auth, orderId);
  return packages(orderId).map((row) => ({
    id: row.id,
    orderItemId: row.order_item_id,
    status: row.status,
    method: row.method,
    transportName: row.transport_name,
    trackingReference: row.tracking_reference,
    expectedArrival: row.expected_arrival,
    hasReceipt: Boolean(row.receipt_path),
    dispatchedAt: row.dispatched_at,
    confirmedAt: row.confirmed_at,
    ...(order.seller_id === auth.user_id
      ? { code: decrypt(row.code_cipher) }
      : {}),
  }));
}
export function preparePackages(auth, orderId) {
  const order = ownedOrder(auth, orderId, "seller");
  paid(order);
  transaction(() => {
    for (const item of db
      .prepare("SELECT id FROM order_items WHERE order_id=?")
      .all(orderId)) {
      if (
        db
          .prepare("SELECT id FROM order_packages WHERE order_item_id=?")
          .get(item.id)
      )
        continue;
      const id = createId("pkg");
      const code = crypto.randomBytes(8).toString("hex").toUpperCase();
      const time = now();
      db.prepare(
        `INSERT INTO order_packages(id,order_id,order_item_id,code_hash,code_cipher,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`,
      ).run(id, orderId, item.id, hash(code), encrypt(code), time, time);
      audit(orderId, id, auth.user_id, "label_created");
    }
  });
  return listPackages(auth, orderId);
}
export function dispatchPackage(
  auth,
  orderId,
  packageId,
  input,
  receiptPath = "",
) {
  const order = ownedOrder(auth, orderId, "seller");
  paid(order);
  const data = z
    .object({
      method: z.enum(["personal", "transport"]),
      transportName: z.string().trim().max(120).default(""),
      trackingReference: z.string().trim().max(120).default(""),
      expectedArrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .parse(input);
  const row = db
    .prepare("SELECT * FROM order_packages WHERE id=? AND order_id=?")
    .get(packageId, orderId);
  if (!row) throw new HttpError(404, "Generate the delivery label first.");
  if (row.status !== "prepared")
    throw new HttpError(409, "This package has already been dispatched.");
  if (
    data.method === "transport" &&
    (!data.transportName || !data.trackingReference || !receiptPath)
  )
    throw new HttpError(
      422,
      "Transport name, shipment reference and receipt image are required.",
    );
  transaction(() => {
    const time = now();
    db.prepare(
      `UPDATE order_packages SET status='dispatched',method=?,transport_name=?,tracking_reference=?,receipt_path=?,
   expected_arrival=?,dispatched_at=?,updated_at=? WHERE id=?`,
    ).run(
      data.method,
      data.transportName,
      data.trackingReference,
      receiptPath,
      data.expectedArrival,
      time,
      time,
      packageId,
    );
    db.prepare(
      "UPDATE orders SET status='out_for_delivery',fulfillment_status='out_for_delivery',delivery_status='out_for_delivery',updated_at=? WHERE id=?",
    ).run(time, orderId);
    audit(orderId, packageId, auth.user_id, "dispatched");
    createNotification({
      userId: order.buyer_id,
      type: "order",
      title: "Your package is on its way",
      body: "Confirm receipt using the printed QR or delivery code only when the package is handed to you.",
      actionPath: `/orders/${orderId}`,
      actionLabel: "View delivery",
    });
  });
  return listPackages(auth, orderId);
}
export function hasOpenIssue(orderId) {
  return Boolean(
    db
      .prepare(
        "SELECT id FROM disputes WHERE order_id=? AND status NOT IN ('resolved','closed','rejected','resolved_seller','dismissed')",
      )
      .get(orderId) ||
    db
      .prepare(
        "SELECT id FROM return_requests WHERE order_id=? AND status NOT IN ('resolved','closed','rejected','cancelled')",
      )
      .get(orderId),
  );
}
export function assertSettlementReady(orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  if (
    !order ||
    order.payment_status !== "paid" ||
    order.status !== "completed" ||
    !order.buyer_confirmed_at ||
    !order.delivery_verified_at
  )
    throw new HttpError(
      409,
      "Buyer-confirmed paid delivery is required for settlement.",
    );
  const rows = packages(orderId);
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id=?")
    .get(orderId).count;
  if (
    !rows.length ||
    rows.length !== Number(count) ||
    rows.some((row) => !row.confirmed_at || row.confirmed_by !== order.buyer_id)
  )
    throw new HttpError(409, "Every package must be confirmed by the buyer.");
  if (hasOpenIssue(orderId))
    throw new HttpError(
      409,
      "An unresolved dispute or return blocks settlement.",
    );
  return order;
}
export function confirmPackage(auth, orderId, packageId, input) {
  const order = ownedOrder(auth, orderId, "buyer");
  paid(order);
  const data = z
    .object({
      code: z.string().trim().min(1).max(80),
      confirmReceived: z.literal(true),
    })
    .parse(input);
  const row = db
    .prepare("SELECT * FROM order_packages WHERE id=? AND order_id=?")
    .get(packageId, orderId);
  if (!row) throw new HttpError(404, "Package was not found.");
  if (row.confirmed_at)
    throw new HttpError(409, "This package was already confirmed.");
  if (row.status !== "dispatched")
    throw new HttpError(409, "The seller has not dispatched this package.");
  if (row.locked_until && row.locked_until > now())
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
  const normalized = data.code.replace(/[\s-]/g, "").toUpperCase();
  if (
    !crypto.timingSafeEqual(
      Buffer.from(hash(normalized), "hex"),
      Buffer.from(row.code_hash, "hex"),
    )
  ) {
    const attempts = row.locked_until ? 1 : Number(row.failed_attempts) + 1;
    db.prepare(
      "UPDATE order_packages SET failed_attempts=?,locked_until=? WHERE id=?",
    ).run(
      attempts,
      attempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null,
      packageId,
    );
    throw new HttpError(422, "The delivery code is incorrect.");
  }
  transaction(() => {
    // Serialize all package confirmations for this order across database connections.
    db.prepare("UPDATE orders SET updated_at=updated_at WHERE id=?").run(
      orderId,
    );
    const updated = db
      .prepare(
        "UPDATE order_packages SET status='confirmed',confirmed_at=?,confirmed_by=?,updated_at=? WHERE id=? AND confirmed_at IS NULL",
      )
      .run(now(), auth.user_id, now(), packageId);
    if (updated.changes !== 1)
      throw new HttpError(409, "This package was already confirmed.");
    audit(orderId, packageId, auth.user_id, "buyer_confirmed");
    const all = packages(orderId);
    const count = Number(
      db
        .prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id=?")
        .get(orderId).count,
    );
    if (all.length === count && all.every((p) => p.confirmed_at)) {
      const time = now();
      db.prepare(
        `UPDATE orders SET status='completed',fulfillment_status='completed',delivery_status='completed',
    delivery_verified_at=?,buyer_confirmed_at=?,delivered_at=?,updated_at=? WHERE id=?`,
      ).run(time, time, time, time, orderId);
      ensurePayoutForStoreOrder(orderId);
      const blocked = hasOpenIssue(orderId);
      db.prepare(
        "UPDATE payouts SET status=?,hold_reason=?,updated_at=? WHERE order_id=? AND status NOT IN ('released','refunded','blocked')",
      ).run(
        blocked ? "blocked" : "eligible",
        blocked
          ? "An unresolved issue blocks settlement."
          : "Buyer confirmed every package. Awaiting verified payout transfer.",
        time,
        orderId,
      );
      db.prepare(
        "UPDATE orders SET payout_status=(SELECT status FROM payouts WHERE order_id=?) WHERE id=?",
      ).run(orderId, orderId);
      createNotification({
        userId: order.seller_id,
        type: "order",
        title: "Buyer confirmed delivery",
        body: "All packages were received. Payment will be settled after the payout checks.",
        actionPath: `/orders/${orderId}`,
        actionLabel: "View order",
      });
    }
  });
  return listPackages(auth, orderId);
}
export function remindBuyer(auth, orderId, packageId) {
  const order = ownedOrder(auth, orderId, "seller");
  paid(order);
  const row = db
    .prepare("SELECT * FROM order_packages WHERE id=? AND order_id=?")
    .get(packageId, orderId);
  if (!row || row.status !== "dispatched")
    throw new HttpError(
      409,
      "Only dispatched, unconfirmed packages can receive reminders.",
    );
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  transaction(() => {
    const updated = db
      .prepare(
        "UPDATE order_packages SET last_reminded_at=? WHERE id=? AND (last_reminded_at IS NULL OR last_reminded_at<?)",
      )
      .run(now(), packageId, cutoff);
    if (updated.changes !== 1)
      throw new HttpError(
        429,
        "A reminder was already sent within the last 24 hours.",
      );
    createNotification({
      userId: order.buyer_id,
      type: "order",
      title: "Have you received your package?",
      body: "If it has arrived, scan its label or enter its delivery code to confirm receipt. If it has not arrived, do not confirm.",
      actionPath: `/orders/${orderId}`,
      actionLabel: "View delivery",
    });
    audit(orderId, packageId, auth.user_id, "reminder_sent");
  });
  return { message: "Reminder sent." };
}
