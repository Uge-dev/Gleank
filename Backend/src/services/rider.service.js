import crypto from "node:crypto";
import { db, transaction } from "../db/database.js";
import "../db/rider-migrations.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { deleteSession, riderSessionCookieName, sessionCookieOptions } from "../lib/session.js";
import { serializeUser } from "../lib/serializers.js";
import { loginUser, registerUser } from "./auth.service.js";
import {
  createNotification,
  createNotificationForUsers,
  listNotifications,
  markNotificationRead,
} from "./notification.service.js";
import { markPayoutDeliveryVerified } from "./payout.service.js";
import { initializePayment } from "./payment.service.js";
import {
  buildDispatchExpiresAt,
  dispatchRemainingSeconds,
  resolveDispatchTimeoutPolicy,
} from "./dispatch-timeout.service.js";
import { generateOrderVerificationCode } from "./logistics.service.js";
import {
  ensureVerificationCase,
  evaluateRiderEligibility,
  submitRequirementForUser,
} from "./verification.service.js";
import {
  expireStaleRiderPresence,
  heartbeatRiderPresence,
  isRiderPresenceOnline,
  markAuthenticatedRiderOffline,
  markRiderPresenceOnline,
} from "./rider-presence.service.js";
import { calculateRoute } from "./location.service.js";
import { createDeliveryAssignmentConversation } from "./message.service.js";
import {
  activeDispatchCount,
  hasRiderCapacity,
  INCOMPLETE_DISPATCH_STATUSES,
  lockRiderCapacity,
  MAX_INCOMPLETE_DISPATCHES,
} from "./rider-capacity.service.js";

const ACTIVE_ASSIGNMENT_STATUSES = new Set(INCOMPLETE_DISPATCH_STATUSES);
const PICKUP_ALLOWED_STATUSES = new Set(["accepted", "arrived_pickup"]);
const COMPLETE_ALLOWED_STATUSES = new Set(["picked_up", "out_for_delivery"]);
const MAX_PROOF_DISTANCE_METERS = Number(process.env.RIDER_PROOF_RADIUS_METERS || 500);

function nowIso() {
  return new Date().toISOString();
}

// Verification failures are audited but never lock an order, rider, seller, or
// buyer out of the delivery workflow. Pickup attempts still require proof and
// proximity checks, and abnormal attempt counts are escalated to admins.
function assertCodeAttemptAllowed() {}

function adminIds() {
  return db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
    .all()
    .map((row) => row.id);
}

function recordCodeFailure(row, label) {
  const now = nowIso();
  const nextAttempts = Number(row?.code_attempt_count || 0) + 1;

  db.prepare(`
    UPDATE rider_assignments
    SET code_attempt_count = code_attempt_count + 1,
        last_code_attempt_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, row.id);

  if ([5, 25, 100, 500, 1000].includes(nextAttempts)) {
    createNotificationForUsers(adminIds(), {
      type: "admin",
      title: `${label} code failures detected`,
      body: `Assignment ${row.id} reached ${nextAttempts} failed code attempt(s).`,
      actionLabel: "Review delivery",
      actionPath: "/admin",
    });
  }
}

function resetCodeAttempts(row) {
  db.prepare(`
    UPDATE rider_assignments
    SET code_attempt_count = 0,
        last_code_attempt_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(nowIso(), row.id);
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function secret() {
  return process.env.RIDER_OTP_SECRET || env.jwtSecret || "gleenc-logistics-otp";
}

export function hashOtp(code) {
  return crypto.createHmac("sha256", secret()).update(String(code || "").trim()).digest("hex");
}

function verifyOtp(code, hash) {
  const provided = hashOtp(code);
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(String(hash || "")));
  } catch {
    return false;
  }
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function shouldApplyDevelopmentRiderDispatchDefaults() {
  return !env.isProduction && (
    env.autoVerifyRidersInDev ||
    env.autoSetRidersOnlineInDev ||
    env.enableTestRiderDispatch
  );
}

function applyDevelopmentRiderDispatchDefaults(userId, now = nowIso()) {
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

function phoneForWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

function riderCompletion(row) {
  if (!row) {
    return {
      profileCompletionPercent: 0,
      completionMissingFields: ["Rider profile"],
      verificationStages: {
        onboardingDocuments: false,
        liveFaceVerification: false,
        profileDetails: false,
        adminVerified: false,
      },
    };
  }

  const checks = [
    ["Full name", row.full_name],
    ["Phone number", row.phone],
    ["Vehicle type", row.vehicle_type || row.transport_type],
    ["Vehicle / bike number", row.vehicle_plate],
    ["Coverage area", row.coverage_area],
    ["Home address", row.home_address],
    ["Emergency contact", row.emergency_contact_name && row.emergency_contact_phone],
    ["Guarantor", row.guarantor_name && row.guarantor_phone],
    ["Government ID", row.identity_document_url],
    ["Profile/selfie image", row.selfie_url],
    ["Delivery capacity", row.transport_type && row.max_package_size && row.max_weight_class && row.delivery_bag_type],
    ["Live face verification", Number(row.live_face_verified || 0) === 1],
  ];

  const completed = checks.filter(([, value]) => Boolean(value)).length;
  const profileDetails = ["full_name", "phone", "vehicle_type", "vehicle_plate", "coverage_area", "home_address"].every((field) =>
    Boolean(row[field] || (field === "vehicle_type" ? row.transport_type : "")),
  );

  return {
    profileCompletionPercent: Math.round((completed / checks.length) * 100),
    completionMissingFields: checks.filter(([, value]) => !value).map(([label]) => label),
    verificationStages: {
      onboardingDocuments: Boolean(row.identity_document_url && row.selfie_url),
      liveFaceVerification: Number(row.live_face_verified || 0) === 1,
      profileDetails,
      adminVerified: row.verification_status === "verified",
    },
  };
}

function distanceMeters(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const earth = 6371000;
  const toRad = (degree) => (degree * Math.PI) / 180;
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function money(kobo) {
  return Number(kobo || 0) / 100;
}

function riskLevelForAssignment(row) {
  const packageValue = money(row?.package_value_kobo);
  const packageDescription = `${row?.package_summary || ""} ${row?.dispatch_timeout_policy || ""}`.toLowerCase();
  const highRiskHandling = /(heavy|fragile|hazard|chemical|glass|breakable|high.?value)/i.test(packageDescription);

  if (packageValue >= 200_000 || highRiskHandling) return "high";
  if (packageValue >= 50_000) return "medium";
  return "low";
}

function serializeProfile(row) {
  if (!row) return null;
  const serviceZoneIds = safeJsonArray(row.service_zone_ids);
  const completion = riderCompletion(row);
  const presenceOnline = isRiderPresenceOnline(row);
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone,
    whatsappPhone: row.whatsapp_phone,
    vehicleType: row.vehicle_type,
    vehiclePlate: row.vehicle_plate,
    transportType: row.transport_type || row.vehicle_type || "motorcycle",
    maxPackageSize: row.max_package_size || "small_medium",
    maxWeightClass: row.max_weight_class || "up_to_medium",
    fragileHandlingAbility: row.fragile_handling_ability || "can_handle_fragile",
    deliveryBagType: row.delivery_bag_type || "medium_delivery_bag",
    serviceZoneIds,
    currentZoneId: row.current_zone_id || null,
    gpsPermissionStatus: row.gps_permission_status || "gps_disabled",
    availabilityMode: presenceOnline
      ? row.gps_permission_status === "gps_enabled"
        ? "online_gps_active"
        : "online_zone_only"
      : "offline",
    canReceiveAutoDispatch: row.can_receive_auto_dispatch !== 0,
    capacityLocked: row.capacity_locked === 1,
    capacityChangeUnlockedUntil: row.capacity_change_unlocked_until || null,
    currentActiveBatchCount: row.current_active_batch_count || 0,
    acceptanceRate: row.acceptance_rate ?? 1,
    rejectionRate: row.rejection_rate ?? 0,
    responseSpeedScore: row.response_speed_score ?? 1,
    reliabilityScore: row.reliability_score ?? 1,
    coverageArea: row.coverage_area,
    homeAddress: row.home_address || "",
    emergencyContactName: row.emergency_contact_name || "",
    emergencyContactPhone: row.emergency_contact_phone || "",
    guarantorName: row.guarantor_name || "",
    guarantorPhone: row.guarantor_phone || "",
    identityDocumentUrl: row.identity_document_url || null,
    selfieUrl: row.selfie_url || null,
    liveFaceVerified: row.live_face_verified === 1,
    ninLast4: row.nin_last4 || "",
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    verificationLevel: row.verification_level,
    maxPackageValueKobo: row.max_package_value_kobo,
    maxPackageValue: money(row.max_package_value_kobo),
    availability: presenceOnline ? "online" : "offline",
    lastPresenceAt: row.last_presence_at || null,
    currentLocation: row.current_lat == null || row.current_lng == null ? null : {
      lat: row.current_lat,
      lng: row.current_lng,
      accuracyMeters: row.current_accuracy_meters || 0,
      updatedAt: row.last_location_at,
    },
    safetyStatus: row.safety_status,
    ratingAverage: row.rating_average,
    completedDeliveries: row.completed_deliveries,
    ...completion,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAssignment(row, { revealPrivate = false } = {}) {
  if (!row) return null;
  const pickedUp = ["picked_up", "out_for_delivery", "delivered"].includes(row.status);
  const reveal = revealPrivate || pickedUp;
  const revealPackage = revealPrivate || ["accepted", "arrived_pickup", "picked_up", "out_for_delivery", "delivered"].includes(row.status);
  const sellerAllowsWhatsApp = row.seller_allows_whatsapp !== 0;
  const timeoutSeconds = Number(row.dispatch_timeout_seconds || env.riderDispatchTimeoutCampusSeconds || 600);
  return {
    id: row.id,
    orderId: row.order_id,
    orderType: row.order_type,
    riderId: row.rider_id,
    sellerId: row.seller_id,
    buyerId: reveal ? row.buyer_id : null,
    status: row.status,
    dispatchTimeoutSeconds: timeoutSeconds,
    dispatchTimeoutMinutes: Math.round(timeoutSeconds / 60),
    dispatchExpiresAt: row.dispatch_expires_at || null,
    dispatchTimeoutPolicy: row.dispatch_timeout_policy || "campus",
    dispatchRemainingSeconds: dispatchRemainingSeconds(row.dispatch_expires_at),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method || (row.payment_status === "paid" ? "pay_now" : "pay_on_delivery"),
    marketSource: row.market_source || "",
    sellerType: row.seller_type || "",
    marketId: row.market_id || null,
    marketName: row.market_name || "",
    campusName: row.campus_name || "",
    pickupLandmark: row.pickup_landmark || "",
    pickupSource: {
      label: row.market_source || "Seller pickup",
      sellerType: row.seller_type || "",
      marketId: row.market_id || null,
      marketName: row.market_name || "",
      campusName: row.campus_name || "",
      landmark: row.pickup_landmark || "",
    },
    pickupPoint: {
      address: row.pickup_address,
      lat: row.pickup_lat,
      lng: row.pickup_lng,
    },
    deliveryPoint: {
      address: reveal ? row.delivery_address : "",
      lat: reveal ? row.delivery_lat : null,
      lng: reveal ? row.delivery_lng : null,
    },
    deliveryDetails: reveal ? row.delivery_details || "" : "",
    deliveryLandmark: reveal ? row.delivery_landmark || "" : "",
    nearestBusStop: reveal ? row.delivery_bus_stop || "" : "",
    deliveryLocation: reveal ? row.delivery_address : "Delivery details locked until seller pickup",
    sellerName: row.seller_name,
    sellerPhone: row.seller_phone,
    sellerWhatsApp: sellerAllowsWhatsApp ? phoneForWhatsapp(row.seller_whatsapp || row.seller_phone) : "",
    sellerAllowsWhatsApp,
    buyerName: reveal ? row.buyer_name : "Locked until pickup",
    buyerPhone: reveal ? row.buyer_phone : "",
    packageSummary: revealPackage ? row.package_summary : "Accept this delivery to see package summary.",
    riskLevel: riskLevelForAssignment(row),
    packageTagCode: "",
    sellerPickupCodeVerifiedAt: row.seller_pickup_code_verified_at || row.picked_up_at || null,
    buyerDeliveryCodeVerifiedAt: row.buyer_delivery_code_verified_at || null,
    packageValueKobo: 0,
    packageValue: 0,
    deliveryFeeKobo: 0,
    deliveryFee: 0,
    riderEarningKobo: Number(row.delivery_fee_kobo || 0),
    riderEarning: money(row.delivery_fee_kobo),
    deliveryBatchId: row.delivery_batch_id || null,
    pickupTaskId: row.pickup_task_id || null,
    pickupProof: row.pickup_proof_created_at ? {
      url: row.pickup_proof_url || null,
      note: row.pickup_proof_note,
      lat: row.pickup_proof_lat,
      lng: row.pickup_proof_lng,
      accuracyMeters: row.pickup_proof_accuracy_meters,
      createdAt: row.pickup_proof_created_at,
    } : null,
    deliveryProof: row.delivery_proof_created_at ? {
      url: row.delivery_proof_url || null,
      note: row.delivery_proof_note,
      lat: row.delivery_proof_lat,
      lng: row.delivery_proof_lng,
      accuracyMeters: row.delivery_proof_accuracy_meters,
      createdAt: row.delivery_proof_created_at,
    } : null,
    acceptedAt: row.accepted_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getRiderProfile(userId) {
  return db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(userId);
}

function assertRiderHasCapacity(riderId, { allowAssignmentId = "" } = {}) {
  if (!hasRiderCapacity(riderId, { allowAssignmentId })) {
    throw new HttpError(422, `This rider already has ${MAX_INCOMPLETE_DISPATCHES} incomplete dispatches.`);
  }
  return activeDispatchCount(riderId);
}

function requireRiderUser(auth) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  if (auth.role !== "rider") throw new HttpError(403, "Rider dashboard requires a rider account.");
  return auth.user_id || auth.id;
}

function requireVerifiedRider(userId) {
  const profile = getRiderProfile(userId);
  if (!profile) throw new HttpError(404, "Rider profile was not found.");
  const verificationCase = ensureVerificationCase(userId, "rider");
  if (
    Number(verificationCase.current_verified_level || 0) < 1 &&
    profile.verification_status !== "verified"
  ) {
    throw new HttpError(403, "Your rider account must be verified before handling deliveries.");
  }
  if (
    verificationCase.operational_status === "suspended" ||
    profile.safety_status === "suspended" ||
    profile.verification_status === "suspended"
  ) {
    throw new HttpError(403, "Your rider account is currently suspended.");
  }
  return profile;
}

function assignmentByIdForRider(riderId, assignmentId) {
  return db.prepare("SELECT * FROM rider_assignments WHERE id = ? AND rider_id = ?").get(assignmentId, riderId);
}

function assignmentByOrderForRider(riderId, orderId) {
  return db.prepare(`
    SELECT *
    FROM rider_assignments
    WHERE order_id = ? AND rider_id = ?
    ORDER BY
      CASE WHEN status IN ('accepted','arrived_pickup','picked_up','out_for_delivery','assigned') THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  `).get(orderId, riderId);
}

function orderTable(orderType) {
  return orderType === "used_order" ? "used_market_orders" : "orders";
}

function updateConnectedOrderAssignment(orderType, orderId, assignmentId, riderId, status) {
  const table = orderTable(orderType);
  const orderStatus = status || (orderType === "used_order" ? "meetup_or_delivery" : "out_for_delivery");
  db.prepare(`
    UPDATE ${table}
    SET assigned_rider_id = ?, rider_assignment_id = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(riderId, assignmentId, orderStatus, nowIso(), orderId);
}

function updateConnectedOrderDelivered(row) {
  const table = orderTable(row.order_type);
  db.prepare(`
    UPDATE ${table}
    SET status = 'completed', updated_at = ?
    WHERE id = ? AND payment_status = 'paid'
  `).run(nowIso(), row.order_id);
}

function connectedOrder(row) {
  const table = orderTable(row.order_type);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.order_id);
}

function pointFrom(address, lat, lng) {
  return {
    address: clean(address, 260),
    lat: numberOrNull(lat),
    lng: numberOrNull(lng),
  };
}

function sourceForOrder(orderType, order) {
  if (orderType === "used_order") {
    const listing = order.listing_id
      ? db
          .prepare("SELECT * FROM used_listings WHERE id = ?")
          .get(order.listing_id)
      : null;

    return {
      marketSource: "Used Market",
      sellerType: "used_market",
      marketId: null,
      marketName: "Used Market",
      campusName: listing?.area_location || listing?.campus || order.campus || "",
      pickupLandmark: listing?.pickup_location || order.pickup_location || "",
      pickupPoint: pointFrom(
        order.pickup_location || listing?.pickup_location || listing?.area_location || listing?.campus || "",
        order.pickup_lat,
        order.pickup_lng,
      ),
      sellerAllowsWhatsApp: true,
      sellerWhatsapp: "",
    };
  }

  const store = order.store_id
    ? db
        .prepare(`
          SELECT stores.*, markets.name AS market_name
          FROM stores
          LEFT JOIN markets ON markets.id = stores.market_id
          WHERE stores.id = ?
        `)
        .get(order.store_id)
    : null;
  const sellerType = store?.seller_type || "campus";
  const marketSource =
    sellerType === "local_market"
      ? "Local Market"
      : sellerType === "used_market"
          ? "Used Market"
          : "Seller pickup";

  return {
    marketSource,
    sellerType,
    marketId: store?.market_id || null,
    marketName: store?.market_name || "",
    campusName: store?.campus || order.campus || "",
    pickupLandmark: store?.nearest_landmark || "",
    pickupPoint: pointFrom(
      order.pickup_location ||
        store?.pickup_location ||
        store?.location_area ||
        store?.campus ||
        "",
      order.pickup_lat ?? store?.pickup_lat,
      order.pickup_lng ?? store?.pickup_lng,
    ),
    sellerAllowsWhatsApp: store?.allow_rider_whatsapp_contact !== 0,
    sellerWhatsapp: store?.whatsapp_phone || store?.phone || "",
  };
}

function proofUrlFromInput(input) {
  return clean(input.proofUrl || input.proofFileName || "", 500);
}

function requireProofEvidence(input, label) {
  if (!proofUrlFromInput(input)) {
    throw new HttpError(422, `${label} proof photo is required.`);
  }
}

function requireProofLocationNear(point, expectedPoint, label) {
  if (!expectedPoint || expectedPoint.lat == null || expectedPoint.lng == null) return;
  const meters = distanceMeters(point, expectedPoint);
  if (meters > MAX_PROOF_DISTANCE_METERS) {
    throw new HttpError(422, `${label} GPS is too far from the expected location. Move closer and try again.`);
  }
}

function recordLocation(userId, location, assignmentId = "") {
  if (!location) return;
  const now = nowIso();
  db.prepare(`
    INSERT INTO rider_location_updates (id, rider_id, assignment_id, lat, lng, accuracy_meters, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'device_gps', ?)
  `).run(
    createId("rloc"),
    userId,
    clean(assignmentId, 140) || null,
    location.lat,
    location.lng,
    location.accuracyMeters || 0,
    now,
  );
}

function statsForRider(userId) {
  const assigned = db.prepare("SELECT COUNT(*) AS count FROM rider_assignments WHERE rider_id = ? AND status = 'assigned'").get(userId).count;
  const pendingOffers = db.prepare(`
    SELECT COUNT(*) AS count
    FROM dispatch_attempts
    WHERE rider_id = ? AND status = 'offered'
  `).get(userId).count;
  const active = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(delivery_batch_id, id)) AS count
    FROM rider_assignments
    WHERE rider_id = ? AND status IN (${INCOMPLETE_DISPATCH_STATUSES.map(() => "?").join(",")})
  `).get(userId, ...INCOMPLETE_DISPATCH_STATUSES).count;
  const completed = db.prepare("SELECT COUNT(*) AS count FROM rider_assignments WHERE rider_id = ? AND status = 'delivered'").get(userId).count;
  const earnings = db.prepare("SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM rider_earnings WHERE rider_id = ?").get(userId).total;
  const payoutPending = db.prepare(`
    SELECT COALESCE(SUM(amount_kobo), 0) AS total
    FROM rider_earnings
    WHERE rider_id = ? AND status IN ('pending', 'available')
  `).get(userId).total;
  const activeRows = db.prepare(`
    SELECT package_value_kobo, package_summary, dispatch_timeout_policy
    FROM rider_assignments
    WHERE rider_id = ?
      AND status IN (${INCOMPLETE_DISPATCH_STATUSES.map(() => "?").join(",")})
  `).all(userId, ...INCOMPLETE_DISPATCH_STATUSES);
  const highRiskTasks = activeRows.filter((row) => riskLevelForAssignment(row) === "high").length;

  return {
    assigned: Number(assigned || 0),
    pendingOffers: Number(pendingOffers || 0),
    newAssignments: Number(assigned || 0) + Number(pendingOffers || 0),
    active: Number(active || 0),
    completed: Number(completed || 0),
    highRiskTasks,
    totalEarningsKobo: Number(earnings || 0),
    totalEarnings: money(earnings),
    payoutPendingKobo: Number(payoutPending || 0),
    payoutPending: money(payoutPending),
  };
}

function dateKey(timestamp, timeZone = process.env.APP_TIMEZONE || "Africa/Lagos") {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function earningsForRider(userId) {
  const rows = db.prepare(`
    SELECT amount_kobo, status, created_at
    FROM rider_earnings
    WHERE rider_id = ?
    ORDER BY created_at DESC
    LIMIT 1000
  `).all(userId);
  const eligibleRows = rows.filter((row) => row.status !== "withheld");
  const now = new Date();
  const todayKey = dateKey(now);
  const weekCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const monthCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const sumKobo = (items) => items.reduce((sum, row) => sum + Number(row.amount_kobo || 0), 0);
  const todayKobo = sumKobo(eligibleRows.filter((row) => dateKey(row.created_at) === todayKey));
  const weeklyKobo = sumKobo(eligibleRows.filter((row) => new Date(row.created_at).getTime() >= weekCutoff));
  const monthlyKobo = sumKobo(eligibleRows.filter((row) => new Date(row.created_at).getTime() >= monthCutoff));
  const pendingKobo = sumKobo(rows.filter((row) => ["pending", "available"].includes(row.status)));
  const completedDeliveries = Number(
    db.prepare("SELECT COUNT(*) AS count FROM rider_assignments WHERE rider_id = ? AND status = 'delivered'").get(userId)?.count || 0,
  );
  const onlinePaymentsDelivered = Number(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM rider_assignments
      WHERE rider_id = ? AND status = 'delivered' AND payment_status = 'paid'
    `).get(userId)?.count || 0,
  );
  const chart = [];

  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const key = dateKey(day);
    const amountKobo = sumKobo(eligibleRows.filter((row) => dateKey(row.created_at) === key));
    chart.push({
      label: day.toLocaleDateString("en-NG", {
        timeZone: process.env.APP_TIMEZONE || "Africa/Lagos",
        weekday: "short",
      }),
      amount: money(amountKobo),
    });
  }

  return {
    today: money(todayKobo),
    weekly: money(weeklyKobo),
    monthly: money(monthlyKobo),
    cashCollected: 0,
    onlinePaymentsDelivered,
    platformFeesHandled: 0,
    riderPayoutPending: money(pendingKobo),
    completedDeliveriesCount: completedDeliveries,
    chart,
  };
}

function activitiesForRider(rows) {
  const activities = [];

  for (const row of rows) {
    const sellerName = row.seller_name || "Seller";
    const orderLabel = row.order_id ? `Order ${row.order_id}` : "Delivery order";

    if (row.created_at) {
      activities.push({
        id: `${row.id}:assigned`,
        title: "New assignment received",
        description: `${sellerName} assigned ${orderLabel} for delivery.`,
        time: row.created_at,
        status: "info",
      });
    }
    if (row.accepted_at) {
      activities.push({
        id: `${row.id}:accepted`,
        title: "Delivery accepted",
        description: `${orderLabel} was accepted and moved to Active Deliveries.`,
        time: row.accepted_at,
        status: "success",
      });
    }
    if (row.picked_up_at) {
      activities.push({
        id: `${row.id}:picked-up`,
        title: "Package picked up",
        description: `Seller pickup was verified for ${orderLabel}.`,
        time: row.picked_up_at,
        status: "success",
      });
    }
    if (row.buyer_delivery_code_verified_at) {
      activities.push({
        id: `${row.id}:buyer-code`,
        title: "Buyer code verified",
        description: `Buyer handover verification passed for ${orderLabel}.`,
        time: row.buyer_delivery_code_verified_at,
        status: "success",
      });
    }
    if (row.delivered_at) {
      activities.push({
        id: `${row.id}:delivered`,
        title: "Delivery completed",
        description: `${orderLabel} was completed and rider earnings were recorded.`,
        time: row.delivered_at,
        status: "success",
      });
    }
    if (row.failed_at) {
      activities.push({
        id: `${row.id}:failed`,
        title: "Delivery needs attention",
        description: row.fail_reason || `${orderLabel} was marked as failed.`,
        time: row.failed_at,
        status: "warning",
      });
    }
  }

  return activities
    .filter((activity) => activity.time)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 30);
}

export async function registerRider(input, meta = {}) {
  if (!input.identityDocumentUrl || !input.selfieUrl) {
    throw new HttpError(422, "Upload rider government ID and profile/selfie image before creating a rider account.");
  }

  const result = await registerUser({
    name: input.name,
    email: input.email,
    password: input.password,
    role: "rider",
    campus: input.campus || "General",
    phone: input.phone,
    storeName: "",
    identityDocumentUrl: input.identityDocumentUrl,
    selfieUrl: input.selfieUrl,
  }, meta, {
    allowRiderRegistration: true,
  });

  const now = nowIso();
  transaction(() => {
    db.prepare(`
      INSERT INTO rider_profiles (
        id, user_id, full_name, phone, whatsapp_phone, vehicle_type, vehicle_plate,
        coverage_area, home_address, emergency_contact_name, emergency_contact_phone,
        guarantor_name, guarantor_phone, identity_document_url, selfie_url, nin_last4,
        transport_type, max_package_size, max_weight_class, fragile_handling_ability,
        delivery_bag_type, service_zone_ids, gps_permission_status,
        can_receive_auto_dispatch, capacity_locked, live_face_verified,
        verification_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'pending_review', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        full_name = excluded.full_name,
        phone = excluded.phone,
        whatsapp_phone = excluded.whatsapp_phone,
        vehicle_type = excluded.vehicle_type,
        vehicle_plate = excluded.vehicle_plate,
        coverage_area = excluded.coverage_area,
        home_address = excluded.home_address,
        emergency_contact_name = excluded.emergency_contact_name,
        emergency_contact_phone = excluded.emergency_contact_phone,
        guarantor_name = excluded.guarantor_name,
        guarantor_phone = excluded.guarantor_phone,
        identity_document_url = excluded.identity_document_url,
        selfie_url = excluded.selfie_url,
        nin_last4 = excluded.nin_last4,
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
      result.user.id,
      input.name,
      input.phone,
      input.whatsappPhone || input.phone,
      input.vehicleType || "",
      input.vehiclePlate || "",
      input.coverageArea || "",
      input.homeAddress || "",
      input.emergencyContactName || "",
      input.emergencyContactPhone || "",
      input.guarantorName || "",
      input.guarantorPhone || "",
      input.identityDocumentUrl || null,
      input.selfieUrl || null,
      input.ninLast4 || "",
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
    if (input.selfieUrl) {
      db.prepare("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?")
        .run(clean(input.selfieUrl, 500), now, result.user.id);
    }
  });

  applyDevelopmentRiderDispatchDefaults(result.user.id, now);

  submitRequirementForUser(result.user.id, "rider", "rider_identity_selfie", {
    payload: { source: "onboarding_selfie" },
    documentUrls: [input.selfieUrl].filter(Boolean),
    provider: "rider_onboarding",
  });

  return {
    ...result,
    user: serializeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(result.user.id) || result.user),
    riderProfile: serializeProfile(getRiderProfile(result.user.id)),
  };
}

export async function loginRider(input, meta = {}) {
  const result = await loginUser(input, meta, {
    allowedRoles: ["rider"],
    wrongRoleMessage:
      "This is a buyer or seller account. Please login through the buyer/seller page here.",
  });
  return {
    ...result,
    riderProfile: serializeProfile(getRiderProfile(result.user.id)),
  };
}

export function logoutRider(cookieToken, auth = null) {
  markAuthenticatedRiderOffline(auth, { allSessions: true });
  deleteSession(cookieToken);
}

export function updateRiderVerificationDocuments(auth, input) {
  const riderId = requireRiderUser(auth);

  if (!input.identityDocumentUrl || !input.selfieUrl) {
    throw new HttpError(422, "Upload both rider government ID and profile/selfie image.");
  }

  const now = nowIso();

  db.prepare(`
    UPDATE rider_profiles
    SET identity_document_url = ?,
        selfie_url = ?,
        verification_status = CASE
          WHEN verification_status = 'suspended' THEN verification_status
          ELSE 'pending_review'
        END,
        verification_note = 'Rider verification documents were submitted for admin review.',
        updated_at = ?
    WHERE user_id = ?
  `).run(
    clean(input.identityDocumentUrl, 500),
    clean(input.selfieUrl, 500),
    now,
    riderId,
  );
  db.prepare("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?")
    .run(clean(input.selfieUrl, 500), now, riderId);

  createNotification({
    userId: riderId,
    type: "verification",
    title: "Rider documents submitted",
    body: "Your rider ID and profile/selfie image have been sent to admin for review.",
    actionLabel: "Open verification",
    actionPath: "/rider/verification",
  });

  submitRequirementForUser(riderId, "rider", "rider_identity_selfie", {
    payload: { source: "verification_documents_update" },
    documentUrls: [input.selfieUrl].filter(Boolean),
    provider: "rider_dashboard",
  });

  return serializeProfile(getRiderProfile(riderId));
}

export function getRiderSession(auth, { touchPresence = true } = {}) {
  const userId = requireRiderUser(auth);
  if (touchPresence) {
    markRiderPresenceOnline(userId, auth.session_id);
  }
  return {
    user: serializeUser(auth),
    riderProfile: serializeProfile(getRiderProfile(userId)),
  };
}

export function updateRiderLocation(auth, input) {
  const userId = requireRiderUser(auth);
  requireVerifiedRider(userId);
  const location = input.currentLocation;
  const now = nowIso();
  db.prepare(`
    UPDATE rider_profiles
    SET current_lat = ?,
        current_lng = ?,
        current_accuracy_meters = ?,
        last_location_at = ?,
        gps_permission_status = 'gps_enabled',
        availability_mode = CASE
          WHEN availability = 'online' THEN 'online_gps_active'
          ELSE availability_mode
        END,
        updated_at = ?
    WHERE user_id = ?
  `).run(location.lat, location.lng, location.accuracyMeters || 0, now, now, userId);
  recordLocation(userId, location, input.assignmentId || "");
  return serializeProfile(getRiderProfile(userId));
}

export function riderDashboard(auth) {
  const userId = requireRiderUser(auth);
  const profile = getRiderProfile(userId);
  const rows = db.prepare(`
    SELECT * FROM rider_assignments
    WHERE rider_id = ?
    ORDER BY
      CASE status
        WHEN 'assigned' THEN 1
        WHEN 'accepted' THEN 2
        WHEN 'arrived_pickup' THEN 3
        WHEN 'picked_up' THEN 4
        WHEN 'out_for_delivery' THEN 5
        ELSE 9
      END,
      created_at DESC
    LIMIT 100
  `).all(userId);
  const notificationState = listNotifications(userId);

  return {
    profile: serializeProfile(profile),
    stats: statsForRider(userId),
    earnings: earningsForRider(userId),
    activities: activitiesForRider(rows),
    assignments: rows.filter((row) => ACTIVE_ASSIGNMENT_STATUSES.has(row.status)).map((row) => serializeAssignment(row)),
    completed: rows.filter((row) => row.status === "delivered").map((row) => serializeAssignment(row, { revealPrivate: true })),
    notifications: notificationState.notifications,
    unreadNotificationCount: notificationState.unreadCount,
  };
}

export function listRiderAssignments(auth, status = "") {
  const userId = requireRiderUser(auth);
  const params = [userId];
  let where = "WHERE rider_id = ?";
  if (status) {
    where += " AND status = ?";
    params.push(status);
  }
  return db.prepare(`SELECT * FROM rider_assignments ${where} ORDER BY created_at DESC LIMIT 120`).all(...params).map((row) => serializeAssignment(row));
}

export function getRiderAssignment(auth, assignmentId) {
  const userId = requireRiderUser(auth);
  const row = assignmentByIdForRider(userId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  return serializeAssignment(row);
}

export function listAvailableRiders(auth, { allowUsedMarketSeller = false } = {}) {
  if (!auth || (!["seller", "admin"].includes(auth.role) && !allowUsedMarketSeller)) {
    throw new HttpError(403, "Only sellers or admins can view available riders.");
  }
  expireStaleRiderPresence();
  return db.prepare(`
    SELECT users.id, users.name, rider_profiles.*
    FROM rider_profiles
    JOIN users ON users.id = rider_profiles.user_id
    WHERE users.is_active = 1
      AND rider_profiles.verification_status = 'verified'
      AND rider_profiles.availability = 'online'
      AND rider_profiles.safety_status = 'normal'
    ORDER BY rider_profiles.rating_average DESC, rider_profiles.completed_deliveries DESC
    LIMIT 100
  `).all()
    .filter((row) =>
      evaluateRiderEligibility(row.user_id, {
        maxActiveAssignments: MAX_INCOMPLETE_DISPATCHES,
        heartbeatSeconds: 300,
      }).eligible,
    )
    .map((row) => {
      const profile = serializeProfile(row);
      const eligibility = evaluateRiderEligibility(row.user_id, {
        maxActiveAssignments: MAX_INCOMPLETE_DISPATCHES,
        heartbeatSeconds: 300,
      });
      return {
        id: row.user_id,
        name: row.name || row.full_name,
        displayName: row.name || row.full_name,
        profileImageUrl: profile?.selfieUrl || null,
        vehicleType: profile?.vehicleType || profile?.transportType || "Rider",
        transportType: profile?.transportType || "motorcycle",
        coverageArea: profile?.coverageArea || "",
        availabilityMode: profile?.availabilityMode || "offline",
        isOnline: profile?.availability === "online",
        lastActiveAt: profile?.lastPresenceAt || profile?.updatedAt || null,
        ratingAverage: Number(profile?.ratingAverage || 0),
        successfulDeliveries: Number(profile?.completedDeliveries || 0),
        eligibleForThisOrder: eligibility.eligible,
        profile,
        eligibility,
        privacyNote: "Private phone details unlock only after a delivery assignment is accepted.",
      };
    });
}

function loadOrderForAssignment(auth, orderType, orderId) {
  const table = orderTable(orderType);
  const order = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (auth.role !== "admin" && order.seller_id !== (auth.user_id || auth.id)) {
    throw new HttpError(403, "Only the seller assigned to this order can assign a rider.");
  }
  const payAtDeliveryAllowed =
    order.payment_method === "pay_on_delivery" &&
    order.payment_status === "unpaid" &&
    ["seller_confirmed", "ready_for_delivery", "out_for_delivery"].includes(order.status);
  if (order.payment_status !== "paid" && !payAtDeliveryAllowed) {
    throw new HttpError(422, "Manual rider assignment is not available for this order yet.");
  }
  return order;
}

export function createRiderAssignment(auth, input) {
  const isUsedMarketSeller = input?.orderType === "used_order" && Boolean(auth?.user_id || auth?.id);
  if (!auth || (!["seller", "admin"].includes(auth.role) && !isUsedMarketSeller)) {
    throw new HttpError(403, "Only the order seller or an admin can assign deliveries.");
  }
  const order = loadOrderForAssignment(auth, input.orderType, input.orderId);
  const source = sourceForOrder(input.orderType, order);
  const pickupPoint = input.pickupPoint || source.pickupPoint;
  const deliveryPoint = input.deliveryPoint || pointFrom(
    order.delivery_address || order.pickup_location || "",
    order.delivery_lat,
    order.delivery_lng,
  );

  if (!pickupPoint?.address) {
    throw new HttpError(422, "Pickup location is missing from the seller profile or order.");
  }

  if (!deliveryPoint?.address) {
    throw new HttpError(422, "Buyer delivery location is missing from the order.");
  }

  const rider = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'rider' AND is_active = 1").get(input.riderId);
  if (!rider) throw new HttpError(404, "Selected rider was not found.");
  const riderProfile = requireVerifiedRider(input.riderId);
  const existingAssignment = db.prepare(`
    SELECT * FROM rider_assignments
    WHERE order_type = ? AND order_id = ?
  `).get(input.orderType, input.orderId);
  if (existingAssignment && ACTIVE_ASSIGNMENT_STATUSES.has(existingAssignment.status)) {
    throw new HttpError(409, "This order already has an active rider assignment. Cancel it before assigning another rider.");
  }
  assertRiderHasCapacity(input.riderId, {
    allowAssignmentId: existingAssignment?.rider_id === input.riderId ? existingAssignment.id : "",
  });
  if (Number(input.packageValueKobo || order.total_kobo || 0) > Number(riderProfile.max_package_value_kobo || 0)) {
    throw new HttpError(422, "This package value is above the rider's current verification limit.");
  }

  const linkedPickupTask = order.pickup_task_id
    ? db.prepare("SELECT * FROM pickup_tasks WHERE id = ?").get(order.pickup_task_id)
    : null;
  const linkedDeliveryTask = order.delivery_batch_id
    ? db.prepare("SELECT * FROM delivery_tasks WHERE delivery_batch_id = ?").get(order.delivery_batch_id)
    : null;
  const pickupCode = generateOrderVerificationCode("seller-pickup", order.id) || generateOtp();
  const deliveryCode = clean(order.verification_code, 12) || generateOrderVerificationCode("buyer-delivery", order.id) || generateOtp();
  const pickupCodeHash = hashOtp(pickupCode);
  const deliveryCodeHash = hashOtp(deliveryCode);
  const now = nowIso();
  const id = existingAssignment?.id || createId("ras");
  const assignmentPaymentStatus = order.payment_status === "paid" ? "paid" : "unpaid";
  const assignmentPaymentConfirmedAt = assignmentPaymentStatus === "paid" ? now : null;
  const packageSummary = input.packageSummary || order.note || "Gleenc delivery package";
  const dispatchPolicy = resolveDispatchTimeoutPolicy({
    sellerType: source.sellerType,
    marketSource: source.marketSource,
    category: input.category || order.category || "",
    packageSummary,
    note: order.note || "",
    packageTags: input.packageTags,
    packageType: input.packageType,
    isHeavyFragile: input.isHeavyFragile,
  });
  const dispatchExpiresAt = buildDispatchExpiresAt(now, dispatchPolicy.timeoutSeconds);
  transaction(() => {
    // Recheck inside the write transaction so manual assignment cannot race
    // with another assignment request and exceed the shared capacity limit.
    lockRiderCapacity(input.riderId);
    assertRiderHasCapacity(input.riderId, {
      allowAssignmentId: existingAssignment?.rider_id === input.riderId ? existingAssignment.id : "",
    });
    db.prepare(`
      INSERT INTO rider_assignments (
        id, order_id, order_type, rider_id, seller_id, buyer_id, store_id, listing_id,
        market_source, seller_type, market_id, market_name, campus_name, pickup_landmark,
        seller_allows_whatsapp,
        status, dispatch_timeout_seconds, dispatch_expires_at, dispatch_timeout_policy,
        payment_status, payment_confirmed_at, pickup_code_hash, delivery_code_hash,
        pickup_address, pickup_lat, pickup_lng, delivery_address,
        delivery_details, delivery_landmark, delivery_bus_stop, delivery_lat, delivery_lng,
        seller_name, seller_phone, seller_whatsapp, buyer_name, buyer_phone, package_summary,
        package_tag_code, package_value_kobo, delivery_fee_kobo,
        delivery_batch_id, pickup_task_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_type, order_id) DO UPDATE SET
        rider_id = excluded.rider_id,
        seller_id = excluded.seller_id,
        buyer_id = excluded.buyer_id,
        store_id = excluded.store_id,
        listing_id = excluded.listing_id,
        market_source = excluded.market_source,
        seller_type = excluded.seller_type,
        market_id = excluded.market_id,
        market_name = excluded.market_name,
        campus_name = excluded.campus_name,
        pickup_landmark = excluded.pickup_landmark,
        seller_allows_whatsapp = excluded.seller_allows_whatsapp,
        status = 'assigned',
        dispatch_timeout_seconds = excluded.dispatch_timeout_seconds,
        dispatch_expires_at = excluded.dispatch_expires_at,
        dispatch_timeout_policy = excluded.dispatch_timeout_policy,
        payment_status = excluded.payment_status,
        payment_confirmed_at = excluded.payment_confirmed_at,
        pickup_code_hash = excluded.pickup_code_hash,
        delivery_code_hash = excluded.delivery_code_hash,
        pickup_address = excluded.pickup_address,
        pickup_lat = excluded.pickup_lat,
        pickup_lng = excluded.pickup_lng,
        delivery_address = excluded.delivery_address,
        delivery_details = excluded.delivery_details,
        delivery_landmark = excluded.delivery_landmark,
        delivery_bus_stop = excluded.delivery_bus_stop,
        delivery_lat = excluded.delivery_lat,
        delivery_lng = excluded.delivery_lng,
        seller_name = excluded.seller_name,
        seller_phone = excluded.seller_phone,
        seller_whatsapp = excluded.seller_whatsapp,
        buyer_name = excluded.buyer_name,
        buyer_phone = excluded.buyer_phone,
        package_summary = excluded.package_summary,
        package_tag_code = excluded.package_tag_code,
        package_value_kobo = excluded.package_value_kobo,
        delivery_fee_kobo = excluded.delivery_fee_kobo,
        delivery_batch_id = excluded.delivery_batch_id,
        pickup_task_id = excluded.pickup_task_id,
        pickup_proof_url = NULL,
        pickup_proof_note = '',
        pickup_proof_lat = NULL,
        pickup_proof_lng = NULL,
        pickup_proof_accuracy_meters = NULL,
        pickup_proof_created_at = NULL,
        delivery_proof_url = NULL,
        delivery_proof_note = '',
        delivery_proof_lat = NULL,
        delivery_proof_lng = NULL,
        delivery_proof_accuracy_meters = NULL,
        delivery_proof_created_at = NULL,
        accepted_at = NULL,
        picked_up_at = NULL,
        delivered_at = NULL,
        failed_at = NULL,
        fail_reason = '',
        seller_pickup_code_verified_at = NULL,
        buyer_delivery_code_verified_at = NULL,
        code_attempt_count = 0,
        last_code_attempt_at = NULL,
        updated_at = excluded.updated_at
    `).run(
      id,
      input.orderId,
      input.orderType,
      input.riderId,
      order.seller_id,
      order.buyer_id,
      order.store_id || null,
      order.listing_id || null,
      source.marketSource,
      source.sellerType,
      source.marketId,
      source.marketName,
      source.campusName,
      source.pickupLandmark,
      source.sellerAllowsWhatsApp ? 1 : 0,
      dispatchPolicy.timeoutSeconds,
      dispatchExpiresAt,
      dispatchPolicy.policyKey,
      assignmentPaymentStatus,
      assignmentPaymentConfirmedAt,
      pickupCodeHash,
      deliveryCodeHash,
      pickupPoint.address,
      pickupPoint.lat,
      pickupPoint.lng,
      deliveryPoint.address,
      input.deliveryDetails || order.delivery_details || "",
      input.deliveryLandmark || order.delivery_landmark || "",
      input.nearestBusStop || order.delivery_bus_stop || "",
      deliveryPoint.lat,
      deliveryPoint.lng,
      input.sellerName || order.seller_name || "Seller",
      input.sellerPhone || "",
      source.sellerAllowsWhatsApp ? phoneForWhatsapp(input.sellerWhatsApp || source.sellerWhatsapp || input.sellerPhone || "") : "",
      input.buyerName || order.buyer_name || "Buyer",
      input.buyerPhone || order.buyer_phone || "",
      packageSummary,
      order.package_tag_code || "",
      input.packageValueKobo || order.total_kobo || 0,
      input.deliveryFeeKobo || order.delivery_fee_kobo || 0,
      order.delivery_batch_id || null,
      order.pickup_task_id || null,
      now,
      now,
    );
    db.prepare(`
      UPDATE ${orderTable(input.orderType)}
      SET seller_pickup_code_hash = ?, buyer_delivery_code_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(pickupCodeHash, deliveryCodeHash, now, input.orderId);
    if (linkedPickupTask) {
      db.prepare("UPDATE pickup_tasks SET pickup_otp_hash = ?, code_attempt_count = 0, last_code_attempt_at = NULL, updated_at = ? WHERE id = ?")
        .run(pickupCodeHash, now, linkedPickupTask.id);
    }
    if (linkedDeliveryTask) {
      db.prepare("UPDATE delivery_tasks SET delivery_otp_hash = ?, code_attempt_count = 0, last_code_attempt_at = NULL, updated_at = ? WHERE id = ?")
        .run(deliveryCodeHash, now, linkedDeliveryTask.id);
    }
    updateConnectedOrderAssignment(input.orderType, input.orderId, id, input.riderId, input.orderType === "used_order" ? "meetup_or_delivery" : "ready_for_delivery");
    if (input.orderType === "used_order") {
      db.prepare(`
        UPDATE used_market_orders
        SET fulfillment_method = 'gleenc_rider',
            fulfillment_status = 'rider_assigned',
            updated_at = ?
        WHERE id = ?
      `).run(now, input.orderId);
    }
    if (input.orderType === "store_order") {
      db.prepare(`
        UPDATE orders
        SET assigned_rider_id = ?,
            rider_assignment_id = ?,
            auto_dispatch_status = 'manual_rider_assigned',
            dispatch_status = 'manual_rider_assigned',
            delivery_status = 'rider_assigned',
            updated_at = ?
        WHERE id = ?
      `).run(input.riderId, id, now, input.orderId);
    }
    if (order.delivery_batch_id) {
      db.prepare(`
        UPDATE dispatch_attempts
        SET status = CASE WHEN status = 'offered' THEN 'rejected' ELSE status END,
            rejection_reason = CASE WHEN status = 'offered' THEN 'Seller manually assigned another rider' ELSE rejection_reason END,
            updated_at = ?
        WHERE delivery_batch_id = ?
      `).run(now, order.delivery_batch_id);
      db.prepare(`
        UPDATE delivery_batches
        SET assigned_rider_id = ?,
            assigned_by_seller_id = ?,
            assigned_manually_at = COALESCE(assigned_manually_at, ?),
            status = 'rider_assigned',
            dispatch_status = 'manual_rider_assigned',
            manual_assignment_unlocked = 1,
            updated_at = ?
        WHERE id = ?
      `).run(input.riderId, auth.user_id || auth.id || null, now, now, order.delivery_batch_id);
      db.prepare(`
        UPDATE pickup_tasks
        SET status = 'pickup_in_progress',
            updated_at = ?
        WHERE delivery_batch_id = ?
          AND status != 'seller_rejected'
      `).run(now, order.delivery_batch_id);
      db.prepare("UPDATE delivery_tasks SET status = 'pickup_in_progress', updated_at = ? WHERE delivery_batch_id = ?").run(now, order.delivery_batch_id);
    }
    createNotification({
      userId: input.riderId,
      type: "order",
      title: "New delivery assigned",
      body:
        assignmentPaymentStatus === "paid"
          ? `A paid Gleenc delivery has been assigned to you for pickup at ${pickupPoint.address}. Accept within ${dispatchPolicy.timeoutMinutes} minutes.`
          : `A Pay at Delivery Gleenc order has been assigned for pickup at ${pickupPoint.address}. Accept within ${dispatchPolicy.timeoutMinutes} minutes. Delivery code stays locked until Paystack confirms payment.`,
      actionLabel: "View delivery",
      actionPath: `/rider/assignments/${id}`,
    });
    createNotification({
      userId: order.buyer_id,
      type: "order",
      title: "Rider assigned",
      body: "The seller assigned a verified rider to your delivery.",
      actionLabel: "Track order",
      actionPath: input.orderType === "used_order" ? `/used-orders/${order.id}` : `/orders/${order.id}`,
    });
  });

  return {
    assignment: serializeAssignment(db.prepare("SELECT * FROM rider_assignments WHERE id = ?").get(id)),
    sellerPickupCode: process.env.NODE_ENV === "production" ? undefined : pickupCode,
    buyerDeliveryCode: process.env.NODE_ENV === "production" ? undefined : deliveryCode,
    codeDeliveryNote: "In production, send sellerPickupCode to seller and buyerDeliveryCode to buyer through secure notification/SMS/email, not to the rider.",
  };
}

export function acceptRiderAssignment(auth, assignmentId, input = {}) {
  const riderId = requireRiderUser(auth);
  heartbeatRiderPresence(auth, input);
  expireStaleRiderPresence();
  const profile = requireVerifiedRider(riderId);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  if (row.status === "accepted") {
    return serializeAssignment(row);
  }
  if (row.status !== "assigned") throw new HttpError(422, "This delivery cannot be accepted now.");
  const remainingSeconds = dispatchRemainingSeconds(row.dispatch_expires_at);
  if (remainingSeconds !== null && remainingSeconds <= 0) {
    throw new HttpError(410, "This dispatch offer has expired and must be reassigned before it can be accepted.");
  }
  const order = connectedOrder(row);
  const payAtDeliveryAllowed = order?.payment_method === "pay_on_delivery" && row.payment_status === "unpaid";
  if (row.payment_status !== "paid" && !payAtDeliveryAllowed) {
    throw new HttpError(422, "Delivery is blocked until platform payment is confirmed.");
  }
  if (!isRiderPresenceOnline(profile)) throw new HttpError(422, "Open the rider app and reconnect before accepting a delivery.");
  if (Number(row.package_value_kobo || 0) > Number(profile.max_package_value_kobo || 0)) {
    throw new HttpError(422, "This package value is above your current rider verification limit.");
  }
  assertRiderHasCapacity(riderId, { allowAssignmentId: assignmentId });
  const now = nowIso();
  transaction(() => {
    lockRiderCapacity(riderId);
    assertRiderHasCapacity(riderId, { allowAssignmentId: assignmentId });
    db.prepare("UPDATE rider_assignments SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?").run(now, now, assignmentId);
    updateConnectedOrderAssignment(row.order_type, row.order_id, assignmentId, riderId, row.order_type === "used_order" ? "meetup_or_delivery" : "ready_for_delivery");
    if (row.order_type === "store_order") {
      db.prepare(`
        UPDATE orders
        SET auto_dispatch_status = 'rider_accepted',
            dispatch_status = 'rider_accepted',
            delivery_status = 'rider_assigned',
            updated_at = ?
        WHERE id = ?
      `).run(now, row.order_id);
    }
    if (row.delivery_batch_id) {
      db.prepare(`
        UPDATE delivery_batches
        SET status = 'rider_accepted',
            dispatch_status = 'rider_accepted',
            rider_accepted_at = COALESCE(rider_accepted_at, ?),
            updated_at = ?
        WHERE id = ?
      `).run(now, now, row.delivery_batch_id);
      db.prepare("UPDATE pickup_tasks SET status = 'pickup_in_progress', updated_at = ? WHERE delivery_batch_id = ? AND status != 'seller_rejected'").run(now, row.delivery_batch_id);
      db.prepare("UPDATE delivery_tasks SET status = 'pickup_in_progress', updated_at = ? WHERE delivery_batch_id = ?").run(now, row.delivery_batch_id);
    }
    db.prepare("UPDATE rider_profiles SET current_active_batch_count = ?, updated_at = ? WHERE user_id = ?")
      .run(activeDispatchCount(riderId), now, riderId);
    try {
      createDeliveryAssignmentConversation(riderId, assignmentId);
    } catch {
      // Chat hydration is recoverable from the assignment card; never roll
      // back a valid delivery acceptance because of a legacy chat row.
    }
    createNotification({
      userId: riderId,
      type: "order",
      title: "Delivery accepted",
      body: `${row.seller_name || "Seller"}'s delivery is now active. Continue to the pickup point and verify the seller pickup code.`,
      actionLabel: "Open active delivery",
      actionPath: `/rider/verify/${assignmentId}`,
    });
    createNotification({
      userId: row.seller_id,
      type: "order",
      title: "Rider accepted your delivery",
      body: "The assigned rider accepted the delivery and is proceeding to pickup.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
  });
  return serializeAssignment(assignmentByIdForRider(riderId, assignmentId));
}

function geoapifyModeForRider(profile) {
  const transport = `${profile?.transport_type || ""} ${profile?.vehicle_type || ""}`.toLowerCase();
  if (/(walk|foot)/.test(transport)) return "walk";
  if (/(bicycle|cycle)/.test(transport)) return "bicycle";
  if (/(scooter|moped)/.test(transport)) return "scooter";
  if (/(car|van|truck)/.test(transport)) return "drive";
  return "motorcycle";
}

function cachedRiderRoute(riderId, assignmentId, target, origin) {
  const row = db.prepare(`
    SELECT *
    FROM rider_route_estimates
    WHERE rider_id = ?
      AND assignment_id = ?
      AND target = ?
      AND source = 'geoapify_routing_api'
    ORDER BY calculated_at DESC
    LIMIT 1
  `).get(riderId, assignmentId, target);
  if (!row) return null;

  const ageMs = Date.now() - new Date(row.calculated_at).getTime();
  const originMovedMeters = distanceMeters(origin, {
    lat: row.origin_lat,
    lng: row.origin_lng,
  });
  if (ageMs > 120_000 || originMovedMeters >= 100) return null;

  try {
    const saved = JSON.parse(row.raw_response || "{}");
    if (
      !saved?.geometry ||
      !["LineString", "MultiLineString"].includes(saved.geometry.type)
    ) {
      return null;
    }
    return {
      ...saved,
      origin,
      destination: {
        lat: row.destination_lat,
        lng: row.destination_lng,
      },
      distanceKm: Number(row.distance_km || 0),
      durationMinutes: Number(row.duration_minutes || 0),
      trafficDurationMinutes: Number(
        row.traffic_duration_minutes || row.duration_minutes || 0,
      ),
      source: row.source,
      calculatedAt: row.calculated_at,
      cached: true,
    };
  } catch {
    return null;
  }
}

export async function getRouteEstimate(auth, assignmentId, query) {
  const riderId = requireRiderUser(auth);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  if (!["accepted", "arrived_pickup", "picked_up", "out_for_delivery"].includes(row.status)) {
    throw new HttpError(422, "Accept this delivery before opening navigation.");
  }
  if (
    query.target === "delivery" &&
    !["picked_up", "out_for_delivery"].includes(row.status)
  ) {
    throw new HttpError(
      403,
      "The buyer delivery location unlocks after seller pickup verification.",
    );
  }

  const origin = { lat: query.lat, lng: query.lng };
  const destination = query.target === "delivery"
    ? { lat: row.delivery_lat, lng: row.delivery_lng }
    : { lat: row.pickup_lat, lng: row.pickup_lng };
  if (destination.lat == null || destination.lng == null) {
    throw new HttpError(
      422,
      `${query.target === "delivery" ? "Buyer delivery" : "Seller pickup"} map coordinates are missing. Save the exact map pin and try again.`,
    );
  }

  const cached = cachedRiderRoute(
    riderId,
    assignmentId,
    query.target,
    origin,
  );
  if (cached) {
    return {
      [query.target === "delivery" ? "routeToDelivery" : "routeToPickup"]: cached,
    };
  }

  const profile = getRiderProfile(riderId);
  const result = await calculateRoute({
    from: origin,
    to: destination,
    mode: geoapifyModeForRider(profile),
  });
  const now = nowIso();
  const storedRoute = {
    provider: result.provider,
    mode: result.mode,
    distanceMeters: result.distanceMeters,
    durationSeconds: result.durationSeconds,
    geometry: result.geometry,
    instructions: result.instructions,
  };
  db.prepare(`
    INSERT INTO rider_route_estimates (
      id, rider_id, assignment_id, target, origin_lat, origin_lng, destination_lat, destination_lng,
      distance_km, duration_minutes, traffic_duration_minutes, source, raw_response, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("rre"), riderId, assignmentId, query.target, origin.lat, origin.lng,
    destination.lat, destination.lng, result.distanceKm, result.durationMinutes,
    result.durationMinutes, result.source, JSON.stringify(storedRoute), now,
  );
  return {
    [query.target === "delivery" ? "routeToDelivery" : "routeToPickup"]: {
      origin,
      destination,
      provider: result.provider,
      mode: result.mode,
      distanceMeters: result.distanceMeters,
      distanceKm: result.distanceKm,
      durationSeconds: result.durationSeconds,
      durationMinutes: result.durationMinutes,
      trafficDurationMinutes: result.durationMinutes,
      geometry: result.geometry,
      instructions: result.instructions,
      source: result.source,
      calculatedAt: now,
      cached: false,
    },
  };
}

export function verifyPickup(auth, assignmentId, input) {
  const riderId = requireRiderUser(auth);
  requireVerifiedRider(riderId);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  if (
    row.seller_pickup_code_verified_at &&
    ["picked_up", "out_for_delivery", "delivered"].includes(row.status)
  ) {
    return serializeAssignment(row, { revealPrivate: true });
  }
  if (!PICKUP_ALLOWED_STATUSES.has(row.status)) throw new HttpError(422, "Pickup cannot be verified at this stage.");
  const order = connectedOrder(row);
  const payAtDeliveryAllowed = order?.payment_method === "pay_on_delivery" && row.payment_status === "unpaid";
  if (row.payment_status !== "paid" && !payAtDeliveryAllowed) {
    throw new HttpError(422, "Pickup is blocked until platform payment is confirmed.");
  }
  requireProofEvidence(input, "Pickup");
  requireProofLocationNear(input.proofLocation, { lat: row.pickup_lat, lng: row.pickup_lng }, "Pickup proof");
  assertCodeAttemptAllowed(row, "Pickup");
  if (!verifyOtp(input.sellerPickupCode, row.pickup_code_hash)) {
    recordCodeFailure(row, "Pickup");
    throw new HttpError(422, "Invalid pickup code. Please confirm the code with the seller.");
  }
  resetCodeAttempts(row);

  const now = nowIso();
  transaction(() => {
    db.prepare(`
      UPDATE rider_assignments
      SET status = 'picked_up', pickup_proof_url = ?, pickup_proof_note = ?,
          pickup_proof_lat = ?, pickup_proof_lng = ?, pickup_proof_accuracy_meters = ?,
          pickup_proof_created_at = ?, picked_up_at = ?,
          seller_pickup_code_verified_at = COALESCE(seller_pickup_code_verified_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(
      proofUrlFromInput(input), clean(input.proofNote, 500), input.proofLocation.lat,
      input.proofLocation.lng, input.proofLocation.accuracyMeters || 0, now, now, now, now, assignmentId,
    );
    updateConnectedOrderAssignment(row.order_type, row.order_id, assignmentId, riderId, row.order_type === "used_order" ? "meetup_or_delivery" : "out_for_delivery");
    if (row.order_type === "store_order") {
      db.prepare(`
        UPDATE orders
        SET pickup_verified_at = COALESCE(pickup_verified_at, ?),
            seller_pickup_code_verified_at = COALESCE(seller_pickup_code_verified_at, ?),
            delivery_status = 'out_for_delivery',
            dispatch_status = 'picked_up',
            auto_dispatch_status = 'picked_up',
            stage4_status = CASE
              WHEN payment_method = 'pay_on_delivery' AND payment_status != 'paid' THEN 'awaiting_buyer_payment'
              ELSE 'out_for_delivery'
            END,
            updated_at = ?
        WHERE id = ?
      `).run(now, now, now, row.order_id);
    }
    if (row.pickup_task_id) {
      db.prepare(`
        UPDATE pickup_tasks
        SET status = 'picked_up',
            picked_up_at = COALESCE(picked_up_at, ?),
            seller_pickup_code_verified_at = COALESCE(seller_pickup_code_verified_at, ?),
            updated_at = ?
        WHERE id = ?
      `).run(now, now, now, row.pickup_task_id);
    }
    if (row.delivery_batch_id) {
      const remaining = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM pickup_tasks
        WHERE delivery_batch_id = ?
          AND status != 'picked_up'
          AND status != 'seller_rejected'
      `).get(row.delivery_batch_id).count || 0);
      if (remaining === 0) {
        db.prepare("UPDATE delivery_batches SET status = 'out_for_delivery', dispatch_status = 'picked_up', updated_at = ? WHERE id = ?").run(now, row.delivery_batch_id);
        db.prepare("UPDATE delivery_tasks SET status = 'out_for_delivery', updated_at = ? WHERE delivery_batch_id = ?").run(now, row.delivery_batch_id);
      }
    }
    createNotification({
      userId: row.seller_id,
      type: "order",
      title: "Package picked up",
      body: "The rider has verified pickup with OTP and GPS proof.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
    createNotification({
      userId: row.buyer_id,
      type: "order",
      title: row.payment_status === "paid" ? "Rider is on the way" : "Rider picked up your order",
      body:
        row.payment_status === "paid"
          ? "The rider verified seller pickup. Keep your delivery code private until the item reaches you."
          : "The rider verified seller pickup. Complete secure Gleenc/Paystack payment before sharing your delivery code.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
  });

  return serializeAssignment(assignmentByIdForRider(riderId, assignmentId), { revealPrivate: true });
}

export function verifyPickupByOrder(auth, orderId, input) {
  const riderId = requireRiderUser(auth);
  const row = assignmentByOrderForRider(riderId, orderId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found for this order.");
  return verifyPickup(auth, row.id, input);
}

export function verifyDeliveryCode(auth, orderId, input) {
  const riderId = requireRiderUser(auth);
  requireVerifiedRider(riderId);
  const row = assignmentByOrderForRider(riderId, orderId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found for this order.");
  if (row.buyer_delivery_code_verified_at) {
    return serializeAssignment(row, { revealPrivate: true });
  }
  if (!["picked_up", "out_for_delivery"].includes(row.status)) {
    throw new HttpError(422, "Verify seller pickup before verifying the buyer delivery code.");
  }

  const order = connectedOrder(row);
  if (!order || order.payment_status !== "paid" || row.payment_status !== "paid") {
    throw new HttpError(422, "Waiting for buyer payment before delivery code can be verified.");
  }

  const now = nowIso();
  assertCodeAttemptAllowed(row, "Delivery");
  if (!verifyOtp(input.customerDeliveryCode || input.code, row.delivery_code_hash)) {
    recordCodeFailure(row, "Delivery");
    throw new HttpError(422, "Invalid delivery code. Please confirm the code with the buyer.");
  }
  resetCodeAttempts(row);

  transaction(() => {
    db.prepare(`
      UPDATE rider_assignments
      SET status = CASE WHEN status = 'picked_up' THEN 'out_for_delivery' ELSE status END,
          buyer_delivery_code_verified_at = COALESCE(buyer_delivery_code_verified_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(now, now, row.id);

    if (row.order_type === "store_order") {
      db.prepare(`
        UPDATE orders
        SET delivery_verified_at = COALESCE(delivery_verified_at, ?),
            buyer_delivery_code_verified_at = COALESCE(buyer_delivery_code_verified_at, ?),
            delivery_status = 'delivery_code_verified',
            dispatch_status = 'delivery_code_verified',
            stage4_status = 'delivery_code_verified',
            updated_at = ?
        WHERE id = ?
      `).run(now, now, now, row.order_id);
    }

    if (row.delivery_batch_id) {
      db.prepare(`
        UPDATE delivery_tasks
        SET status = 'delivery_code_verified',
            buyer_delivery_code_verified_at = COALESCE(buyer_delivery_code_verified_at, ?),
            updated_at = ?
        WHERE delivery_batch_id = ?
      `).run(now, now, row.delivery_batch_id);
    }

    createNotification({
      userId: row.buyer_id,
      type: "order",
      title: "Delivery code verified",
      body: "Your delivery code was verified. The rider can now hand over the package.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
    createNotification({
      userId: row.seller_id,
      type: "order",
      title: "Buyer code verified",
      body: "The rider verified the buyer delivery code. Delivery can now be completed.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
  });

  return serializeAssignment(assignmentByOrderForRider(riderId, orderId), { revealPrivate: true });
}

export function completeDelivery(auth, orderId, input) {
  const riderId = requireRiderUser(auth);
  requireVerifiedRider(riderId);
  const row = assignmentByOrderForRider(riderId, orderId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found for this order.");
  if (!COMPLETE_ALLOWED_STATUSES.has(row.status)) throw new HttpError(422, "Delivery cannot be completed at this stage.");
  if (row.payment_status !== "paid") throw new HttpError(422, "Delivery is blocked until platform payment is confirmed.");
  const order = connectedOrder(row);
  if (!order || order.payment_status !== "paid") throw new HttpError(422, "Connected order is not fully paid on the platform.");
  requireProofEvidence(input, "Delivery");
  requireProofLocationNear(input.proofLocation, { lat: row.delivery_lat, lng: row.delivery_lng }, "Delivery proof");

  const now = nowIso();
  const deliveryCodeAlreadyVerified = Boolean(row.buyer_delivery_code_verified_at);
  if (!deliveryCodeAlreadyVerified) {
    assertCodeAttemptAllowed(row, "Delivery");
    if (!verifyOtp(input.customerDeliveryCode, row.delivery_code_hash)) {
      recordCodeFailure(row, "Delivery");
      throw new HttpError(422, "Invalid delivery code. Please confirm the code with the buyer.");
    }
    resetCodeAttempts(row);
  }
  transaction(() => {
    db.prepare(`
      UPDATE rider_assignments
      SET status = 'delivered', delivery_proof_url = ?, delivery_proof_note = ?,
          delivery_proof_lat = ?, delivery_proof_lng = ?, delivery_proof_accuracy_meters = ?,
          delivery_proof_created_at = ?, delivered_at = ?,
          buyer_delivery_code_verified_at = COALESCE(buyer_delivery_code_verified_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(
      proofUrlFromInput(input), clean(input.proofNote, 500), input.proofLocation.lat,
      input.proofLocation.lng, input.proofLocation.accuracyMeters || 0, now, now, now, now, row.id,
    );
    updateConnectedOrderDelivered(row);
    if (row.order_type === "store_order") {
      db.prepare(`
        UPDATE orders
        SET status = 'delivered',
            fulfillment_status = 'delivered',
            stage4_status = 'delivered',
            delivery_status = 'delivered',
            dispatch_status = 'delivered',
            delivery_verified_at = COALESCE(delivery_verified_at, ?),
            buyer_delivery_code_verified_at = COALESCE(buyer_delivery_code_verified_at, ?),
            delivered_at = COALESCE(delivered_at, ?),
            updated_at = ?
        WHERE id = ?
      `).run(now, now, now, now, row.order_id);
    }
    if (row.delivery_batch_id) {
      const remainingAssignments = Number(db.prepare(`
        SELECT COUNT(*) AS count
        FROM rider_assignments
        WHERE delivery_batch_id = ?
          AND rider_id = ?
          AND status NOT IN ('delivered', 'failed', 'cancelled')
      `).get(row.delivery_batch_id, riderId)?.count || 0);

      if (remainingAssignments === 0) {
        db.prepare(`
          UPDATE delivery_batches
          SET status = 'delivered',
              dispatch_status = 'completed',
              delivery_workflow_status = 'completed',
              payout_workflow_status = 'ready_for_payout',
              blocking_step = 'completed',
              updated_at = ?
          WHERE id = ?
        `).run(now, row.delivery_batch_id);
        db.prepare(`
          UPDATE delivery_tasks
          SET status = 'delivered',
              delivered_at = COALESCE(delivered_at, ?),
              buyer_delivery_code_verified_at = COALESCE(buyer_delivery_code_verified_at, ?),
              updated_at = ?
          WHERE delivery_batch_id = ?
        `).run(now, now, now, row.delivery_batch_id);

        // Workload is synchronized from live assignments below. Avoid mutable
        // decrement counters, which drift when a batch has several orders.
      }
    }
    db.prepare(`
      INSERT INTO rider_earnings (id, rider_id, assignment_id, order_id, order_type, amount_kobo, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?)
      ON CONFLICT(assignment_id) DO UPDATE SET status = 'available', updated_at = excluded.updated_at
    `).run(createId("reg"), riderId, row.id, row.order_id, row.order_type, row.delivery_fee_kobo || 0, now, now);
    db.prepare(`
      UPDATE rider_profiles
      SET completed_deliveries = completed_deliveries + 1,
          current_active_batch_count = ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(activeDispatchCount(riderId), now, riderId);
    createNotification({
      userId: row.buyer_id,
      type: "order",
      title: "Order delivered",
      body: "Your Gleenc order has been delivered and confirmed with OTP.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
    createNotification({
      userId: row.seller_id,
      type: "order",
      title: "Delivery completed",
      body: "The rider completed delivery with the buyer code and proof.",
      actionLabel: "View successful orders",
      actionPath: "/seller/orders?view=successful",
    });
    createNotification({
      userId: riderId,
      type: "order",
      title: "Delivery completed",
      body: `${row.seller_name || "Seller"}'s delivery was completed. Your rider earning is now pending platform payout.`,
      actionLabel: "View completed deliveries",
      actionPath: "/rider/completed",
    });
  });
  markPayoutDeliveryVerified({
    sourceType: row.order_type === "used_order" ? "used_order" : "store_order",
    orderId: row.order_id,
    actorId: riderId,
    note: "Rider verified delivery code and GPS proof.",
  });
  return serializeAssignment(assignmentByOrderForRider(riderId, orderId), { revealPrivate: true });
}

export async function generateRiderPaymentLink(auth, orderId) {
  const riderId = requireRiderUser(auth);
  const row = assignmentByOrderForRider(riderId, orderId);

  if (!row) {
    throw new HttpError(404, "Delivery assignment was not found for this rider.");
  }

  if (!["picked_up", "out_for_delivery"].includes(row.status)) {
    throw new HttpError(422, "Verify seller pickup before generating the buyer payment link.");
  }

  if (row.payment_status === "paid") {
    throw new HttpError(422, "This order payment has already been confirmed.");
  }

  if (!row.buyer_id) {
    throw new HttpError(422, "Buyer account is required before payment can be generated.");
  }

  const payment = await initializePayment(row.buyer_id, {
    purpose: row.order_type === "used_order" ? "used_order" : "store_order",
    targetId: row.order_id,
  });

  createNotification({
    userId: row.buyer_id,
    type: "payment",
    title: "Delivery payment link is ready",
    body: "Your rider has generated a secure Gleenc/Paystack payment link. Pay before sharing your delivery OTP.",
    actionLabel: "Open order",
    actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
  });

  return {
    paymentLink: payment.authorizationUrl,
    reference: payment.reference,
    payment,
    assignment: serializeAssignment(assignmentByOrderForRider(riderId, orderId), { revealPrivate: true }),
  };
}

export function failAssignment(auth, assignmentId, input) {
  const riderId = requireRiderUser(auth);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  if (["delivered", "cancelled", "failed"].includes(row.status)) throw new HttpError(422, "This delivery is already closed.");
  const now = nowIso();
  transaction(() => {
    db.prepare("UPDATE rider_assignments SET status = 'failed', fail_reason = ?, failed_at = ?, updated_at = ? WHERE id = ?").run(clean(input.note, 500), now, now, assignmentId);
    db.prepare("UPDATE rider_profiles SET current_active_batch_count = ?, updated_at = ? WHERE user_id = ?")
      .run(activeDispatchCount(riderId), now, riderId);
    if (input.currentLocation) recordLocation(riderId, input.currentLocation, assignmentId);
    createNotification({
      userId: row.seller_id,
      type: "order",
      title: "Delivery failed",
      body: clean(input.note, 500),
      actionLabel: "Review order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
  });
  return serializeAssignment(assignmentByIdForRider(riderId, assignmentId), { revealPrivate: true });
}

export function createRiderSafetyReport(auth, input) {
  const riderId = requireRiderUser(auth);
  const now = nowIso();
  const id = createId("rsr");
  db.prepare(`
    INSERT INTO rider_safety_reports (id, rider_id, assignment_id, order_id, report_type, note, lat, lng, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(
    id,
    riderId,
    clean(input.assignmentId, 140) || null,
    clean(input.orderId, 140) || null,
    input.type,
    clean(input.note, 1000),
    input.location?.lat ?? null,
    input.location?.lng ?? null,
    now,
    now,
  );
  createNotification({
    userId: riderId,
    type: "admin",
    title: "Safety report received",
    body: "Gleenc support has received your rider safety report.",
    actionLabel: "Open safety center",
    actionPath: "/rider/safety",
  });
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
  for (const admin of admins) {
    createNotification({
      userId: admin.id,
      type: "admin",
      title: "New rider dispute/compliance report",
      body: clean(input.note, 180) || "A rider submitted a safety or compliance report.",
      actionLabel: "Open admin disputes",
      actionPath: "/admin?tab=disputes",
    });
  }
  return db.prepare("SELECT * FROM rider_safety_reports WHERE id = ?").get(id);
}

export function auditRiderContact(auth, assignmentId, input) {
  const riderId = requireRiderUser(auth);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  const now = nowIso();
  db.prepare(`
    INSERT INTO rider_contact_audit_logs (id, rider_id, assignment_id, contact_type, contact_target, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("rca"), riderId, assignmentId, input.contactType, input.contactTarget, now);
  return { ok: true, loggedAt: now };
}

export function markRiderNotificationRead(auth, notificationId) {
  const riderId = requireRiderUser(auth);
  return markNotificationRead(riderId, notificationId);
}

function sellerOrderForRiderManagement(auth, orderId) {
  if (!auth || !["seller", "admin"].includes(auth.role)) {
    throw new HttpError(403, "Seller or admin access is required.");
  }
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (auth.role !== "admin" && order.seller_id !== (auth.user_id || auth.id)) {
    throw new HttpError(403, "Only this order's seller can manage its rider.");
  }
  return order;
}

function assignedRiderRowForOrder(order) {
  const assignment = db.prepare(`
    SELECT rider_assignments.*,
           users.name AS rider_user_name,
           users.email AS rider_email,
           users.phone AS rider_user_phone,
           users.avatar_url AS rider_avatar_url,
           rider_profiles.selfie_url AS rider_selfie_url,
           rider_profiles.vehicle_type AS rider_vehicle_type,
           rider_profiles.transport_type AS rider_transport_type,
           rider_profiles.current_lat AS rider_current_lat,
           rider_profiles.current_lng AS rider_current_lng,
           rider_profiles.last_location_at AS rider_last_location_at,
           rider_profiles.last_presence_at AS rider_last_presence_at,
           rider_profiles.availability AS rider_availability
    FROM rider_assignments
    JOIN users ON users.id = rider_assignments.rider_id
    LEFT JOIN rider_profiles ON rider_profiles.user_id = rider_assignments.rider_id
    WHERE rider_assignments.order_type = 'store_order'
      AND rider_assignments.order_id = ?
    ORDER BY
      CASE WHEN rider_assignments.status IN ('assigned','accepted','arrived_pickup','picked_up','out_for_delivery') THEN 0 ELSE 1 END,
      rider_assignments.updated_at DESC
    LIMIT 1
  `).get(order.id);
  if (assignment && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) return assignment;

  if (!order.delivery_batch_id) return null;
  return db.prepare(`
    SELECT dispatch_attempts.id AS dispatch_attempt_id,
           dispatch_attempts.status AS dispatch_attempt_status,
           dispatch_attempts.rider_id,
           dispatch_attempts.offered_at AS created_at,
           dispatch_attempts.updated_at,
           users.name AS rider_user_name,
           users.email AS rider_email,
           users.phone AS rider_user_phone,
           users.avatar_url AS rider_avatar_url,
           rider_profiles.selfie_url AS rider_selfie_url,
           rider_profiles.vehicle_type AS rider_vehicle_type,
           rider_profiles.transport_type AS rider_transport_type,
           rider_profiles.current_lat AS rider_current_lat,
           rider_profiles.current_lng AS rider_current_lng,
           rider_profiles.last_location_at AS rider_last_location_at,
           rider_profiles.last_presence_at AS rider_last_presence_at,
           rider_profiles.availability AS rider_availability
    FROM dispatch_attempts
    JOIN users ON users.id = dispatch_attempts.rider_id
    LEFT JOIN rider_profiles ON rider_profiles.user_id = dispatch_attempts.rider_id
    WHERE dispatch_attempts.delivery_batch_id = ?
      AND dispatch_attempts.status IN ('offered','accepted')
    ORDER BY dispatch_attempts.updated_at DESC
    LIMIT 1
  `).get(order.delivery_batch_id);
}

export function getSellerAssignedRider(auth, orderId) {
  const order = sellerOrderForRiderManagement(auth, orderId);
  const row = assignedRiderRowForOrder(order);
  if (!row) throw new HttpError(404, "No active rider is assigned to this order.");

  const riderPoint = pointFrom("", row.rider_current_lat, row.rider_current_lng);
  const pickupPoint = pointFrom(order.pickup_location || "", order.pickup_lat, order.pickup_lng);
  const meters = distanceMeters(riderPoint, pickupPoint);
  // Opening the seller popup must not create an empty conversation. The
  // message page resolves this assignment as a draft and persists it only
  // when the first message is sent.
  const conversationId = null;

  return {
    assignmentId: row.id || null,
    dispatchAttemptId: row.dispatch_attempt_id || null,
    orderId: order.id,
    status: row.status || row.dispatch_attempt_status || "offered",
    accepted: ["accepted", "arrived_pickup", "picked_up", "out_for_delivery"].includes(row.status) || row.dispatch_attempt_status === "accepted",
    canCancel: !["picked_up", "out_for_delivery", "delivered"].includes(row.status),
    conversationId,
    chatPath: row.id
      ? `/messages?assignment=${encodeURIComponent(row.id)}`
      : row.dispatch_attempt_id
        ? `/messages?offer=${encodeURIComponent(row.dispatch_attempt_id)}`
        : "",
    rider: {
      id: row.rider_id,
      name: row.rider_user_name || "Gleenc rider",
      username: "@rider",
      profileImageUrl: row.rider_selfie_url || row.rider_avatar_url || null,
      phone: row.rider_user_phone || "",
      email: row.rider_email || "",
      vehicleType: row.rider_vehicle_type || row.rider_transport_type || "Rider",
      isOnline: row.rider_availability === "online" && isRiderPresenceOnline({ user_id: row.rider_id }),
      lastActiveAt: row.rider_last_presence_at || row.rider_last_location_at || row.updated_at || null,
      currentLocation: row.rider_current_lat == null || row.rider_current_lng == null
        ? null
        : { lat: Number(row.rider_current_lat), lng: Number(row.rider_current_lng) },
      distanceToSellerKm: Number.isFinite(meters) ? Number((meters / 1000).toFixed(2)) : null,
    },
  };
}

export function cancelSellerRiderAssignment(auth, orderId, reason = "") {
  const order = sellerOrderForRiderManagement(auth, orderId);
  const row = assignedRiderRowForOrder(order);
  if (!row) throw new HttpError(404, "No active rider assignment was found.");
  if (["picked_up", "out_for_delivery", "delivered"].includes(row.status)) {
    throw new HttpError(409, "The rider assignment cannot be cancelled after pickup.");
  }

  const now = nowIso();
  const note = clean(reason || "Seller cancelled the rider assignment.", 500);
  transaction(() => {
    if (row.id) {
      db.prepare(`
        UPDATE rider_assignments
        SET status = 'cancelled', fail_reason = ?, failed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(note, now, now, row.id);
    }
    if (order.delivery_batch_id) {
      db.prepare(`
        UPDATE dispatch_attempts
        SET status = CASE WHEN status IN ('offered','accepted') THEN 'superseded' ELSE status END,
            rejection_reason = CASE WHEN status IN ('offered','accepted') THEN ? ELSE rejection_reason END,
            updated_at = ?
        WHERE delivery_batch_id = ?
      `).run(note, now, order.delivery_batch_id);
      db.prepare(`
        UPDATE delivery_batches
        SET assigned_rider_id = NULL,
            current_dispatch_attempt_id = NULL,
            status = 'ready_for_dispatch',
            dispatch_status = 'ready_for_dispatch',
            rider_assignment_status = 'ready',
            blocking_step = 'ready_to_find_rider',
            updated_at = ?
        WHERE id = ?
      `).run(now, order.delivery_batch_id);
      db.prepare(`
        UPDATE pickup_tasks
        SET status = CASE WHEN seller_marked_ready = 1 THEN 'package_ready' ELSE status END,
            updated_at = ?
        WHERE delivery_batch_id = ? AND status != 'seller_rejected'
      `).run(now, order.delivery_batch_id);
      db.prepare("UPDATE delivery_tasks SET status = 'pending_pickups', updated_at = ? WHERE delivery_batch_id = ?")
        .run(now, order.delivery_batch_id);
    }
    db.prepare(`
      UPDATE orders
      SET assigned_rider_id = NULL,
          rider_assignment_id = NULL,
          auto_dispatch_status = 'ready_for_dispatch',
          dispatch_status = 'ready_for_dispatch',
          delivery_status = 'package_ready',
          updated_at = ?
      WHERE id = ?
    `).run(now, order.id);
    db.prepare("UPDATE rider_profiles SET current_active_batch_count = ?, updated_at = ? WHERE user_id = ?")
      .run(activeDispatchCount(row.rider_id), now, row.rider_id);
    createNotification({
      userId: row.rider_id,
      type: "order",
      title: "Rider assignment cancelled",
      body: note,
      actionLabel: "Open rider dashboard",
      actionPath: "/rider",
    });
  });

  return { ok: true, orderId: order.id, cancelledRiderId: row.rider_id };
}

export function cookieConfig() {
  return { sessionCookieName: riderSessionCookieName, sessionCookieOptions: sessionCookieOptions() };
}

export function adminListRiders(auth, status = "") {
  if (!auth || auth.role !== "admin") throw new HttpError(403, "Only admins can manage riders.");
  expireStaleRiderPresence();
  const params = [];
  let where = "WHERE users.role = 'rider'";
  if (status) {
    where += " AND rider_profiles.verification_status = ?";
    params.push(status);
  }
  return db.prepare(`
    SELECT users.id AS user_id, users.name, users.email, users.phone AS user_phone,
           users.is_active, users.email_verified, users.email_verified_at,
           users.phone_verified, users.phone_verified_at, users.created_at AS user_created_at,
           users.updated_at AS user_updated_at,
           rider_profiles.*
    FROM users
    LEFT JOIN rider_profiles ON rider_profiles.user_id = users.id
    ${where}
    ORDER BY COALESCE(rider_profiles.updated_at, users.updated_at) DESC
    LIMIT 200
  `).all(...params).map((row) => ({
    user: {
      id: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.user_phone,
      emailVerified: Boolean(row.email_verified),
      emailVerifiedAt: row.email_verified_at || null,
      phoneVerified: Boolean(row.phone_verified),
      phoneVerifiedAt: row.phone_verified_at || null,
      isActive: Boolean(row.is_active),
      createdAt: row.user_created_at,
      updatedAt: row.user_updated_at,
    },
    riderProfile: serializeProfile(row.id ? row : null),
  }));
}

export function adminUpdateRiderVerification(auth, riderId, input) {
  if (!auth || auth.role !== "admin") throw new HttpError(403, "Only admins can verify riders.");
  const rider = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'rider'").get(riderId);
  if (!rider) throw new HttpError(404, "Rider account was not found.");
  const existing = getRiderProfile(riderId);
  if (!existing) throw new HttpError(404, "Rider profile was not found.");
  if (input.verificationStatus === "verified") {
    const verificationCase = ensureVerificationCase(riderId, "rider");
    if (Number(verificationCase.current_verified_level || 0) < 1) {
      throw new HttpError(
        422,
        "Complete and approve rider Stage 1 before marking the rider verified.",
      );
    }
  }
  const now = nowIso();
  const requestedMaxPackageValueKobo = Number(input.maxPackageValueKobo ?? existing.max_package_value_kobo ?? 0);
  const nextMaxPackageValueKobo =
    input.verificationStatus === "verified" && requestedMaxPackageValueKobo <= 0
      ? 2_000_000
      : requestedMaxPackageValueKobo > 0
        ? requestedMaxPackageValueKobo
        : null;
  db.prepare(`
    UPDATE rider_profiles
    SET verification_status = ?,
        verification_note = ?,
        verification_level = COALESCE(?, verification_level),
        max_package_value_kobo = COALESCE(?, max_package_value_kobo),
        safety_status = COALESCE(?, safety_status),
        availability = CASE
          WHEN ? IN ('rejected','suspended') THEN 'offline'
          ELSE availability
        END,
        availability_mode = CASE
          WHEN ? IN ('rejected','suspended') THEN 'offline'
          ELSE availability_mode
        END,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    input.verificationStatus,
    clean(input.verificationNote, 500),
    input.verificationLevel ?? null,
    nextMaxPackageValueKobo,
    input.safetyStatus ?? null,
    input.verificationStatus,
    input.verificationStatus,
    now,
    riderId,
  );
  createNotification({
    userId: riderId,
    type: "admin",
    title: input.verificationStatus === "verified" ? "Rider account verified" : "Rider verification updated",
    body: input.verificationNote || `Your rider account status is now ${input.verificationStatus}.`,
    actionLabel: "Open rider dashboard",
    actionPath: "/rider",
  });
  return serializeProfile(getRiderProfile(riderId));
}

export function adminUnlockRiderCapacityChange(auth, riderId, input = {}) {
  if (!auth || auth.role !== "admin") throw new HttpError(403, "Only admins can unlock rider capacity changes.");
  const rider = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'rider'").get(riderId);
  if (!rider) throw new HttpError(404, "Rider account was not found.");
  const existing = getRiderProfile(riderId);
  if (!existing) throw new HttpError(404, "Rider profile was not found.");

  const minutes = Math.min(1440, Math.max(15, Number(input.minutes || 120)));
  const unlockUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const note = clean(input.note || "Admin opened a temporary delivery-capacity change window.", 500);
  const now = nowIso();

  db.prepare(`
    UPDATE rider_profiles
    SET capacity_change_unlocked_until = ?, verification_note = ?, updated_at = ?
    WHERE user_id = ?
  `).run(unlockUntil, note, now, riderId);

  db.prepare(`
    UPDATE rider_capacity_profiles
    SET capacity_change_unlocked_until = ?, updated_at = ?
    WHERE rider_id = ?
  `).run(unlockUntil, now, riderId);

  createNotification({
    userId: riderId,
    type: "admin",
    title: "Capacity change unlocked",
    body: `Admin unlocked your rider delivery capacity settings until ${new Date(unlockUntil).toLocaleString()}.`,
    actionLabel: "Update capacity",
    actionPath: "/rider/profile",
  });

  return serializeProfile(getRiderProfile(riderId));
}
