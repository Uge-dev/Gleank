import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../db/database.js";
import { createId } from "./ids.js";

export const sessionCookieName = "gleank_session";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export function createSession(userId, meta = {}) {
  const sessionId = createId("ses");
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + env.sessionDays * 24 * 60 * 60 * 1_000,
  );

  const token = jwt.sign(
    {
      sub: userId,
      sid: sessionId,
    },
    env.jwtSecret,
    {
      expiresIn: `${env.sessionDays}d`,
      issuer: "gleank-api",
      audience: "gleank-web",
    },
  );

  db.prepare(`
    INSERT INTO sessions (
      id, user_id, token_hash, expires_at, user_agent, ip_address,
      last_used_at, revoked_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    sessionId,
    userId,
    hashToken(token),
    expiresAt.toISOString(),
    clean(meta.userAgent, 500),
    clean(meta.ipAddress, 120),
    now,
    now,
  );

  return { token, expiresAt };
}

export function verifySessionToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, {
    issuer: "gleank-api",
    audience: "gleank-web",
  });

  const session = db
    .prepare(`
      SELECT sessions.id AS session_id, sessions.user_id, sessions.expires_at,
             sessions.created_at AS session_created_at,
             sessions.last_used_at AS session_last_used_at,
             sessions.revoked_at AS session_revoked_at,
             users.id, users.name, users.email, users.role, users.campus, users.phone,
             users.avatar_url, users.is_active, users.email_verified,
             users.email_verified_at, users.phone_verified, users.phone_verified_at,
             users.locked_until, users.last_login_at, users.last_password_change_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.token_hash = ? AND sessions.revoked_at IS NULL
    `)
    .get(payload.sid, hashToken(token));

  if (
    !session ||
    !session.is_active ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  db.prepare("UPDATE sessions SET last_used_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    session.session_id,
  );

  return session;
}

export function deleteSession(token) {
  if (!token) return;

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: "gleank-api",
      audience: "gleank-web",
    });
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      payload.sid,
    );
  } catch {
    // Invalid or expired cookies are simply cleared by the caller.
  }
}

export function deleteSessionsForUser(userId, exceptSessionId = "") {
  if (exceptSessionId) {
    db.prepare(`
      UPDATE sessions
      SET revoked_at = ?
      WHERE user_id = ? AND id != ? AND revoked_at IS NULL
    `).run(new Date().toISOString(), userId, exceptSessionId);
    return;
  }

  db.prepare(`
    UPDATE sessions
    SET revoked_at = ?
    WHERE user_id = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), userId);
}

export function listActiveSessionsForUser(userId) {
  return db
    .prepare(`
      SELECT id, user_agent, ip_address, expires_at, created_at, last_used_at
      FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY COALESCE(last_used_at, created_at) DESC
    `)
    .all(userId, new Date().toISOString())
    .map((row) => ({
      id: row.id,
      userAgent: row.user_agent || "Unknown device",
      ipAddress: row.ip_address || "",
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at || row.created_at,
    }));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.isProduction ? "none" : "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: env.sessionDays * 24 * 60 * 60 * 1_000,
  };
}
