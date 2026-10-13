import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
export const TERMS_VERSION = "2026-10-13";
export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
export const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const json = (value) => JSON.stringify(value);
export const parse = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
export const identifier = z
  .string()
  .trim()
  .min(1)
  .max(140)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
export const money = z.number().int().min(0).max(1_000_000_000);
export const page = (query) => ({
  limit: z.coerce.number().int().min(1).max(100).default(30).parse(query.limit),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .default(0)
    .parse(query.offset),
});
export function assertUser(userId) {
  const u = db
    .prepare("SELECT * FROM users WHERE id=? AND is_active=1")
    .get(userId);
  if (!u) throw new HttpError(404, "Account not available.");
  return u;
}
export function lockUsers(ids) {
  for (const u of [...new Set(ids.filter(Boolean))].sort())
    db.prepare("UPDATE users SET updated_at=updated_at WHERE id=?").run(u);
}
export function assertUnblocked(a, b) {
  if (!b || a === b) return;
  if (
    db
      .prepare(
        "SELECT 1 FROM shared_blocks WHERE (user_id=? AND target_id=?) OR (user_id=? AND target_id=?)",
      )
      .get(a, b, b, a)
  )
    throw new HttpError(403, "This interaction is unavailable.");
}
export function assertTerms(userId) {
  if (
    db
      .prepare("SELECT terms_version FROM shared_profiles WHERE user_id=?")
      .get(userId)?.terms_version !== TERMS_VERSION
  )
    throw new HttpError(428, "Accept the current community terms first.");
}
export function audit(actor, action, target, data = {}) {
  db.prepare(
    "INSERT INTO shared_audit(id,actor_id,action,target_id,data_json,created_at) VALUES(?,?,?,?,?,?)",
  ).run(id("audit"), actor || null, action, target, json(data), now());
}
export function notify(userId, kind, target, actorId = "", data = {}) {
  const old = db
    .prepare(
      "SELECT * FROM shared_notifications WHERE user_id=? AND kind=? AND target_id=?",
    )
    .get(userId, kind, target);
  const notificationId = old?.id || id("notification");
  const actors = [
    ...new Set([actorId, ...parse(old?.actors_json, [])].filter(Boolean)),
  ].slice(0, 3);
  db.prepare(
    `INSERT INTO shared_notifications(id,user_id,kind,target_id,actors_json,data_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,kind,target_id) DO UPDATE SET actors_json=excluded.actors_json,data_json=excluded.data_json,read_at=NULL,updated_at=excluded.updated_at`,
  ).run(
    notificationId,
    userId,
    kind,
    target,
    json(actors),
    json(data),
    now(),
    now(),
  );
  if (!old || Date.parse(old.updated_at) < Date.now() - 30000)
    db.prepare(
      "INSERT INTO shared_push_jobs(id,notification_id,available_at,created_at) VALUES(?,?,?,?)",
    ).run(id("push"), notificationId, now(), now());
}
export function assertAmount(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 2_000_000_000)
    throw new HttpError(422, "Amount is outside supported limits.");
  return n;
}

export function assertAdmin(userId) {
  if (assertUser(userId).role !== "admin")
    throw new HttpError(403, "Admin access is required.");
}
