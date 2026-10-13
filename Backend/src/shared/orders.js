import crypto from "node:crypto";
import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import {
  id,
  now,
  hash,
  json,
  parse,
  lockUsers,
  notify,
  audit,
  page,
} from "./core.js";
import { walletChange, releaseCheckoutStock, changeStock } from "./checkout.js";
import { ownedMedia } from "./media.js";
import { providerRequest } from "./payments.js";
const encryptionKey = () =>
  crypto
    .createHash("sha256")
    .update(
      (process.env.PACKAGE_LABEL_SECRET || env.jwtSecret) +
        ":shared-package-v1",
    )
    .digest();
function encrypt(code) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  return Buffer.concat([
    iv,
    cipher.update(code),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
function decrypt(code) {
  const bytes = Buffer.from(code, "base64"),
    cipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      bytes.subarray(0, 12),
    );
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    cipher.update(bytes.subarray(12, -16)),
    cipher.final(),
  ]).toString();
}
export function ownedOrderV2(userId, orderId, side = "either") {
  const o = db.prepare("SELECT * FROM shared_orders WHERE id=?").get(orderId);
  if (
    !o ||
    (side === "buyer"
      ? o.buyer_id !== userId
      : side === "seller"
        ? o.seller_id !== userId
        : ![o.buyer_id, o.seller_id].includes(userId))
  )
    throw new HttpError(404, "Order not found.");
  return o;
}
function lines(orderId) {
  return db
    .prepare("SELECT * FROM shared_order_lines WHERE order_id=? ORDER BY id")
    .all(orderId);
}
export function orderView(userId, orderId) {
  const o = ownedOrderV2(userId, orderId),
    buyer = userId === o.buyer_id;
  return {
    id: o.id,
    checkoutId: o.checkout_id,
    buyerId: o.buyer_id,
    sellerId: o.seller_id,
    amountKobo: Number(o.total_kobo),
    deliveryKobo: Number(o.delivery_kobo),
    status: o.status,
    address: parse(o.address_json),
    createdAt: o.created_at,
    items: lines(o.id).map((l) => {
      const snapshot = parse(l.snapshot_json);
      delete snapshot.fileIds;
      return {
        lineId: l.id,
        ...snapshot,
        fulfilledAt: l.fulfilled_at,
        refundState: l.refund_state,
        packages: db
          .prepare(
            "SELECT * FROM shared_packages WHERE line_id=? ORDER BY unit_index",
          )
          .all(l.id)
          .map((p) => ({
            id: p.id,
            unitIndex: p.unit_index,
            status: p.status,
            details: parse(p.data_json),
            confirmedAt: p.confirmed_at,
            ...(!buyer ? { code: decrypt(p.code_cipher) } : {}),
          })),
      };
    }),
  };
}
export function listOrdersV2(userId, query = {}) {
  const p = page(query),
    seller = query.side === "sales";
  return db
    .prepare(
      `SELECT id FROM shared_orders WHERE ${seller ? "seller_id" : "buyer_id"}=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, p.limit, p.offset)
    .map((o) => orderView(userId, o.id));
}
export function prepareOrder(userId, orderId) {
  return transaction(() => {
    let o = ownedOrderV2(userId, orderId, "seller");
    lockUsers([o.buyer_id, o.seller_id]);
    o = ownedOrderV2(userId, orderId, "seller");
    if (!["paid", "processing", "dispatched"].includes(o.status))
      throw new HttpError(409, "Only a paid active order can be prepared.");
    for (const line of lines(o.id)) {
      const q = parse(line.snapshot_json);
      if (q.kind === "digital" || line.refund_state) continue;
      for (let unit = 0; unit < line.quantity; unit++) {
        if (
          db
            .prepare(
              "SELECT id FROM shared_packages WHERE line_id=? AND unit_index=?",
            )
            .get(line.id, unit)
        )
          continue;
        const code = crypto.randomBytes(16).toString("hex").toUpperCase();
        db.prepare(
          "INSERT INTO shared_packages(id,line_id,unit_index,code_hash,code_cipher,status) VALUES(?,?,?,?,?,?)",
        ).run(
          id("package"),
          line.id,
          unit,
          hash(code),
          encrypt(code),
          "prepared",
        );
      }
    }
    db.prepare(
      "UPDATE shared_orders SET status='processing' WHERE id=? AND status='paid'",
    ).run(o.id);
    audit(userId, "prepare-order", o.id);
    return orderView(userId, o.id);
  });
}
export function dispatchV2(userId, orderId, packageId, body) {
  const data = z
    .object({
      method: z.enum(["personal", "transport"]),
      transportName: z.string().trim().max(120).default(""),
      trackingReference: z.string().trim().max(120).default(""),
      expectedArrival: z.string().datetime({ offset: true }),
      receiptId: z.string().max(140).optional(),
    })
    .strict()
    .parse(body);
  if (data.receiptId) ownedMedia(userId, [data.receiptId], ["receipt"]);
  if (
    data.method === "transport" &&
    (!data.receiptId || !data.trackingReference || !data.transportName)
  )
    throw new HttpError(
      422,
      "Add transport details and private receipt proof.",
    );
  return transaction(() => {
    let o = ownedOrderV2(userId, orderId, "seller");
    lockUsers([o.buyer_id, o.seller_id]);
    o = ownedOrderV2(userId, orderId, "seller");
    const p = db
      .prepare(
        "SELECT p.*,l.refund_state FROM shared_packages p JOIN shared_order_lines l ON l.id=p.line_id WHERE p.id=? AND l.order_id=?",
      )
      .get(packageId, o.id);
    if (
      !p ||
      p.status !== "prepared" ||
      p.refund_state ||
      !["paid", "processing", "dispatched"].includes(o.status)
    )
      throw new HttpError(409, "This package cannot be dispatched.");
    db.prepare(
      "UPDATE shared_packages SET status='dispatched',data_json=? WHERE id=? AND status='prepared'",
    ).run(json(data), p.id);
    db.prepare("UPDATE shared_orders SET status='dispatched' WHERE id=?").run(
      o.id,
    );
    notify(o.buyer_id, "delivery", p.id, userId, {
      orderId: o.id,
      status: "dispatched",
    });
    audit(userId, "dispatch", p.id);
    return orderView(userId, o.id);
  });
}
export function confirmV2(userId, orderId, packageId, body) {
  const data = z
    .object({
      code: z.string().trim().min(1).max(80),
      confirmReceived: z.literal(true),
    })
    .strict()
    .parse(body);
  const result = transaction(() => {
    const o = ownedOrderV2(userId, orderId, "buyer");
    lockUsers([o.buyer_id, o.seller_id]);
    const p = db
      .prepare(
        "SELECT p.*,l.refund_state FROM shared_packages p JOIN shared_order_lines l ON l.id=p.line_id WHERE p.id=? AND l.order_id=?",
      )
      .get(packageId, o.id);
    if (!p || p.status !== "dispatched" || p.confirmed_at || p.refund_state)
      throw new HttpError(409, "This package cannot be confirmed.");
    if (p.locked_until && p.locked_until > now()) return { error: 429 };
    const actual = hash(data.code.replace(/[\s-]/g, "").toUpperCase());
    if (
      !crypto.timingSafeEqual(
        Buffer.from(actual, "hex"),
        Buffer.from(p.code_hash, "hex"),
      )
    ) {
      const failures = p.locked_until ? 1 : Number(p.failures) + 1;
      db.prepare(
        "UPDATE shared_packages SET failures=?,locked_until=? WHERE id=?",
      ).run(
        failures,
        failures >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null,
        p.id,
      );
      return { error: 422 };
    }
    db.prepare(
      "UPDATE shared_packages SET status='confirmed',confirmed_by=?,confirmed_at=? WHERE id=? AND status='dispatched'",
    ).run(userId, now(), p.id);
    const siblings = db
        .prepare("SELECT status FROM shared_packages WHERE line_id=?")
        .all(p.line_id),
      line = db
        .prepare(
          "SELECT quantity,snapshot_json FROM shared_order_lines WHERE id=?",
        )
        .get(p.line_id);
    if (
      siblings.length === line.quantity &&
      siblings.every((s) => s.status === "confirmed")
    )
      db.prepare(
        "UPDATE shared_order_lines SET fulfilled_at=?,eligible_at=? WHERE id=?",
      ).run(
        now(),
        new Date(
          Date.now() +
            Number(parse(line.snapshot_json).returnDays || 0) * 86400000,
        ).toISOString(),
        p.line_id,
      );
    if (
      lines(o.id).every((l) => l.fulfilled_at || l.refund_state === "refunded")
    )
      db.prepare("UPDATE shared_orders SET status='completed' WHERE id=?").run(
        o.id,
      );
    notify(o.seller_id, "delivery-confirmed", p.id, userId, { orderId: o.id });
    audit(userId, "buyer-confirmed", p.id);
    return orderView(userId, o.id);
  });
  if (result.error)
    throw new HttpError(
      result.error,
      result.error === 429
        ? "Too many attempts. Try again in 15 minutes."
        : "Incorrect delivery code.",
    );
  return result;
}
export function releaseEligible() {
  const candidates = db
    .prepare(
      "SELECT l.id,o.buyer_id,o.seller_id FROM shared_order_lines l JOIN shared_orders o ON o.id=l.order_id WHERE l.fulfilled_at IS NOT NULL AND l.eligible_at<=? AND l.refund_state='' AND NOT EXISTS(SELECT 1 FROM shared_issues i WHERE i.line_id=l.id AND i.status IN ('open','refund_pending')) AND NOT EXISTS(SELECT 1 FROM shared_ledger x WHERE x.event_key='release:' || l.id) ORDER BY l.eligible_at LIMIT 100",
    )
    .all(now());
  for (const c of candidates)
    transaction(() => {
      let row = db
        .prepare(
          "SELECT l.*,o.seller_id,o.buyer_id FROM shared_order_lines l JOIN shared_orders o ON o.id=l.order_id WHERE l.id=?",
        )
        .get(c.id);
      lockUsers([row.seller_id, row.promoter_id, row.buyer_id]);
      row = db
        .prepare(
          "SELECT l.*,o.seller_id,o.buyer_id FROM shared_order_lines l JOIN shared_orders o ON o.id=l.order_id WHERE l.id=?",
        )
        .get(c.id);
      const q = parse(row.snapshot_json),
        cutoff =
          Date.parse(row.fulfilled_at) + Number(q.returnDays || 0) * 86400000;
      if (
        cutoff > Date.now() ||
        row.refund_state ||
        db
          .prepare(
            "SELECT user_id FROM shared_wallet_holds WHERE user_id IN (?,?)",
          )
          .get(row.seller_id, row.promoter_id || row.seller_id) ||
        db
          .prepare(
            "SELECT id FROM shared_issues WHERE line_id=? AND status IN ('open','refund_pending')",
          )
          .get(row.id)
      )
        return;
      if (
        !db
          .prepare("SELECT id FROM shared_ledger WHERE event_key=?")
          .get("release:" + row.id)
      ) {
        walletChange(
          row.seller_id,
          "held",
          -Number(row.seller_kobo),
          "release-held:" + row.id,
          row.id,
        );
        walletChange(
          row.seller_id,
          "available",
          Number(row.seller_kobo),
          "release:" + row.id,
          row.id,
        );
        if (row.promoter_id) {
          walletChange(
            row.promoter_id,
            "held",
            -Number(row.commission_kobo),
            "commission-release-held:" + row.id,
            row.id,
          );
          walletChange(
            row.promoter_id,
            "available",
            Number(row.commission_kobo),
            "commission-release:" + row.id,
            row.id,
          );
        }
      }
      const o = db
        .prepare("SELECT * FROM shared_orders WHERE id=?")
        .get(row.order_id);
      if (
        o.status === "completed" &&
        Number(o.delivery_kobo) &&
        lines(o.id).every(
          (l) =>
            l.refund_state === "refunded" ||
            db
              .prepare("SELECT id FROM shared_ledger WHERE event_key=?")
              .get("release:" + l.id),
        )
      ) {
        walletChange(
          row.seller_id,
          "held",
          -Number(o.delivery_kobo),
          "delivery-release-held:" + o.id,
        );
        walletChange(
          row.seller_id,
          "available",
          Number(o.delivery_kobo),
          "delivery-release:" + o.id,
        );
      }
    });
}
export function openIssue(userId, lineId, body) {
  const input = z
    .object({
      kind: z.enum(["return", "dispute", "cancellation"]),
      reason: z.string().trim().min(5).max(2000),
      evidenceIds: z.array(z.string().max(140)).max(5).default([]),
    })
    .strict()
    .parse(body);
  ownedMedia(userId, input.evidenceIds, ["receipt", "evidence", "document"]);
  return transaction(() => {
    const row = db
      .prepare(
        "SELECT l.*,o.buyer_id,o.seller_id,o.status FROM shared_order_lines l JOIN shared_orders o ON o.id=l.order_id WHERE l.id=? AND o.buyer_id=?",
      )
      .get(lineId, userId);
    if (!row) throw new HttpError(404, "Purchased item not found.");
    lockUsers([row.buyer_id, row.seller_id]);
    if (row.refund_state === "refunded")
      throw new HttpError(409, "Already refunded.");
    const q = parse(row.snapshot_json);
    if (
      input.kind === "return" &&
      (!row.fulfilled_at ||
        Date.now() > Date.parse(row.fulfilled_at) + q.returnDays * 86400000)
    )
      throw new HttpError(409, "This return window is closed.");
    if (
      input.kind === "cancellation" &&
      db
        .prepare(
          "SELECT id FROM shared_packages WHERE line_id=? AND status<>'prepared'",
        )
        .get(lineId)
    )
      throw new HttpError(
        409,
        "Use a return or dispute for dispatched products.",
      );
    const old = db
      .prepare(
        "SELECT * FROM shared_issues WHERE line_id=? AND status IN ('open','refund_pending')",
      )
      .get(lineId);
    if (old) return old;
    const key = id("issue");
    db.prepare(
      "INSERT INTO shared_issues(id,line_id,buyer_id,kind,reason,evidence_json,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      key,
      lineId,
      userId,
      input.kind,
      input.reason,
      json(input.evidenceIds),
      "open",
      now(),
    );
    notify(row.seller_id, "issue", key, userId, { lineId, kind: input.kind });
    return { id: key, status: "open" };
  });
}
export function resolveIssue(adminId, issueId, body) {
  if (
    db.prepare("SELECT role FROM users WHERE id=? AND is_active=1").get(adminId)
      ?.role !== "admin"
  )
    throw new HttpError(403, "Admin review is required.");
  const data = z
    .object({
      decision: z.enum(["reject", "refund"]),
      note: z.string().trim().min(5).max(2000),
    })
    .strict()
    .parse(body);
  return transaction(() => {
    const issue = db
      .prepare(
        "SELECT i.*,l.order_id FROM shared_issues i JOIN shared_order_lines l ON l.id=i.line_id WHERE i.id=?",
      )
      .get(issueId);
    if (!issue) throw new HttpError(404, "Issue not found.");
    const o = db
      .prepare("SELECT * FROM shared_orders WHERE id=?")
      .get(issue.order_id);
    lockUsers([o.buyer_id, o.seller_id]);
    if (issue.status !== "open")
      throw new HttpError(409, "This issue is already resolved.");
    if (data.decision === "reject") {
      db.prepare(
        "UPDATE shared_issues SET status='rejected',resolution=? WHERE id=?",
      ).run(data.note, issueId);
    } else {
      if (
        db
          .prepare("SELECT id FROM shared_ledger WHERE event_key=?")
          .get("release:" + issue.line_id)
      )
        throw new HttpError(
          409,
          "Released earnings require a finance recovery review before refund.",
        );
      db.prepare(
        "UPDATE shared_issues SET status='refund_pending',resolution=? WHERE id=?",
      ).run(data.note, issueId);
      db.prepare(
        "UPDATE shared_order_lines SET refund_state='pending' WHERE id=?",
      ).run(issue.line_id);
      const delivery = lines(o.id).every(
        (l) =>
          l.id === issue.line_id ||
          ["pending", "refunded"].includes(l.refund_state),
      )
        ? Number(o.delivery_kobo)
        : 0;
      db.prepare(
        "INSERT INTO shared_refunds(id,issue_id,line_id,status,amount_kobo,delivery_kobo,created_at) VALUES(?,?,?,?,?,?,?)",
      ).run(
        id("refund"),
        issueId,
        issue.line_id,
        "queued",
        Number(
          db
            .prepare(
              "SELECT seller_kobo+commission_kobo+platform_kobo AS amount FROM shared_order_lines WHERE id=?",
            )
            .get(issue.line_id).amount,
        ) + delivery,
        delivery,
        now(),
      );
    }
    audit(adminId, "resolve-issue", issueId, data);
    return {
      id: issueId,
      status: data.decision === "reject" ? "rejected" : "refund_pending",
    };
  });
}
export function applyRefund(refundId) {
  transaction(() => {
    const refund = db
      .prepare("SELECT * FROM shared_refunds WHERE id=?")
      .get(refundId);
    if (!refund || refund.status === "processed") return;
    const l = db
        .prepare("SELECT * FROM shared_order_lines WHERE id=?")
        .get(refund.line_id),
      o = db.prepare("SELECT * FROM shared_orders WHERE id=?").get(l.order_id);
    lockUsers([o.buyer_id, o.seller_id, l.promoter_id]);
    if (
      db.prepare("SELECT status FROM shared_refunds WHERE id=?").get(refundId)
        .status === "processed"
    )
      return;
    walletChange(
      o.seller_id,
      "held",
      -Number(l.seller_kobo),
      "refund-seller:" + l.id,
      l.id,
    );
    if (l.promoter_id)
      walletChange(
        l.promoter_id,
        "held",
        -Number(l.commission_kobo),
        "refund-commission:" + l.id,
        l.id,
      );
    const c = db
      .prepare("SELECT * FROM shared_checkouts WHERE id=?")
      .get(o.checkout_id);
    if (c.provider === "wallet")
      walletChange(
        o.buyer_id,
        "available",
        Number(refund.amount_kobo),
        "refund-buyer:" + l.id,
        l.id,
      );
    db.prepare(
      "UPDATE shared_order_lines SET refund_state='refunded' WHERE id=?",
    ).run(l.id);
    db.prepare(
      "UPDATE shared_entitlements SET revoked_at=? WHERE line_id=?",
    ).run(now(), l.id);
    const wasDispatched = !!db
      .prepare(
        "SELECT id FROM shared_packages WHERE line_id=? AND status IN ('dispatched','confirmed')",
      )
      .get(l.id);
    db.prepare(
      "UPDATE shared_packages SET status='cancelled' WHERE line_id=? AND confirmed_at IS NULL",
    ).run(l.id);
    // Restock only undelivered cancellations; damaged/returned units require seller inspection.
    if (!l.fulfilled_at && !wasDispatched)
      changeStock(parse(l.snapshot_json), 1);
    if (Number(refund.delivery_kobo))
      walletChange(
        o.seller_id,
        "held",
        -Number(refund.delivery_kobo),
        "delivery-refund-held:" + o.id,
      );
    const remaining = lines(o.id).filter((x) => x.refund_state !== "refunded");
    if (!remaining.length) {
      db.prepare("UPDATE shared_orders SET status='refunded' WHERE id=?").run(
        o.id,
      );
    }
    db.prepare("UPDATE shared_refunds SET status='processed' WHERE id=?").run(
      refundId,
    );
    db.prepare("UPDATE shared_issues SET status='refunded' WHERE id=?").run(
      refund.issue_id,
    );
    notify(o.buyer_id, "refund", refundId, o.seller_id, { lineId: l.id });
  });
}
export async function processRefund(refundId) {
  const r = db
    .prepare(
      `SELECT r.*,l.seller_kobo,l.commission_kobo,l.platform_kobo,c.reference,c.provider FROM shared_refunds r JOIN shared_order_lines l ON l.id=r.line_id JOIN shared_orders o ON o.id=l.order_id JOIN shared_checkouts c ON c.id=o.checkout_id WHERE r.id=?`,
    )
    .get(refundId);
  if (!r || r.status === "processed") return;
  if (r.provider === "wallet") {
    applyRefund(r.id);
    return;
  }
  if (r.status === "queued") {
    const claim = db
      .prepare(
        "UPDATE shared_refunds SET status='submitting' WHERE id=? AND status='queued'",
      )
      .run(r.id);
    if (claim.changes !== 1) return;
    try {
      const result = await providerRequest("/refund", {
        transaction: r.reference,
        amount: Number(r.amount_kobo),
        merchant_note: r.id,
      });
      db.prepare(
        "UPDATE shared_refunds SET provider_id=?,status='pending' WHERE id=?",
      ).run(String(result.id), r.id);
    } catch {
      db.prepare(
        "UPDATE shared_refunds SET status='needs_reconciliation' WHERE id=?",
      ).run(r.id);
    }
  }
  const fresh = db.prepare("SELECT * FROM shared_refunds WHERE id=?").get(r.id);
  if (fresh.provider_id) {
    const result = await providerRequest(
      "/refund/" + encodeURIComponent(fresh.provider_id),
    );
    if (
      result.status === "processed" &&
      result.transaction?.reference === r.reference &&
      Number(result.amount) === Number(r.amount_kobo)
    )
      applyRefund(r.id);
  }
}
export function receiptView(userId, orderId) {
  const o = orderView(userId, orderId);
  if (o.buyerId !== userId) throw new HttpError(404, "Receipt not found.");
  return {
    receiptNumber: o.id,
    currency: "NGN",
    paidAt: o.createdAt,
    amountKobo: o.amountKobo,
    deliveryKobo: o.deliveryKobo,
    items: o.items.map((l) => ({
      name: l.product.name,
      quantity: l.quantity,
      unitPriceKobo: l.unitPriceKobo,
      totalKobo: l.totalKobo,
      components: l.components,
      variant: l.variant,
      refundState: l.refundState,
    })),
    sellerId: o.sellerId,
  };
}

export function replyIssue(userId, issueId, body) {
  const data = z
    .object({
      note: z.string().trim().min(5).max(2000),
      acceptRefund: z.boolean().default(false),
    })
    .strict()
    .parse(body);
  return transaction(() => {
    const i = db
      .prepare(
        "SELECT i.*,o.seller_id,o.buyer_id FROM shared_issues i JOIN shared_order_lines l ON l.id=i.line_id JOIN shared_orders o ON o.id=l.order_id WHERE i.id=? AND o.seller_id=?",
      )
      .get(issueId, userId);
    if (!i) throw new HttpError(404, "Issue not found.");
    lockUsers([i.buyer_id, i.seller_id]);
    if (i.status !== "open")
      throw new HttpError(409, "This issue is no longer open.");
    db.prepare("UPDATE shared_issues SET resolution=? WHERE id=?").run(
      json({ sellerNote: data.note, sellerAcceptsRefund: data.acceptRefund }),
      issueId,
    );
    audit(userId, "seller-issue-response", issueId, data);
    notify(i.buyer_id, "issue-reply", issueId, userId, data);
    return { submitted: true, adminReviewRequired: true };
  });
}
