import crypto from "node:crypto";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { hash, id, now, lockUsers } from "./core.js";
const token = () => crypto.randomBytes(32).toString("base64url");
export function issueMobileSession(userId, deviceName = "Gleenc mobile") {
  const accessToken = token(),
    refreshToken = token();
  const sid = id("device"),
    expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const accessExpiresAt = new Date(Date.now() + 20 * 60000).toISOString();
  db.prepare(
    `INSERT INTO shared_sessions(id,user_id,access_hash,refresh_hash,access_expires_at,expires_at,device_name,created_at) VALUES(?,?,?,?,?,?,?,?)`,
  ).run(
    sid,
    userId,
    hash(accessToken),
    hash(refreshToken),
    accessExpiresAt,
    expiresAt,
    String(deviceName).slice(0, 100),
    now(),
  );
  return {
    accessToken,
    refreshToken,
    accessExpiresAt,
    expiresAt,
    sessionId: sid,
    tokenType: "Bearer",
  };
}
export function verifyMobileToken(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const row = db
    .prepare(
      `SELECT u.*,s.id AS session_id,s.user_id FROM shared_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.access_hash=? AND s.revoked_at IS NULL AND s.access_expires_at>? AND s.expires_at>? AND u.is_active=1 AND u.role IN ('buyer','seller')`,
    )
    .get(hash(value), now(), now());
  return row || null;
}
export function rotateMobileSession(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value || ""))
    throw new HttpError(401, "Session expired. Sign in again.");
  const digest = hash(value);
  const result = transaction(() => {
    const used = db
      .prepare(
        "SELECT session_id FROM shared_refresh_history WHERE token_hash=?",
      )
      .get(digest);
    if (used) {
      db.prepare("UPDATE shared_sessions SET revoked_at=? WHERE id=?").run(
        now(),
        used.session_id,
      );
      return null;
    }
    let row = db
      .prepare("SELECT * FROM shared_sessions WHERE refresh_hash=?")
      .get(digest);
    if (!row) return null;
    lockUsers([row.user_id]);
    row = db.prepare("SELECT * FROM shared_sessions WHERE id=?").get(row.id);
    if (row.refresh_hash !== digest) {
      db.prepare("UPDATE shared_sessions SET revoked_at=? WHERE id=?").run(
        now(),
        row.id,
      );
      return null;
    }
    const u = db
      .prepare("SELECT is_active,role FROM users WHERE id=?")
      .get(row.user_id);
    if (
      row.revoked_at ||
      row.expires_at <= now() ||
      !u?.is_active ||
      !["buyer", "seller"].includes(u.role)
    )
      return null;
    const accessToken = token(),
      refreshToken = token(),
      accessExpiresAt = new Date(
        Math.min(Date.now() + 20 * 60000, Date.parse(row.expires_at)),
      ).toISOString();
    db.prepare(
      "INSERT INTO shared_refresh_history(token_hash,session_id) VALUES(?,?)",
    ).run(digest, row.id);
    db.prepare(
      "UPDATE shared_sessions SET access_hash=?,refresh_hash=?,access_expires_at=? WHERE id=?",
    ).run(hash(accessToken), hash(refreshToken), accessExpiresAt, row.id);
    return {
      accessToken,
      refreshToken,
      accessExpiresAt,
      expiresAt: row.expires_at,
      sessionId: row.id,
      tokenType: "Bearer",
    };
  });
  if (!result)
    throw new HttpError(
      401,
      "Session expired or refresh token reused. Sign in again.",
    );
  return result;
}
export function revokeMobileSession(userId, sessionId) {
  db.prepare(
    "UPDATE shared_sessions SET revoked_at=? WHERE user_id=? AND id=?",
  ).run(now(), userId, sessionId);
}
