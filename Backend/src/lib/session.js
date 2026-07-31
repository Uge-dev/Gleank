import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../db/database.js";
import { createId } from "./ids.js";

export const sessionCookieName = "gleank_session";
export const riderSessionCookieName = "gleank_rider_session";
export const adminSessionCookieName = "gleank_admin_session";

const PORTAL_COOKIE_NAMES = {
  user: sessionCookieName,
  rider: riderSessionCookieName,
  admin: adminSessionCookieName,
};

const PORTAL_ROLES = {
  user: new Set(["buyer", "seller"]),
  rider: new Set(["rider"]),
  admin: new Set(["admin"]),
};

function normalizePortal(value) {
  return Object.hasOwn(PORTAL_COOKIE_NAMES, value) ? value : "user";
}

export function sessionPortalForRole(role) {
  if (role === "rider") return "rider";
  if (role === "admin") return "admin";
  return "user";
}

export function sessionCookieNameForPortal(portal = "user") {
  return PORTAL_COOKIE_NAMES[normalizePortal(portal)];
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export function createSession(userId, meta = {}) {
  const userRole = db.prepare("SELECT role FROM users WHERE id = ?").get(userId)?.role;
  const portal = normalizePortal(meta.portal || sessionPortalForRole(userRole));
  if (!PORTAL_ROLES[portal].has(userRole)) {
    throw new Error("The account role does not match the requested login portal.");
  }
  const sessionId = createId("ses");
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + env.sessionDays * 24 * 60 * 60 * 1_000,
  );

  const token = jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      portal,
    },
    env.jwtSecret,
    {
      expiresIn: `${env.sessionDays}d`,
      issuer: "gleank-api",
      audience: `gleank-${portal}`,
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

  return { id: sessionId, token, expiresAt };
}

export function verifySessionToken(token, expectedPortal = "user") {
  const portal = normalizePortal(expectedPortal);
  const payload = jwt.verify(token, env.jwtSecret, {
    issuer: "gleank-api",
    audience: `gleank-${portal}`,
  });

  if (payload.portal !== portal) return null;

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
    !PORTAL_ROLES[portal].has(session.role) ||
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
      audience: ["gleank-user", "gleank-rider", "gleank-admin"],
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
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: env.sessionDays * 24 * 60 * 60 * 1_000,
  };
}
