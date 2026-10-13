import { z } from "zod";
import { db } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { id, now } from "./core.js";
export function registerPush(userId, body) {
  const d = z
    .object({
      token: z
        .string()
        .max(200)
        .regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/),
      projectId: z.string().uuid(),
      platform: z.enum(["android", "ios"]),
    })
    .strict()
    .parse(body);
  if (
    !process.env.EXPO_PROJECT_ID ||
    d.projectId !== process.env.EXPO_PROJECT_ID
  )
    throw new HttpError(
      422,
      "Push project is not configured or does not match this app.",
    );
  db.prepare(
    "INSERT INTO shared_push_devices(token,user_id,platform,active,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,active=1,updated_at=excluded.updated_at",
  ).run(d.token, userId, d.platform, now());
  return { registered: true };
}
export async function sendPushJobs() {
  if (!process.env.EXPO_PUSH_ACCESS_TOKEN) return;
  const jobs = db
    .prepare(
      "SELECT * FROM shared_push_jobs WHERE status='queued' AND available_at<=? ORDER BY created_at LIMIT 30",
    )
    .all(now());
  for (const job of jobs) {
    const n = db
      .prepare("SELECT * FROM shared_notifications WHERE id=?")
      .get(job.notification_id);
    if (!n || n.read_at) {
      db.prepare("UPDATE shared_push_jobs SET status='done' WHERE id=?").run(
        job.id,
      );
      continue;
    }
    const settings = db
      .prepare("SELECT data_json FROM shared_settings WHERE user_id=?")
      .get(n.user_id);
    let prefs = {};
    try {
      prefs = JSON.parse(settings?.data_json || "{}");
    } catch {}
    const type =
      n.kind === "message"
        ? "messageNotifications"
        : ["order", "sale", "delivery", "delivery-confirmed"].includes(n.kind)
          ? "orderNotifications"
          : "activityNotifications";
    const devices = db
      .prepare(
        "SELECT token FROM shared_push_devices d JOIN users u ON u.id=d.user_id WHERE d.user_id=? AND d.active=1 AND u.is_active=1",
      )
      .all(n.user_id);
    if (!devices.length || prefs[type] === false) {
      db.prepare("UPDATE shared_push_jobs SET status='done' WHERE id=?").run(
        job.id,
      );
      continue;
    }
    if (
      db
        .prepare(
          "UPDATE shared_push_jobs SET status='sending',attempts=attempts+1 WHERE id=? AND status='queued'",
        )
        .run(job.id).changes !== 1
    )
      continue;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.EXPO_PUSH_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          devices.map((d) => ({
            to: d.token,
            title: "Gleenc",
            body: "You have new activity",
            sound: "default",
            data: { notificationId: n.id, kind: n.kind, targetId: n.target_id },
            channelId: "activity",
          })),
        ),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.data))
        throw new Error("Push service unavailable.");
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i];
        if (ticket.details?.error === "DeviceNotRegistered")
          db.prepare(
            "UPDATE shared_push_devices SET active=0 WHERE token=?",
          ).run(devices[i].token);
        else if (ticket.status === "error")
          throw new Error("Push service rejected request.");
        else if (ticket.id)
          db.prepare(
            "INSERT INTO shared_push_receipts(id,token,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
          ).run(ticket.id, devices[i].token, now());
      }
      db.prepare("UPDATE shared_push_jobs SET status='done' WHERE id=?").run(
        job.id,
      );
    } catch {
      db.prepare(
        "UPDATE shared_push_jobs SET status=?,available_at=? WHERE id=?",
      ).run(
        job.attempts >= 4 ? "failed" : "queued",
        new Date(
          Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts),
        ).toISOString(),
        job.id,
      );
    }
  }
  const receipts = db
    .prepare(
      "SELECT id,token FROM shared_push_receipts WHERE created_at<? LIMIT 100",
    )
    .all(new Date(Date.now() - 15 * 60000).toISOString());
  if (receipts.length) {
    try {
      const r = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.EXPO_PUSH_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: receipts.map((r) => r.id) }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      if (r.ok)
        for (const receipt of receipts) {
          const status = data.data?.[receipt.id];
          if (!status) continue;
          if (status.details?.error === "DeviceNotRegistered")
            db.prepare(
              "UPDATE shared_push_devices SET active=0 WHERE token=?",
            ).run(receipt.token);
          db.prepare("DELETE FROM shared_push_receipts WHERE id=?").run(
            receipt.id,
          );
        }
    } catch {}
  }
  // Recover a crashed sender; push retries are harmless and identified by notification ID.
  db.prepare(
    "UPDATE shared_push_jobs SET status='queued' WHERE status='sending' AND available_at<?",
  ).run(new Date(Date.now() - 5 * 60000).toISOString());
}
