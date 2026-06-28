import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { deleteSessionsForUser, listActiveSessionsForUser } from "../lib/session.js";
import { validatePasswordStrength } from "../lib/password-policy.js";
import { findUserById, updateUserPassword } from "../repositories/user.repository.js";
import { serializeUser } from "../lib/serializers.js";

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export function createSecurityEvent(userId, eventType, metadata = {}, meta = {}) {
  if (!userId) return;
  db.prepare(`
    INSERT INTO user_security_events (
      id, user_id, event_type, metadata, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("sec"),
    userId,
    clean(eventType, 80),
    JSON.stringify(metadata || {}),
    clean(meta.ipAddress, 120),
    clean(meta.userAgent, 500),
    new Date().toISOString(),
  );
}

export function createLoginAttempt({ email = "", userId = null, success = false, reason = "", meta = {} }) {
  db.prepare(`
    INSERT INTO login_attempts (
      id, email, user_id, ip_address, user_agent, success, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("lat"),
    clean(email.toLowerCase(), 160),
    userId,
    clean(meta.ipAddress, 120),
    clean(meta.userAgent, 500),
    success ? 1 : 0,
    clean(reason, 200),
    new Date().toISOString(),
  );
}

export function createEmailVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.emailVerificationMinutes * 60 * 1_000);

  db.prepare("DELETE FROM email_verification_tokens WHERE user_id = ?").run(userId);
  db.prepare(`
    INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)
  `).run(
    createId("evt"),
    userId,
    hashToken(token),
    expiresAt.toISOString(),
    now.toISOString(),
  );

  return { token, expiresAt: expiresAt.toISOString() };
}

export function verifyEmailToken(token, meta = {}) {
  const now = new Date().toISOString();
  const row = db
    .prepare("SELECT * FROM email_verification_tokens WHERE token_hash = ?")
    .get(hashToken(token));

  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, "This email verification link is invalid or has expired.");
  }

  transaction(() => {
    db.prepare("UPDATE users SET email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, row.user_id);
    db.prepare("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?").run(now, row.id);
    createSecurityEvent(row.user_id, "email_verified", {}, meta);
  });

  return serializeUser(findUserById(row.user_id));
}

export async function changePassword(userId, input, meta = {}) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "Account was not found.");

  const currentPassword = String(input.currentPassword || "");
  const nextPassword = String(input.newPassword || input.password || "");

  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    createSecurityEvent(userId, "password_change_failed", { reason: "wrong_current_password" }, meta);
    throw new HttpError(401, "Your current password is incorrect.");
  }

  const policy = validatePasswordStrength(nextPassword);
  if (!policy.valid) {
    throw new HttpError(422, policy.issues[0] || "Choose a stronger password.", policy.issues);
  }

  const passwordHash = await bcrypt.hash(nextPassword, 12);
  const now = new Date().toISOString();

  transaction(() => {
    updateUserPassword(userId, passwordHash, now);
    deleteSessionsForUser(userId, meta.currentSessionId || "");
    createSecurityEvent(userId, "password_changed", {}, meta);
  });

  return { message: "Password updated successfully." };
}

export function getAccountSecurity(user) {
  const rows = db
    .prepare(`
      SELECT event_type, metadata, ip_address, user_agent, created_at
      FROM user_security_events
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `)
    .all(user.user_id || user.id);

  return {
    user: serializeUser(user),
    sessions: listActiveSessionsForUser(user.user_id || user.id),
    events: rows.map((row) => ({
      eventType: row.event_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      ipAddress: row.ip_address || "",
      userAgent: row.user_agent || "",
      createdAt: row.created_at,
    })),
  };
}

export function logoutAllDevices(userId, currentSessionId = "", meta = {}) {
  deleteSessionsForUser(userId, currentSessionId);
  createSecurityEvent(userId, "logout_all_devices", { keptCurrentSession: Boolean(currentSessionId) }, meta);
  return { message: "Other active sessions have been signed out." };
}
