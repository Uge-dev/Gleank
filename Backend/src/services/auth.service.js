import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { createId, slugify } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createSession, deleteSessionsForUser } from "../lib/session.js";
import { serializeStore, serializeUser } from "../lib/serializers.js";
import { transaction } from "../db/database.js";
import { validatePasswordStrength } from "../lib/password-policy.js";
import { sendEmailVerificationEmail, sendPasswordResetEmail } from "./email.service.js";
import {
  createEmailVerificationToken,
  createLoginAttempt,
  createSecurityEvent,
  hashToken,
  verifyEmailToken,
} from "./security.service.js";
import { ensureSellerSubscription } from "./subscription.service.js";
import {
  createPasswordReset,
  deletePasswordResetsForUser,
  findPasswordResetByTokenHash,
  markPasswordResetUsed,
} from "../repositories/password-reset.repository.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
  recordFailedLogin,
  recordSuccessfulLogin,
  updateUserPassword,
} from "../repositories/user.repository.js";
import {
  createStore,
  findStoreByOwnerId,
  findStoreBySlug,
} from "../repositories/store.repository.js";

function uniqueStoreSlug(storeName) {
  const base = slugify(storeName);
  let candidate = base;
  let suffix = 2;

  while (findStoreBySlug(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function passwordResetExpiry() {
  const now = new Date();
  return new Date(now.getTime() + env.passwordResetMinutes * 60 * 1_000);
}

const resetRequestMessage =
  "If an active account matches that email, password reset instructions are ready.";

function normalizeMeta(meta = {}) {
  return {
    ipAddress: meta.ipAddress || "",
    userAgent: meta.userAgent || "",
    currentSessionId: meta.currentSessionId || "",
  };
}

function assertPasswordPolicy(password) {
  const policy = validatePasswordStrength(password);
  if (!policy.valid) {
    throw new HttpError(422, policy.issues[0] || "Choose a stronger password.", policy.issues);
  }
}

export async function registerUser(input, meta = {}) {
  if (findUserByEmail(input.email)) {
    throw new HttpError(409, "An account already exists with this email.");
  }

  assertPasswordPolicy(input.password);

  const cleanMeta = normalizeMeta(meta);
  const now = new Date().toISOString();
  const userId = createId("usr");
  const passwordHash = await bcrypt.hash(input.password, 12);
  const emailVerified = env.autoVerifyAuth;
  const emailVerifiedAt = emailVerified ? now : null;

  const result = transaction(() => {
    const createdUser = createUser({
      id: userId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      campus: input.campus,
      phone: input.phone,
      emailVerified,
      emailVerifiedAt,
      lastPasswordChangeAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (input.role === "seller") {
      createStore({
        id: createId("sto"),
        ownerId: userId,
        slug: uniqueStoreSlug(input.storeName),
        name: input.storeName,
        description: "",
        campus: input.campus,
        category: "General",
        phone: input.phone,
        status: "active",
        verified: false,
        createdAt: now,
        updatedAt: now,
      });
      ensureSellerSubscription(userId);
    }

    createSecurityEvent(userId, "account_registered", { role: input.role }, cleanMeta);

    return {
      user: createdUser,
      verification: emailVerified ? null : createEmailVerificationToken(userId),
    };
  });

  if (result.verification) {
    await sendEmailVerificationEmail({
      to: result.user.email,
      name: result.user.name,
      token: result.verification.token,
    });
  }

  return {
    user: serializeUser(result.user),
    store: serializeStore(findStoreByOwnerId(result.user.id)),
    session: createSession(result.user.id, cleanMeta),
    emailVerificationRequired: !emailVerified,
    ...(!env.isProduction && result.verification
      ? {
          developmentEmailVerificationToken: result.verification.token,
          emailVerificationExpiresAt: result.verification.expiresAt,
        }
      : {}),
  };
}

export async function loginUser(input, meta = {}) {
  const cleanMeta = normalizeMeta(meta);
  const email = String(input.email || "").toLowerCase();
  const user = findUserByEmail(email);

  if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    createLoginAttempt({ email, userId: user.id, success: false, reason: "locked", meta: cleanMeta });
    throw new HttpError(423, "Too many failed login attempts. Please wait before trying again.");
  }

  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    if (user) {
      const failedCount = Number(user.failed_login_count || 0) + 1;
      const lockedUntil = failedCount >= env.loginMaxFailedAttempts
        ? new Date(Date.now() + env.loginLockMinutes * 60 * 1_000).toISOString()
        : null;
      recordFailedLogin(user.id, failedCount, lockedUntil, new Date().toISOString());
    }

    createLoginAttempt({ email, userId: user?.id || null, success: false, reason: "invalid_credentials", meta: cleanMeta });
    throw new HttpError(401, "Email or password is incorrect.");
  }

  if (!user.is_active) {
    createLoginAttempt({ email, userId: user.id, success: false, reason: "disabled", meta: cleanMeta });
    throw new HttpError(403, "This account is currently disabled.");
  }

  const loggedInAt = new Date().toISOString();
  recordSuccessfulLogin(user.id, loggedInAt);
  createLoginAttempt({ email, userId: user.id, success: true, reason: "success", meta: cleanMeta });
  createSecurityEvent(user.id, "login_success", {}, cleanMeta);

  const freshUser = findUserByEmail(email);

  return {
    user: serializeUser(freshUser),
    store: serializeStore(findStoreByOwnerId(freshUser.id)),
    session: createSession(freshUser.id, cleanMeta),
  };
}

export async function resendEmailVerification(userId, meta = {}) {
  const user = findUserByEmail(meta.email || "") || null;
  const account = user?.id === userId ? user : null;
  const row = account || findUserById(userId);

  if (!row) throw new HttpError(404, "Account was not found.");

  if (row.email_verified) {
    return { message: "Your email is already verified.", user: serializeUser(row) };
  }

  const verification = createEmailVerificationToken(row.id);
  await sendEmailVerificationEmail({ to: row.email, name: row.name, token: verification.token });
  createSecurityEvent(row.id, "email_verification_resent", {}, normalizeMeta(meta));

  return {
    message: "Verification instructions have been prepared.",
    ...(!env.isProduction
      ? {
          developmentEmailVerificationToken: verification.token,
          emailVerificationExpiresAt: verification.expiresAt,
        }
      : {}),
  };
}

export function verifyEmail(input, meta = {}) {
  const user = verifyEmailToken(input.token, normalizeMeta(meta));
  return {
    message: "Email verified successfully.",
    user,
    store: serializeStore(findStoreByOwnerId(user.id)),
  };
}

export async function requestPasswordReset(input, meta = {}) {
  const user = findUserByEmail(input.email);

  if (!user || !user.is_active) {
    createLoginAttempt({ email: input.email, success: false, reason: "password_reset_requested_unknown", meta: normalizeMeta(meta) });
    return { message: resetRequestMessage };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = passwordResetExpiry();

  transaction(() => {
    deletePasswordResetsForUser(user.id);
    createPasswordReset({
      id: createId("pwr"),
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    });
    createSecurityEvent(user.id, "password_reset_requested", {}, normalizeMeta(meta));
  });

  await sendPasswordResetEmail({ to: user.email, name: user.name, token });

  return {
    message: resetRequestMessage,
    ...(!env.isProduction && {
      developmentToken: token,
      expiresAt: expiresAt.toISOString(),
    }),
  };
}

export async function resetPassword(input, meta = {}) {
  assertPasswordPolicy(input.password);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const now = new Date().toISOString();

  transaction(() => {
    const reset = findPasswordResetByTokenHash(hashResetToken(input.token));

    if (
      !reset ||
      reset.used_at ||
      new Date(reset.expires_at).getTime() <= Date.now()
    ) {
      throw new HttpError(
        400,
        "This password reset link is invalid or has expired.",
      );
    }

    updateUserPassword(reset.user_id, passwordHash, now);
    markPasswordResetUsed(reset.id, now);
    deleteSessionsForUser(reset.user_id);
    createSecurityEvent(reset.user_id, "password_reset_completed", {}, normalizeMeta(meta));
  });

  return {
    message: "Your password has been reset. You can now log in.",
  };
}
