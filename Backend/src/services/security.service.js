import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
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

function normalizeMeta(meta = {}) {
  return {
    ipAddress: clean(meta.ipAddress, 120),
    userAgent: clean(meta.userAgent, 500),
    currentSessionId: clean(meta.currentSessionId, 160),
  };
}

function passwordResetExpiry() {
  const minutes = Number(env.passwordResetMinutes || 30);
  return new Date(Date.now() + minutes * 60 * 1_000);
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function assertPasswordPolicy(password) {
  const policy = validatePasswordStrength(password);

  if (!policy.valid) {
    throw new HttpError(422, policy.issues[0] || "Choose a stronger password.", policy.issues);
  }
}

function isSmtpConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass && getMailFrom());
}

function getMailFrom() {
  if (env.emailFrom) return env.emailFrom;

  if (env.smtpFromEmail) {
    const safeName = String(env.smtpFromName || "Gleenc").replace(/[<>]/g, "").trim();
    return safeName ? `"${safeName}" <${env.smtpFromEmail}>` : env.smtpFromEmail;
  }

  return env.smtpUser || "";
}

function queueSecurityEmail(label, send) {
  void send().catch((error) => {
    console.error(
      `[security-email:${label}]`,
      error instanceof Error ? error.message : error,
    );
  });
}

async function sendLoggedInPasswordResetCodeEmail({ to, name, code, expiresAt }) {
  if (!isSmtpConfigured()) {
    throw new HttpError(
      500,
      "Email delivery is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM or SMTP_FROM_EMAIL in Backend/.env.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  const displayName = name || "there";
  const expiryText = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiresAt));

  const subject = "Your Gleenc password reset code";
  const text = `Hi ${displayName},\n\nYour Gleenc password reset code is ${code}.\n\nThis code expires at ${expiryText}. If you did not request this, ignore this email and keep your account secure.\n\nGleenc Security`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:28px;">
        <p style="margin:0 0 10px;color:#f97316;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px;">Gleenc Security</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;">Password reset code</h1>
        <p style="margin:0 0 18px;color:#475569;line-height:1.6;">Hi ${displayName}, use this code to confirm it is really you before changing your password.</p>
        <div style="font-size:34px;font-weight:900;letter-spacing:8px;background:#fff7ed;color:#f97316;border-radius:18px;padding:18px;text-align:center;">${code}</div>
        <p style="margin:18px 0 0;color:#64748b;line-height:1.6;">This code expires at ${expiryText}. If you did not request it, ignore this email.</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: getMailFrom(),
    to,
    subject,
    text,
    html,
  });
}

function findPasswordResetCode(userId, code) {
  return db
    .prepare(
      `
        SELECT *
        FROM password_reset_tokens
        WHERE user_id = ?
          AND token_hash = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(userId, hashToken(code));
}

function assertValidResetCode(userId, code) {
  const reset = findPasswordResetCode(userId, code);

  if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, "This verification code is invalid or has expired.");
  }

  return reset;
}

export function createSecurityEvent(userId, eventType, metadata = {}, meta = {}) {
  if (!userId) return;

  const cleanMeta = normalizeMeta(meta);

  db.prepare(
    `
      INSERT INTO user_security_events (
        id,
        user_id,
        event_type,
        metadata,
        ip_address,
        user_agent,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    createId("sec"),
    userId,
    clean(eventType, 80),
    JSON.stringify(metadata || {}),
    cleanMeta.ipAddress,
    cleanMeta.userAgent,
    new Date().toISOString(),
  );
}

export function createLoginAttempt({
  email = "",
  userId = null,
  success = false,
  reason = "",
  meta = {},
}) {
  const cleanMeta = normalizeMeta(meta);

  db.prepare(
    `
      INSERT INTO login_attempts (
        id,
        email,
        user_id,
        ip_address,
        user_agent,
        success,
        reason,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    createId("lat"),
    clean(email.toLowerCase(), 160),
    userId,
    cleanMeta.ipAddress,
    cleanMeta.userAgent,
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
  db.prepare(
    `
      INSERT INTO email_verification_tokens (
        id,
        user_id,
        token_hash,
        expires_at,
        used_at,
        created_at
      )
      VALUES (?, ?, ?, ?, NULL, ?)
    `,
  ).run(
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
    db.prepare(
      "UPDATE users SET email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?",
    ).run(now, now, row.user_id);

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

  assertPasswordPolicy(nextPassword);

  const passwordHash = await bcrypt.hash(nextPassword, 12);
  const now = new Date().toISOString();

  transaction(() => {
    updateUserPassword(userId, passwordHash, now);
    deleteSessionsForUser(userId, meta.currentSessionId || "");
    createSecurityEvent(userId, "password_changed", {}, meta);
  });

  return { message: "Password updated successfully." };
}

export async function requestLoggedInPasswordReset(userId, meta = {}) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "Account was not found.");

  if (!user.email_verified) {
    throw new HttpError(403, "Verify your email before resetting your password from account security.");
  }

  const code = generateSixDigitCode();
  const expiresAt = passwordResetExpiry();
  const now = new Date().toISOString();

  transaction(() => {
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
    db.prepare(
      `
        INSERT INTO password_reset_tokens (
          id,
          user_id,
          token_hash,
          expires_at,
          used_at,
          created_at
        )
        VALUES (?, ?, ?, ?, NULL, ?)
      `,
    ).run(createId("pwr"), userId, hashToken(code), expiresAt.toISOString(), now);

    createSecurityEvent(userId, "password_reset_code_requested", {}, meta);
  });

  queueSecurityEmail("password-reset-code", () => sendLoggedInPasswordResetCodeEmail({
    to: user.email,
    name: user.name,
    code,
    expiresAt: expiresAt.toISOString(),
  }));

  return {
    message: "A verification code is being sent to your verified email address.",
  };
}

export function verifyLoggedInPasswordResetCode(userId, code, meta = {}) {
  assertValidResetCode(userId, code);
  createSecurityEvent(userId, "password_reset_code_verified", {}, meta);

  return {
    message: "Code verified. You can now create a new password.",
  };
}

export async function completeLoggedInPasswordReset(userId, input, meta = {}) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "Account was not found.");

  const code = clean(input.code, 20);
  const nextPassword = String(input.newPassword || input.password || "");
  const reset = assertValidResetCode(userId, code);

  assertPasswordPolicy(nextPassword);

  const passwordHash = await bcrypt.hash(nextPassword, 12);
  const now = new Date().toISOString();

  transaction(() => {
    updateUserPassword(userId, passwordHash, now);
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(now, reset.id);
    deleteSessionsForUser(userId, meta.currentSessionId || "");
    createSecurityEvent(userId, "password_reset_completed_logged_in", {}, meta);
  });

  return {
    message: "Password updated successfully. Other active sessions have been signed out.",
  };
}

export function getAccountSecurity(user) {
  const userId = user.user_id || user.id;
  const row = findUserById(userId) || user;
  const rows = db
    .prepare(
      `
        SELECT event_type, metadata, ip_address, user_agent, created_at
        FROM user_security_events
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `,
    )
    .all(userId);

  return {
    user: serializeUser(row),
    sessions: listActiveSessionsForUser(userId),
    events: rows.map((event) => ({
      eventType: event.event_type,
      metadata: event.metadata ? JSON.parse(event.metadata) : {},
      ipAddress: event.ip_address || "",
      userAgent: event.user_agent || "",
      createdAt: event.created_at,
    })),
  };
}

export function logoutAllDevices(userId, currentSessionId = "", meta = {}) {
  deleteSessionsForUser(userId, currentSessionId);
  createSecurityEvent(
    userId,
    "logout_all_devices",
    { keptCurrentSession: Boolean(currentSessionId) },
    meta,
  );

  return { message: "Other active sessions have been signed out." };
}
