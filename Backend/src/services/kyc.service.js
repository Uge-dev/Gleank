import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createNotification, createNotificationForUsers } from "./notification.service.js";
import { logAdminAudit } from "./audit-log.service.js";
import {
  createDojahVerificationSession,
  normalizeDojahWebhook,
  verifyDojahWebhookSignature,
} from "./dojah.service.js";

const KYC_ROLES = new Set(["seller", "rider"]);

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function json(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function jsonArray(value) {
  try {
    return JSON.stringify(Array.isArray(value) ? value : []);
  } catch {
    return "[]";
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function requireKycActor(auth) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  if (!KYC_ROLES.has(auth.role)) {
    throw new HttpError(403, "Verification is available for seller and rider accounts.");
  }
  return {
    userId: auth.user_id || auth.id,
    role: auth.role,
  };
}

function getUser(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function getAdminIds() {
  return db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
    .all()
    .map((row) => row.id);
}

function latestKycForUser(userId, role) {
  return db
    .prepare(`
      SELECT *
      FROM kyc_verifications
      WHERE user_id = ? AND role = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(userId, role);
}

function kycByIdOrUserId(id) {
  return db
    .prepare(`
      SELECT *
      FROM kyc_verifications
      WHERE id = ? OR user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(id, id);
}

function sellerCompletionPercent(userId, kycStatus = "") {
  const user = getUser(userId);
  const store = db.prepare("SELECT * FROM stores WHERE owner_id = ?").get(userId);
  const payout = db.prepare("SELECT * FROM user_payout_accounts WHERE user_id = ?").get(userId);
  const checks = [
    Boolean(user?.email_verified),
    Boolean(user?.phone || store?.phone),
    Boolean(store?.name),
    Boolean(store?.description),
    Boolean(store?.pickup_location || store?.location_area),
    Boolean(store?.logo_url),
    Boolean(payout?.account_number || payout?.bank_name),
    kycStatus === "verified" || store?.verification_status === "approved",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function riderCompletionPercent(userId, kycStatus = "") {
  const user = getUser(userId);
  const profile = db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(userId);
  const checks = [
    Boolean(user?.email_verified),
    Boolean(user?.phone || profile?.phone),
    Boolean(profile?.identity_document_url),
    Boolean(profile?.selfie_url || profile?.profile_photo_url),
    Boolean(profile?.transport_type),
    Boolean(profile?.service_zone_ids && profile.service_zone_ids !== "[]"),
    Boolean(profile?.current_zone_id || profile?.last_known_latitude || profile?.current_lat),
    kycStatus === "verified" || profile?.verification_status === "verified",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function syncKycStatus({ userId, role, provider, reference, status, level, failureReason, requiresAdminReview, adminReviewStatus }) {
  const now = nowIso();
  const verifiedAt = status === "verified" ? now : null;
  const failedAt = ["failed", "rejected"].includes(status) ? now : null;
  const completionPercent =
    role === "seller"
      ? sellerCompletionPercent(userId, status)
      : riderCompletionPercent(userId, status);

  if (role === "seller") {
    db.prepare(`
      UPDATE stores
      SET kyc_provider = ?,
          kyc_reference_id = ?,
          kyc_status = ?,
          kyc_level = ?,
          kyc_started_at = COALESCE(kyc_started_at, ?),
          kyc_verified_at = COALESCE(?, kyc_verified_at),
          kyc_failed_at = COALESCE(?, kyc_failed_at),
          kyc_failure_reason = ?,
          kyc_requires_admin_review = ?,
          kyc_admin_review_status = ?,
          profile_completion_percent = ?,
          verified = CASE WHEN ? = 'verified' THEN 1 ELSE verified END,
          verification_status = CASE
            WHEN ? = 'verified' THEN 'approved'
            WHEN ? IN ('failed', 'rejected') THEN 'rejected'
            WHEN ? = 'resubmission_requested' THEN 'changes_requested'
            ELSE verification_status
          END,
          verified_at = CASE WHEN ? = 'verified' THEN COALESCE(verified_at, ?) ELSE verified_at END,
          updated_at = ?
      WHERE owner_id = ?
    `).run(
      provider,
      reference,
      status,
      level,
      now,
      verifiedAt,
      failedAt,
      failureReason,
      requiresAdminReview ? 1 : 0,
      adminReviewStatus,
      completionPercent,
      status,
      status,
      status,
      status,
      status,
      now,
      now,
      userId,
    );
  }

  if (role === "rider") {
    db.prepare(`
      UPDATE rider_profiles
      SET kyc_provider = ?,
          kyc_reference_id = ?,
          kyc_status = ?,
          kyc_level = ?,
          kyc_started_at = COALESCE(kyc_started_at, ?),
          kyc_verified_at = COALESCE(?, kyc_verified_at),
          kyc_failed_at = COALESCE(?, kyc_failed_at),
          kyc_failure_reason = ?,
          kyc_requires_admin_review = ?,
          kyc_admin_review_status = ?,
          profile_completion_percent = ?,
          liveness_review_status = CASE WHEN ? = 'verified' THEN 'approved' ELSE liveness_review_status END,
          verification_status = CASE
            WHEN ? = 'verified' THEN 'verified'
            WHEN ? IN ('failed', 'rejected') THEN 'rejected'
            WHEN ? = 'resubmission_requested' THEN 'pending_review'
            ELSE verification_status
          END,
          updated_at = ?
      WHERE user_id = ?
    `).run(
      provider,
      reference,
      status,
      level,
      now,
      verifiedAt,
      failedAt,
      failureReason,
      requiresAdminReview ? 1 : 0,
      adminReviewStatus,
      completionPercent,
      status,
      status,
      status,
      status,
      now,
      userId,
    );
  }
}

function serializeKyc(row) {
  if (!row) {
    return {
      id: "",
      status: "not_started",
      provider: env.kycProvider,
      level: 0,
      requiresAdminReview: false,
      adminReviewStatus: "not_started",
      failureReason: "",
      documentUrls: [],
      selfieUrl: null,
      submittedPayload: {},
      rawProviderPayload: {},
      startedAt: null,
      verifiedAt: null,
      failedAt: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    provider: row.provider,
    providerReferenceId: row.provider_reference_id,
    status: row.status,
    level: Number(row.kyc_level || 0),
    requiresAdminReview: Boolean(row.requires_admin_review),
    adminReviewStatus: row.admin_review_status,
    failureReason: row.failure_reason || "",
    documentUrls: parseJson(row.document_urls, []),
    selfieUrl: row.selfie_url || null,
    livenessReference: row.liveness_reference || "",
    submittedPayload: parseJson(row.submitted_payload, {}),
    rawProviderPayload: parseJson(row.raw_provider_payload, {}),
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    startedAt: row.started_at || null,
    verifiedAt: row.verified_at || null,
    failedAt: row.failed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createKycRow({ userId, role, provider, reference, status, level, requiresAdminReview, adminReviewStatus, submittedPayload = {}, documentUrls = [], selfieUrl = "", rawProviderPayload = {} }) {
  const now = nowIso();
  const id = createId("kyc");

  db.prepare(`
    INSERT INTO kyc_verifications (
      id, user_id, role, provider, provider_reference_id, status, kyc_level,
      requires_admin_review, admin_review_status, failure_reason,
      submitted_payload, document_urls, selfie_url, liveness_reference,
      raw_provider_payload, reviewed_by, reviewed_at, started_at,
      verified_at, failed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, '', ?, NULL, NULL, ?, ?, NULL, ?, ?)
  `).run(
    id,
    userId,
    role,
    provider,
    reference,
    status,
    level,
    requiresAdminReview ? 1 : 0,
    adminReviewStatus,
    json(submittedPayload),
    jsonArray(documentUrls),
    selfieUrl || null,
    json(rawProviderPayload),
    now,
    status === "verified" ? now : null,
    now,
    now,
  );

  const row = db.prepare("SELECT * FROM kyc_verifications WHERE id = ?").get(id);
  syncKycStatus({
    userId,
    role,
    provider,
    reference,
    status,
    level,
    failureReason: "",
    requiresAdminReview,
    adminReviewStatus,
  });
  return row;
}

export function startKyc(auth, input = {}) {
  const actor = requireKycActor(auth);
  const existing = latestKycForUser(actor.userId, actor.role);

  if (existing?.status === "verified") {
    return {
      kyc: serializeKyc(existing),
      alreadyVerified: true,
    };
  }

  const provider = ["mock", "manual", "dojah"].includes(clean(input.provider, 20))
    ? clean(input.provider, 20)
    : env.kycProvider;
  const user = getUser(actor.userId);
  const manualFallback = provider === "manual" || (provider === "dojah" && (!env.dojahAppId || !env.dojahSecretKey));
  const dojahSession =
    provider === "dojah"
      ? createDojahVerificationSession({ user, role: actor.role })
      : null;
  const shouldAutoVerify =
    provider === "mock" &&
    !env.isProduction &&
    input.autoVerify !== false;
  const status = shouldAutoVerify
    ? "verified"
    : manualFallback
      ? "pending_review"
      : dojahSession?.status || "pending_review";
  const level = status === "verified" ? 2 : 1;
  const requiresAdminReview = status !== "verified";
  const adminReviewStatus = status === "verified" ? "approved" : "pending";
  const reference =
    dojahSession?.reference ||
    clean(input.reference || input.providerReferenceId, 160) ||
    createId(provider === "mock" ? "mock_kyc" : "manual_kyc");

  const row = createKycRow({
    userId: actor.userId,
    role: actor.role,
    provider,
    reference,
    status,
    level,
    requiresAdminReview,
    adminReviewStatus,
    submittedPayload: {
      source: "start",
      note: clean(input.note, 500),
    },
    rawProviderPayload: dojahSession || {},
  });

  if (status === "pending_review") {
    createNotificationForUsers(getAdminIds(), {
      type: "admin",
      title: `${actor.role === "rider" ? "Rider" : "Seller"} KYC needs review`,
      body: `${user?.name || "A user"} started ${provider} verification.`,
      actionLabel: "Review",
      actionPath: "/admin?section=kyc",
    });
  }

  return {
    kyc: serializeKyc(row),
    provider,
    providerSession: dojahSession?.widget || null,
    setupRequired: Boolean(dojahSession?.setupRequired),
  };
}

export function submitManualKyc(auth, input = {}) {
  const actor = requireKycActor(auth);
  const user = getUser(actor.userId);
  const documentUrls = [
    input.identityDocumentUrl,
    input.businessDocumentUrl,
    input.vehicleDocumentUrl,
    ...(Array.isArray(input.documentUrls) ? input.documentUrls : []),
  ]
    .map((item) => clean(item, 700))
    .filter(Boolean);
  const selfieUrl = clean(input.selfieUrl || input.faceImageUrl || input.profilePhotoUrl, 700);

  if (documentUrls.length === 0 && !selfieUrl) {
    throw new HttpError(422, "Upload at least one verification document or selfie.");
  }

  const row = createKycRow({
    userId: actor.userId,
    role: actor.role,
    provider: "manual",
    reference: createId("manual_kyc"),
    status: "pending_review",
    level: 1,
    requiresAdminReview: true,
    adminReviewStatus: "pending",
    documentUrls,
    selfieUrl,
    submittedPayload: {
      fullName: clean(input.fullName || user?.name, 160),
      phone: clean(input.phone || user?.phone, 40),
      ninLast4: clean(input.ninLast4, 4),
      address: clean(input.address, 260),
      businessName: clean(input.businessName, 160),
      vehicleType: clean(input.vehicleType, 80),
      capacity: clean(input.capacity || input.deliveryCapacity, 80),
      note: clean(input.note, 1000),
    },
  });

  createNotificationForUsers(getAdminIds(), {
    type: "admin",
    title: `${actor.role === "rider" ? "Rider" : "Seller"} documents submitted`,
    body: `${user?.name || "A user"} submitted verification documents for review.`,
    actionLabel: "Review",
    actionPath: "/admin?section=kyc",
  });

  createNotification({
    userId: actor.userId,
    type: "admin",
    title: "Verification submitted",
    body: "Your documents have been sent to admin for review.",
    actionLabel: "Open dashboard",
    actionPath: actor.role === "rider" ? "/rider" : "/seller/dashboard",
  });

  return { kyc: serializeKyc(row) };
}

export function getOwnKycStatus(auth) {
  const actor = requireKycActor(auth);
  const row = latestKycForUser(actor.userId, actor.role);
  const completionPercent =
    actor.role === "seller"
      ? sellerCompletionPercent(actor.userId, row?.status || "")
      : riderCompletionPercent(actor.userId, row?.status || "");

  return {
    kyc: serializeKyc(row),
    completionPercent,
  };
}

export function getKycStatusForUser(auth, userId) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  if (auth.role !== "admin" && (auth.user_id || auth.id) !== userId) {
    throw new HttpError(403, "You cannot view this verification status.");
  }

  const user = getUser(userId);
  if (!user || !KYC_ROLES.has(user.role)) throw new HttpError(404, "Verification record was not found.");
  const row = latestKycForUser(userId, user.role);
  const completionPercent =
    user.role === "seller"
      ? sellerCompletionPercent(userId, row?.status || "")
      : riderCompletionPercent(userId, row?.status || "");

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || "",
      campus: user.campus || "",
    },
    kyc: serializeKyc(row),
    completionPercent,
  };
}

export function adminListKyc(filters = {}) {
  const params = [];
  const where = [];

  if (filters.role && KYC_ROLES.has(filters.role)) {
    where.push("kyc_verifications.role = ?");
    params.push(filters.role);
  }

  if (filters.status) {
    where.push("kyc_verifications.status = ?");
    params.push(clean(filters.status, 60));
  }

  if (filters.reviewStatus) {
    where.push("kyc_verifications.admin_review_status = ?");
    params.push(clean(filters.reviewStatus, 60));
  }

  const rows = db
    .prepare(`
      SELECT
        kyc_verifications.*,
        users.name,
        users.email,
        users.phone,
        users.campus
      FROM kyc_verifications
      JOIN users ON users.id = kyc_verifications.user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY kyc_verifications.created_at DESC
      LIMIT 250
    `)
    .all(...params);

  return rows.map((row) => ({
    ...serializeKyc(row),
    user: {
      id: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone || "",
      campus: row.campus || "",
      role: row.role,
    },
    completionPercent:
      row.role === "seller"
        ? sellerCompletionPercent(row.user_id, row.status)
        : riderCompletionPercent(row.user_id, row.status),
  }));
}

export function adminGetKyc(id) {
  const row = kycByIdOrUserId(id);
  if (!row) throw new HttpError(404, "Verification record was not found.");
  return getKycStatusForUser({ role: "admin" }, row.user_id);
}

function updateKycDecision(adminAuth, id, decision, input = {}, requestMeta = {}) {
  const row = kycByIdOrUserId(id);
  if (!row) throw new HttpError(404, "Verification record was not found.");

  const now = nowIso();
  const statusByDecision = {
    approve: "verified",
    reject: "rejected",
    "request-resubmission": "resubmission_requested",
  };
  const reviewStatusByDecision = {
    approve: "approved",
    reject: "rejected",
    "request-resubmission": "resubmission_requested",
  };
  const status = statusByDecision[decision];
  const adminReviewStatus = reviewStatusByDecision[decision];
  const failureReason = decision === "approve" ? "" : clean(input.reason || input.note, 900);
  const level = decision === "approve" ? Math.max(Number(row.kyc_level || 0), 2) : Number(row.kyc_level || 1);

  return transaction(() => {
    db.prepare(`
      UPDATE kyc_verifications
      SET status = ?,
          kyc_level = ?,
          requires_admin_review = 0,
          admin_review_status = ?,
          failure_reason = ?,
          reviewed_by = ?,
          reviewed_at = ?,
          verified_at = CASE WHEN ? = 'verified' THEN COALESCE(verified_at, ?) ELSE verified_at END,
          failed_at = CASE WHEN ? IN ('failed', 'rejected') THEN COALESCE(failed_at, ?) ELSE failed_at END,
          updated_at = ?
      WHERE id = ?
    `).run(
      status,
      level,
      adminReviewStatus,
      failureReason,
      adminAuth?.user_id || adminAuth?.id || null,
      now,
      status,
      now,
      status,
      now,
      now,
      row.id,
    );

    syncKycStatus({
      userId: row.user_id,
      role: row.role,
      provider: row.provider,
      reference: row.provider_reference_id,
      status,
      level,
      failureReason,
      requiresAdminReview: false,
      adminReviewStatus,
    });

    createNotification({
      userId: row.user_id,
      type: "admin",
      title:
        decision === "approve"
          ? "Verification approved"
          : decision === "reject"
            ? "Verification rejected"
            : "Verification needs an update",
      body:
        decision === "approve"
          ? "Your verification has been approved."
          : failureReason || "Please review your verification details and submit again.",
      actionLabel: "Open dashboard",
      actionPath: row.role === "rider" ? "/rider" : "/seller/dashboard",
    });

    logAdminAudit({
      adminId: adminAuth?.user_id || adminAuth?.id || null,
      action: `kyc_${decision}`,
      targetType: "kyc_verification",
      targetId: row.id,
      summary: `${row.role} verification ${decision.replace("-", " ")}`,
      metadata: { userId: row.user_id, reason: failureReason },
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });

    return serializeKyc(db.prepare("SELECT * FROM kyc_verifications WHERE id = ?").get(row.id));
  });
}

export function adminApproveKyc(adminAuth, id, input, requestMeta) {
  return { kyc: updateKycDecision(adminAuth, id, "approve", input, requestMeta) };
}

export function adminRejectKyc(adminAuth, id, input, requestMeta) {
  return { kyc: updateKycDecision(adminAuth, id, "reject", input, requestMeta) };
}

export function adminRequestKycResubmission(adminAuth, id, input, requestMeta) {
  return { kyc: updateKycDecision(adminAuth, id, "request-resubmission", input, requestMeta) };
}

export function handleDojahWebhook({ rawBody, signature, payload }) {
  if (!verifyDojahWebhookSignature(rawBody, signature)) {
    throw new HttpError(401, "Invalid verification webhook signature.");
  }

  const event = normalizeDojahWebhook(payload);
  if (!event.reference) {
    throw new HttpError(422, "Verification webhook reference is missing.");
  }

  const row = db
    .prepare("SELECT * FROM kyc_verifications WHERE provider_reference_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(event.reference);

  if (!row) {
    return { received: true, matched: false };
  }

  const now = nowIso();
  const finalStatus = event.status === "verified" ? "verified" : event.status === "failed" ? "failed" : "pending_review";
  const adminReviewStatus = finalStatus === "verified" ? "approved" : finalStatus === "failed" ? "pending" : "pending";
  const requiresAdminReview = finalStatus !== "verified";
  const level = finalStatus === "verified" ? 2 : Number(row.kyc_level || 1);

  db.prepare(`
    UPDATE kyc_verifications
    SET status = ?,
        kyc_level = ?,
        requires_admin_review = ?,
        admin_review_status = ?,
        failure_reason = ?,
        raw_provider_payload = ?,
        verified_at = CASE WHEN ? = 'verified' THEN COALESCE(verified_at, ?) ELSE verified_at END,
        failed_at = CASE WHEN ? = 'failed' THEN COALESCE(failed_at, ?) ELSE failed_at END,
        updated_at = ?
    WHERE id = ?
  `).run(
    finalStatus,
    level,
    requiresAdminReview ? 1 : 0,
    adminReviewStatus,
    clean(event.failureReason, 900),
    json(event.raw),
    finalStatus,
    now,
    finalStatus,
    now,
    now,
    row.id,
  );

  syncKycStatus({
    userId: row.user_id,
    role: row.role,
    provider: row.provider,
    reference: row.provider_reference_id,
    status: finalStatus,
    level,
    failureReason: clean(event.failureReason, 900),
    requiresAdminReview,
    adminReviewStatus,
  });

  createNotification({
    userId: row.user_id,
    type: "admin",
    title: finalStatus === "verified" ? "Verification approved" : "Verification update",
    body:
      finalStatus === "verified"
        ? "Your identity verification has been completed."
        : "Your verification needs an admin review.",
    actionLabel: "Open dashboard",
    actionPath: row.role === "rider" ? "/rider" : "/seller/dashboard",
  });

  if (requiresAdminReview) {
    createNotificationForUsers(getAdminIds(), {
      type: "admin",
      title: "Verification needs review",
      body: "A provider verification result needs admin review.",
      actionLabel: "Review",
      actionPath: "/admin?section=kyc",
    });
  }

  return {
    received: true,
    matched: true,
    kyc: serializeKyc(db.prepare("SELECT * FROM kyc_verifications WHERE id = ?").get(row.id)),
  };
}
