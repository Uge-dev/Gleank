import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import "../db/rider-migrations.js";
import { env } from "../config/env.js";
import { createId, slugify } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createSession, deleteSessionsForUser } from "../lib/session.js";
import { serializeStore, serializeUser } from "../lib/serializers.js";
import { db, transaction } from "../db/database.js";
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
  recordPasswordResetAttempt,
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
import { markRiderPresenceOnline } from "./rider-presence.service.js";

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

function createRiderProfileFromAuth(userId, input, now) {
  db.prepare(`
    INSERT INTO rider_profiles (
      id, user_id, full_name, phone, whatsapp_phone, vehicle_type, vehicle_plate,
      coverage_area, home_address, emergency_contact_name, emergency_contact_phone,
      guarantor_name, guarantor_phone, identity_document_url, selfie_url, nin_last4,
      transport_type, max_package_size, max_weight_class, fragile_handling_ability,
      delivery_bag_type, service_zone_ids, gps_permission_status,
      can_receive_auto_dispatch, capacity_locked, live_face_verified,
      verification_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'pending_review', ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name,
      phone = excluded.phone,
      whatsapp_phone = excluded.whatsapp_phone,
      vehicle_type = excluded.vehicle_type,
      vehicle_plate = excluded.vehicle_plate,
      coverage_area = excluded.coverage_area,
      home_address = excluded.home_address,
      transport_type = excluded.transport_type,
      max_package_size = excluded.max_package_size,
      max_weight_class = excluded.max_weight_class,
      fragile_handling_ability = excluded.fragile_handling_ability,
      delivery_bag_type = excluded.delivery_bag_type,
      service_zone_ids = excluded.service_zone_ids,
      gps_permission_status = excluded.gps_permission_status,
      can_receive_auto_dispatch = excluded.can_receive_auto_dispatch,
      capacity_locked = 1,
      live_face_verified = excluded.live_face_verified,
      updated_at = excluded.updated_at
  `).run(
    createId("rpr"),
    userId,
    input.name,
    input.phone || "",
    input.whatsappPhone || input.phone || "",
    input.vehicleType || "",
    input.vehiclePlate || "",
    input.coverageArea || input.campus || "",
    input.homeAddress || "",
    input.identityDocumentUrl || null,
    input.selfieUrl || null,
    input.transportType || input.vehicleType || "motorcycle",
    input.maxPackageSize || "small_medium",
    input.maxWeightClass || "up_to_medium",
    input.fragileHandlingAbility || "can_handle_fragile",
    input.deliveryBagType || "medium_delivery_bag",
    JSON.stringify(Array.isArray(input.serviceZoneIds) ? input.serviceZoneIds : []),
    input.gpsPermissionStatus || "gps_disabled",
    input.canReceiveAutoDispatch === false ? 0 : 1,
    now,
    now,
  );
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function passwordResetExpiry() {
  const now = new Date();
  return new Date(now.getTime() + env.passwordResetMinutes * 60 * 1_000);
}

const resetRequestMessage =
  "If an active account matches that email, password reset instructions are being prepared.";
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_COOLDOWN_MS = 15 * 60 * 1000;

async function deliverAuthEmail(label, send, options = {}) {
  try {
    return await send();
  } catch (error) {
    console.error(
      `[auth-email:${label}]`,
      error instanceof Error ? error.message : error,
    );

    if (options.required) {
      throw new HttpError(
        502,
        "Gleenc could not send the email right now. Please check the Brevo SMTP setup and try again.",
      );
    }

    return { sent: false };
  }
}

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

function assertPasswordResetAttemptAllowed(reset) {
  const attempts = Number(reset?.attempt_count || 0);
  const lastAttemptAt = reset?.last_attempt_at
    ? new Date(reset.last_attempt_at).getTime()
    : 0;

  if (
    attempts >= PASSWORD_RESET_MAX_ATTEMPTS &&
    lastAttemptAt > 0 &&
    Date.now() - lastAttemptAt < PASSWORD_RESET_COOLDOWN_MS
  ) {
    const waitMinutes = Math.max(
      1,
      Math.ceil((lastAttemptAt + PASSWORD_RESET_COOLDOWN_MS - Date.now()) / 60_000),
    );
    throw new HttpError(
      429,
      `This password reset link is temporarily locked. Please wait about ${waitMinutes} minute(s) before trying again.`,
    );
  }
}

function shouldApplyDevelopmentRiderDispatchDefaults() {
  return !env.isProduction && (
    env.autoVerifyRidersInDev ||
    env.autoSetRidersOnlineInDev ||
    env.enableTestRiderDispatch
  );
}

function applyDevelopmentRiderDispatchDefaults(userId, now) {
  if (!shouldApplyDevelopmentRiderDispatchDefaults()) return;

  const shouldVerify = env.autoVerifyRidersInDev || env.enableTestRiderDispatch;
  const shouldSetOnline = env.autoSetRidersOnlineInDev;
  const shouldVerifyEmail = env.enableTestRiderDispatch;

  db.prepare(`
    UPDATE users
    SET is_active = 1,
        email_verified = CASE WHEN ? THEN 1 ELSE email_verified END,
        email_verified_at = CASE
          WHEN ? THEN COALESCE(email_verified_at, ?)
          ELSE email_verified_at
        END,
        updated_at = ?
    WHERE id = ? AND role = 'rider'
  `).run(
    shouldVerifyEmail ? 1 : 0,
    shouldVerifyEmail ? 1 : 0,
    now,
    now,
    userId,
  );

  db.prepare(`
    UPDATE rider_profiles
    SET verification_status = CASE WHEN ? THEN 'verified' ELSE verification_status END,
        availability = CASE WHEN ? THEN 'online' ELSE availability END,
        availability_mode = CASE
          WHEN ? AND gps_permission_status = 'gps_enabled' THEN 'online_gps_active'
          WHEN ? THEN 'online_zone_only'
          ELSE availability_mode
        END,
        safety_status = 'normal',
        can_receive_auto_dispatch = 1,
        capacity_locked = 0,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    shouldVerify ? 1 : 0,
    shouldSetOnline ? 1 : 0,
    shouldSetOnline ? 1 : 0,
    shouldSetOnline ? 1 : 0,
    now,
    userId,
  );
}

export async function registerUser(input, meta = {}) {
  const email = String(input.email || "").trim().toLowerCase();

  const existingUser = findUserByEmail(email);
  if (existingUser) {
    if (existingUser.role === "rider" && input.role !== "rider") {
      throw new HttpError(409, "This email is already registered as a rider account. Please use the rider login page.");
    }
    if (input.role === "rider" && existingUser.role !== "rider") {
      throw new HttpError(409, "This email is already registered. Please use a different email or contact support.");
    }
    throw new HttpError(409, "An account already exists with this email. Please login with the correct account type.");
  }

  if (input.role === "rider" && (!input.identityDocumentUrl || !input.selfieUrl)) {
    throw new HttpError(422, "Upload rider government ID and profile/selfie image before creating a rider account.");
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
      email,
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

    if (input.role === "rider") {
      createRiderProfileFromAuth(userId, input, now);
      applyDevelopmentRiderDispatchDefaults(userId, now);
    }

    createSecurityEvent(userId, "account_registered", { role: input.role }, cleanMeta);

    return {
      user: createdUser,
      verification: emailVerified ? null : createEmailVerificationToken(userId),
    };
  });

  if (result.verification) {
    void deliverAuthEmail("verification", () => sendEmailVerificationEmail({
      to: result.user.email,
      name: result.user.name,
      token: result.verification.token,
    }));
  }

  const session = createSession(result.user.id, cleanMeta);
  if (result.user.role === "rider") {
    markRiderPresenceOnline(result.user.id, session.id);
  }

  return {
    user: serializeUser(findUserById(result.user.id) || result.user),
    store: serializeStore(findStoreByOwnerId(result.user.id)),
    session,
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
    createLoginAttempt({
      email,
      userId: user.id,
      success: false,
      reason: "locked",
      meta: cleanMeta,
    });

    throw new HttpError(423, "Too many failed login attempts. Please wait before trying again.");
  }

  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    if (user) {
      const failedCount = Number(user.failed_login_count || 0) + 1;
      const lockedUntil =
        failedCount >= env.loginMaxFailedAttempts
          ? new Date(Date.now() + env.loginLockMinutes * 60 * 1_000).toISOString()
          : null;

      recordFailedLogin(user.id, failedCount, lockedUntil, new Date().toISOString());
    }

    createLoginAttempt({
      email,
      userId: user?.id || null,
      success: false,
      reason: "invalid_credentials",
      meta: cleanMeta,
    });

    throw new HttpError(401, "Email or password is incorrect.");
  }

  if (!user.is_active) {
    createLoginAttempt({
      email,
      userId: user.id,
      success: false,
      reason: "disabled",
      meta: cleanMeta,
    });

    throw new HttpError(403, "This account is currently disabled.");
  }

  const loggedInAt = new Date().toISOString();
  recordSuccessfulLogin(user.id, loggedInAt);
  createLoginAttempt({
    email,
    userId: user.id,
    success: true,
    reason: "success",
    meta: cleanMeta,
  });
  createSecurityEvent(user.id, "login_success", {}, cleanMeta);

  const freshUser = findUserByEmail(email);
  const session = createSession(freshUser.id, cleanMeta);
  if (freshUser.role === "rider") {
    markRiderPresenceOnline(freshUser.id, session.id);
  }

  return {
    user: serializeUser(freshUser),
    store: serializeStore(findStoreByOwnerId(freshUser.id)),
    session,
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

  await deliverAuthEmail(
    "verification-resend",
    () =>
    sendEmailVerificationEmail({
      to: row.email,
      name: row.name,
      token: verification.token,
    }),
    { required: env.isProduction },
  );

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
  const email = String(input.email || "").toLowerCase();
  const user = findUserByEmail(email);
  const cleanMeta = normalizeMeta(meta);

  if (!user || !user.is_active) {
    createLoginAttempt({
      email,
      success: false,
      reason: "password_reset_requested_unknown",
      meta: cleanMeta,
    });

    return { message: resetRequestMessage };
  }

  if (input.role && user.role !== input.role) {
    createLoginAttempt({
      email,
      userId: user.id,
      success: false,
      reason: "password_reset_requested_wrong_role",
      meta: cleanMeta,
    });

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

    createSecurityEvent(user.id, "password_reset_requested", {}, cleanMeta);
  });

  await deliverAuthEmail(
    "password-reset",
    () =>
    sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token,
      role: input.role || user.role,
    }),
    { required: env.isProduction },
  );

  return {
    message: resetRequestMessage,
    ...(!env.isProduction
      ? {
          developmentToken: token,
          passwordResetExpiresAt: expiresAt.toISOString(),
        }
      : {}),
  };
}

export async function resetPassword(input, meta = {}) {
  assertPasswordPolicy(input.password);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const now = new Date().toISOString();

  transaction(() => {
    const reset = findPasswordResetByTokenHash(hashResetToken(input.token));

    if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) {
      throw new HttpError(400, "This password reset link is invalid or has expired.");
    }

    assertPasswordResetAttemptAllowed(reset);

    const user = findUserById(reset.user_id);
    if (!user) {
      throw new HttpError(404, "Account was not found.");
    }

    if (input.role && user.role !== input.role) {
      recordPasswordResetAttempt(reset.id, now);
      throw new HttpError(403, `This password reset link is not for a ${input.role} account.`);
    }

    updateUserPassword(reset.user_id, passwordHash, now);
    markPasswordResetUsed(reset.id, now);
    deleteSessionsForUser(reset.user_id);
    createSecurityEvent(reset.user_id, "password_reset_completed", {}, normalizeMeta(meta));
  });

  return { message: "Your password has been reset. You can now log in." };
}
