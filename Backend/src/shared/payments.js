import crypto from "node:crypto";
import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { id, now, json, parse, lockUsers, money, notify } from "./core.js";
import {
  ownedCheckout,
  checkoutView,
  completeCheckout,
  walletChange,
} from "./checkout.js";
import { queueLatePayment } from "./recovery.js";
export async function providerRequest(route, body) {
  if (env.paymentProvider !== "paystack" || !env.paystackSecretKey)
    throw new HttpError(503, "Payment services are not configured.");
  if (
    env.isProduction &&
    !env.paystackSecretKey.startsWith("sk_live_") &&
    !(env.paystackMode === "test" && env.allowPaystackTestKeysInProduction)
  )
    throw new HttpError(503, "Live payment credentials are required.");
  const response = await fetch(
    (env.paystackBaseUrl || "https://api.paystack.co") + route,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + env.paystackSecretKey,
        "Content-Type": "application/json",
      },
      ...(body ? { body: json(body) } : {}),
      signal: AbortSignal.timeout(15000),
    },
  );
  const payload = await response.json();
  if (!response.ok || payload.status !== true)
    throw new HttpError(
      502,
      "The payment provider could not complete this request.",
    );
  return payload.data;
}
export async function initializeCheckout(userId, checkoutId) {
  if (env.paymentProvider !== "paystack" || !env.paystackSecretKey)
    throw new HttpError(503, "Payment services are not configured.");
  const c = transaction(() => {
    lockUsers([userId]);
    const r = ownedCheckout(userId, checkoutId);
    if (r.provider !== "paystack")
      throw new HttpError(422, "Use wallet payment for this checkout.");
    if (
      r.authorization_url ||
      r.status === "paid" ||
      r.status === "initializing" ||
      r.status === "pending"
    )
      return r;
    if (!["ready", "failed"].includes(r.status) || r.expires_at <= now())
      throw new HttpError(409, "This checkout is no longer payable.");
    db.prepare(
      "UPDATE shared_checkouts SET status='initializing' WHERE id=?",
    ).run(r.id);
    return { ...r, start: true };
  });
  if (!c.start) return checkoutView(c);
  const user = db.prepare("SELECT email FROM users WHERE id=?").get(userId);
  try {
    const payment = await providerRequest("/transaction/initialize", {
      email: user.email,
      amount: Number(c.total_kobo),
      currency: "NGN",
      reference: c.reference,
      callback_url: env.paystackCallbackUrl,
      metadata: { checkoutId: c.id },
    });
    if (
      payment.reference !== c.reference ||
      !/^https:\/\//.test(payment.authorization_url || "")
    )
      throw new HttpError(502, "Provider checkout response is invalid.");
    db.prepare(
      "UPDATE shared_checkouts SET authorization_url=?,status='pending' WHERE id=? AND status='initializing'",
    ).run(payment.authorization_url, c.id);
  } catch (error) {
    // The provider may have initialized before a timeout. Preserve the reference;
    // never release reserved inventory or create a new charge automatically.
    notify(userId, "payment", c.id, "", { status: "verification_required" });
    throw error;
  }
  return checkoutView(ownedCheckout(userId, c.id));
}
export function applyCharge(data) {
  const c = db
    .prepare("SELECT * FROM shared_checkouts WHERE reference=?")
    .get(String(data?.reference || ""));
  const topup = c
    ? null
    : db
        .prepare("SELECT * FROM shared_topups WHERE reference=?")
        .get(String(data?.reference || ""));
  if (!c && !topup) return false;
  const expected = c ? Number(c.total_kobo) : Number(topup.amount_kobo);
  if (
    data.status !== "success" ||
    data.currency !== "NGN" ||
    Number(data.amount) !== expected ||
    (env.isProduction &&
      data.domain !==
        (env.paystackMode === "test" && env.allowPaystackTestKeysInProduction
          ? "test"
          : "live"))
  )
    throw new HttpError(
      409,
      "Verified payment amount, currency or environment does not match.",
    );
  transaction(() => {
    lockUsers([c?.buyer_id || topup.user_id]);
    if (c) {
      completeCheckout(c.id);
      const current = db
        .prepare("SELECT * FROM shared_checkouts WHERE id=?")
        .get(c.id);
      if (current.status === "refund_required") queueLatePayment(current);
    } else {
      const current = db
        .prepare("SELECT * FROM shared_topups WHERE id=?")
        .get(topup.id);
      if (current.status === "paid") return;
      walletChange(topup.user_id, "available", expected, "topup:" + topup.id);
      db.prepare("UPDATE shared_topups SET status='paid' WHERE id=?").run(
        topup.id,
      );
      notify(topup.user_id, "wallet", topup.id, "", { amountKobo: expected });
    }
  });
  return true;
}
export async function verifyCheckout(userId, checkoutId) {
  const c = ownedCheckout(userId, checkoutId),
    data = await providerRequest(
      "/transaction/verify/" + encodeURIComponent(c.reference),
    );
  if (data.reference !== c.reference)
    throw new HttpError(409, "Provider reference mismatch.");
  if (data.status === "success") applyCharge(data);
  else if (data.status === "reversed" && c.status === "paid") {
    transaction(() => {
      lockUsers([userId]);
      for (const o of db
        .prepare("SELECT seller_id,id FROM shared_orders WHERE checkout_id=?")
        .all(c.id)) {
        for (const who of [o.seller_id, userId])
          db.prepare(
            "INSERT INTO shared_wallet_holds(user_id,reason,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING",
          ).run(who, "Payment reversal requires finance reconciliation", now());
        db.prepare(
          "UPDATE shared_entitlements SET revoked_at=? WHERE line_id IN (SELECT id FROM shared_order_lines WHERE order_id=?)",
        ).run(now(), o.id);
      }
      notify(userId, "payment", c.id, "", { status: "reversed_review" });
    });
  } else if (["failed", "abandoned", "reversed"].includes(data.status))
    db.prepare(
      "UPDATE shared_checkouts SET status='failed',authorization_url='' WHERE id=? AND status NOT IN ('paid','cancelled','expired','refund_required')",
    ).run(c.id);
  return checkoutView(ownedCheckout(userId, c.id));
}
export async function createTopup(userId, amountKobo, key) {
  if (env.paymentProvider !== "paystack" || !env.paystackSecretKey)
    throw new HttpError(503, "Payment services are not configured.");
  money.min(10000).parse(amountKobo);
  z.string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .parse(key);
  let row = transaction(() => {
    lockUsers([userId]);
    const old = db
      .prepare(
        "SELECT * FROM shared_topups WHERE user_id=? AND idempotency_key=?",
      )
      .get(userId, key);
    if (old) {
      if (Number(old.amount_kobo) !== amountKobo)
        throw new HttpError(409, "This key was used for another amount.");
      return old;
    }
    const topupId = id("topup");
    db.prepare(
      "INSERT INTO shared_topups(id,user_id,amount_kobo,reference,idempotency_key,status,created_at) VALUES(?,?,?,?,?,'initializing',?)",
    ).run(topupId, userId, amountKobo, id("TOP"), key, now());
    return {
      ...db.prepare("SELECT * FROM shared_topups WHERE id=?").get(topupId),
      start: true,
    };
  });
  if (row.start) {
    const u = db.prepare("SELECT email FROM users WHERE id=?").get(userId);
    const data = await providerRequest("/transaction/initialize", {
      email: u.email,
      amount: amountKobo,
      currency: "NGN",
      reference: row.reference,
      callback_url: env.paystackCallbackUrl,
    });
    if (data.reference !== row.reference)
      throw new HttpError(502, "Invalid top-up reference.");
    db.prepare(
      "UPDATE shared_topups SET authorization_url=?,status='pending' WHERE id=?",
    ).run(data.authorization_url, row.id);
    row = db.prepare("SELECT * FROM shared_topups WHERE id=?").get(row.id);
  }
  return {
    id: row.id,
    reference: row.reference,
    amountKobo: Number(row.amount_kobo),
    status: row.status,
    authorizationUrl: row.authorization_url,
  };
}
export async function verifyTopup(userId, topupId) {
  const row = db
    .prepare("SELECT * FROM shared_topups WHERE id=? AND user_id=?")
    .get(topupId, userId);
  if (!row) throw new HttpError(404, "Top-up not found.");
  const data = await providerRequest(
    "/transaction/verify/" + encodeURIComponent(row.reference),
  );
  if (data.reference !== row.reference)
    throw new HttpError(409, "Reference mismatch.");
  if (data.status === "success") applyCharge(data);
  return {
    id: row.id,
    status: db
      .prepare("SELECT status FROM shared_topups WHERE id=?")
      .get(row.id).status,
  };
}
export async function requestWithdrawal(userId, amountKobo, key) {
  if (env.paymentProvider !== "paystack" || !env.paystackSecretKey)
    throw new HttpError(503, "Payment services are not configured.");
  money.min(10000).parse(amountKobo);
  z.string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .parse(key);
  const row = transaction(() => {
    lockUsers([userId]);
    const old = db
      .prepare(
        "SELECT * FROM shared_transfers WHERE user_id=? AND idempotency_key=?",
      )
      .get(userId, key);
    if (old) {
      if (Number(old.amount_kobo) !== amountKobo)
        throw new HttpError(409, "This key was used for another withdrawal.");
      return old;
    }
    const bank = db
      .prepare("SELECT * FROM commerce_payout_recipients WHERE user_id=?")
      .get(userId);
    if (!bank)
      throw new HttpError(
        422,
        "Set up and verify your payout bank account first.",
      );
    if (
      db
        .prepare("SELECT user_id FROM shared_wallet_holds WHERE user_id=?")
        .get(userId)
    )
      throw new HttpError(403, "Withdrawals are paused for financial review.");
    const transferId = id("withdrawal");
    walletChange(userId, "available", -amountKobo, "withdraw:" + transferId);
    db.prepare(
      "INSERT INTO shared_transfers(id,user_id,idempotency_key,amount_kobo,reference,recipient_code,status,created_at) VALUES(?,?,?,?,?,?,'pending',?)",
    ).run(
      transferId,
      userId,
      key,
      amountKobo,
      id("TRF"),
      bank.recipient_code,
      now(),
    );
    return {
      ...db
        .prepare("SELECT * FROM shared_transfers WHERE id=?")
        .get(transferId),
      start: true,
    };
  });
  // Reconcile first after retries: the same reference may have reached Paystack.
  if (row.status === "pending" && row.start) {
    try {
      const data = await providerRequest("/transfer", {
        source: "balance",
        currency: "NGN",
        amount: Number(row.amount_kobo),
        reference: row.reference,
        recipient: row.recipient_code,
      });
      if (data.status === "success")
        applyWithdrawal({ ...data, currency: data.currency || "NGN" });
    } catch {
      /* Unknown provider outcome remains reserved for verification. */
    }
  }
  return withdrawalView(
    db.prepare("SELECT * FROM shared_transfers WHERE id=?").get(row.id),
  );
}
function withdrawalView(row) {
  return {
    id: row.id,
    amountKobo: Number(row.amount_kobo),
    status: row.status,
    reference: row.reference,
  };
}
export function applyWithdrawal(data) {
  const row = db
    .prepare("SELECT * FROM shared_transfers WHERE reference=?")
    .get(String(data?.reference || ""));
  if (!row) return false;
  if (
    Number(data.amount) !== Number(row.amount_kobo) ||
    data.currency !== "NGN" ||
    data.recipient?.recipient_code !== row.recipient_code
  )
    throw new HttpError(409, "Payout beneficiary or amount mismatch.");
  transaction(() => {
    lockUsers([row.user_id]);
    const current = db
      .prepare("SELECT * FROM shared_transfers WHERE id=?")
      .get(row.id);
    if (
      ["failed", "reversed"].includes(current.status) ||
      (current.status === "success" && data.status !== "reversed")
    )
      return;
    if (data.status === "success") {
      db.prepare("UPDATE shared_transfers SET status='success' WHERE id=?").run(
        row.id,
      );
      notify(row.user_id, "wallet", row.id, "", { status: "withdrawn" });
    } else if (["failed", "reversed"].includes(data.status)) {
      walletChange(
        row.user_id,
        "available",
        Number(row.amount_kobo),
        "withdraw-reversal:" + row.id,
      );
      db.prepare("UPDATE shared_transfers SET status=? WHERE id=?").run(
        data.status,
        row.id,
      );
    }
  });
  return true;
}
export async function verifyWithdrawal(userId, key) {
  const row = db
    .prepare("SELECT * FROM shared_transfers WHERE id=? AND user_id=?")
    .get(key, userId);
  if (!row) throw new HttpError(404, "Withdrawal not found.");
  const data = await providerRequest(
    "/transfer/verify/" + encodeURIComponent(row.reference),
  );
  if (data.reference !== row.reference)
    throw new HttpError(409, "Payout reference mismatch.");
  applyWithdrawal(data);
  return withdrawalView(
    db.prepare("SELECT * FROM shared_transfers WHERE id=?").get(key),
  );
}
export async function sharedWebhook({ rawBody, body, signature }) {
  const ref = String(body?.data?.reference || "");
  const charge =
    body?.event === "charge.success" &&
    (db.prepare("SELECT id FROM shared_checkouts WHERE reference=?").get(ref) ||
      db.prepare("SELECT id FROM shared_topups WHERE reference=?").get(ref));
  const transfer =
    String(body?.event || "").startsWith("transfer.") &&
    db.prepare("SELECT id FROM shared_transfers WHERE reference=?").get(ref);
  if (!charge && !transfer) return false;
  if (
    !Buffer.isBuffer(rawBody) ||
    !env.paystackSecretKey ||
    !/^[a-f0-9]{128}$/i.test(signature || "")
  )
    throw new HttpError(401, "Invalid payment signature.");
  const computed = crypto
    .createHmac("sha512", env.paystackSecretKey)
    .update(rawBody)
    .digest();
  if (!crypto.timingSafeEqual(computed, Buffer.from(signature, "hex")))
    throw new HttpError(401, "Invalid payment signature.");
  // Query canonical provider data, not a mobile callback or webhook metadata.
  const data = await providerRequest(
    (charge ? "/transaction/verify/" : "/transfer/verify/") +
      encodeURIComponent(ref),
  );
  if (data.reference !== ref)
    throw new HttpError(409, "Provider reference mismatch.");
  if (charge) applyCharge(data);
  else applyWithdrawal(data);
  return true;
}
