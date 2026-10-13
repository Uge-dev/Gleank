import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { id, now, lockUsers, notify, audit } from "./core.js";
import { providerRequest } from "./payments.js";
export function queueLatePayment(checkout) {
  db.prepare(
    "INSERT INTO shared_payment_recoveries(id,checkout_id,reference,amount_kobo,status,created_at) VALUES(?,?,?,?,'queued',?) ON CONFLICT(checkout_id) DO NOTHING",
  ).run(
    id("recovery"),
    checkout.id,
    checkout.reference,
    Number(checkout.total_kobo),
    now(),
  );
}
export async function recoverPayment(key) {
  const row = db
    .prepare("SELECT * FROM shared_payment_recoveries WHERE id=?")
    .get(key);
  if (!row || row.status === "processed") return;
  if (row.status === "queued") {
    if (
      db
        .prepare(
          "UPDATE shared_payment_recoveries SET status='submitting' WHERE id=? AND status='queued'",
        )
        .run(row.id).changes !== 1
    )
      return;
    try {
      const data = await providerRequest("/refund", {
        transaction: row.reference,
        amount: Number(row.amount_kobo),
        merchant_note: row.id,
      });
      db.prepare(
        "UPDATE shared_payment_recoveries SET status='pending',provider_id=? WHERE id=?",
      ).run(String(data.id), row.id);
    } catch {
      db.prepare(
        "UPDATE shared_payment_recoveries SET status='needs_reconciliation' WHERE id=?",
      ).run(row.id);
    }
  }
  const fresh = db
    .prepare("SELECT * FROM shared_payment_recoveries WHERE id=?")
    .get(row.id);
  if (!fresh.provider_id) return;
  const data = await providerRequest(
    "/refund/" + encodeURIComponent(fresh.provider_id),
  );
  if (data.status !== "processed") return;
  if (
    data.transaction?.reference !== fresh.reference ||
    Number(data.amount) !== Number(fresh.amount_kobo)
  )
    throw new HttpError(409, "Refund reference or amount mismatch.");
  transaction(() => {
    const c = db
      .prepare("SELECT * FROM shared_checkouts WHERE id=?")
      .get(fresh.checkout_id);
    lockUsers([c.buyer_id]);
    db.prepare(
      "UPDATE shared_payment_recoveries SET status='processed' WHERE id=?",
    ).run(fresh.id);
    db.prepare(
      "UPDATE shared_checkouts SET status='refunded' WHERE id=? AND status='refund_required'",
    ).run(c.id);
    notify(c.buyer_id, "refund", fresh.id, "", {
      checkoutId: c.id,
      amountKobo: Number(fresh.amount_kobo),
    });
  });
}
export async function linkProviderRefund(
  adminId,
  key,
  providerId,
  late = false,
) {
  if (!/^[0-9]{1,30}$/.test(String(providerId)))
    throw new HttpError(422, "Enter the provider refund ID.");
  const table = late ? "shared_payment_recoveries" : "shared_refunds";
  const row = late
    ? db.prepare("SELECT * FROM shared_payment_recoveries WHERE id=?").get(key)
    : db
        .prepare(
          "SELECT r.*,c.reference FROM shared_refunds r JOIN shared_order_lines l ON l.id=r.line_id JOIN shared_orders o ON o.id=l.order_id JOIN shared_checkouts c ON c.id=o.checkout_id WHERE r.id=?",
        )
        .get(key);
  if (!row || !["needs_reconciliation", "submitting"].includes(row.status))
    throw new HttpError(
      409,
      "This refund does not need manual reconciliation.",
    );
  const result = await providerRequest(
    "/refund/" + encodeURIComponent(providerId),
  );
  if (
    result.transaction?.reference !== row.reference ||
    Number(result.amount) !== Number(row.amount_kobo)
  )
    throw new HttpError(409, "Provider refund does not match.");
  db.prepare(
    `UPDATE ${table} SET provider_id=?,status='pending' WHERE id=?`,
  ).run(String(providerId), row.id);
  audit(adminId, "link-provider-refund", row.id, {
    providerId: String(providerId),
  });
  return { linked: true };
}
