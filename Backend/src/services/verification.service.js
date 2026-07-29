import { db, transaction } from "../db/database.js";
import "../db/rider-migrations.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { serializeUser } from "../lib/serializers.js";
import { createNotification, createNotificationForUsers } from "./notification.service.js";
import { isDojahConfigured } from "./dojah.service.js";
import { isRiderPresenceOnline } from "./rider-presence.service.js";

const REQUIREMENT_STATUSES = new Set([
  "not_submitted",
  "submitted",
  "under_review",
  "approved",
  "needs_information",
  "rejected",
  "expired",
  "superseded",
]);

const REVIEW_ACTION_TO_STATUS = new Map([
  ["mark_under_review", "under_review"],
  ["approve", "approved"],
  ["needs_information", "needs_information"],
  ["reject", "rejected"],
  ["expire", "expired"],
  ["supersede", "superseded"],
  ["restore", "submitted"],
]);

const VALID_TRANSITIONS = {
  not_submitted: new Set(["submitted", "under_review", "approved", "needs_information", "rejected", "expired"]),
  submitted: new Set(["submitted", "under_review", "approved", "needs_information", "rejected", "expired", "superseded"]),
  under_review: new Set(["submitted", "approved", "needs_information", "rejected", "expired", "superseded"]),
  approved: new Set(["submitted", "under_review", "needs_information", "rejected", "expired", "superseded"]),
  needs_information: new Set(["submitted", "under_review", "approved", "rejected", "expired", "superseded"]),
  rejected: new Set(["submitted", "under_review", "approved", "needs_information", "expired", "superseded"]),
  expired: new Set(["submitted", "under_review", "approved", "needs_information", "rejected", "superseded"]),
  superseded: new Set(["submitted", "under_review", "approved", "needs_information", "rejected", "expired"]),
};

const ROLE_REQUIREMENT_DEFINITIONS = [
  {
    code: "rider_email_verified",
    role: "rider",
    level: 1,
    blocking: true,
    workflowType: "system",
    title: "Email verified",
    description: "Rider must confirm the account email address.",
  },
  {
    code: "rider_phone_verified",
    role: "rider",
    level: 1,
    blocking: true,
    workflowType: "system",
    title: "Phone verified",
    description: "Rider must verify a reachable phone number.",
  },
  {
    code: "rider_personal_profile",
    role: "rider",
    level: 1,
    blocking: true,
    workflowType: "form",
    title: "Personal and residential information",
    description: "Legal name, home address, state, city/LGA and nearest landmark.",
  },
  {
    code: "rider_vehicle_capacity",
    role: "rider",
    level: 1,
    blocking: true,
    workflowType: "form",
    title: "Vehicle and delivery capacity",
    description: "Vehicle, package size, weight limit, fragile ability and delivery bag information.",
  },
  {
    code: "rider_service_zone",
    role: "rider",
    level: 1,
    blocking: true,
    workflowType: "form",
    title: "Service zones and location permission",
    description: "Working zones and GPS/location permission state.",
  },
  {
    code: "rider_government_id",
    role: "rider",
    level: 2,
    blocking: true,
    workflowType: "document",
    title: "Government identity document",
    description: "ID type, secure ID number reference, front/back images and expiry date.",
  },
  {
    code: "rider_identity_selfie",
    role: "rider",
    level: 2,
    blocking: true,
    workflowType: "document",
    title: "Identity selfie",
    description: "A clear selfie for admin identity matching. This is not live-face verification.",
  },
  {
    code: "rider_home_address",
    role: "rider",
    level: 2,
    blocking: true,
    workflowType: "form",
    title: "Home address proof",
    description: "Residential address details and proof where required by risk level.",
  },
  {
    code: "rider_emergency_contact",
    role: "rider",
    level: 2,
    blocking: true,
    workflowType: "form",
    title: "Emergency contact",
    description: "Emergency contact name, relationship, phone numbers and address where required.",
  },
  {
    code: "rider_guarantor",
    role: "rider",
    level: 2,
    blocking: true,
    workflowType: "document",
    title: "Guarantor or referee",
    description: "Guarantor details, ID document and consent confirmation.",
  },
  {
    code: "rider_vehicle_authorization",
    role: "rider",
    level: 2,
    blocking: true,
    workflowType: "document",
    title: "Vehicle ownership or authorization",
    description: "Proof that the rider may use the vehicle for Gleenc deliveries.",
  },
  {
    code: "rider_nin_dojah",
    role: "rider",
    level: 3,
    blocking: false,
    workflowType: "provider",
    title: "NIN/Dojah identity verification",
    description: "Provider-backed identity verification. Dojah must be configured server-side.",
  },
  {
    code: "rider_live_face",
    role: "rider",
    level: 3,
    blocking: false,
    workflowType: "provider",
    title: "Live-face verification",
    description: "Separate liveness check. A static selfie can never approve this requirement.",
  },
  {
    code: "rider_delivery_history_review",
    role: "rider",
    level: 3,
    blocking: false,
    workflowType: "system",
    title: "Delivery history and complaint review",
    description: "Admin review of delivery performance, disputes and complaints.",
  },
  {
    code: "seller_email_verified",
    role: "seller",
    level: 1,
    blocking: true,
    workflowType: "system",
    title: "Email verified",
    description: "Seller must confirm the account email address.",
  },
  {
    code: "seller_phone_verified",
    role: "seller",
    level: 1,
    blocking: true,
    workflowType: "system",
    title: "Phone verification ready",
    description: "Seller must provide and verify a reachable phone number.",
  },
  {
    code: "seller_identity_selfie",
    role: "seller",
    level: 2,
    blocking: true,
    workflowType: "document",
    title: "Identity/selfie",
    description: "Identity document and selfie for seller trust review.",
  },
  {
    code: "seller_store_identity",
    role: "seller",
    level: 1,
    blocking: true,
    workflowType: "form",
    title: "Store identity",
    description: "Store name, category, description and seller type.",
  },
  {
    code: "seller_pickup_information",
    role: "seller",
    level: 1,
    blocking: true,
    workflowType: "form",
    title: "Pickup information",
    description: "Pickup area, address/point, landmark and operating hours.",
  },
  {
    code: "seller_payout_account",
    role: "seller",
    level: 3,
    blocking: true,
    workflowType: "form",
    title: "Payout account",
    description: "Bank/payout account information kept separate from subscription status.",
  },
  {
    code: "seller_campus_identity",
    role: "seller",
    sellerTypes: ["campus"],
    level: 2,
    blocking: true,
    workflowType: "document",
    title: "Campus identity",
    description: "Campus/institution, student ID or approved equivalent.",
  },
  {
    code: "seller_market_selection",
    role: "seller",
    sellerTypes: ["local_market", "nearby"],
    level: 1,
    blocking: true,
    workflowType: "form",
    title: "Market selection",
    description: "Approved market, stall/shop identity and exact pickup point.",
  },
  {
    code: "seller_shop_identity",
    role: "seller",
    sellerTypes: ["local_market", "nearby"],
    level: 2,
    blocking: true,
    workflowType: "document",
    title: "Shop/stall identity",
    description: "Stall/shop number, section, photo and business proof where available.",
  },
  {
    code: "seller_business_document",
    role: "seller",
    sellerTypes: ["business"],
    level: 2,
    blocking: false,
    workflowType: "document",
    title: "Business documentation",
    description: "CAC/business documentation and authorized representative information.",
  },
  {
    code: "seller_used_item_authenticity",
    role: "seller",
    sellerTypes: ["used_market"],
    level: 2,
    blocking: false,
    workflowType: "document",
    title: "Used item authenticity",
    description: "Proof of ownership or authenticity for higher-risk used goods.",
  },
  {
    code: "seller_operational_agreement",
    role: "seller",
    level: 3,
    blocking: true,
    workflowType: "form",
    title: "Seller operating agreement",
    description: "Agreement to Gleenc fulfilment, payment, product and marketplace rules.",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function safeJsonArray(value) {
  try {
    return JSON.stringify(Array.isArray(value) ? value : []);
  } catch {
    return "[]";
  }
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function userIdFromAuth(auth) {
  return auth?.user_id || auth?.id || "";
}

function requireAuth(auth) {
  const userId = userIdFromAuth(auth);
  if (!userId) throw new HttpError(401, "Please log in to continue.");
  return userId;
}

function requireAdmin(auth) {
  const userId = requireAuth(auth);
  if (auth.role !== "admin") throw new HttpError(403, "Only admins can review verification.");
  return userId;
}

function normalizeRole(role) {
  const cleanRole = clean(role, 20);
  if (!["seller", "rider"].includes(cleanRole)) {
    throw new HttpError(422, "Verification is available for sellers and riders.");
  }
  return cleanRole;
}

function roleFromRequirementCode(code) {
  const normalizedCode = clean(code, 120);
  if (normalizedCode.startsWith("rider_")) return "rider";
  if (normalizedCode.startsWith("seller_")) return "seller";
  return "";
}

function accountSupportsVerificationRole(userId, role) {
  if (role === "rider") return Boolean(getRiderProfile(userId));
  if (role === "seller") return Boolean(getStore(userId));
  return false;
}

function resolveActorVerificationRole(auth, requestedRole = "", requirementCode = "") {
  const userId = requireAuth(auth);
  const sessionRole = clean(auth.role, 20);
  const codeRole = roleFromRequirementCode(requirementCode);
  const explicitRole = ["seller", "rider"].includes(clean(requestedRole, 20))
    ? clean(requestedRole, 20)
    : "";
  const targetRole = codeRole || explicitRole || (["seller", "rider"].includes(sessionRole) ? sessionRole : "");

  if (!targetRole) {
    throw new HttpError(422, "Verification is available for sellers and riders.");
  }
  if (codeRole && explicitRole && codeRole !== explicitRole) {
    throw new HttpError(422, "This verification submission does not match the selected account type.");
  }
  if (["seller", "rider"].includes(sessionRole) && sessionRole !== targetRole) {
    if (!accountSupportsVerificationRole(userId, targetRole)) {
      throw new HttpError(403, `This verification center requires a ${targetRole} account.`);
    }
  } else if (sessionRole !== targetRole && !accountSupportsVerificationRole(userId, targetRole)) {
    throw new HttpError(403, `This verification center requires a ${targetRole} account.`);
  }

  return targetRole;
}

function normalizeSellerType(value) {
  const sellerType = clean(value || "campus", 60);
  if (sellerType === "local") return "local_market";
  return sellerType || "campus";
}

function getUser(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function getStore(userId) {
  return db.prepare("SELECT * FROM stores WHERE owner_id = ?").get(userId);
}

function getRiderProfile(userId) {
  return db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(userId);
}

function getAdminIds() {
  return db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
    .all()
    .map((row) => row.id);
}

function requirementDefinitionsFor(role, sellerType = "") {
  const normalizedRole = normalizeRole(role);
  const normalizedSellerType = normalizedRole === "seller" ? normalizeSellerType(sellerType) : "";

  return ROLE_REQUIREMENT_DEFINITIONS.filter((definition) => {
    if (definition.role !== normalizedRole) return false;
    if (!definition.sellerTypes?.length) return true;
    return definition.sellerTypes.includes(normalizedSellerType);
  }).map((definition) => ({
    ...definition,
    sellerType: normalizedRole === "seller" ? normalizedSellerType : "",
    level: Number(definition.level || 1),
    blocking: Boolean(definition.blocking),
    workflowType: definition.workflowType || "form",
  }));
}

function statusLabel(status) {
  return String(status || "not_submitted").replace(/_/g, " ");
}

function assertTransition(previousStatus, nextStatus) {
  const previous = REQUIREMENT_STATUSES.has(previousStatus) ? previousStatus : "not_submitted";
  const next = REQUIREMENT_STATUSES.has(nextStatus) ? nextStatus : "";
  if (!next) throw new HttpError(422, "Invalid verification status.");
  if (!VALID_TRANSITIONS[previous]?.has(next)) {
    throw new HttpError(409, `Cannot move verification from ${statusLabel(previous)} to ${statusLabel(next)}.`);
  }
}

function addAuditEvent({
  caseId = null,
  actorId = null,
  actorRole = "",
  eventType,
  requirementCode = "",
  previousStatus = "",
  newStatus = "",
  summary = "",
  metadata = {},
}) {
  db.prepare(`
    INSERT INTO verification_audit_events (
      id, case_id, actor_id, actor_role, event_type, requirement_code,
      previous_status, new_status, summary, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("vau"),
    caseId,
    actorId || null,
    clean(actorRole, 60),
    clean(eventType, 120),
    clean(requirementCode, 120),
    clean(previousStatus, 60),
    clean(newStatus, 60),
    clean(summary, 900),
    safeJson(metadata),
    nowIso(),
  );
}

function createOrUpdateRequirement(caseRow, definition) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO verification_requirements (
      id, case_id, code, role, seller_type, required_level, blocking,
      title, description, workflow_type, status, definition_version,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_submitted', 1, ?, ?, ?)
    ON CONFLICT(case_id, code) DO UPDATE SET
      role = excluded.role,
      seller_type = excluded.seller_type,
      required_level = excluded.required_level,
      blocking = excluded.blocking,
      title = excluded.title,
      description = excluded.description,
      workflow_type = excluded.workflow_type,
      definition_version = excluded.definition_version,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run(
    createId("vreq"),
    caseRow.id,
    definition.code,
    definition.role,
    definition.sellerType || "",
    definition.level,
    definition.blocking ? 1 : 0,
    definition.title,
    definition.description || "",
    definition.workflowType,
    safeJson({
      appliesToSellerTypes: definition.sellerTypes || [],
      configurable: true,
    }),
    now,
    now,
  );
}

function systemRequirementSignal(user, requirement, caseRow) {
  if (!user) return null;
  const store = caseRow.role === "seller" ? getStore(user.id) : null;
  const riderProfile = caseRow.role === "rider" ? getRiderProfile(user.id) : null;
  const payout = caseRow.role === "seller"
    ? db.prepare("SELECT * FROM user_payout_accounts WHERE user_id = ?").get(user.id)
    : null;
  const sellerVerification = caseRow.role === "seller"
    ? db.prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?").get(user.id)
    : null;

  switch (requirement.code) {
    case "rider_email_verified":
    case "seller_email_verified":
      return user.email_verified ? "approved" : "not_submitted";
    case "rider_phone_verified":
    case "seller_phone_verified":
      return user.phone_verified || user.phone || riderProfile?.phone || sellerVerification?.phone || store?.phone
        ? "approved"
        : "not_submitted";
    case "rider_delivery_history_review":
      return Number(riderProfile?.completed_deliveries || 0) > 0 ? "approved" : "not_submitted";
    case "seller_payout_account":
      return payout?.payout_verified || payout?.account_last4 || payout?.bank_name ? "approved" : null;
    default:
      return null;
  }
}

function applySystemSignals(caseRow) {
  const user = getUser(caseRow.user_id);
  const requirements = db
    .prepare("SELECT * FROM verification_requirements WHERE case_id = ?")
    .all(caseRow.id);
  const now = nowIso();

  for (const requirement of requirements) {
    if (requirement.workflow_type !== "system" && requirement.code !== "seller_payout_account") continue;
    const nextStatus = systemRequirementSignal(user, requirement, caseRow);
    if (!nextStatus || requirement.status === nextStatus) continue;
    if (!["not_submitted", "approved", "needs_information"].includes(requirement.status)) continue;

    db.prepare(`
      UPDATE verification_requirements
      SET status = ?, review_result = ?, admin_feedback = ?, updated_at = ?
      WHERE id = ?
    `).run(
      nextStatus,
      nextStatus === "approved" ? "system_approved" : "",
      nextStatus === "approved" ? "Automatically matched from account data." : "",
      now,
      requirement.id,
    );

    addAuditEvent({
      caseId: caseRow.id,
      actorRole: "system",
      eventType: "system_requirement_sync",
      requirementCode: requirement.code,
      previousStatus: requirement.status,
      newStatus: nextStatus,
      summary: `${requirement.title} changed to ${statusLabel(nextStatus)} from account data.`,
    });
  }
}

function computeCaseSummary(caseId) {
  const requirements = db.prepare("SELECT * FROM verification_requirements WHERE case_id = ?").all(caseId);
  const required = requirements.filter((requirement) => requirement.blocking !== 0);
  const approved = required.filter((requirement) => requirement.status === "approved").length;
  const submitted = requirements.filter((requirement) => ["submitted", "under_review"].includes(requirement.status)).length;
  const needsInfo = requirements.filter((requirement) => requirement.status === "needs_information").length;
  const rejected = requirements.filter((requirement) => requirement.status === "rejected").length;
  const expired = requirements.filter((requirement) => requirement.status === "expired").length;
  const totalRequired = required.length || requirements.length || 1;
  const completionPercent = Math.round((approved / totalRequired) * 100);

  let overallStatus = "in_progress";
  if (approved === 0 && submitted === 0 && needsInfo === 0 && rejected === 0) overallStatus = "not_started";
  if (submitted > 0) overallStatus = "under_review";
  if (needsInfo > 0) overallStatus = "needs_information";
  if (rejected > 0) overallStatus = "rejected";
  if (expired > 0) overallStatus = "expired";
  if (required.length > 0 && approved >= required.length && rejected === 0 && needsInfo === 0 && submitted === 0) {
    overallStatus = "approved";
  }

  return {
    requirements,
    completionPercent,
    counts: {
      required: required.length,
      approved,
      submitted,
      needsInformation: needsInfo,
      rejected,
      expired,
    },
    overallStatus,
  };
}

function refreshCaseStatus(caseId) {
  const caseRow = db.prepare("SELECT * FROM verification_cases WHERE id = ?").get(caseId);
  if (!caseRow) return null;
  const summary = computeCaseSummary(caseId);
  let overallStatus = summary.overallStatus;

  if (caseRow.operational_status === "suspended") overallStatus = "suspended";
  if (caseRow.operational_status === "restricted" && caseRow.current_verified_level > 0) overallStatus = "restricted";

  db.prepare(`
    UPDATE verification_cases
    SET overall_status = ?, updated_at = ?
    WHERE id = ?
  `).run(overallStatus, nowIso(), caseId);

  return db.prepare("SELECT * FROM verification_cases WHERE id = ?").get(caseId);
}

export function ensureVerificationCase(userId, role, options = {}) {
  const normalizedRole = normalizeRole(role);
  const user = getUser(userId);
  if (!user) throw new HttpError(404, "Account was not found.");

  const store = normalizedRole === "seller" ? getStore(userId) : null;
  const sellerType = normalizedRole === "seller"
    ? normalizeSellerType(options.sellerType || store?.seller_type || "campus")
    : "";
  const now = nowIso();
  const existing = db
    .prepare("SELECT * FROM verification_cases WHERE user_id = ? AND role = ?")
    .get(userId, normalizedRole);

  if (!existing) {
    db.prepare(`
      INSERT INTO verification_cases (
        id, user_id, role, seller_type, current_verified_level, requested_level,
        overall_status, operational_status, operational_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 1, 'not_started', 'restricted', ?, ?, ?)
    `).run(
      createId("vcase"),
      userId,
      normalizedRole,
      sellerType,
      "Awaiting requirement review.",
      now,
      now,
    );
  } else if (normalizedRole === "seller" && existing.seller_type !== sellerType) {
    db.prepare(`
      UPDATE verification_cases
      SET seller_type = ?, updated_at = ?
      WHERE id = ?
    `).run(sellerType, now, existing.id);
  }

  let caseRow = db
    .prepare("SELECT * FROM verification_cases WHERE user_id = ? AND role = ?")
    .get(userId, normalizedRole);

  for (const definition of requirementDefinitionsFor(normalizedRole, sellerType)) {
    createOrUpdateRequirement(caseRow, definition);
  }

  applySystemSignals(caseRow);
  caseRow = refreshCaseStatus(caseRow.id) || caseRow;
  return caseRow;
}

function serializeSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    requirementId: row.requirement_id,
    caseId: row.case_id,
    userId: row.user_id,
    version: Number(row.version || 1),
    submittedBy: row.submitted_by,
    payload: parseJson(row.payload_json, {}),
    documentUrls: parseJson(row.document_urls, []),
    provider: row.provider || "manual",
    providerReference: row.provider_reference || "",
    providerStatus: row.provider_status || "",
    status: row.status,
    isCurrent: row.is_current !== 0,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  };
}

function serializeReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    requirementId: row.requirement_id,
    submissionId: row.submission_id || null,
    caseId: row.case_id,
    adminId: row.admin_id,
    action: row.action,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    feedback: row.feedback || "",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  };
}

function serializeResubmissionRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    requirementId: row.requirement_id,
    caseId: row.case_id,
    userId: row.user_id,
    reason: row.reason || "",
    status: row.status,
    adminFeedback: row.admin_feedback || "",
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRequirement(row, { includeHistory = false } = {}) {
  if (!row) return null;
  const latestSubmission = row.latest_submission_id
    ? db.prepare("SELECT * FROM verification_submissions WHERE id = ?").get(row.latest_submission_id)
    : null;
  const latestReview = row.latest_review_id
    ? db.prepare("SELECT * FROM verification_reviews WHERE id = ?").get(row.latest_review_id)
    : null;
  const submissions = includeHistory
    ? db
        .prepare("SELECT * FROM verification_submissions WHERE requirement_id = ? ORDER BY version DESC")
        .all(row.id)
        .map(serializeSubmission)
    : [];
  const reviews = includeHistory
    ? db
        .prepare("SELECT * FROM verification_reviews WHERE requirement_id = ? ORDER BY created_at DESC")
        .all(row.id)
        .map(serializeReview)
    : [];
  const resubmissionRequest = db
    .prepare(`
      SELECT *
      FROM verification_resubmission_requests
      WHERE requirement_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(row.id);
  const caseRow = db
    .prepare("SELECT current_verified_level FROM verification_cases WHERE id = ?")
    .get(row.case_id);
  const previousStageApproved =
    Number(row.required_level || 1) === 1 ||
    Number(caseRow?.current_verified_level || 0) >= Number(row.required_level || 1) - 1;
  const statusLocksSubmission = ["submitted", "under_review", "approved"].includes(row.status);

  return {
    id: row.id,
    caseId: row.case_id,
    code: row.code,
    role: row.role,
    sellerType: row.seller_type || "",
    requiredLevel: Number(row.required_level || 1),
    blocking: row.blocking !== 0,
    title: row.title,
    description: row.description || "",
    workflowType: row.workflow_type,
    status: row.status,
    latestSubmissionId: row.latest_submission_id || null,
    latestReviewId: row.latest_review_id || null,
    reviewResult: row.review_result || "",
    adminFeedback: row.admin_feedback || "",
    expiresAt: row.expires_at || null,
    metadata: parseJson(row.metadata_json, {}),
    latestSubmission: serializeSubmission(latestSubmission),
    latestReview: serializeReview(latestReview),
    resubmissionRequest: serializeResubmissionRequest(resubmissionRequest),
    isLocked: statusLocksSubmission,
    previousStageApproved,
    canSubmit:
      previousStageApproved &&
      !statusLocksSubmission &&
      !["system", "provider"].includes(row.workflow_type),
    canRequestResubmission:
      row.status === "approved" &&
      !["system", "provider"].includes(row.workflow_type) &&
      (!resubmissionRequest || !["pending", "approved"].includes(resubmissionRequest.status)),
    submissions,
    reviews,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const REQUIRED_SUBMISSION_FIELDS = {
  rider_personal_profile: [
    "fullLegalName",
    "homeAddress",
    "state",
    "cityLga",
    "nearestLandmark",
  ],
  rider_vehicle_capacity: [
    "vehicleType",
    "plateInformation",
    "packageSizes",
    "weightLimit",
    "fragileCapability",
  ],
  rider_service_zone: ["serviceZones", "locationPermissionState"],
  rider_government_id: ["idType", "idNumberReference"],
  rider_home_address: [
    "fullLegalName",
    "homeAddress",
    "state",
    "cityLga",
    "nearestLandmark",
  ],
  rider_emergency_contact: [
    "fullName",
    "relationship",
    "primaryPhone",
    "address",
  ],
  rider_guarantor: [
    "fullName",
    "relationship",
    "phone",
    "email",
    "address",
    "occupation",
    "consentConfirmed",
  ],
  rider_vehicle_authorization: [
    "vehicleType",
    "plateInformation",
    "packageSizes",
    "weightLimit",
    "fragileCapability",
  ],
  seller_operational_agreement: ["agreementAccepted"],
};

const DOCUMENT_REQUIRED_CODES = new Set([
  "rider_government_id",
  "rider_identity_selfie",
  "rider_guarantor",
  "rider_vehicle_authorization",
  "seller_identity_selfie",
  "seller_campus_identity",
  "seller_shop_identity",
]);

const VERIFIED_PROVIDER_CODES = new Set([
  "rider_nin_dojah",
  "rider_live_face",
]);

function hasSubmissionValue(value) {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? "").trim().length > 0;
}

function evaluateSubmissionCompleteness(
  requirement,
  { payload = {}, documentUrls = [], provider = "", providerStatus = "" } = {},
) {
  if (requirement.workflow_type === "system") {
    return {
      complete: requirement.status === "approved",
      missing: requirement.status === "approved" ? [] : ["automatic account check"],
    };
  }

  const requiredFields = REQUIRED_SUBMISSION_FIELDS[requirement.code] || [];
  const missing = requiredFields
    .filter((field) => !hasSubmissionValue(payload[field]))
    .map((field) => field.replace(/([A-Z])/g, " $1").toLowerCase());

  if (
    requirement.code === "rider_service_zone" &&
    /disabled|denied|blocked|off/i.test(String(payload.locationPermissionState || ""))
  ) {
    missing.push("enabled location permission");
  }

  if (DOCUMENT_REQUIRED_CODES.has(requirement.code) && documentUrls.length === 0) {
    missing.push("required document");
  }

  if (
    VERIFIED_PROVIDER_CODES.has(requirement.code) &&
    (String(provider).toLowerCase() === "manual" ||
      String(providerStatus).toLowerCase() !== "verified")
  ) {
    missing.push("verified provider result");
  }

  return { complete: missing.length === 0, missing };
}

function stageReadinessForCase(caseRow, requirements) {
  const currentLevel = Number(caseRow.current_verified_level || 0);

  return [1, 2, 3].map((stage) => {
    const rows = requirements.filter(
      (requirement) => Number(requirement.required_level || 1) === stage,
    );
    const rowStates = rows.map((requirement) => {
      if (requirement.status === "approved") {
        return { requirement, complete: true };
      }

      const submission = requirement.latest_submission_id
        ? db
            .prepare("SELECT * FROM verification_submissions WHERE id = ?")
            .get(requirement.latest_submission_id)
        : null;
      const completion = evaluateSubmissionCompleteness(requirement, {
        payload: parseJson(submission?.payload_json, {}),
        documentUrls: parseJson(submission?.document_urls, []),
        provider: submission?.provider || "",
        providerStatus: submission?.provider_status || "",
      });

      return {
        requirement,
        complete:
          ["submitted", "under_review"].includes(requirement.status) &&
          completion.complete,
        missing: completion.missing,
      };
    });
    const approved = currentLevel >= stage;
    const started = rows.some(
      (requirement) => requirement.status !== "not_submitted",
    );
    const submissionComplete =
      rows.length > 0 && rowStates.every((state) => state.complete);
    const previousStageApproved = stage === 1 || currentLevel >= stage - 1;

    return {
      stage,
      title:
        stage === 1
          ? "Basic dispatch"
          : stage === 2
            ? "Identity and trust"
            : "Advanced and high-value",
      started,
      approved,
      submissionComplete,
      previousStageApproved,
      approvalReady:
        !approved && previousStageApproved && submissionComplete,
      missingRequirementCodes: rowStates
        .filter((state) => !state.complete)
        .map((state) => state.requirement.code),
    };
  });
}

function serializeCase(row, { includeHistory = false, includeEligibility = false } = {}) {
  if (!row) return null;
  const user = getUser(row.user_id);
  const summary = computeCaseSummary(row.id);
  const levelRequest = db
    .prepare(`
      SELECT * FROM verification_level_requests
      WHERE case_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(row.id);
  const audit = includeHistory
    ? db
        .prepare("SELECT * FROM verification_audit_events WHERE case_id = ? ORDER BY created_at DESC LIMIT 120")
        .all(row.id)
        .map((event) => ({
          id: event.id,
          actorId: event.actor_id || null,
          actorRole: event.actor_role || "",
          eventType: event.event_type,
          requirementCode: event.requirement_code || "",
          previousStatus: event.previous_status || "",
          newStatus: event.new_status || "",
          summary: event.summary || "",
          metadata: parseJson(event.metadata_json, {}),
          createdAt: event.created_at,
        }))
    : [];

  return {
    id: row.id,
    userId: row.user_id,
    user: serializeUser(user),
    role: row.role,
    sellerType: row.seller_type || "",
    currentVerifiedLevel: Number(row.current_verified_level || 0),
    requestedLevel: Number(row.requested_level || 1),
    overallStatus: row.overall_status,
    operationalStatus: row.operational_status,
    operationalReason: row.operational_reason || "",
    suspensionReason: row.suspension_reason || "",
    restrictionReason: row.restriction_reason || "",
    completionPercent: summary.completionPercent,
    counts: summary.counts,
    pendingLevelRequest: levelRequest
      ? {
          id: levelRequest.id,
          requestedLevel: Number(levelRequest.requested_level || 1),
          reason: levelRequest.reason || "",
          status: levelRequest.status,
          createdAt: levelRequest.created_at,
        }
      : null,
    requirements: summary.requirements.map((requirement) =>
      serializeRequirement(requirement, { includeHistory }),
    ),
    stageReadiness: stageReadinessForCase(row, summary.requirements),
    eligibility: includeEligibility && row.role === "rider"
      ? evaluateRiderEligibility(row.user_id)
      : null,
    audit,
    lastReviewedBy: row.last_reviewed_by || null,
    lastReviewedAt: row.last_reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getVerificationCenter(auth, options = {}) {
  const ownUserId = requireAuth(auth);
  const requestedRole = auth.role === "admin"
    ? normalizeRole(options.role)
    : resolveActorVerificationRole(auth, options.role || auth.role);
  const targetUserId = clean(options.userId || ownUserId, 140);

  if (targetUserId !== ownUserId && auth.role !== "admin") {
    throw new HttpError(403, "You cannot open another account's verification.");
  }

  const caseRow = ensureVerificationCase(targetUserId, requestedRole, options);
  return {
    case: serializeCase(caseRow, {
      includeHistory: Boolean(options.includeHistory),
      includeEligibility: true,
    }),
    requirementDefinitions: requirementDefinitionsFor(requestedRole, caseRow.seller_type),
    thirdParty: {
      dojahConfigured: isDojahConfigured(),
      liveFaceStatus: isDojahConfigured() ? "ready" : "provider_unconfigured",
    },
  };
}

function requireRequirementForActor(auth, code, requestedRole = "") {
  const userId = requireAuth(auth);
  const role = resolveActorVerificationRole(auth, requestedRole, code);
  const caseRow = ensureVerificationCase(userId, role);
  const requirement = db
    .prepare("SELECT * FROM verification_requirements WHERE case_id = ? AND code = ?")
    .get(caseRow.id, clean(code, 120));
  if (!requirement) throw new HttpError(404, "Verification requirement was not found.");
  return { userId, caseRow, requirement };
}

export function submitRequirement(auth, code, input = {}) {
  const { userId, caseRow, requirement } = requireRequirementForActor(
    auth,
    code,
    input.actorRole || input.role,
  );
  if (
    input.allowFutureStage !== true &&
    Number(requirement.required_level || 1) > 1 &&
    Number(caseRow.current_verified_level || 0) < Number(requirement.required_level || 1) - 1
  ) {
    throw new HttpError(
      403,
      `Stage ${Number(requirement.required_level || 1) - 1} must be approved before this requirement opens.`,
    );
  }
  if (requirement.workflow_type === "system") {
    throw new HttpError(422, "This requirement is updated automatically from account data.");
  }
  if (requirement.code === "rider_live_face") {
    throw new HttpError(
      422,
      isDojahConfigured()
        ? "Start live-face verification through the provider workflow."
        : "Live-face verification is not configured yet, so this requirement remains incomplete.",
    );
  }
  if (["submitted", "under_review"].includes(requirement.status)) {
    throw new HttpError(409, "This requirement is locked while admin review is active.");
  }
  if (requirement.status === "approved") {
    throw new HttpError(
      409,
      "This approved requirement is locked. Request resubmission and wait for admin to reopen it.",
    );
  }

  const documentUrls = [
    ...(Array.isArray(input.documentUrls) ? input.documentUrls : []),
    ...Object.values(input.files || {}).flat().map((file) => file.url).filter(Boolean),
  ].map((value) => clean(value, 500)).filter(Boolean);
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const submissionCheck = evaluateSubmissionCompleteness(requirement, {
    payload,
    documentUrls,
    provider: input.provider || "manual",
    providerStatus: input.providerStatus || "",
  });

  if (!submissionCheck.complete) {
    throw new HttpError(
      422,
      `Complete every required field before submitting ${requirement.title}.`,
      { missingFields: submissionCheck.missing },
    );
  }
  const now = nowIso();
  const latestVersion = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM verification_submissions WHERE requirement_id = ?")
    .get(requirement.id);
  const nextVersion = Number(latestVersion?.version || 0) + 1;
  const submissionId = createId("vsub");

  assertTransition(requirement.status, "submitted");

  transaction(() => {
    db.prepare(`
      UPDATE verification_submissions
      SET is_current = 0,
          status = CASE WHEN status IN ('submitted','under_review') THEN 'superseded' ELSE status END
      WHERE requirement_id = ?
    `).run(requirement.id);

    db.prepare(`
      INSERT INTO verification_submissions (
        id, requirement_id, case_id, user_id, version, submitted_by,
        payload_json, document_urls, provider, provider_reference,
        provider_status, status, is_current, submitted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 1, ?, ?)
    `).run(
      submissionId,
      requirement.id,
      caseRow.id,
      userId,
      nextVersion,
      userId,
      safeJson(payload),
      safeJsonArray(documentUrls),
      clean(input.provider || "manual", 80),
      clean(input.providerReference || "", 160),
      clean(input.providerStatus || "", 80),
      now,
      now,
    );

    db.prepare(`
      UPDATE verification_requirements
      SET status = 'submitted',
          latest_submission_id = ?,
          review_result = '',
          admin_feedback = '',
          updated_at = ?
      WHERE id = ?
    `).run(submissionId, now, requirement.id);

    db.prepare(`
      UPDATE verification_resubmission_requests
      SET status = 'completed',
          updated_at = ?
      WHERE requirement_id = ?
        AND status = 'approved'
    `).run(now, requirement.id);

    addAuditEvent({
      caseId: caseRow.id,
      actorId: userId,
      actorRole: caseRow.role,
      eventType: nextVersion > 1 ? "requirement_resubmitted" : "requirement_submitted",
      requirementCode: requirement.code,
      previousStatus: requirement.status,
      newStatus: "submitted",
      summary: `${requirement.title} submitted for review.`,
      metadata: { version: nextVersion },
    });

    refreshCaseStatus(caseRow.id);
  });

  const updatedCase = requireCase(caseRow.id);
  const stageState = stageReadinessForCase(
    updatedCase,
    computeCaseSummary(caseRow.id).requirements,
  ).find((stage) => stage.stage === Number(requirement.required_level || 1));

  createNotificationForUsers(getAdminIds(), {
    type: "admin",
    title: stageState?.approvalReady
      ? `${caseRow.role === "rider" ? "Rider" : "Seller"} Stage ${stageState.stage} ready for approval`
      : nextVersion > 1
        ? "Verification resubmitted"
        : "New verification submission",
    body: stageState?.approvalReady
      ? `${auth.name || `A ${caseRow.role}`} completed every Stage ${stageState.stage} requirement.`
      : `${auth.name || "A user"} submitted ${requirement.title} for review.`,
    actionLabel: "Review",
    actionPath: "/admin",
  });

  return getVerificationCenter(
    { ...auth, role: caseRow.role },
    { role: caseRow.role, includeHistory: true },
  );
}

export function submitRequirementForUser(userId, role, code, input = {}) {
  const user = getUser(userId);
  if (!user) throw new HttpError(404, "Account was not found.");
  return submitRequirement({
    id: user.id,
    user_id: user.id,
    role: normalizeRole(role),
    name: user.name,
  }, code, {
    ...input,
    allowFutureStage: true,
  });
}

function requireCase(caseId) {
  const caseRow = db.prepare("SELECT * FROM verification_cases WHERE id = ?").get(caseId);
  if (!caseRow) throw new HttpError(404, "Verification case was not found.");
  return caseRow;
}

function requirementById(requirementId) {
  const requirement = db.prepare("SELECT * FROM verification_requirements WHERE id = ?").get(requirementId);
  if (!requirement) throw new HttpError(404, "Verification requirement was not found.");
  return requirement;
}

export function requestRequirementResubmission(auth, requirementId, input = {}) {
  const userId = requireAuth(auth);
  const requirement = requirementById(requirementId);
  const caseRow = requireCase(requirement.case_id);
  const role = resolveActorVerificationRole(
    auth,
    input.actorRole || input.role || caseRow.role,
    requirement.code,
  );

  if (caseRow.user_id !== userId || caseRow.role !== role) {
    throw new HttpError(403, "You cannot request changes to another account's verification.");
  }
  if (requirement.status !== "approved") {
    throw new HttpError(422, "Resubmission can only be requested for an approved, locked requirement.");
  }
  if (["system", "provider"].includes(requirement.workflow_type)) {
    throw new HttpError(
      422,
      "This requirement is updated through its account or verification-provider workflow.",
    );
  }

  const reason = clean(input.reason, 1000);
  if (reason.length < 8) {
    throw new HttpError(422, "Explain clearly why this approved information needs to be changed.");
  }
  const existing = db.prepare(`
    SELECT *
    FROM verification_resubmission_requests
    WHERE requirement_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(requirement.id);
  if (existing) {
    throw new HttpError(409, "A resubmission request is already waiting for admin review.");
  }

  const now = nowIso();
  const requestId = createId("vrs");
  transaction(() => {
    db.prepare(`
      INSERT INTO verification_resubmission_requests (
        id, requirement_id, case_id, user_id, reason, status,
        admin_feedback, reviewed_by, reviewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', '', NULL, NULL, ?, ?)
    `).run(requestId, requirement.id, caseRow.id, userId, reason, now, now);

    addAuditEvent({
      caseId: caseRow.id,
      actorId: userId,
      actorRole: role,
      eventType: "resubmission_unlock_requested",
      requirementCode: requirement.code,
      previousStatus: requirement.status,
      newStatus: requirement.status,
      summary: reason,
      metadata: { requestId },
    });
  });

  createNotificationForUsers(getAdminIds(), {
    type: "admin",
    title: `${role === "rider" ? "Rider" : "Seller"} requested verification resubmission`,
    body: `${auth.name || "A user"} wants to update ${requirement.title}: ${reason}`,
    actionLabel: "Review request",
    actionPath: "/admin",
  });

  return getVerificationCenter(
    { ...auth, role },
    { role, includeHistory: true },
  );
}

export function reviewRequirementResubmission(auth, requestId, input = {}) {
  const adminId = requireAdmin(auth);
  const action = clean(input.action, 40);
  if (!["approve", "reject"].includes(action)) {
    throw new HttpError(422, "Choose approve or reject for this resubmission request.");
  }
  const row = db.prepare(`
    SELECT verification_resubmission_requests.*,
           verification_requirements.code AS requirement_code,
           verification_requirements.title AS requirement_title,
           verification_requirements.status AS requirement_status
    FROM verification_resubmission_requests
    JOIN verification_requirements
      ON verification_requirements.id = verification_resubmission_requests.requirement_id
    WHERE verification_resubmission_requests.id = ?
  `).get(clean(requestId, 140));
  if (!row) throw new HttpError(404, "Verification resubmission request was not found.");
  if (row.status !== "pending") {
    throw new HttpError(409, "This resubmission request has already been reviewed.");
  }

  const caseRow = requireCase(row.case_id);
  const feedback = clean(
    input.feedback ||
      input.reason ||
      (action === "approve"
        ? "Admin reopened this requirement for resubmission."
        : "Admin kept the approved information locked."),
    1000,
  );
  if (action === "reject" && feedback.length < 8) {
    throw new HttpError(422, "Give a clear reason for keeping this requirement locked.");
  }

  const now = nowIso();
  transaction(() => {
    db.prepare(`
      UPDATE verification_resubmission_requests
      SET status = ?,
          admin_feedback = ?,
          reviewed_by = ?,
          reviewed_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(action === "approve" ? "approved" : "rejected", feedback, adminId, now, now, row.id);

    if (action === "approve") {
      assertTransition(row.requirement_status, "needs_information");
      const reviewId = createId("vrev");
      db.prepare(`
        INSERT INTO verification_reviews (
          id, requirement_id, submission_id, case_id, admin_id, action,
          previous_status, new_status, feedback, metadata_json, created_at
        ) VALUES (
          ?, ?, (SELECT latest_submission_id FROM verification_requirements WHERE id = ?),
          ?, ?, 'needs_information', ?, 'needs_information', ?, ?, ?
        )
      `).run(
        reviewId,
        row.requirement_id,
        row.requirement_id,
        row.case_id,
        adminId,
        row.requirement_status,
        feedback,
        safeJson({ resubmissionRequestId: row.id, riderRequested: caseRow.role === "rider" }),
        now,
      );
      db.prepare(`
        UPDATE verification_requirements
        SET status = 'needs_information',
            latest_review_id = ?,
            review_result = 'needs_information',
            admin_feedback = ?,
            updated_at = ?
        WHERE id = ?
      `).run(reviewId, feedback, now, row.requirement_id);
      refreshCaseStatus(row.case_id);
    }

    addAuditEvent({
      caseId: row.case_id,
      actorId: adminId,
      actorRole: "admin",
      eventType: action === "approve"
        ? "resubmission_unlock_approved"
        : "resubmission_unlock_rejected",
      requirementCode: row.requirement_code,
      previousStatus: row.requirement_status,
      newStatus: action === "approve" ? "needs_information" : row.requirement_status,
      summary: feedback,
      metadata: { requestId: row.id },
    });
  });

  notifyCaseUser(
    caseRow,
    action === "approve" ? "Verification form reopened" : "Verification remains locked",
    `${row.requirement_title}: ${feedback}`,
  );

  return {
    case: serializeCase(requireCase(row.case_id), {
      includeHistory: true,
      includeEligibility: true,
    }),
  };
}

function notifyCaseUser(caseRow, title, body) {
  createNotification({
    userId: caseRow.user_id,
    type: caseRow.role === "seller" ? "seller" : "admin",
    title,
    body,
    actionLabel: "Open verification",
    actionPath: caseRow.role === "rider" ? "/rider/verification" : "/seller/onboarding",
  });
}

export function reviewRequirement(auth, requirementId, input = {}) {
  const adminId = requireAdmin(auth);
  const requirement = requirementById(requirementId);
  const action = clean(input.action, 60);
  const nextStatus = REVIEW_ACTION_TO_STATUS.get(action);
  if (!nextStatus) throw new HttpError(422, "Choose a valid verification review action.");
  const feedback = clean(input.feedback || input.reason || "", 1000);
  if (["needs_information", "reject"].includes(action) && feedback.length < 8) {
    throw new HttpError(422, "Give a clear reason before requesting correction or rejecting.");
  }
  if (
    action === "approve" &&
    !["submitted", "under_review"].includes(requirement.status)
  ) {
    throw new HttpError(
      422,
      "Only a complete submitted requirement can be approved. Reopen it and wait for a new submission first.",
    );
  }
  if (action === "approve") {
    const submission = requirement.latest_submission_id
      ? db.prepare("SELECT * FROM verification_submissions WHERE id = ?").get(requirement.latest_submission_id)
      : null;
    const completion = evaluateSubmissionCompleteness(requirement, {
      payload: parseJson(submission?.payload_json, {}),
      documentUrls: parseJson(submission?.document_urls, []),
      provider: submission?.provider || "",
      providerStatus: submission?.provider_status || "",
    });
    if (!submission || !completion.complete) {
      throw new HttpError(
        422,
        `Complete every required field before approving ${requirement.title}.`,
        { missingFields: completion.missing },
      );
    }
  }
  if (requirement.code === "rider_live_face" && action === "approve") {
    const submission = requirement.latest_submission_id
      ? db.prepare("SELECT * FROM verification_submissions WHERE id = ?").get(requirement.latest_submission_id)
      : null;
    if (!submission || submission.provider !== "dojah" || submission.provider_status !== "verified") {
      throw new HttpError(422, "Live-face can only be approved from a verified provider result.");
    }
  }
  assertTransition(requirement.status, nextStatus);

  const caseRow = requireCase(requirement.case_id);
  const now = nowIso();
  const reviewId = createId("vrev");

  transaction(() => {
    db.prepare(`
      INSERT INTO verification_reviews (
        id, requirement_id, submission_id, case_id, admin_id, action,
        previous_status, new_status, feedback, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reviewId,
      requirement.id,
      requirement.latest_submission_id || null,
      caseRow.id,
      adminId,
      action,
      requirement.status,
      nextStatus,
      feedback,
      safeJson(input.metadata || {}),
      now,
    );

    db.prepare(`
      UPDATE verification_requirements
      SET status = ?,
          latest_review_id = ?,
          review_result = ?,
          admin_feedback = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nextStatus, reviewId, action, feedback, now, requirement.id);

    if (requirement.latest_submission_id) {
      db.prepare("UPDATE verification_submissions SET status = ? WHERE id = ?")
        .run(nextStatus, requirement.latest_submission_id);
    }

    db.prepare(`
      UPDATE verification_cases
      SET last_reviewed_by = ?, last_reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(adminId, now, now, caseRow.id);

    addAuditEvent({
      caseId: caseRow.id,
      actorId: adminId,
      actorRole: "admin",
      eventType: "requirement_reviewed",
      requirementCode: requirement.code,
      previousStatus: requirement.status,
      newStatus: nextStatus,
      summary: feedback || `${requirement.title} moved to ${statusLabel(nextStatus)}.`,
      metadata: { reviewId, action },
    });

    refreshCaseStatus(caseRow.id);
  });

  const title =
    nextStatus === "approved"
      ? "Verification requirement approved"
      : nextStatus === "needs_information"
        ? "Verification correction requested"
        : nextStatus === "rejected"
          ? "Verification requirement rejected"
          : "Verification review updated";
  notifyCaseUser(caseRow, title, `${requirement.title}: ${feedback || statusLabel(nextStatus)}.`);

  return {
    case: serializeCase(requireCase(caseRow.id), { includeHistory: true, includeEligibility: true }),
  };
}

function syncLegacyApproval(caseRow, level, adminId, now = nowIso()) {
  if (caseRow.role === "rider") {
    db.prepare(`
      UPDATE rider_profiles
      SET verification_status = 'verified',
          verification_level = ?,
          verification_note = ?,
          safety_status = CASE WHEN safety_status = 'suspended' THEN safety_status ELSE 'normal' END,
          updated_at = ?
      WHERE user_id = ?
    `).run(
      level,
      `Approved through requirement-based verification by ${adminId}. Availability remains manual.`,
      now,
      caseRow.user_id,
    );
    return;
  }

  const fullyVerified = Number(level) >= 3;
  const stageStatus = fullyVerified ? "verified" : `stage_${level}_approved`;
  const note = `Stage ${level} approved through requirement-based verification by ${adminId}.`;

  db.prepare(`
    UPDATE stores
    SET verified = ?,
        verification_status = ?,
        verification_note = ?,
        verified_at = CASE
          WHEN ? THEN COALESCE(verified_at, ?)
          ELSE verified_at
        END,
        updated_at = ?
    WHERE owner_id = ?
  `).run(
    fullyVerified ? 1 : 0,
    stageStatus,
    note,
    fullyVerified ? 1 : 0,
    now,
    now,
    caseRow.user_id,
  );

  db.prepare(`
    UPDATE seller_verification_profiles
    SET status = CASE WHEN ? THEN 'verified' ELSE status END,
        admin_review_status = ?,
        verified_at = CASE
          WHEN ? THEN COALESCE(verified_at, ?)
          ELSE verified_at
        END,
        note = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    fullyVerified ? 1 : 0,
    fullyVerified ? "approved" : stageStatus,
    fullyVerified ? 1 : 0,
    now,
    note,
    now,
    caseRow.user_id,
  );
}

export function approveCaseLevel(auth, caseId, input = {}) {
  const adminId = requireAdmin(auth);
  const caseRow = requireCase(caseId);
  const requestedLevel = Math.min(
    3,
    Math.max(1, Number(caseRow.current_verified_level || 0) + 1),
  );
  const requirements = computeCaseSummary(caseRow.id).requirements;
  const readiness = stageReadinessForCase(caseRow, requirements).find(
    (stage) => stage.stage === requestedLevel,
  );

  if (!readiness?.approvalReady) {
    throw new HttpError(
      422,
      `Stage ${requestedLevel} cannot be approved until every requirement in that stage is complete.`,
      {
        missingRequirementCodes: readiness?.missingRequirementCodes || [],
        previousStageApproved: readiness?.previousStageApproved || false,
      },
    );
  }

  const now = nowIso();
  transaction(() => {
    for (const requirement of requirements.filter(
      (row) =>
        Number(row.required_level || 1) === requestedLevel &&
        row.status !== "approved",
    )) {
      const reviewId = createId("vrev");

      db.prepare(`
        INSERT INTO verification_reviews (
          id, requirement_id, submission_id, case_id, admin_id, action,
          previous_status, new_status, feedback, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, 'approve', ?, 'approved', ?, ?, ?)
      `).run(
        reviewId,
        requirement.id,
        requirement.latest_submission_id || null,
        caseRow.id,
        adminId,
        requirement.status,
        clean(input.reason || `Approved with Stage ${requestedLevel}.`, 1000),
        safeJson({ stage: requestedLevel, bulkStageApproval: true }),
        now,
      );

      db.prepare(`
        UPDATE verification_requirements
        SET status = 'approved',
            latest_review_id = ?,
            review_result = 'approve',
            admin_feedback = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        reviewId,
        clean(input.reason || `Approved with Stage ${requestedLevel}.`, 1000),
        now,
        requirement.id,
      );

      if (requirement.latest_submission_id) {
        db.prepare(
          "UPDATE verification_submissions SET status = 'approved' WHERE id = ?",
        ).run(requirement.latest_submission_id);
      }

      addAuditEvent({
        caseId: caseRow.id,
        actorId: adminId,
        actorRole: "admin",
        eventType: "requirement_approved_with_stage",
        requirementCode: requirement.code,
        previousStatus: requirement.status,
        newStatus: "approved",
        summary: `Approved as part of Stage ${requestedLevel}.`,
      });
    }

    db.prepare(`
      UPDATE verification_cases
      SET current_verified_level = CASE
            WHEN current_verified_level > ? THEN current_verified_level
            ELSE ?
          END,
          requested_level = CASE
            WHEN requested_level > ? THEN requested_level
            ELSE ?
          END,
          overall_status = 'approved',
          operational_status = CASE
            WHEN operational_status = 'suspended' THEN operational_status
            ELSE 'active'
          END,
          operational_reason = ?,
          last_reviewed_by = ?,
          last_reviewed_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      requestedLevel,
      requestedLevel,
      requestedLevel,
      requestedLevel,
      clean(input.reason || `Stage ${requestedLevel} approved.`, 800),
      adminId,
      now,
      now,
      caseRow.id,
    );

    db.prepare(`
      UPDATE verification_level_requests
      SET status = 'approved',
          admin_feedback = ?,
          reviewed_by = ?,
          reviewed_at = ?,
          updated_at = ?
      WHERE case_id = ? AND requested_level <= ? AND status = 'pending'
    `).run(
      clean(input.reason || `Stage ${requestedLevel} approved.`, 800),
      adminId,
      now,
      now,
      caseRow.id,
      requestedLevel,
    );

    syncLegacyApproval(caseRow, requestedLevel, adminId, now);

    addAuditEvent({
      caseId: caseRow.id,
      actorId: adminId,
      actorRole: "admin",
      eventType: "stage_approved",
      previousStatus: String(caseRow.current_verified_level || 0),
      newStatus: String(requestedLevel),
      summary: clean(input.reason || `${caseRow.role} verification Stage ${requestedLevel} approved.`, 900),
      metadata: { stage: requestedLevel },
    });
  });

  notifyCaseUser(
    caseRow,
    "Verification stage approved",
    `Your ${caseRow.role} verification Stage ${requestedLevel} has been approved.`,
  );

  return {
    case: serializeCase(requireCase(caseRow.id), { includeHistory: true, includeEligibility: true }),
  };
}

export function requestVerificationLevel(auth, input = {}) {
  const userId = requireAuth(auth);
  const role = resolveActorVerificationRole(auth, input.actorRole || input.role || auth.role);
  const caseRow = ensureVerificationCase(userId, role);
  const requestedLevel = Math.min(
    3,
    Math.max(
      Number(caseRow.current_verified_level || 0) + 1,
      Number(input.level || caseRow.requested_level || 1),
    ),
  );
  const now = nowIso();
  const id = createId("vlr");

  transaction(() => {
    db.prepare(`
      INSERT INTO verification_level_requests (
        id, case_id, user_id, role, requested_level, status, reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, caseRow.id, userId, role, requestedLevel, clean(input.reason || "", 900), now, now);

    db.prepare(`
      UPDATE verification_cases
      SET requested_level = CASE WHEN requested_level > ? THEN requested_level ELSE ? END,
          overall_status = CASE WHEN overall_status = 'approved' THEN 'under_review' ELSE overall_status END,
          updated_at = ?
      WHERE id = ?
    `).run(requestedLevel, requestedLevel, now, caseRow.id);

    addAuditEvent({
      caseId: caseRow.id,
      actorId: userId,
      actorRole: role,
      eventType: "level_requested",
      previousStatus: String(caseRow.requested_level || 1),
      newStatus: String(requestedLevel),
      summary: `${role} requested verification level ${requestedLevel}.`,
      metadata: { requestId: id },
    });
  });

  createNotificationForUsers(getAdminIds(), {
    type: "admin",
    title: "Verification upgrade requested",
    body: `${auth.name || "A user"} requested ${role} verification level ${requestedLevel}.`,
    actionLabel: "Review",
    actionPath: "/admin",
  });

  return getVerificationCenter(auth, { role, includeHistory: true });
}

export function setCaseOperationalStatus(auth, caseId, input = {}) {
  const adminId = requireAdmin(auth);
  const caseRow = requireCase(caseId);
  const status = clean(input.status, 60);
  if (!["active", "restricted", "suspended", "deactivated"].includes(status)) {
    throw new HttpError(422, "Choose active, restricted, suspended or deactivated.");
  }
  const reason = clean(input.reason || "", 900);
  if (status !== "active" && reason.length < 8) {
    throw new HttpError(422, "Give a clear operational reason.");
  }
  const now = nowIso();

  transaction(() => {
    db.prepare(`
      UPDATE verification_cases
      SET operational_status = ?,
          operational_reason = ?,
          suspension_reason = CASE WHEN ? = 'suspended' THEN ? ELSE suspension_reason END,
          restriction_reason = CASE WHEN ? = 'restricted' THEN ? ELSE restriction_reason END,
          overall_status = CASE
            WHEN ? = 'suspended' THEN 'suspended'
            WHEN ? = 'restricted' THEN 'restricted'
            ELSE overall_status
          END,
          last_reviewed_by = ?,
          last_reviewed_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(status, reason, status, reason, status, reason, status, status, adminId, now, now, caseRow.id);

    if (caseRow.role === "rider") {
      db.prepare(`
        UPDATE rider_profiles
        SET verification_status = CASE
              WHEN ? = 'suspended' THEN 'suspended'
              ELSE verification_status
            END,
            safety_status = CASE
              WHEN ? = 'suspended' THEN 'suspended'
              WHEN ? = 'active' AND safety_status = 'suspended' THEN 'normal'
              ELSE safety_status
            END,
            availability = CASE WHEN ? != 'active' THEN 'offline' ELSE availability END,
            availability_mode = CASE WHEN ? != 'active' THEN 'offline' ELSE availability_mode END,
            updated_at = ?
        WHERE user_id = ?
      `).run(status, status, status, status, status, now, caseRow.user_id);
    }

    if (caseRow.role === "seller") {
      db.prepare(`
        UPDATE stores
        SET status = CASE WHEN ? IN ('suspended','deactivated') THEN 'paused' ELSE status END,
            verification_status = CASE WHEN ? = 'suspended' THEN 'suspended' ELSE verification_status END,
            verification_note = ?,
            updated_at = ?
        WHERE owner_id = ?
      `).run(status, status, reason, now, caseRow.user_id);
    }

    addAuditEvent({
      caseId: caseRow.id,
      actorId: adminId,
      actorRole: "admin",
      eventType: `operational_${status}`,
      previousStatus: caseRow.operational_status,
      newStatus: status,
      summary: reason || `Operational status changed to ${status}.`,
    });
  });

  notifyCaseUser(
    caseRow,
    status === "active" ? "Operational access reinstated" : "Operational access updated",
    reason || `Your ${caseRow.role} operational status is now ${status}.`,
  );

  return {
    case: serializeCase(requireCase(caseRow.id), { includeHistory: true, includeEligibility: true }),
  };
}

function secondsSince(timestamp) {
  if (!timestamp) return Infinity;
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return Math.max(0, Math.floor((Date.now() - time) / 1000));
}

function parseArrayColumn(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function evaluateRiderEligibility(userId, options = {}) {
  const user = getUser(userId);
  const profile = getRiderProfile(userId);
  let caseRow = null;

  try {
    caseRow = user ? ensureVerificationCase(user.id, "rider") : null;
  } catch {
    caseRow = null;
  }

  const activeWorkload = profile
    ? db.prepare(`
        SELECT COUNT(*) AS count
        FROM rider_assignments
        WHERE rider_id = ?
          AND status IN ('assigned','accepted','arrived_pickup','picked_up','out_for_delivery')
      `).get(userId).count
    : 0;
  const serviceZones = parseArrayColumn(profile?.service_zone_ids);
  const heartbeatSeconds = secondsSince(profile?.last_presence_at);
  const requiredLevel = Math.max(1, Number(options.requiredLevel || 1));
  const capacityReady = Boolean(profile?.transport_type && profile?.max_package_size && profile?.max_weight_class && profile?.delivery_bag_type);
  const zoneReady = Boolean(serviceZones.length || profile?.coverage_area || profile?.current_zone_id);
  const highValueAllowed =
    !options.highValue ||
    Number(caseRow?.current_verified_level || 0) >= 3 ||
    Number(profile?.max_package_value_kobo || 0) >= Number(options.packageValueKobo || 0);
  const checks = {
    correctRole: user?.role === "rider",
    accountActive: Boolean(user?.is_active),
    emailVerified: Boolean(user?.email_verified),
    phoneVerified: Boolean(user?.phone_verified || user?.phone || profile?.phone),
    requiredVerificationApproved:
      Number(caseRow?.current_verified_level || profile?.verification_level || 0) >= requiredLevel ||
      profile?.verification_status === "verified",
    operationallyActive: caseRow?.operational_status === "active" || (profile?.verification_status === "verified" && profile?.safety_status !== "suspended"),
    safetyClear: Boolean(profile && profile.safety_status !== "suspended" && profile.verification_status !== "suspended"),
    presenceOnline: isRiderPresenceOnline(profile),
    recentHeartbeat: heartbeatSeconds <= Number(options.heartbeatSeconds || 180),
    locationPermission: profile?.gps_permission_status === "gps_enabled" || String(profile?.availability_mode || "").includes("gps"),
    capacityReady,
    zoneReady,
    workloadReady: Number(activeWorkload || 0) < Number(options.maxActiveAssignments || 2),
    deliveryLimitReady: highValueAllowed,
    autoDispatchEnabled:
      options.requireAutoDispatch === false ||
      profile?.can_receive_auto_dispatch !== 0,
  };

  const blockingReasons = [];
  const add = (condition, code, message) => {
    if (!condition) blockingReasons.push({ code, message });
  };

  add(checks.correctRole, "ROLE_NOT_RIDER", "Log in with a rider account.");
  add(checks.accountActive, "ACCOUNT_INACTIVE", "Your account is not active.");
  add(checks.emailVerified, "EMAIL_NOT_VERIFIED", "Verify your email before receiving deliveries.");
  add(checks.phoneVerified, "PHONE_NOT_VERIFIED", "Verify or add your phone number.");
  add(checks.requiredVerificationApproved, "VERIFICATION_INCOMPLETE", "Complete the required rider verification level.");
  add(checks.operationallyActive, "OPERATIONAL_RESTRICTED", "Your rider account is restricted or awaiting admin activation.");
  add(checks.safetyClear, "SAFETY_REVIEW", "Your rider account has a safety restriction.");
  add(checks.presenceOnline, "RIDER_OFFLINE", "Open the rider app and stay connected to receive assignments.");
  add(checks.recentHeartbeat, "HEARTBEAT_STALE", "The rider app has not sent a recent presence update.");
  add(checks.locationPermission, "LOCATION_PERMISSION_MISSING", "Enable GPS/location permission.");
  add(checks.capacityReady, "CAPACITY_MISSING", "Complete your vehicle and package capacity.");
  add(checks.zoneReady, "SERVICE_ZONE_MISSING", "Select at least one working zone.");
  add(checks.workloadReady, "WORKLOAD_LIMIT", "Finish current deliveries before taking another assignment.");
  add(checks.deliveryLimitReady, "DELIVERY_LIMIT", "This package is above your current verification limit.");
  add(
    checks.autoDispatchEnabled,
    "AUTO_DISPATCH_DISABLED",
    "Auto-dispatch is disabled for this rider.",
  );

  return {
    eligible: blockingReasons.length === 0,
    blockingReasons,
    checks,
    heartbeatSeconds: Number.isFinite(heartbeatSeconds) ? heartbeatSeconds : null,
    activeWorkload: Number(activeWorkload || 0),
    requiredLevel,
  };
}

export function adminListVerificationQueues(auth, filters = {}) {
  requireAdmin(auth);
  const roleFilter = clean(filters.role || "", 20);
  const params = [];
  let where = "";
  if (["seller", "rider"].includes(roleFilter)) {
    where = "WHERE verification_cases.role = ?";
    params.push(roleFilter);
  }

  const cases = db
    .prepare(`
      SELECT verification_cases.*
      FROM verification_cases
      ${where}
      ORDER BY updated_at DESC
      LIMIT 300
    `)
    .all(...params)
    .map((row) => serializeCase(row, { includeHistory: true, includeEligibility: true }));

  const queues = {
    newSubmissions: [],
    underReview: [],
    needsInformation: [],
    resubmitted: [],
    resubmissionRequests: [],
    upgradeRequests: [],
    expiring: [],
    rejected: [],
    suspendedRestricted: [],
    completedApproved: [],
  };

  for (const item of cases) {
    const requirements = item.requirements || [];
    if (requirements.some((requirement) => requirement.status === "submitted" && Number(requirement.latestSubmission?.version || 1) <= 1)) {
      queues.newSubmissions.push(item);
    }
    if (requirements.some((requirement) => requirement.status === "submitted" && Number(requirement.latestSubmission?.version || 1) > 1)) {
      queues.resubmitted.push(item);
    }
    if (requirements.some((requirement) => requirement.resubmissionRequest?.status === "pending")) {
      queues.resubmissionRequests.push(item);
    }
    if (requirements.some((requirement) => requirement.status === "under_review")) queues.underReview.push(item);
    if (requirements.some((requirement) => requirement.status === "needs_information")) queues.needsInformation.push(item);
    if (requirements.some((requirement) => requirement.status === "rejected")) queues.rejected.push(item);
    if (requirements.some((requirement) => requirement.expiresAt && new Date(requirement.expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000)) {
      queues.expiring.push(item);
    }
    if (item.pendingLevelRequest) queues.upgradeRequests.push(item);
    if (["suspended", "restricted"].includes(item.operationalStatus) || ["suspended", "restricted"].includes(item.overallStatus)) {
      queues.suspendedRestricted.push(item);
    }
    if (item.overallStatus === "approved") queues.completedApproved.push(item);
  }

  return { cases, queues };
}

function createBackfillSubmission({
  caseRow,
  requirement,
  status,
  payload = {},
  documentUrls = [],
  provider = "legacy",
  providerStatus = "",
  summary = "",
  dryRun = false,
}) {
  const hasSubmission = db
    .prepare("SELECT id FROM verification_submissions WHERE requirement_id = ? LIMIT 1")
    .get(requirement.id);
  if (hasSubmission) return { created: false, reason: "existing_submission" };
  if (dryRun) return { created: true, dryRun: true };

  const now = nowIso();
  const submissionId = createId("vsub");
  db.prepare(`
    INSERT INTO verification_submissions (
      id, requirement_id, case_id, user_id, version, submitted_by,
      payload_json, document_urls, provider, provider_status, status,
      is_current, submitted_at, created_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    submissionId,
    requirement.id,
    caseRow.id,
    caseRow.user_id,
    caseRow.user_id,
    safeJson({ ...payload, backfilled: true }),
    safeJsonArray(documentUrls),
    provider,
    providerStatus,
    status,
    now,
    now,
  );
  db.prepare(`
    UPDATE verification_requirements
    SET status = ?, latest_submission_id = ?, review_result = ?, admin_feedback = ?, updated_at = ?
    WHERE id = ?
  `).run(
    status,
    submissionId,
    "legacy_backfill",
    summary,
    now,
    requirement.id,
  );
  addAuditEvent({
    caseId: caseRow.id,
    actorRole: "system",
    eventType: "legacy_backfill",
    requirementCode: requirement.code,
    previousStatus: requirement.status,
    newStatus: status,
    summary: summary || `${requirement.title} backfilled from legacy data.`,
  });
  return { created: true };
}

function backfillRiderCase(user, dryRun) {
  const caseRow = ensureVerificationCase(user.id, "rider");
  const profile = getRiderProfile(user.id);
  const requirements = db
    .prepare("SELECT * FROM verification_requirements WHERE case_id = ?")
    .all(caseRow.id);
  const results = [];
  const req = (code) => requirements.find((item) => item.code === code);
  const apply = (code, status, payload, documentUrls, providerStatus, summary) => {
    const requirement = req(code);
    if (!requirement) return;
    results.push({
      code,
      status,
      ...createBackfillSubmission({
        caseRow,
        requirement,
        status,
        payload,
        documentUrls,
        providerStatus,
        summary,
        dryRun,
      }),
    });
  };

  if (profile?.full_name || profile?.home_address) {
    apply("rider_personal_profile", profile.home_address ? "approved" : "under_review", {
      fullName: profile.full_name,
      homeAddress: profile.home_address,
      coverageArea: profile.coverage_area,
    }, [], "", "Legacy rider personal profile preserved.");
  }
  if (profile?.transport_type || profile?.vehicle_type) {
    apply("rider_vehicle_capacity", "approved", {
      vehicleType: profile.vehicle_type,
      transportType: profile.transport_type,
      maxPackageSize: profile.max_package_size,
      maxWeightClass: profile.max_weight_class,
      fragileHandlingAbility: profile.fragile_handling_ability,
    }, [], "", "Legacy rider vehicle/capacity preserved.");
  }
  if (profile?.coverage_area || profile?.service_zone_ids !== "[]") {
    apply("rider_service_zone", "approved", {
      coverageArea: profile.coverage_area,
      serviceZoneIds: parseArrayColumn(profile.service_zone_ids),
      gpsPermissionStatus: profile.gps_permission_status,
    }, [], "", "Legacy rider service zones preserved.");
  }
  if (profile?.identity_document_url) {
    apply("rider_government_id", profile.verification_status === "verified" ? "approved" : "under_review", {
      ninLast4: profile.nin_last4,
    }, [profile.identity_document_url], "", "Legacy government ID preserved.");
  }
  if (profile?.selfie_url) {
    apply("rider_identity_selfie", profile.verification_status === "verified" ? "approved" : "under_review", {}, [profile.selfie_url], "", "Legacy identity selfie preserved. It does not approve live-face.");
  }
  if (profile?.emergency_contact_name || profile?.emergency_contact_phone) {
    apply("rider_emergency_contact", "approved", {
      name: profile.emergency_contact_name,
      phone: profile.emergency_contact_phone,
    }, [], "", "Legacy emergency contact preserved.");
  }
  if (profile?.guarantor_name || profile?.guarantor_phone) {
    apply("rider_guarantor", "under_review", {
      name: profile.guarantor_name,
      phone: profile.guarantor_phone,
    }, [], "", "Legacy guarantor preserved for admin review.");
  }
  if (Number(profile?.live_face_verified || 0) === 1) {
    apply("rider_live_face", "under_review", {}, [], "manual_review", "Legacy live-face flag preserved for manual review.");
  }

  return { caseId: caseRow.id, userId: user.id, role: "rider", results };
}

function backfillSellerCase(user, dryRun) {
  const store = getStore(user.id);
  const caseRow = ensureVerificationCase(user.id, "seller", { sellerType: store?.seller_type || "campus" });
  const profile = db.prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?").get(user.id);
  const payout = db.prepare("SELECT * FROM user_payout_accounts WHERE user_id = ?").get(user.id);
  const requirements = db
    .prepare("SELECT * FROM verification_requirements WHERE case_id = ?")
    .all(caseRow.id);
  const results = [];
  const req = (code) => requirements.find((item) => item.code === code);
  const apply = (code, status, payload, documentUrls, providerStatus, summary) => {
    const requirement = req(code);
    if (!requirement) return;
    results.push({
      code,
      status,
      ...createBackfillSubmission({
        caseRow,
        requirement,
        status,
        payload,
        documentUrls,
        providerStatus,
        summary,
        dryRun,
      }),
    });
  };

  if (profile?.identity_proof_url || Number(profile?.face_verified || 0) === 1) {
    apply("seller_identity_selfie", profile.status === "verified" ? "approved" : "under_review", {
      faceProvider: profile.face_provider,
      faceReference: profile.face_reference,
    }, [profile.identity_proof_url].filter(Boolean), profile.face_verified ? "verified" : "", "Legacy seller identity/selfie preserved.");
  }
  if (store?.name || profile?.business_description) {
    apply("seller_store_identity", store?.verification_status === "verified" || profile?.status === "verified" ? "approved" : "under_review", {
      storeName: store?.name,
      category: store?.category,
      sellerType: store?.seller_type,
      businessDescription: profile?.business_description,
    }, [], "", "Legacy seller store identity preserved.");
  }
  if (store?.pickup_location || profile?.pickup_location || store?.location_area) {
    apply("seller_pickup_information", store?.verification_status === "verified" || profile?.status === "verified" ? "approved" : "under_review", {
      pickupLocation: store?.pickup_location || profile?.pickup_location,
      locationArea: store?.location_area || profile?.location_area,
      nearestLandmark: store?.nearest_landmark || profile?.nearest_landmark,
    }, [], "", "Legacy seller pickup information preserved.");
  }
  if (profile?.student_id || store?.campus) {
    apply("seller_campus_identity", profile?.status === "verified" ? "approved" : "under_review", {
      campus: profile?.campus || store?.campus,
      studentId: profile?.student_id,
    }, [], "", "Legacy campus seller identity preserved.");
  }
  if (store?.market_id || profile?.market_id) {
    apply("seller_market_selection", store?.verification_status === "verified" ? "approved" : "under_review", {
      marketId: store?.market_id || profile?.market_id,
      stall: store?.shop_stall_number || profile?.shop_stall_number,
      section: store?.shop_section || profile?.shop_section,
    }, [], "", "Legacy market seller selection preserved.");
  }
  if (payout?.account_last4 || payout?.bank_name) {
    apply("seller_payout_account", payout.payout_verified ? "approved" : "under_review", {
      bankName: payout.bank_name,
      accountLast4: payout.account_last4,
    }, [], "", "Legacy payout account preserved.");
  }

  return { caseId: caseRow.id, userId: user.id, role: "seller", results };
}

export function backfillLegacyVerification({ dryRun = true } = {}) {
  const users = db
    .prepare("SELECT * FROM users WHERE role IN ('seller','rider') ORDER BY created_at ASC")
    .all();
  const startedAt = nowIso();
  const report = {
    dryRun: Boolean(dryRun),
    startedAt,
    completedAt: "",
    usersScanned: users.length,
    cases: [],
    conflicts: [],
  };

  for (const user of users) {
    try {
      report.cases.push(
        user.role === "rider"
          ? backfillRiderCase(user, dryRun)
          : backfillSellerCase(user, dryRun),
      );
    } catch (error) {
      report.conflicts.push({
        userId: user.id,
        role: user.role,
        message: error instanceof Error ? error.message : "Unknown backfill conflict.",
      });
    }
  }

  report.completedAt = nowIso();
  return report;
}

export function verificationRequirementDefinitions() {
  return ROLE_REQUIREMENT_DEFINITIONS.map((definition) => ({ ...definition }));
}
