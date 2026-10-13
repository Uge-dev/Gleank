import { db, transaction } from "../db/database.js";
import { now, lockUsers } from "./core.js";
import { publishDue } from "./catalogue.js";
import { ownedCheckout, releaseCheckoutStock } from "./checkout.js";
import { verifyCheckout, verifyWithdrawal, verifyTopup } from "./payments.js";
import { releaseEligible, processRefund } from "./orders.js";
import { recoverPayment } from "./recovery.js";
import { syncLegacyPosts } from "./discovery.js";
import { sendPushJobs } from "./push.js";
export async function runSharedJobs() {
  syncLegacyPosts();
  publishDue();
  const expired = db
    .prepare(
      "SELECT id,buyer_id,status FROM shared_checkouts WHERE expires_at<=? AND status IN ('ready','failed','initializing','pending') ORDER BY expires_at LIMIT 100",
    )
    .all(now());
  for (const c of expired) {
    try {
      if (["initializing", "pending"].includes(c.status))
        await verifyCheckout(c.buyer_id, c.id);
      transaction(() => {
        lockUsers([c.buyer_id]);
        const current = ownedCheckout(c.buyer_id, c.id);
        if (
          ["ready", "failed"].includes(current.status) &&
          !current.authorization_url
        )
          releaseCheckoutStock(current, "expired");
      });
    } catch {
      /* An uncertain remote payment keeps its reservation until reconciled. */
    }
  }
  for (const r of db
    .prepare(
      "SELECT id FROM shared_refunds WHERE status IN ('queued','pending') ORDER BY created_at LIMIT 30",
    )
    .all()) {
    try {
      await processRefund(r.id);
    } catch {}
  }
  for (const r of db
    .prepare(
      "SELECT id,user_id FROM shared_transfers WHERE status='pending' ORDER BY created_at LIMIT 30",
    )
    .all()) {
    try {
      await verifyWithdrawal(r.user_id, r.id);
    } catch {}
  }
  for (const r of db
    .prepare(
      "SELECT id,user_id FROM shared_topups WHERE status IN ('pending','initializing') ORDER BY created_at LIMIT 30",
    )
    .all()) {
    try {
      await verifyTopup(r.user_id, r.id);
    } catch {}
  }
  for (const r of db
    .prepare(
      "SELECT id FROM shared_payment_recoveries WHERE status IN ('queued','pending') LIMIT 30",
    )
    .all()) {
    try {
      await recoverPayment(r.id);
    } catch {}
  }
  releaseEligible();
  await sendPushJobs();
  db.prepare("DELETE FROM shared_download_tokens WHERE expires_at<?").run(
    now(),
  );
  db.prepare("DELETE FROM shared_identity_challenges WHERE expires_at<?").run(
    now(),
  );
  // Refresh history is retained for the full session lifetime to detect replay.
  db.prepare(
    "DELETE FROM shared_refresh_history WHERE session_id IN (SELECT id FROM shared_sessions WHERE expires_at<?)",
  ).run(now());
  db.prepare("DELETE FROM shared_sessions WHERE expires_at<?").run(now());
}
export function startSharedWorker() {
  let stopped = false,
    timer;
  const tick = async () => {
    if (stopped) return;
    try {
      await runSharedJobs();
    } catch (error) {
      console.error("Shared jobs failed:", error.message);
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, 60000);
        timer.unref();
      }
    }
  };
  timer = setTimeout(tick, 1000);
  timer.unref();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
