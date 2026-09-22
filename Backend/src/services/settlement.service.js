import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { assertSettlementReady } from "./fulfillment.service.js";
const now = () => new Date().toISOString();
async function paystack(route, body) {
  if (!env.paystackSecretKey || env.paymentProvider !== "paystack")
    throw new HttpError(
      503,
      "Bank payouts are not configured yet. Your earnings remain held.",
    );
  if (
    env.isProduction &&
    env.paystackMode !== "test" &&
    !env.paystackSecretKey.startsWith("sk_live_")
  )
    throw new HttpError(503, "Live payout credentials are not configured.");
  const response = await fetch(
    `${env.paystackBaseUrl || "https://api.paystack.co"}${route}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${env.paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.status)
    throw new HttpError(
      502,
      "The payout provider could not complete this request. Funds have not been marked released.",
    );
  return result.data;
}
export async function banks() {
  return (await paystack("/bank?currency=NGN&perPage=100")).map((b) => ({
    name: b.name,
    code: b.code,
  }));
}
export function recipient(userId) {
  const row = db
    .prepare(
      "SELECT account_name,bank_code,account_last4 FROM commerce_payout_recipients WHERE user_id=?",
    )
    .get(userId);
  return row
    ? {
        accountName: row.account_name,
        bankCode: row.bank_code,
        last4: row.account_last4,
      }
    : null;
}
export async function saveRecipient(auth, body) {
  const input = z
    .object({
      accountNumber: z.string().regex(/^\d{10}$/),
      bankCode: z.string().regex(/^\d{2,12}$/),
      password: z.string().min(1).max(72),
    })
    .parse(body);
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(auth.user_id);
  if (!user || !(await bcrypt.compare(input.password, user.password_hash)))
    throw new HttpError(
      403,
      "Confirm your current password to change payout details.",
    );
  const account = await paystack(
    `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`,
  );
  const created = await paystack("/transferrecipient", {
    type: "nuban",
    name: account.account_name,
    account_number: input.accountNumber,
    bank_code: input.bankCode,
    currency: "NGN",
  });
  db.prepare(
    `INSERT INTO commerce_payout_recipients(user_id,recipient_code,account_name,bank_code,account_last4,updated_at) VALUES(?,?,?,?,?,?)
 ON CONFLICT(user_id) DO UPDATE SET recipient_code=excluded.recipient_code,account_name=excluded.account_name,bank_code=excluded.bank_code,account_last4=excluded.account_last4,updated_at=excluded.updated_at`,
  ).run(
    auth.user_id,
    created.recipient_code,
    account.account_name,
    input.bankCode,
    input.accountNumber.slice(-4),
    now(),
  );
  return recipient(auth.user_id);
}
export function applyTransfer(data) {
  const transfer = db
    .prepare("SELECT * FROM settlement_transfers WHERE reference=?")
    .get(String(data?.reference || ""));
  if (!transfer) return applyEarningTransfer(data);
  const payout = db
    .prepare("SELECT * FROM payouts WHERE id=?")
    .get(transfer.payout_id);
  if (
    Number(data.amount) !== payout.seller_amount_kobo ||
    data.currency !== "NGN" ||
    data.recipient?.recipient_code !== transfer.recipient_code
  )
    throw new HttpError(422, "Transfer details do not match the settlement.");
  const status = String(data.status || "pending");
  // Signed provider events can arrive out of order. A reversal is terminal; older
  // pending/failed notifications must never turn a successful transfer into another payout.
  if (
    transfer.status === "reversed" ||
    (transfer.status === "success" && status !== "reversed")
  )
    return { received: true, idempotent: true };
  transaction(() => {
    db.prepare(
      "UPDATE settlement_transfers SET status=?,provider_transfer_code=?,updated_at=? WHERE payout_id=?",
    ).run(status, String(data.transfer_code || ""), now(), payout.id);
    if (status === "success") {
      db.prepare(
        "UPDATE payouts SET status='released',released_at=?,hold_reason='',updated_at=? WHERE id=?",
      ).run(now(), now(), payout.id);
      db.prepare(
        "UPDATE orders SET payout_status='released',updated_at=? WHERE id=?",
      ).run(now(), payout.order_id);
    } else if (["failed", "reversed"].includes(status)) {
      db.prepare(
        "UPDATE payouts SET status='blocked',hold_reason=?,updated_at=? WHERE id=?",
      ).run(
        "Transfer " + status + ". Administrator reconciliation required.",
        now(),
        payout.id,
      );
      db.prepare(
        "UPDATE orders SET payout_status='blocked',updated_at=? WHERE id=?",
      ).run(now(), payout.order_id);
    }
  });
  return { received: true };
}
export async function settlePayout(payoutId) {
  let transfer;
  const payout = transaction(() => {
    const p = db.prepare("SELECT * FROM payouts WHERE id=?").get(payoutId);
    if (!p || p.status !== "eligible" || p.source_type !== "store_order")
      return null;
    assertSettlementReady(p.order_id);
    const r = db
      .prepare("SELECT * FROM commerce_payout_recipients WHERE user_id=?")
      .get(p.seller_id);
    if (!r) return null;
    db.prepare(
      `INSERT INTO settlement_transfers(payout_id,reference,recipient_code,status,updated_at) VALUES(?,?,?,'created',?) ON CONFLICT(payout_id) DO NOTHING`,
    ).run(p.id, crypto.randomUUID(), r.recipient_code, now());
    transfer = db
      .prepare("SELECT * FROM settlement_transfers WHERE payout_id=?")
      .get(p.id);
    return p;
  });
  if (
    !payout ||
    !transfer ||
    ["success", "failed", "reversed", "otp"].includes(transfer.status)
  )
    return;
  // Stable reference and recipient survive timeouts/restarts. Never generate a second transfer.
  let data;
  if (transfer.status !== "created") {
    const verified = await paystack(
      `/transfer/verify/${encodeURIComponent(transfer.reference)}`,
    );
    applyTransfer(verified);
    return;
  }
  try {
    data = await paystack("/transfer", {
      source: "balance",
      amount: payout.seller_amount_kobo,
      currency: "NGN",
      recipient: transfer.recipient_code,
      reference: transfer.reference,
      reason: "Gleenc verified order settlement",
    });
  } catch (error) {
    // A timeout may happen after acceptance. Reconcile the same reference.
    try {
      const verified = await paystack(
        `/transfer/verify/${encodeURIComponent(transfer.reference)}`,
      );
      applyTransfer(verified);
      return;
    } catch {
      throw error;
    }
  }

  if (data.status === "success") {
    // Verification returns expanded recipient data; don't infer success from queuing.
    const verified = await paystack(
      `/transfer/verify/${encodeURIComponent(transfer.reference)}`,
    );
    applyTransfer(verified);
  } else {
    db.prepare(
      "UPDATE settlement_transfers SET status=?,provider_transfer_code=?,updated_at=? WHERE payout_id=? AND status NOT IN ('success','reversed','failed')",
    ).run(
      String(data.status || "pending"),
      String(data.transfer_code || ""),
      now(),
      payout.id,
    );
  }
}
export function startSettlementWorker() {
  if (process.env.ENABLE_AUTOMATIC_SETTLEMENT !== "true") return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for(const e of process.env.ENABLE_EARNING_SETTLEMENT === 'true' ? db.prepare(`SELECT e.id FROM earning_payouts e
        JOIN payouts p ON p.order_id=e.order_id JOIN orders o ON o.id=e.order_id
        JOIN commerce_payout_recipients r ON r.user_id=e.seller_id
        WHERE e.status='on_hold' AND p.status IN ('eligible','released') AND o.status='completed' AND o.payment_status='paid'
        ORDER BY e.updated_at LIMIT 25`).all() : []) {
        try { await settleEarning(e.id); } catch { console.error('[settlement] Earning transfer held or pending reconciliation.'); }
        db.prepare('UPDATE earning_payouts SET updated_at=? WHERE id=?').run(now(),e.id);
      }
      for (const p of db
        .prepare(
          "SELECT id FROM payouts WHERE status='eligible' AND source_type='store_order' ORDER BY created_at LIMIT 25",
        )
        .all()) {
        try {
          await settlePayout(p.id);
        } catch {
          console.error(
            "[settlement] Transfer pending; will retry/reconcile without changing reference.",
          );
        }
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 30000);
  timer.unref();
  return () => clearInterval(timer);
}

export function applyEarningTransfer(data) {
  const t=db.prepare('SELECT * FROM earning_transfers WHERE reference=?').get(String(data?.reference||''));
  if(!t) return {ignored:true};
  const p=db.prepare('SELECT * FROM earning_payouts WHERE id=?').get(t.payout_id);
  if(Number(data.amount)!==p.seller_amount_kobo || data.currency!=='NGN' || data.recipient?.recipient_code!==t.recipient_code)
    throw new HttpError(422,'Transfer details do not match the earning.');
  const status=String(data.status||'pending');
  if(t.status==='reversed'||(t.status==='success'&&status!=='reversed')) return {received:true,idempotent:true};
  transaction(()=>{
    db.prepare('UPDATE earning_transfers SET status=?,provider_transfer_code=?,updated_at=? WHERE payout_id=?').run(status,String(data.transfer_code||''),now(),p.id);
    if(status==='success') db.prepare("UPDATE earning_payouts SET status='released',released_at=?,hold_reason='',updated_at=? WHERE id=?").run(now(),now(),p.id);
    else if(['failed','reversed'].includes(status)) db.prepare("UPDATE earning_payouts SET status='blocked',hold_reason=?,updated_at=? WHERE id=?").run('Transfer '+status+'. Administrator reconciliation required.',now(),p.id);
  });
  return {received:true};
}

export async function settleEarning(id) {
  let transfer;
  const p=transaction(()=>{
    const payout=db.prepare('SELECT * FROM earning_payouts WHERE id=?').get(id);
    if(!payout||payout.status!=='on_hold') return null;
    assertSettlementReady(payout.order_id);
    const parent=db.prepare('SELECT status FROM payouts WHERE order_id=?').get(payout.order_id);
    if(!parent||!['eligible','released'].includes(parent.status)) return null;
    const account=db.prepare('SELECT recipient_code FROM commerce_payout_recipients WHERE user_id=?').get(payout.seller_id);
    if(!account) return null;
    db.prepare(`INSERT INTO earning_transfers(payout_id,reference,recipient_code,status,updated_at) VALUES(?,?,?,'created',?) ON CONFLICT(payout_id) DO NOTHING`).run(id,crypto.randomUUID(),account.recipient_code,now());
    transfer=db.prepare('SELECT * FROM earning_transfers WHERE payout_id=?').get(id);
    return payout;
  });
  if(!p||!transfer||['success','failed','reversed','otp'].includes(transfer.status)) return;
  const verify=async()=>applyEarningTransfer(await paystack('/transfer/verify/'+encodeURIComponent(transfer.reference)));
  if(transfer.status!=='created') return verify();
  let data;
  try {data=await paystack('/transfer',{source:'balance',amount:p.seller_amount_kobo,currency:'NGN',recipient:transfer.recipient_code,reference:transfer.reference,reason:'Gleenc verified '+p.mode+' earning'});}
  catch(error){try{return await verify();}catch{throw error;}}
  if(data.status==='success') return verify();
  db.prepare("UPDATE earning_transfers SET status=?,provider_transfer_code=?,updated_at=? WHERE payout_id=? AND status NOT IN ('success','failed','reversed')").run(String(data.status||'pending'),String(data.transfer_code||''),now(),id);
}
