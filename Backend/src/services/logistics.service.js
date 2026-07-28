import crypto from "node:crypto";
import { db, transaction } from "../db/database.js";
import "../db/logistics-migrations.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { serializeProduct } from "../lib/serializers.js";
import { createNotification, createNotificationForUsers } from "./notification.service.js";
import {
  buildDispatchExpiresAt,
  dispatchRemainingSeconds,
  resolveDispatchTimeoutPolicy,
} from "./dispatch-timeout.service.js";
import { evaluateRiderEligibility } from "./verification.service.js";
import { createDeliveryAssignmentConversation } from "./message.service.js";

const SIZE_ORDER = ["small", "medium", "large", "extra_large"];
const WEIGHT_ORDER = ["very_light", "light", "medium", "heavy", "very_heavy"];
const VEHICLE_ORDER = ["walking_ok", "bicycle_or_above", "motorcycle_or_above", "tricycle_or_above", "car_or_van_required"];
const RISK_ORDER = ["low", "medium", "high", "critical"];
const MANUAL_ASSIGNMENT_DISPATCH_STATUSES = new Set([
  "seller_manual_assignment_required",
  "manual_assignment_required",
  "no_rider_available",
  "assignment_failed",
  "offer_declined",
  "offer_expired",
  "ready_for_dispatch",
]);

const DEFAULT_PROFILE = {
  packageSize: "small",
  packageWeightClass: "light",
  fragilityLevel: "not_fragile",
  handlingInstructions: ["normal_handling"],
  packageShape: "box",
  stackability: "stackable",
  batchingEligibility: "can_batch",
  requiredVehicleType: "motorcycle_or_above",
  specialDeliveryFlags: ["none"],
  estimatedPackageUnits: 1,
  requiresSeparateDelivery: false,
  packageProfileAutoSuggested: true,
  packageProfileSellerEdited: false,
  packageProfileAdminVerified: false,
  packageProfileRiskFlag: "",
  riskLevel: "low",
};

function nowIso() {
  return new Date().toISOString();
}

function safeJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeJsonObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function slugKey(value) {
  return clean(value, 160)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function koboToNaira(kobo) {
  return Number(kobo || 0) / 100;
}

function rank(value, list) {
  const index = list.indexOf(value);
  return index === -1 ? 0 : index;
}

function maxByRank(values, list, fallback) {
  return values.reduce((best, value) => (rank(value, list) > rank(best, list) ? value : best), fallback);
}

function booleanInt(value) {
  return value ? 1 : 0;
}

function hashOtp(code) {
  return crypto
    .createHmac("sha256", process.env.RIDER_OTP_SECRET || env.jwtSecret || "gleenc-logistics-otp")
    .update(String(code || "").trim())
    .digest("hex");
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function generateOrderVerificationCode(kind, orderId) {
  const digest = crypto
    .createHmac("sha256", process.env.RIDER_OTP_SECRET || env.jwtSecret || "gleenc-logistics-otp")
    .update(`${kind}:${orderId}`)
    .digest();
  const number = digest.readUInt32BE(0) % 900000;
  return String(number + 100000);
}

function generateFallbackPackageTag(orderId = "") {
  const digest = crypto
    .createHmac("sha256", process.env.RIDER_OTP_SECRET || env.jwtSecret || "gleenc-logistics-otp")
    .update(`package:${orderId}`)
    .digest("hex")
    .slice(0, 5)
    .toUpperCase();
  return `GLC-${digest}`;
}

function buyerDeliveryCodeForOrder(order) {
  return clean(order?.verification_code, 12) || generateOrderVerificationCode("buyer-delivery", order?.id || "");
}

function sellerPickupCodeForOrder(order) {
  return generateOrderVerificationCode("seller-pickup", order?.id || "");
}

function ensureOrderStage2Codes(orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return null;
  const sellerPickupCode = sellerPickupCodeForOrder(order);
  const buyerDeliveryCode = buyerDeliveryCodeForOrder(order);
  const packageTagCode = clean(order.package_tag_code, 40) || generateFallbackPackageTag(order.id);
  const now = nowIso();

  db.prepare(`
    UPDATE orders
    SET seller_pickup_code_hash = COALESCE(NULLIF(seller_pickup_code_hash, ''), ?),
        buyer_delivery_code_hash = COALESCE(NULLIF(buyer_delivery_code_hash, ''), ?),
        verification_code = COALESCE(NULLIF(verification_code, ''), ?),
        package_tag_code = COALESCE(NULLIF(package_tag_code, ''), ?),
        updated_at = ?
    WHERE id = ?
  `).run(
    hashOtp(sellerPickupCode),
    hashOtp(buyerDeliveryCode),
    buyerDeliveryCode,
    packageTagCode,
    now,
    order.id,
  );

  return {
    sellerPickupCode,
    buyerDeliveryCode,
    packageTagCode,
  };
}

function deliveryReadinessForProduct(product = {}, orderCreatedAt = nowIso()) {
  const type = product.delivery_readiness_type || "immediate";
  if (type === "scheduled_date" && product.delivery_ready_at) {
    const time = Date.parse(product.delivery_ready_at);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  const minutes = Number(product.delivery_ready_after_minutes || 0);
  if ((type === "hours" || type === "days") && minutes > 0) {
    const base = Date.parse(orderCreatedAt) || Date.now();
    return new Date(base + minutes * 60 * 1000).toISOString();
  }

  return null;
}

function deliveryReadinessLabelForProduct(product = {}) {
  const type = product.delivery_readiness_type || "immediate";
  const minutes = Number(product.delivery_ready_after_minutes || 0);
  if (type === "hours") return `Ready for delivery in ${Math.max(1, Math.round(minutes / 60))} hour(s)`;
  if (type === "days") return `Ready for delivery in ${Math.max(1, Math.round(minutes / 1440))} day(s)`;
  if (type === "scheduled_date" && product.delivery_ready_at) return `Ready for delivery from ${product.delivery_ready_at}`;
  return "Ready for delivery immediately";
}

function readinessSummaryForOrderItems(items = [], orderCreatedAt = nowIso()) {
  const readyTimes = items
    .map((item) => deliveryReadinessForProduct(item, orderCreatedAt))
    .filter(Boolean)
    .map((value) => Date.parse(value));
  const maxReadyAt = readyTimes.length ? new Date(Math.max(...readyTimes)).toISOString() : null;
  const labels = Array.from(new Set(items.map(deliveryReadinessLabelForProduct))).filter(Boolean);
  return {
    readyAt: maxReadyAt,
    label: maxReadyAt ? `Seller will prepare this item before dispatch. ${labels.join(" · ")}` : "Ready for delivery immediately",
    labels,
  };
}

function readinessDue(readyAt) {
  if (!readyAt) return true;
  const time = Date.parse(readyAt);
  return !Number.isFinite(time) || time <= Date.now();
}

function notificationEvent({ userId = null, role = "", eventKey, title = "", body = "", relatedOrderId = null, relatedBatchId = null }) {
  db.prepare(`
    INSERT INTO notification_events (
      id, user_id, role, event_key, title, body, related_order_id, related_batch_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("nev"),
    userId,
    role,
    eventKey,
    title,
    body,
    relatedOrderId,
    relatedBatchId,
    nowIso(),
  );
}

function offerWindowSeconds() {
  const seconds = Number(env.riderDispatchOfferSeconds || 90);
  if (!Number.isFinite(seconds) || seconds <= 0) return 90;
  return Math.max(30, Math.min(180, Math.round(seconds)));
}

function batchSafePaymentReady(order) {
  if (!order) return false;
  if (order.payment_status === "paid") return true;
  return order.payment_method === "pay_on_delivery" && ["seller_confirmed", "ready_for_delivery", "out_for_delivery"].includes(order.status || "");
}

function deriveBatchBlockingStep(batchId) {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) return "missing_batch";
  const tasks = db.prepare(`
    SELECT pickup_tasks.*, orders.payment_status, orders.payment_method, orders.status AS order_status
    FROM pickup_tasks
    LEFT JOIN orders ON orders.id = pickup_tasks.order_id
    WHERE pickup_tasks.delivery_batch_id = ?
      AND pickup_tasks.status != 'seller_rejected'
  `).all(batchId);

  if (!tasks.length) return "cancelled_or_no_active_pickups";
  if (tasks.some((task) => !batchSafePaymentReady({
    payment_status: task.payment_status,
    payment_method: task.payment_method,
    status: task.order_status,
  }))) {
    return "payment_not_ready";
  }
  if (tasks.some((task) => !task.seller_confirmed_availability)) return "seller_stock_confirmation";
  if (tasks.some((task) => !task.seller_marked_ready)) return "seller_package_preparation";
  if (batch.assigned_rider_id) return "rider_assigned";
  if (batch.dispatch_status === "offer_pending" || batch.dispatch_status === "rider_offered") return "rider_offer_pending";
  if (batch.manual_assignment_unlocked) return "seller_manual_assignment";
  return "ready_to_find_rider";
}

function syncBatchWorkflowState(batchId, updates = {}) {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) return null;
  const blockingStep = updates.blockingStep || deriveBatchBlockingStep(batchId);
  const patch = {
    sellerPreparationStatus: updates.sellerPreparationStatus || (
      blockingStep === "seller_package_preparation" || blockingStep === "seller_stock_confirmation"
        ? "not_ready"
        : "ready"
    ),
    riderAssignmentStatus: updates.riderAssignmentStatus || (
      batch.assigned_rider_id
        ? "assigned"
        : blockingStep === "rider_offer_pending"
          ? "offer_pending"
          : blockingStep === "ready_to_find_rider" || blockingStep === "seller_manual_assignment"
            ? "ready"
            : "not_started"
    ),
    deliveryWorkflowStatus: updates.deliveryWorkflowStatus || batch.delivery_workflow_status || "not_started",
    payoutWorkflowStatus: updates.payoutWorkflowStatus || batch.payout_workflow_status || "on_hold",
  };
  const now = nowIso();
  db.prepare(`
    UPDATE delivery_batches
    SET seller_preparation_status = ?,
        rider_assignment_status = ?,
        delivery_workflow_status = ?,
        payout_workflow_status = ?,
        blocking_step = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    patch.sellerPreparationStatus,
    patch.riderAssignmentStatus,
    patch.deliveryWorkflowStatus,
    patch.payoutWorkflowStatus,
    blockingStep,
    now,
    batchId,
  );
  return db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
}

function recordDispatchEvent({
  batchId,
  attemptId = null,
  riderId = null,
  actorId = null,
  actorRole = "",
  eventType,
  note = "",
  statusBefore = "",
  statusAfter = "",
  metadata = {},
}) {
  if (!batchId || !eventType) return null;
  const id = createId("dev");
  db.prepare(`
    INSERT INTO dispatch_events (
      id, delivery_batch_id, dispatch_attempt_id, rider_id, event_type, note,
      actor_id, actor_role, status_before, status_after, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    batchId,
    attemptId,
    riderId,
    eventType,
    clean(note, 900),
    actorId,
    clean(actorRole, 60),
    clean(statusBefore, 80),
    clean(statusAfter, 80),
    JSON.stringify(metadata || {}),
    nowIso(),
  );
  return id;
}

function assertOtpAttemptAllowed(table, idColumn, task, taskLabel) {
  const attempts = Number(task.code_attempt_count || 0);
  const lastAttemptMs = Date.parse(task.last_code_attempt_at || "");
  if (attempts >= 5) {
    if (Number.isFinite(lastAttemptMs) && Date.now() - lastAttemptMs < 15 * 60 * 1000) {
      throw new HttpError(429, `Too many ${taskLabel} code attempts. Please wait before trying again.`);
    }
    db.prepare(`UPDATE ${table} SET code_attempt_count = 0, last_code_attempt_at = NULL WHERE ${idColumn} = ?`).run(task.id);
  }
}

function recordFailedOtpAttempt(table, idColumn, task) {
  db.prepare(`
    UPDATE ${table}
    SET code_attempt_count = code_attempt_count + 1,
        last_code_attempt_at = ?,
        updated_at = ?
    WHERE ${idColumn} = ?
  `).run(nowIso(), nowIso(), task.id);
}

function queueIntervention(input) {
  const existing = db.prepare(`
    SELECT * FROM intervention_queue
    WHERE status = 'open'
      AND type = ?
      AND COALESCE(related_batch_id, '') = COALESCE(?, '')
      AND COALESCE(related_order_id, '') = COALESCE(?, '')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(input.type, input.relatedBatchId || null, input.relatedOrderId || null);

  if (existing) return serializeIntervention(existing);

  const now = nowIso();
  const id = createId("intq");
  db.prepare(`
    INSERT INTO intervention_queue (
      id, type, priority, related_order_id, related_batch_id, related_user_id,
      related_seller_id, related_rider_id, reason, status, assigned_admin_id,
      created_at, resolved_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, NULL, ?)
  `).run(
    id,
    input.type,
    input.priority || "medium",
    input.relatedOrderId || null,
    input.relatedBatchId || null,
    input.relatedUserId || null,
    input.relatedSellerId || null,
    input.relatedRiderId || null,
    clean(input.reason, 700),
    now,
    now,
  );

  return serializeIntervention(db.prepare("SELECT * FROM intervention_queue WHERE id = ?").get(id));
}

function serializeZone(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentAreaId: row.parent_area_id || null,
    zoneType: row.zone_type,
    marketId: row.market_id || null,
    campusId: row.campus_id || null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    baseDeliveryFeeKobo: Number(row.base_delivery_fee_kobo || 0),
    baseDeliveryFee: koboToNaira(row.base_delivery_fee_kobo),
    extraPickupFeeKobo: Number(row.extra_pickup_fee_kobo || 0),
    extraPickupFee: koboToNaira(row.extra_pickup_fee_kobo),
    supportedDeliveryTypes: safeJsonArray(row.supported_delivery_types, ["instant", "scheduled"]),
    isActive: row.is_active !== 0,
    availabilityStatus: row.availability_status || "normal",
    availabilityNote: row.availability_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePackageRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    categoryKey: row.category_key,
    categoryName: row.category_name,
    packageSize: row.package_size,
    packageWeightClass: row.package_weight_class,
    fragilityLevel: row.fragility_level,
    handlingInstructions: safeJsonArray(row.handling_instructions, ["normal_handling"]),
    packageShape: row.package_shape,
    stackability: row.stackability,
    batchingEligibility: row.batching_eligibility,
    requiredVehicleType: row.required_vehicle_type,
    specialDeliveryFlags: safeJsonArray(row.special_delivery_flags, ["none"]),
    estimatedPackageUnits: Number(row.estimated_package_units || 1),
    requiresSeparateDelivery: Boolean(row.requires_separate_delivery),
    riskLevel: row.risk_level || "low",
    adminReviewRequired: Boolean(row.admin_review_required),
    isActive: row.is_active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializePackageProfile(row) {
  if (!row) return { ...DEFAULT_PROFILE };
  return {
    packageSize: row.package_size || DEFAULT_PROFILE.packageSize,
    packageWeightClass: row.package_weight_class || DEFAULT_PROFILE.packageWeightClass,
    fragilityLevel: row.fragility_level || DEFAULT_PROFILE.fragilityLevel,
    handlingInstructions: safeJsonArray(row.handling_instructions, DEFAULT_PROFILE.handlingInstructions),
    packageShape: row.package_shape || DEFAULT_PROFILE.packageShape,
    stackability: row.stackability || DEFAULT_PROFILE.stackability,
    batchingEligibility: row.batching_eligibility || DEFAULT_PROFILE.batchingEligibility,
    requiredVehicleType: row.required_vehicle_type || DEFAULT_PROFILE.requiredVehicleType,
    specialDeliveryFlags: safeJsonArray(row.special_delivery_flags, DEFAULT_PROFILE.specialDeliveryFlags),
    estimatedPackageUnits: Number(row.estimated_package_units || 1),
    requiresSeparateDelivery: Boolean(row.requires_separate_delivery),
    packageProfileAutoSuggested: Boolean(row.package_profile_auto_suggested ?? row.auto_suggested ?? 1),
    packageProfileSellerEdited: Boolean(row.package_profile_seller_edited ?? row.seller_edited ?? 0),
    packageProfileAdminVerified: Boolean(row.package_profile_admin_verified ?? row.admin_verified ?? 0),
    packageProfileRiskFlag: row.package_profile_risk_flag || row.risk_flag || "",
    riskLevel: row.risk_level || DEFAULT_PROFILE.riskLevel,
  };
}

function serializeCapacity(row) {
  if (!row) return null;
  const serviceZones = safeJsonArray(row.service_zone_ids, []);
  return {
    riderId: row.rider_id || row.user_id,
    transportType: row.transport_type || row.vehicle_type || "motorcycle",
    maxPackageSize: row.max_package_size || "small_medium",
    maxWeightClass: row.max_weight_class || "up_to_medium",
    fragileHandlingAbility: row.fragile_handling_ability || "can_handle_fragile",
    deliveryBagType: row.delivery_bag_type || "medium_delivery_bag",
    serviceZoneIds: serviceZones,
    currentZoneId: row.current_zone_id || null,
    gpsPermissionStatus: row.gps_permission_status || "gps_disabled",
    availabilityMode: row.availability_mode || row.availability || "offline",
    canReceiveAutoDispatch: row.can_receive_auto_dispatch !== 0,
    capacityLocked: row.capacity_locked === 1,
    capacityChangeUnlockedUntil: row.capacity_change_unlocked_until || null,
    currentActiveBatchCount: Number(row.current_active_batch_count || 0),
    acceptanceRate: Number(row.acceptance_rate ?? 1),
    rejectionRate: Number(row.rejection_rate ?? 0),
    responseSpeedScore: Number(row.response_speed_score ?? 1),
    reliabilityScore: Number(row.reliability_score ?? 1),
    updatedAt: row.updated_at,
  };
}

function serializeBatch(row, { pickupTasks = [], deliveryTask = null, attempts = [] } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    parentOrderId: row.parent_order_id,
    batchType: row.batch_type,
    sourceAreaId: row.source_area_id || null,
    sourceZoneId: row.source_zone_id || null,
    deliveryZoneId: row.delivery_zone_id || null,
    marketId: row.market_id || null,
    campusId: row.campus_id || null,
    pickupCount: Number(row.pickup_count || 0),
    totalItemCount: Number(row.total_item_count || 0),
    packageSizeSummary: row.package_size_summary,
    weightClassSummary: row.weight_class_summary,
    fragilitySummary: row.fragility_summary,
    requiredVehicleType: row.required_vehicle_type,
    requiresGps: Boolean(row.requires_gps),
    requiresPhotoProof: Boolean(row.requires_photo_proof),
    canBatch: Boolean(row.can_batch),
    deliveryFeeKobo: Number(row.delivery_fee_kobo || 0),
    deliveryFee: koboToNaira(row.delivery_fee_kobo),
    riskLevel: row.risk_level || "low",
    status: row.status,
    dispatchStatus: row.dispatch_status,
    sellerPreparationStatus: row.seller_preparation_status || "not_ready",
    riderAssignmentStatus: row.rider_assignment_status || "not_started",
    deliveryWorkflowStatus: row.delivery_workflow_status || "not_started",
    payoutWorkflowStatus: row.payout_workflow_status || "on_hold",
    blockingStep: row.blocking_step || "",
    assignmentMode: row.assignment_mode || "automatic",
    currentDispatchAttemptId: row.current_dispatch_attempt_id || null,
    offerWindowSeconds: Number(row.offer_window_seconds || offerWindowSeconds()),
    candidateSnapshot: safeJsonArray(row.candidate_snapshot_json),
    excludedCandidateSnapshot: safeJsonArray(row.excluded_candidate_snapshot_json),
    assignedRiderId: row.assigned_rider_id || null,
    dispatchAttemptCount: Number(row.dispatch_attempt_count || 0),
    pickupTasks,
    deliveryTask,
    attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePickupTask(row) {
  if (!row) return null;
  const orderItems = row.order_id ? db.prepare(`
    SELECT id, product_id, product_name, product_image_url,
           unit_price_kobo, quantity, total_kobo
    FROM order_items
    WHERE order_id = ?
    ORDER BY created_at ASC
  `).all(row.order_id).map((item) => ({
    id: item.id,
    productId: item.product_id,
    name: item.product_name,
    imageUrl: item.product_image_url || "",
    unitPrice: koboToNaira(item.unit_price_kobo),
    quantity: Number(item.quantity || 1),
    total: koboToNaira(item.total_kobo),
  })) : [];
  return {
    id: row.id,
    deliveryBatchId: row.delivery_batch_id,
    orderId: row.order_id || null,
    usedOrderId: row.used_order_id || null,
    sellerId: row.seller_id,
    sellerName: row.seller_name || "",
    orderCode: row.order_code || "",
    packageTagCode: row.package_tag_code || "",
    pickupZoneId: row.pickup_zone_id || null,
    pickupLandmark: row.pickup_landmark || "",
    pickupSequence: Number(row.pickup_sequence || 0),
    itemCount: Number(row.item_count || 0),
    packageProfileSnapshot: safeJsonObject(row.package_profile_snapshot),
    orderItems,
    status: row.status,
    sellerConfirmedAvailability: Boolean(row.seller_confirmed_availability),
    sellerMarkedReady: Boolean(row.seller_marked_ready),
    packageSize: row.package_size || safeJsonObject(row.package_profile_snapshot).packageSize || "",
    packageWeightClass: row.package_weight_class || safeJsonObject(row.package_profile_snapshot).packageWeightClass || "",
    handlingClass: row.handling_class || safeJsonObject(row.package_profile_snapshot).fragilityLevel || "",
    pickupPointConfirmed: Boolean(row.pickup_point_confirmed),
    packageReadyNote: row.package_ready_note || "",
    batchStatus: row.batch_status || "",
    dispatchStatus: row.dispatch_status || "",
    assignedRiderId: row.assigned_rider_id || null,
    dispatchAttemptCount: Number(row.dispatch_attempt_count || 0),
    manualAssignmentAllowed: MANUAL_ASSIGNMENT_DISPATCH_STATUSES.has(row.dispatch_status || ""),
    confirmationDeadlineAt: row.confirmation_deadline_at || null,
    sellerConfirmedAt: row.seller_confirmed_at || null,
    sellerRejectedAt: row.seller_rejected_at || null,
    sellerRejectionNote: row.seller_rejection_note || "",
    readyAt: row.ready_at || null,
    pickedUpAt: row.picked_up_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAttempt(row) {
  if (!row) return null;
  return {
    id: row.id,
    deliveryBatchId: row.delivery_batch_id,
    riderId: row.rider_id,
    dispatchScore: Number(row.dispatch_score || 0),
    status: row.status,
    offeredAt: row.offered_at,
    expiresAt: row.expires_at || null,
    acceptedAt: row.accepted_at || null,
    rejectedAt: row.rejected_at || null,
    timedOutAt: row.timed_out_at || null,
    rejectionReason: row.rejection_reason || "",
    attemptNumber: Number(row.attempt_number || 1),
    assignmentMode: row.assignment_mode || "automatic",
    offerWindowSeconds: Number(row.offer_window_seconds || offerWindowSeconds()),
    safeRiderSnapshot: safeJsonObject(row.safe_rider_snapshot_json),
    remainingSeconds: dispatchRemainingSeconds(row.expires_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeIntervention(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    priority: row.priority,
    relatedOrderId: row.related_order_id || null,
    relatedBatchId: row.related_batch_id || null,
    relatedUserId: row.related_user_id || null,
    relatedSellerId: row.related_seller_id || null,
    relatedRiderId: row.related_rider_id || null,
    reason: row.reason || "",
    status: row.status,
    assignedAdminId: row.assigned_admin_id || null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
    updatedAt: row.updated_at,
  };
}

function profileFromProduct(product) {
  return serializePackageProfile(product);
}

export function suggestPackageProfile(input = {}) {
  const categoryKey = slugKey(input.category || input.categoryKey || input.name || "");
  const nameKey = slugKey(input.name || "");
  const searchKey = `${categoryKey} ${nameKey}`;
  const rules = db.prepare("SELECT * FROM package_rules WHERE is_active = 1").all();

  const direct = rules.find((rule) => categoryKey === rule.category_key || searchKey.includes(rule.category_key));
  const matched = direct || rules.find((rule) => searchKey.includes(slugKey(rule.category_name)));

  const ruleProfile = matched ? serializePackageRule(matched) : null;
  const profile = ruleProfile
    ? {
        packageSize: ruleProfile.packageSize,
        packageWeightClass: ruleProfile.packageWeightClass,
        fragilityLevel: ruleProfile.fragilityLevel,
        handlingInstructions: ruleProfile.handlingInstructions,
        packageShape: ruleProfile.packageShape,
        stackability: ruleProfile.stackability,
        batchingEligibility: ruleProfile.batchingEligibility,
        requiredVehicleType: ruleProfile.requiredVehicleType,
        specialDeliveryFlags: ruleProfile.specialDeliveryFlags,
        estimatedPackageUnits: ruleProfile.estimatedPackageUnits,
        requiresSeparateDelivery: ruleProfile.requiresSeparateDelivery,
        riskLevel: ruleProfile.riskLevel,
        packageProfileAutoSuggested: true,
      }
    : { ...DEFAULT_PROFILE };

  return {
    profile,
    matchedRule: ruleProfile,
    riskFlag: evaluatePackageRiskFlag({ ...input, ...profile }),
  };
}

function evaluatePackageRiskFlag(input = {}) {
  const text = `${input.name || ""} ${input.category || ""} ${input.description || ""}`.toLowerCase();
  const packageSize = input.packageSize || input.package_size || DEFAULT_PROFILE.packageSize;
  const weight = input.packageWeightClass || input.package_weight_class || DEFAULT_PROFILE.packageWeightClass;
  const fragility = input.fragilityLevel || input.fragility_level || DEFAULT_PROFILE.fragilityLevel;
  const flags = [];

  if (/(standing fan|fan|mattress|furniture|wardrobe|table|chair|gas cylinder)/i.test(text)) {
    if (rank(packageSize, SIZE_ORDER) < rank("large", SIZE_ORDER) || rank(weight, WEIGHT_ORDER) < rank("heavy", WEIGHT_ORDER)) {
      flags.push("Large/heavy item appears marked too small or light.");
    }
  }

  if (/(glass|cup|mirror|perfume|bottle|ceramic|breakable)/i.test(text) && fragility === "not_fragile") {
    flags.push("Fragile item appears marked as non-fragile.");
  }

  if (/(iphone|phone|laptop|macbook|tablet|camera)/i.test(text) && !safeJsonArray(input.specialDeliveryFlags, input.specialDeliveryFlags || []).includes("high_value")) {
    flags.push("High-value electronics may require high-value handling.");
  }

  return flags.join(" ");
}

function normalizeProfileInput(input = {}, product = {}) {
  const suggestion = suggestPackageProfile({
    name: product.name || input.name,
    category: product.category || input.category,
    description: product.description || input.description,
  }).profile;
  const profile = { ...DEFAULT_PROFILE, ...suggestion };

  for (const [key, value] of Object.entries(input || {})) {
    if (value !== undefined && value !== null && value !== "") {
      profile[key] = value;
    }
  }

  profile.handlingInstructions = safeJsonArray(profile.handlingInstructions, String(profile.handlingInstructions || "").split(",").filter(Boolean));
  profile.specialDeliveryFlags = safeJsonArray(profile.specialDeliveryFlags, String(profile.specialDeliveryFlags || "").split(",").filter(Boolean));
  if (!profile.handlingInstructions.length) profile.handlingInstructions = ["normal_handling"];
  if (!profile.specialDeliveryFlags.length) profile.specialDeliveryFlags = ["none"];
  profile.estimatedPackageUnits = Math.max(1, Number(profile.estimatedPackageUnits || 1));
  profile.requiresSeparateDelivery =
    Boolean(profile.requiresSeparateDelivery) ||
    profile.batchingEligibility === "separate_delivery_required" ||
    profile.specialDeliveryFlags.includes("high_value") ||
    rank(profile.packageSize, SIZE_ORDER) >= rank("large", SIZE_ORDER);
  profile.packageProfileRiskFlag = evaluatePackageRiskFlag({
    ...product,
    ...profile,
  });
  profile.packageProfileAutoSuggested = input.packageProfileAutoSuggested !== undefined
    ? Boolean(input.packageProfileAutoSuggested)
    : !input.packageSize && !input.packageWeightClass && !input.fragilityLevel;
  profile.packageProfileSellerEdited = Boolean(input.packageProfileSellerEdited || input.packageSize || input.packageWeightClass || input.fragilityLevel);
  profile.riskLevel = profile.specialDeliveryFlags.includes("high_value") || rank(profile.packageWeightClass, WEIGHT_ORDER) >= rank("heavy", WEIGHT_ORDER)
    ? "high"
    : profile.fragilityLevel !== "not_fragile" || profile.specialDeliveryFlags.includes("perishable")
      ? "medium"
      : "low";

  return profile;
}

export function applyProductPackageProfile(productId, input = {}, { actorId = null, adminVerified = false } = {}) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) throw new HttpError(404, "Product was not found.");
  const profile = normalizeProfileInput(input, product);
  const now = nowIso();

  db.prepare(`
    UPDATE products
    SET package_size = ?, package_weight_class = ?, fragility_level = ?,
        handling_instructions = ?, package_shape = ?, stackability = ?,
        batching_eligibility = ?, required_vehicle_type = ?, special_delivery_flags = ?,
        estimated_package_units = ?, requires_separate_delivery = ?,
        package_profile_auto_suggested = ?, package_profile_seller_edited = ?,
        package_profile_admin_verified = ?,
        package_profile_risk_flag = ?,
        risk_level = CASE
          WHEN ? != '' AND risk_level IN ('low','medium') THEN 'medium'
          ELSE risk_level
        END,
        updated_at = ?
    WHERE id = ?
  `).run(
    profile.packageSize,
    profile.packageWeightClass,
    profile.fragilityLevel,
    JSON.stringify(profile.handlingInstructions),
    profile.packageShape,
    profile.stackability,
    profile.batchingEligibility,
    profile.requiredVehicleType,
    JSON.stringify(profile.specialDeliveryFlags),
    profile.estimatedPackageUnits,
    booleanInt(profile.requiresSeparateDelivery),
    booleanInt(profile.packageProfileAutoSuggested),
    booleanInt(profile.packageProfileSellerEdited),
    booleanInt(adminVerified || profile.packageProfileAdminVerified),
    profile.packageProfileRiskFlag,
    profile.packageProfileRiskFlag,
    now,
    productId,
  );

  const existing = db.prepare("SELECT id FROM product_package_profiles WHERE product_id = ?").get(productId);
  const id = existing?.id || createId("ppf");
  db.prepare(`
    INSERT INTO product_package_profiles (
      id, product_id, package_size, package_weight_class, fragility_level,
      handling_instructions, package_shape, stackability, batching_eligibility,
      required_vehicle_type, special_delivery_flags, estimated_package_units,
      requires_separate_delivery, auto_suggested, seller_edited, admin_verified,
      risk_flag, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      package_size = excluded.package_size,
      package_weight_class = excluded.package_weight_class,
      fragility_level = excluded.fragility_level,
      handling_instructions = excluded.handling_instructions,
      package_shape = excluded.package_shape,
      stackability = excluded.stackability,
      batching_eligibility = excluded.batching_eligibility,
      required_vehicle_type = excluded.required_vehicle_type,
      special_delivery_flags = excluded.special_delivery_flags,
      estimated_package_units = excluded.estimated_package_units,
      requires_separate_delivery = excluded.requires_separate_delivery,
      auto_suggested = excluded.auto_suggested,
      seller_edited = excluded.seller_edited,
      admin_verified = excluded.admin_verified,
      risk_flag = excluded.risk_flag,
      updated_at = excluded.updated_at
  `).run(
    id,
    productId,
    profile.packageSize,
    profile.packageWeightClass,
    profile.fragilityLevel,
    JSON.stringify(profile.handlingInstructions),
    profile.packageShape,
    profile.stackability,
    profile.batchingEligibility,
    profile.requiredVehicleType,
    JSON.stringify(profile.specialDeliveryFlags),
    profile.estimatedPackageUnits,
    booleanInt(profile.requiresSeparateDelivery),
    booleanInt(profile.packageProfileAutoSuggested),
    booleanInt(profile.packageProfileSellerEdited),
    booleanInt(adminVerified || profile.packageProfileAdminVerified),
    profile.packageProfileRiskFlag,
    existing ? now : now,
    now,
  );

  if (profile.packageProfileRiskFlag) {
    queueIntervention({
      type: "package_profile_mismatch",
      priority: "low",
      relatedSellerId: product.store_id,
      reason: `${product.name}: ${profile.packageProfileRiskFlag}`,
    });
  }

  if (actorId) {
    updateReliabilityScore(actorId, "seller");
  }

  return serializePackageProfile(db.prepare("SELECT * FROM products WHERE id = ?").get(productId));
}

export function listZones({ includeInactive = false } = {}) {
  const where = includeInactive ? "" : "WHERE is_active = 1";
  return db.prepare(`SELECT * FROM delivery_zones ${where} ORDER BY parent_area_id ASC, name ASC`).all().map(serializeZone);
}

export function saveZone(input = {}, zoneId = "") {
  const now = nowIso();
  const id = zoneId || createId("zon");
  const existing = zoneId ? db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(zoneId) : null;
  const payload = {
    name: clean(input.name ?? existing?.name, 120),
    parentAreaId: clean(input.parentAreaId ?? existing?.parent_area_id ?? "", 140) || null,
    zoneType: clean(input.zoneType ?? existing?.zone_type ?? "general_area", 40),
    marketId: clean(input.marketId ?? existing?.market_id ?? "", 140) || null,
    campusId: clean(input.campusId ?? existing?.campus_id ?? "", 140) || null,
    latitude: input.latitude === "" || input.latitude === undefined ? existing?.latitude ?? null : Number(input.latitude),
    longitude: input.longitude === "" || input.longitude === undefined ? existing?.longitude ?? null : Number(input.longitude),
    baseDeliveryFeeKobo: Math.round(Number(input.baseDeliveryFeeKobo ?? input.baseDeliveryFee ?? existing?.base_delivery_fee_kobo ?? 70000)),
    extraPickupFeeKobo: Math.round(Number(input.extraPickupFeeKobo ?? input.extraPickupFee ?? existing?.extra_pickup_fee_kobo ?? 15000)),
    supportedDeliveryTypes: Array.isArray(input.supportedDeliveryTypes)
      ? input.supportedDeliveryTypes
      : safeJsonArray(input.supportedDeliveryTypes, safeJsonArray(existing?.supported_delivery_types, ["instant", "scheduled"])),
    isActive: input.isActive === undefined ? existing?.is_active !== 0 : Boolean(input.isActive),
    availabilityStatus: clean(input.availabilityStatus ?? existing?.availability_status ?? "normal", 80),
    availabilityNote: clean(input.availabilityNote ?? existing?.availability_note ?? "", 500),
  };

  if (!payload.name) throw new HttpError(422, "Zone name is required.");

  if (existing) {
    db.prepare(`
      UPDATE delivery_zones
      SET name = ?, parent_area_id = ?, zone_type = ?, market_id = ?, campus_id = ?,
          latitude = ?, longitude = ?, base_delivery_fee_kobo = ?, extra_pickup_fee_kobo = ?,
          supported_delivery_types = ?, is_active = ?, availability_status = ?,
          availability_note = ?, updated_at = ?
      WHERE id = ?
    `).run(
      payload.name,
      payload.parentAreaId,
      payload.zoneType,
      payload.marketId,
      payload.campusId,
      payload.latitude,
      payload.longitude,
      payload.baseDeliveryFeeKobo,
      payload.extraPickupFeeKobo,
      JSON.stringify(payload.supportedDeliveryTypes),
      booleanInt(payload.isActive),
      payload.availabilityStatus,
      payload.availabilityNote,
      now,
      zoneId,
    );
  } else {
    db.prepare(`
      INSERT INTO delivery_zones (
        id, name, parent_area_id, zone_type, market_id, campus_id, latitude, longitude,
        base_delivery_fee_kobo, extra_pickup_fee_kobo, supported_delivery_types,
        is_active, availability_status, availability_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      payload.name,
      payload.parentAreaId,
      payload.zoneType,
      payload.marketId,
      payload.campusId,
      payload.latitude,
      payload.longitude,
      payload.baseDeliveryFeeKobo,
      payload.extraPickupFeeKobo,
      JSON.stringify(payload.supportedDeliveryTypes),
      booleanInt(payload.isActive),
      payload.availabilityStatus,
      payload.availabilityNote,
      now,
      now,
    );
  }

  return serializeZone(db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(id));
}

export function deleteZone(zoneId) {
  const row = db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(zoneId);
  if (!row) throw new HttpError(404, "Zone was not found.");
  db.prepare("UPDATE delivery_zones SET is_active = 0, availability_status = 'temporarily_unavailable', updated_at = ? WHERE id = ?").run(nowIso(), zoneId);
  return serializeZone(db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(zoneId));
}

export function listPackageRules() {
  return db.prepare("SELECT * FROM package_rules ORDER BY category_name ASC").all().map(serializePackageRule);
}

export function savePackageRule(input = {}, ruleId = "") {
  const now = nowIso();
  const id = ruleId || createId("pkr");
  const existing = ruleId ? db.prepare("SELECT * FROM package_rules WHERE id = ?").get(ruleId) : null;
  const categoryName = clean(input.categoryName ?? existing?.category_name ?? input.category ?? "", 120);
  const categoryKey = slugKey(input.categoryKey ?? existing?.category_key ?? categoryName);
  if (!categoryKey) throw new HttpError(422, "Package rule category is required.");
  const profile = normalizeProfileInput(input, { category: categoryName });

  if (existing) {
    db.prepare(`
      UPDATE package_rules
      SET category_key = ?, category_name = ?, package_size = ?, package_weight_class = ?,
          fragility_level = ?, handling_instructions = ?, package_shape = ?, stackability = ?,
          batching_eligibility = ?, required_vehicle_type = ?, special_delivery_flags = ?,
          estimated_package_units = ?, requires_separate_delivery = ?, risk_level = ?,
          admin_review_required = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      categoryKey,
      categoryName,
      profile.packageSize,
      profile.packageWeightClass,
      profile.fragilityLevel,
      JSON.stringify(profile.handlingInstructions),
      profile.packageShape,
      profile.stackability,
      profile.batchingEligibility,
      profile.requiredVehicleType,
      JSON.stringify(profile.specialDeliveryFlags),
      profile.estimatedPackageUnits,
      booleanInt(profile.requiresSeparateDelivery),
      profile.riskLevel,
      booleanInt(input.adminReviewRequired),
      input.isActive === undefined ? 1 : booleanInt(input.isActive),
      now,
      id,
    );
  } else {
    db.prepare(`
      INSERT INTO package_rules (
        id, category_key, category_name, package_size, package_weight_class,
        fragility_level, handling_instructions, package_shape, stackability,
        batching_eligibility, required_vehicle_type, special_delivery_flags,
        estimated_package_units, requires_separate_delivery, risk_level,
        admin_review_required, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      categoryKey,
      categoryName,
      profile.packageSize,
      profile.packageWeightClass,
      profile.fragilityLevel,
      JSON.stringify(profile.handlingInstructions),
      profile.packageShape,
      profile.stackability,
      profile.batchingEligibility,
      profile.requiredVehicleType,
      JSON.stringify(profile.specialDeliveryFlags),
      profile.estimatedPackageUnits,
      booleanInt(profile.requiresSeparateDelivery),
      profile.riskLevel,
      booleanInt(input.adminReviewRequired),
      input.isActive === undefined ? 1 : booleanInt(input.isActive),
      now,
      now,
    );
  }

  return serializePackageRule(db.prepare("SELECT * FROM package_rules WHERE id = ?").get(id));
}

function findZoneForText(text, preferredType = "") {
  const key = slugKey(text);
  if (!key) return null;
  const zones = listZones({ includeInactive: false });
  return zones.find((zone) => {
    if (preferredType && zone.zoneType !== preferredType) return false;
    return key.includes(slugKey(zone.name)) || slugKey(zone.name).includes(key);
  }) || zones.find((zone) => key.includes(slugKey(zone.name)) || slugKey(zone.name).includes(key)) || null;
}

function inferBatchType(store) {
  if (store.seller_type === "local_market") return "local_market";
  if (store.seller_type === "nearby") return "nearby";
  if (store.seller_type === "used_market") return "used_market";
  return "campus_market";
}

function packageSnapshotForOrderItems(items) {
  const profiles = items.map((item) => profileFromProduct(item));
  const flags = profiles.flatMap((profile) => profile.specialDeliveryFlags || []);
  const separate = profiles.some((profile) => profile.requiresSeparateDelivery);
  const fragility = profiles.some((profile) => profile.fragilityLevel === "very_fragile")
    ? "very_fragile"
    : profiles.some((profile) => profile.fragilityLevel === "fragile")
      ? "fragile"
      : "not_fragile";
  const riskLevel = maxByRank(profiles.map((profile) => profile.riskLevel || "low"), RISK_ORDER, "low");

  return {
    packageSizeSummary: maxByRank(profiles.map((profile) => profile.packageSize), SIZE_ORDER, "small"),
    weightClassSummary: maxByRank(profiles.map((profile) => profile.packageWeightClass), WEIGHT_ORDER, "light"),
    fragilitySummary: fragility,
    requiredVehicleType: maxByRank(profiles.map((profile) => profile.requiredVehicleType), VEHICLE_ORDER, "motorcycle_or_above"),
    requiresGps: env.requireGpsForHighRiskDelivery && (riskLevel === "high" || riskLevel === "critical" || flags.includes("high_value")),
    requiresPhotoProof: riskLevel === "high" || fragility !== "not_fragile" || flags.includes("high_value"),
    canBatch: !separate && !flags.includes("requires_admin_review"),
    requiresSeparateDelivery: separate,
    estimatedPackageUnits: profiles.reduce((sum, profile) => sum + Number(profile.estimatedPackageUnits || 1), 0),
    riskLevel,
    flags,
  };
}

function batchFeeKobo({ zone, pickupCount, summary }) {
  const base = Number(zone?.baseDeliveryFeeKobo || zone?.base_delivery_fee_kobo || 70000);
  const extraPickup = Number(zone?.extraPickupFeeKobo || zone?.extra_pickup_fee_kobo || 15000);
  const additionalPickupFee = Math.max(0, Number(pickupCount || 1) - 1) * extraPickup;
  const sizeFee = rank(summary.packageSizeSummary, SIZE_ORDER) * 10000;
  const weightFee = rank(summary.weightClassSummary, WEIGHT_ORDER) * 10000;
  const fragileFee = summary.fragilitySummary === "very_fragile" ? 20000 : summary.fragilitySummary === "fragile" ? 10000 : 0;
  const vehicleFee = rank(summary.requiredVehicleType, VEHICLE_ORDER) >= rank("tricycle_or_above", VEHICLE_ORDER) ? 30000 : 0;
  return base + additionalPickupFee + sizeFee + weightFee + fragileFee + vehicleFee;
}

function loadOrderForBatch(orderId) {
  const order = db.prepare(`
    SELECT orders.*, stores.name AS store_name, stores.seller_type, stores.market_id,
           stores.campus AS store_campus, stores.location_area, stores.pickup_location AS store_pickup_location,
           stores.nearest_landmark, stores.pickup_zone_id, stores.pickup_lat, stores.pickup_lng,
           users.name AS seller_name, users.phone AS seller_user_phone
    FROM orders
    JOIN stores ON stores.id = orders.store_id
    JOIN users ON users.id = orders.seller_id
    WHERE orders.id = ?
  `).get(orderId);

  if (!order) return null;
  const items = db.prepare(`
    SELECT order_items.*, products.category, products.description, products.package_size,
           products.package_weight_class, products.fragility_level, products.handling_instructions,
           products.package_shape, products.stackability, products.batching_eligibility,
           products.required_vehicle_type, products.special_delivery_flags,
           products.estimated_package_units, products.requires_separate_delivery,
           products.package_profile_auto_suggested, products.package_profile_seller_edited,
           products.package_profile_admin_verified, products.package_profile_risk_flag,
           products.risk_level, products.delivery_readiness_type,
           products.delivery_readiness_value, products.delivery_ready_after_minutes,
           products.delivery_ready_at
    FROM order_items
    JOIN products ON products.id = order_items.product_id
    WHERE order_items.order_id = ?
  `).all(orderId);

  return { ...order, items };
}

export function createParentOrderForOrders({ buyerId, orderIds = [] }) {
  if (!env.enableAutomatedOrderGrouping || !orderIds.length) return null;

  const orders = orderIds.map(loadOrderForBatch).filter(Boolean);
  if (!orders.length) return null;
  const existingParentId = orders.find((order) => order.parent_order_id)?.parent_order_id;
  if (existingParentId) return getParentOrder(existingParentId);

  const now = nowIso();
  const parentId = createId("por");
  const deliveryText = orders[0].delivery_address || orders[0].pickup_location || orders[0].campus || "";
  const deliveryZone = findZoneForText(deliveryText) || findZoneForText(orders[0].campus, "campus");
  const parentTotal = orders.reduce((sum, order) => sum + Number(order.total_kobo || 0), 0);
  const oldDeliveryTotal = orders.reduce((sum, order) => sum + Number(order.delivery_fee_kobo || 0), 0);

  db.prepare(`
    INSERT INTO parent_orders (
      id, buyer_id, payment_status, total_amount_kobo, total_delivery_fee_kobo,
      order_status, delivery_area, delivery_zone_id, delivery_landmark, created_at, updated_at
    ) VALUES (?, ?, 'unpaid', ?, ?, 'seller_confirmation_pending', ?, ?, ?, ?, ?)
  `).run(
    parentId,
    buyerId,
    parentTotal,
    oldDeliveryTotal,
    clean(orders[0].campus || orders[0].delivery_area || ""),
    deliveryZone?.id || null,
    clean(orders[0].delivery_address || orders[0].pickup_location || ""),
    now,
    now,
  );

  const batchGroups = new Map();

  for (const order of orders) {
    const summary = packageSnapshotForOrderItems(order.items);
    const batchType = inferBatchType(order);
    const sourceZone = order.pickup_zone_id
      ? serializeZone(db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(order.pickup_zone_id))
      : findZoneForText(order.store_pickup_location || order.nearest_landmark || order.store_campus || order.location_area, batchType === "local_market" ? "local_market" : "");
    const sourceArea = order.market_id || order.store_campus || order.location_area || order.campus || "";
    const split = summary.requiresSeparateDelivery || !summary.canBatch;
    const key = split
      ? `single:${order.id}`
      : [batchType, sourceArea || "general", sourceZone?.id || "zone", deliveryZone?.id || "delivery"].join(":");
    const group = batchGroups.get(key) || {
      batchType,
      sourceAreaId: sourceArea,
      sourceZoneId: sourceZone?.id || null,
      marketId: order.market_id || null,
      campusId: order.store_campus || order.campus || null,
      orders: [],
    };
    group.orders.push({ order, summary });
    batchGroups.set(key, group);
  }

  let newDeliveryTotal = 0;
  for (const group of batchGroups.values()) {
    const batchId = createId("bat");
    const allItems = group.orders.flatMap((item) => item.order.items);
    const summary = packageSnapshotForOrderItems(allItems);
    const pickupCount = group.orders.length;
    const sourceZone = group.sourceZoneId ? serializeZone(db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(group.sourceZoneId)) : null;
    const deliveryFeeKobo = env.enableAutomatedDeliveryFees
      ? batchFeeKobo({ zone: sourceZone || deliveryZone, pickupCount, summary })
      : group.orders.reduce((sum, item) => sum + Number(item.order.delivery_fee_kobo || 0), 0);
    newDeliveryTotal += deliveryFeeKobo;

    db.prepare(`
      INSERT INTO delivery_batches (
        id, parent_order_id, batch_type, source_area_id, source_zone_id, delivery_zone_id,
        market_id, campus_id, pickup_count, total_item_count, package_size_summary,
        weight_class_summary, fragility_summary, required_vehicle_type, requires_gps,
        requires_photo_proof, can_batch, delivery_fee_kobo, risk_level, status,
        dispatch_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'batch_created', 'pending', ?, ?)
    `).run(
      batchId,
      parentId,
      group.batchType,
      group.sourceAreaId || "",
      group.sourceZoneId,
      deliveryZone?.id || null,
      group.marketId,
      group.campusId,
      pickupCount,
      allItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      summary.packageSizeSummary,
      summary.weightClassSummary,
      summary.fragilitySummary,
      summary.requiredVehicleType,
      booleanInt(summary.requiresGps),
      booleanInt(summary.requiresPhotoProof),
      booleanInt(summary.canBatch),
      deliveryFeeKobo,
      summary.riskLevel,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO batch_package_summaries (id, delivery_batch_id, summary_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(createId("bps"), batchId, JSON.stringify(summary), now, now);

    group.orders.forEach(({ order }, index) => {
      const codes = ensureOrderStage2Codes(order.id);
      const pickupOtp = codes?.sellerPickupCode || generateOtp();
      const taskId = createId("put");
      const deadline = new Date(Date.parse(now) + env.sellerConfirmationWindowMinutes * 60 * 1000).toISOString();
      const readiness = readinessSummaryForOrderItems(order.items, order.created_at || now);
      const taskSnapshot = {
        ...packageSnapshotForOrderItems(order.items),
        deliveryReadiness: readiness,
      };
      db.prepare(`
        INSERT INTO pickup_tasks (
          id, delivery_batch_id, order_id, used_order_id, seller_id, pickup_zone_id,
          pickup_landmark, pickup_otp_hash, pickup_sequence, item_count,
          package_profile_snapshot, status, confirmation_deadline_at, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'seller_confirmation_pending', ?, ?, ?)
      `).run(
        taskId,
        batchId,
        order.id,
        order.seller_id,
        group.sourceZoneId,
        clean(order.nearest_landmark || order.store_pickup_location || order.pickup_location || ""),
        hashOtp(pickupOtp),
        index + 1,
        order.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
        JSON.stringify(taskSnapshot),
        deadline,
        now,
        now,
      );

      db.prepare(`
        UPDATE orders
        SET parent_order_id = ?, delivery_batch_id = ?, pickup_task_id = ?,
            delivery_zone_id = ?, delivery_area = ?, delivery_landmark = ?,
            seller_confirmation_deadline_at = ?, package_ready_at = COALESCE(package_ready_at, ?),
            seller_ready_at = COALESCE(seller_ready_at, ?),
            seller_ready_status = CASE WHEN ? IS NULL THEN 'immediate' ELSE 'scheduled' END,
            auto_dispatch_status = 'seller_confirmation_pending',
            delivery_status = 'seller_confirmation_pending',
            dispatch_status = 'pending_dispatch',
            seller_confirmation_status = 'pending',
            delivery_fee_kobo = ?, total_kobo = subtotal_kobo + ?, updated_at = ?
        WHERE id = ?
      `).run(
        parentId,
        batchId,
        taskId,
        deliveryZone?.id || null,
        clean(order.campus || ""),
        clean(order.delivery_address || order.pickup_location || ""),
        deadline,
        readiness.readyAt,
        readiness.readyAt,
        readiness.readyAt,
        Math.round(deliveryFeeKobo / pickupCount),
        Math.round(deliveryFeeKobo / pickupCount),
        now,
        order.id,
      );

      createNotification({
        userId: order.seller_id,
        type: "order",
        title: "Confirm item availability",
        body: "You have a new order item to confirm and prepare. Open Gleenc to view details.",
        actionLabel: "View order",
        actionPath: `/orders/${order.id}`,
      });
      notificationEvent({
        userId: order.seller_id,
        role: "seller",
        eventKey: "confirm_availability_required",
        title: "Confirm item availability",
        relatedOrderId: order.id,
        relatedBatchId: batchId,
      });
    });

    const deliveryOtp = ensureOrderStage2Codes(orders[0].id)?.buyerDeliveryCode || generateOtp();
    db.prepare(`
      INSERT INTO delivery_tasks (
        id, delivery_batch_id, buyer_id, delivery_zone_id, delivery_landmark,
        delivery_otp_hash, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending_pickups', ?, ?)
    `).run(
      createId("dlt"),
      batchId,
      buyerId,
      deliveryZone?.id || null,
      clean(orders[0].delivery_address || orders[0].pickup_location || ""),
      hashOtp(deliveryOtp),
      now,
      now,
    );
  }

  db.prepare(`
    UPDATE parent_orders
    SET total_delivery_fee_kobo = ?, total_amount_kobo = ?, updated_at = ?
    WHERE id = ?
  `).run(
    newDeliveryTotal,
    orders.reduce((sum, order) => sum + Number(order.subtotal_kobo || 0), 0) + newDeliveryTotal,
    now,
    parentId,
  );

  createNotification({
    userId: buyerId,
    type: "order",
    title: batchGroups.size > 1 ? "Your order was split safely" : "Your order was grouped for delivery",
    body: "Gleenc has grouped your items into delivery batch(es). Open your order to track seller confirmation and rider dispatch.",
    actionLabel: "View orders",
    actionPath: "/orders",
  });
  notificationEvent({
    userId: buyerId,
    role: "buyer",
    eventKey: batchGroups.size > 1 ? "order_split_into_batches" : "order_grouped_into_batch",
    title: "Delivery batch created",
  });

  return getParentOrder(parentId);
}

export function getParentOrder(parentOrderId) {
  const parent = db.prepare("SELECT * FROM parent_orders WHERE id = ?").get(parentOrderId);
  if (!parent) return null;
  const batches = db.prepare("SELECT * FROM delivery_batches WHERE parent_order_id = ? ORDER BY created_at ASC").all(parent.id)
    .map((batch) => getDeliveryBatchById(batch.id));
  return {
    id: parent.id,
    buyerId: parent.buyer_id,
    paymentStatus: parent.payment_status,
    totalAmountKobo: Number(parent.total_amount_kobo || 0),
    totalAmount: koboToNaira(parent.total_amount_kobo),
    totalDeliveryFeeKobo: Number(parent.total_delivery_fee_kobo || 0),
    totalDeliveryFee: koboToNaira(parent.total_delivery_fee_kobo),
    orderStatus: parent.order_status,
    deliveryArea: parent.delivery_area || "",
    deliveryZoneId: parent.delivery_zone_id || null,
    deliveryLandmark: parent.delivery_landmark || "",
    cancellationReason: parent.cancellation_reason || "",
    batches,
    createdAt: parent.created_at,
    updatedAt: parent.updated_at,
  };
}

export function createBatchesForOrder(auth, orderId) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!row) throw new HttpError(404, "Order was not found.");
  if (auth.role !== "admin" && row.buyer_id !== auth.user_id && row.seller_id !== auth.user_id) {
    throw new HttpError(403, "You cannot create batches for this order.");
  }
  return transaction(() => createParentOrderForOrders({ buyerId: row.buyer_id, orderIds: [row.id] }));
}

export function getBatchesForOrder(auth, orderId) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!row) throw new HttpError(404, "Order was not found.");
  if (auth.role !== "admin" && row.buyer_id !== auth.user_id && row.seller_id !== auth.user_id) {
    throw new HttpError(403, "You cannot view this order batch.");
  }
  advanceDueReadinessAndDispatch();
  advanceExpiredDispatchAttempts();
  if (!row.parent_order_id) return { parentOrder: null, batches: [] };
  const parentOrder = getParentOrder(row.parent_order_id);
  return { parentOrder, batches: parentOrder?.batches || [] };
}

export function getDeliveryBatchById(batchId) {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) return null;
  const pickupTasks = db.prepare(`
    SELECT pickup_tasks.*, users.name AS seller_name, orders.order_code, orders.package_tag_code,
           delivery_batches.status AS batch_status,
           delivery_batches.dispatch_status,
           delivery_batches.assigned_rider_id,
           delivery_batches.dispatch_attempt_count
    FROM pickup_tasks
    LEFT JOIN users ON users.id = pickup_tasks.seller_id
    LEFT JOIN orders ON orders.id = pickup_tasks.order_id
    LEFT JOIN delivery_batches ON delivery_batches.id = pickup_tasks.delivery_batch_id
    WHERE pickup_tasks.delivery_batch_id = ?
    ORDER BY pickup_sequence ASC, created_at ASC
  `).all(batchId).map(serializePickupTask);
  const deliveryTask = db.prepare("SELECT * FROM delivery_tasks WHERE delivery_batch_id = ?").get(batchId);
  const attempts = db.prepare("SELECT * FROM dispatch_attempts WHERE delivery_batch_id = ? ORDER BY attempt_number ASC").all(batchId).map(serializeAttempt);
  return serializeBatch(batch, {
    pickupTasks,
    deliveryTask: deliveryTask ? {
      id: deliveryTask.id,
      deliveryBatchId: deliveryTask.delivery_batch_id,
      buyerId: deliveryTask.buyer_id,
      deliveryZoneId: deliveryTask.delivery_zone_id || null,
      deliveryLandmark: deliveryTask.delivery_landmark || "",
      status: deliveryTask.status,
      deliveredAt: deliveryTask.delivered_at || null,
      createdAt: deliveryTask.created_at,
      updatedAt: deliveryTask.updated_at,
    } : null,
    attempts,
  });
}

export function requireBatchForAuth(auth, batchId) {
  const batch = getDeliveryBatchById(batchId);
  if (!batch) throw new HttpError(404, "Delivery batch was not found.");
  if (auth.role === "admin") return batch;
  if (auth.role === "rider" && batch.assignedRiderId === auth.user_id) return batch;
  if (auth.role === "buyer") {
    const parent = db.prepare("SELECT * FROM parent_orders WHERE id = ?").get(batch.parentOrderId);
    if (parent?.buyer_id === auth.user_id) return batch;
  }
  if (auth.role === "seller") {
    const task = db.prepare("SELECT id FROM pickup_tasks WHERE delivery_batch_id = ? AND seller_id = ?").get(batchId, auth.user_id);
    if (task) return batch;
  }
  throw new HttpError(403, "You cannot view this delivery batch.");
}

export function getDeliveryBatch(auth, batchId) {
  return requireBatchForAuth(auth, batchId);
}

function pickupTaskByOrderItem(orderItemId) {
  return db.prepare(`
    SELECT pickup_tasks.*, orders.buyer_id, orders.order_code
    FROM order_items
    JOIN orders ON orders.id = order_items.order_id
    JOIN pickup_tasks ON pickup_tasks.order_id = orders.id
    WHERE order_items.id = ?
  `).get(orderItemId);
}

export function listSellerReadinessTasks(auth) {
  if (!["seller", "admin"].includes(auth.role)) throw new HttpError(403, "Seller access is required.");
  advanceDueReadinessAndDispatch();
  advanceExpiredDispatchAttempts();
  const params = [];
  let where = "";
  if (auth.role !== "admin") {
    where = "WHERE pickup_tasks.seller_id = ?";
    params.push(auth.user_id);
  }
  return db.prepare(`
    SELECT pickup_tasks.*, users.name AS seller_name, orders.order_code
    FROM pickup_tasks
    LEFT JOIN users ON users.id = pickup_tasks.seller_id
    LEFT JOIN orders ON orders.id = pickup_tasks.order_id
    ${where}
    ORDER BY pickup_tasks.created_at DESC
    LIMIT 150
  `).all(...params).map((row) => {
    const task = serializePickupTask(row);
    if (task?.orderId) {
      task.sellerPickupCode = sellerPickupCodeForOrder({ id: task.orderId });
      task.packageInstruction = "Write or tape the package tag on the product before handing it to the rider. Share the seller pickup code only with the assigned rider at pickup.";
    }
    return task;
  });
}

export function sellerConfirmAvailability(auth, orderItemId, note = "") {
  const task = pickupTaskByOrderItem(orderItemId);
  if (!task) throw new HttpError(404, "Pickup task was not found for this order item.");
  if (auth.role !== "admin" && task.seller_id !== auth.user_id) {
    throw new HttpError(403, "Only this seller or admin can confirm availability.");
  }
  const now = nowIso();
  db.prepare(`
    UPDATE pickup_tasks
    SET seller_confirmed_availability = 1, seller_confirmed_at = ?,
        status = CASE WHEN seller_marked_ready = 1 THEN 'package_ready' ELSE 'package_ready_pending' END,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, task.id);
  db.prepare(`
    UPDATE orders
    SET status = CASE WHEN payment_status = 'paid' THEN 'paid' ELSE status END,
        stage4_status = 'seller_confirmed_package_pending',
        fulfillment_status = 'seller_confirmed',
        seller_confirmation_required = 0,
        seller_confirmed_at = ?,
        auto_dispatch_status = 'package_ready_pending',
        updated_at = ?
    WHERE id = ?
  `).run(now, now, task.order_id);
  db.prepare(`
    INSERT INTO seller_readiness_events (id, pickup_task_id, seller_id, event_type, note, created_at)
    VALUES (?, ?, ?, 'seller_confirmed_availability', ?, ?)
  `).run(createId("sre"), task.id, task.seller_id, clean(note, 500), now);
  syncBatchWorkflowState(task.delivery_batch_id, {
    sellerPreparationStatus: "not_ready",
    riderAssignmentStatus: "not_started",
  });
  createNotification({
    userId: task.buyer_id,
    type: "order",
    title: "Seller confirmed your item",
    body: "One seller confirmed your item and is preparing the package.",
    actionLabel: "View orders",
    actionPath: "/orders",
  });
  updateReliabilityScore(task.seller_id, "seller");
  return serializePickupTask(db.prepare("SELECT * FROM pickup_tasks WHERE id = ?").get(task.id));
}

export function sellerRejectAvailability(auth, orderItemId, note = "") {
  const task = pickupTaskByOrderItem(orderItemId);
  if (!task) throw new HttpError(404, "Pickup task was not found for this order item.");
  if (auth.role !== "admin" && task.seller_id !== auth.user_id) {
    throw new HttpError(403, "Only this seller or admin can reject availability.");
  }
  const now = nowIso();
  const reason = clean(note || "Seller marked item unavailable.", 700);
  db.prepare(`
    UPDATE pickup_tasks
    SET seller_rejected_at = ?, seller_rejection_note = ?, status = 'seller_rejected', updated_at = ?
    WHERE id = ?
  `).run(now, reason, now, task.id);
  db.prepare(`
    UPDATE orders
    SET status = 'cancelled', stage4_status = 'seller_rejected',
        fulfillment_status = 'cancelled', seller_rejected_at = ?,
        seller_rejection_note = ?, updated_at = ?
    WHERE id = ?
  `).run(now, reason, now, task.order_id);
  db.prepare(`
    INSERT INTO cancellation_events (
      id, parent_order_id, order_id, actor_id, actor_role, reason, status_before, status_after, created_at
    ) VALUES (?, (SELECT parent_order_id FROM orders WHERE id = ?), ?, ?, ?, ?, ?, 'cancelled', ?)
  `).run(createId("can"), task.order_id, task.order_id, auth.user_id, auth.role, reason, task.status || "", now);
  createSubstitutionOptionsForOrder(task.order_id);
  createNotification({
    userId: task.buyer_id,
    type: "order",
    title: "One item is unavailable",
    body: "A seller marked one item unavailable. Open Gleenc to choose another option or continue with available items.",
    actionLabel: "View order",
    actionPath: `/orders/${task.order_id}`,
  });
  queueIntervention({
    type: "seller_unavailable_item",
    priority: "medium",
    relatedOrderId: task.order_id,
    relatedBatchId: task.delivery_batch_id,
    relatedSellerId: task.seller_id,
    reason,
  });
  updateReliabilityScore(task.seller_id, "seller");
  recalculateBatch(task.delivery_batch_id);
  return serializePickupTask(db.prepare("SELECT * FROM pickup_tasks WHERE id = ?").get(task.id));
}

export function markPickupTaskReady(auth, pickupTaskId, input = {}) {
  const task = db.prepare(`
    SELECT pickup_tasks.*, orders.payment_status, orders.payment_method, orders.status AS order_status
    FROM pickup_tasks
    LEFT JOIN orders ON orders.id = pickup_tasks.order_id
    WHERE pickup_tasks.id = ?
  `).get(pickupTaskId);
  if (!task) throw new HttpError(404, "Pickup task was not found.");
  if (auth.role !== "admin" && task.seller_id !== auth.user_id) {
    throw new HttpError(403, "Only this seller or admin can mark the package ready.");
  }
  if (!batchSafePaymentReady({
    payment_status: task.payment_status,
    payment_method: task.payment_method,
    status: task.order_status,
  })) {
    throw new HttpError(422, "This order is not payment-ready for dispatch yet.");
  }
  if (!task.seller_confirmed_availability) {
    throw new HttpError(422, "Confirm availability before marking package ready.");
  }
  const profile = safeJsonObject(task.package_profile_snapshot);
  const packageSize = clean(input.packageSize || profile.packageSize || task.package_size || "", 80);
  const packageWeightClass = clean(input.packageWeightClass || profile.packageWeightClass || task.package_weight_class || "", 80);
  const handlingClass = clean(input.handlingClass || input.fragilityLevel || profile.fragilityLevel || task.handling_class || "normal_handling", 120);
  const pickupPointConfirmed =
    input.pickupPointConfirmed === true ||
    input.pickupPointConfirmed === 1 ||
    input.pickupPointConfirmed === "true" ||
    Boolean(task.pickup_landmark || task.pickup_zone_id);

  if (!packageSize || !packageWeightClass || !handlingClass) {
    throw new HttpError(422, "Confirm package size, weight class, and handling before dispatch.");
  }
  if (!pickupPointConfirmed) {
    throw new HttpError(422, "Confirm the pickup point before marking the package ready.");
  }

  const now = nowIso();
  db.prepare(`
    UPDATE pickup_tasks
    SET seller_marked_ready = 1,
        ready_at = ?,
        status = 'package_ready',
        package_size = ?,
        package_weight_class = ?,
        handling_class = ?,
        pickup_point_confirmed = 1,
        package_ready_note = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    now,
    packageSize,
    packageWeightClass,
    handlingClass,
    clean(input.note || input.packageReadyNote || "", 500),
    now,
    pickupTaskId,
  );
  db.prepare(`
    UPDATE orders
    SET status = CASE WHEN payment_status = 'paid' THEN 'ready_for_delivery' ELSE status END,
        stage4_status = 'package_ready',
        fulfillment_status = 'package_ready',
        package_ready_at = ?,
        auto_dispatch_status = 'ready_for_dispatch',
        updated_at = ?
    WHERE id = ?
  `).run(now, now, task.order_id);
  db.prepare(`
    INSERT INTO seller_readiness_events (id, pickup_task_id, seller_id, event_type, note, created_at)
    VALUES (?, ?, ?, 'seller_marked_ready', '', ?)
  `).run(createId("sre"), task.id, task.seller_id, now);
  maybeMarkBatchReady(task.delivery_batch_id);
  syncBatchWorkflowState(task.delivery_batch_id);
  updateReliabilityScore(task.seller_id, "seller");
  return serializePickupTask(db.prepare("SELECT * FROM pickup_tasks WHERE id = ?").get(pickupTaskId));
}

function maybeMarkBatchReady(batchId) {
  const tasks = db.prepare("SELECT * FROM pickup_tasks WHERE delivery_batch_id = ?").all(batchId);
  const activeTasks = tasks.filter((task) => task.status !== "seller_rejected");
  if (!activeTasks.length) {
    db.prepare("UPDATE delivery_batches SET status = 'cancelled', dispatch_status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), batchId);
    return;
  }
  const allReady = activeTasks.every((task) => task.seller_marked_ready);
  if (!allReady) return;
  const now = nowIso();
  db.prepare(`
    UPDATE delivery_batches
    SET status = 'ready_for_dispatch',
        dispatch_status = 'ready_for_dispatch',
        seller_preparation_status = 'ready',
        rider_assignment_status = 'ready',
        blocking_step = 'ready_to_find_rider',
        auto_dispatch_started_at = COALESCE(auto_dispatch_started_at, ?),
        updated_at = ?
    WHERE id = ?
  `).run(now, now, batchId);
  db.prepare("UPDATE delivery_tasks SET status = 'ready_for_dispatch', updated_at = ? WHERE delivery_batch_id = ?").run(now, batchId);
  db.prepare(`
    UPDATE orders
    SET auto_dispatch_status = 'ready_for_dispatch',
        dispatch_status = 'pending_dispatch',
        delivery_status = 'ready_for_pickup',
        updated_at = ?
    WHERE delivery_batch_id = ?
  `).run(now, batchId);
  recordDispatchEvent({
    batchId,
    eventType: "package_ready_for_dispatch",
    note: "All active sellers marked their package ready for dispatch.",
    statusAfter: "ready_for_dispatch",
  });
}

export function syncOrderReadinessForDispatch(orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order?.pickup_task_id || !order.delivery_batch_id) return null;

  ensureOrderStage2Codes(order.id);

  const readyForDispatch =
    (order.payment_status === "paid" || order.payment_method === "pay_on_delivery") &&
    (order.fulfillment_status === "seller_confirmed" || order.seller_confirmed_at);
  const now = nowIso();
  const readyAt = order.package_ready_at || order.seller_ready_at || null;
  const dueNow = readinessDue(readyAt);

  if (readyForDispatch && dueNow) {
    db.prepare(`
      UPDATE pickup_tasks
      SET seller_confirmed_availability = 1,
          seller_marked_ready = 1,
          seller_confirmed_at = COALESCE(seller_confirmed_at, ?),
          ready_at = COALESCE(ready_at, ?),
          status = 'package_ready',
          updated_at = ?
      WHERE id = ?
    `).run(now, now, now, order.pickup_task_id);
    db.prepare(`
      UPDATE orders
      SET status = CASE
            WHEN payment_status = 'paid' THEN 'ready_for_delivery'
            ELSE status
          END,
          stage4_status = 'package_ready',
          fulfillment_status = 'package_ready',
          package_ready_at = COALESCE(package_ready_at, ?),
          auto_dispatch_status = 'ready_for_dispatch',
          delivery_status = 'ready_for_pickup',
          dispatch_status = 'pending_dispatch',
          seller_confirmation_status = 'confirmed',
          seller_ready_status = 'ready',
          updated_at = ?
      WHERE id = ?
    `).run(now, now, order.id);
    maybeMarkBatchReady(order.delivery_batch_id);
  } else if (readyForDispatch && !dueNow) {
    db.prepare(`
      UPDATE pickup_tasks
      SET seller_confirmed_availability = 1,
          seller_confirmed_at = COALESCE(seller_confirmed_at, ?),
          ready_at = COALESCE(ready_at, ?),
          status = 'package_ready_pending',
          updated_at = ?
      WHERE id = ?
    `).run(now, readyAt, now, order.pickup_task_id);
    db.prepare(`
      UPDATE orders
      SET auto_dispatch_status = 'scheduled_for_readiness',
          delivery_status = 'seller_preparing',
          dispatch_status = 'scheduled_for_readiness',
          seller_confirmation_status = 'confirmed',
          seller_ready_status = 'scheduled',
          updated_at = ?
      WHERE id = ?
    `).run(now, order.id);
  } else if (order.fulfillment_status === "seller_confirmed" || order.seller_confirmed_at) {
    db.prepare(`
      UPDATE pickup_tasks
      SET seller_confirmed_availability = 1,
          seller_confirmed_at = COALESCE(seller_confirmed_at, ?),
          status = CASE WHEN seller_marked_ready = 1 THEN 'package_ready' ELSE 'package_ready_pending' END,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, order.pickup_task_id);
    db.prepare(`
      UPDATE orders
      SET auto_dispatch_status = 'package_ready_pending',
          delivery_status = 'seller_preparing',
          seller_confirmation_status = 'confirmed',
          updated_at = ?
      WHERE id = ?
    `).run(now, order.id);
  }

  return getBatchesForOrder({ role: "admin", user_id: "system" }, order.id);
}

function recalculateBatch(batchId) {
  const tasks = db.prepare("SELECT * FROM pickup_tasks WHERE delivery_batch_id = ? AND status != 'seller_rejected'").all(batchId);
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) return null;
  if (!tasks.length) {
    db.prepare("UPDATE delivery_batches SET status = 'cancelled', dispatch_status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), batchId);
    return getDeliveryBatchById(batchId);
  }
  db.prepare("UPDATE delivery_batches SET pickup_count = ?, updated_at = ? WHERE id = ?").run(tasks.length, nowIso(), batchId);
  return getDeliveryBatchById(batchId);
}

function unlockManualAssignmentForBatch(batchId, reason) {
  const now = nowIso();
  const before = db.prepare("SELECT dispatch_status FROM delivery_batches WHERE id = ?").get(batchId)?.dispatch_status || "";
  db.prepare(`
    UPDATE delivery_batches
    SET dispatch_status = 'assignment_failed',
        rider_assignment_status = 'seller_manual_assignment_required',
        blocking_step = 'seller_manual_assignment',
        manual_assignment_unlocked = 1,
        manual_assignment_unlocked_at = COALESCE(manual_assignment_unlocked_at, ?),
        updated_at = ?
    WHERE id = ?
  `).run(now, now, batchId);
  db.prepare(`
    UPDATE orders
    SET auto_dispatch_status = 'manual_assignment_required',
        dispatch_status = 'manual_assignment_required',
        delivery_status = CASE
          WHEN delivery_status IN ('picked_up','out_for_delivery','delivered','completed') THEN delivery_status
          ELSE 'manual_assignment_required'
        END,
        updated_at = ?
    WHERE delivery_batch_id = ?
  `).run(now, batchId);
  recordDispatchEvent({
    batchId,
    eventType: "seller_manual_assignment_unlocked",
    note: reason,
    statusBefore: before,
    statusAfter: "assignment_failed",
  });
  notifyBatchSellersManualAssignment(batchId, reason);
}

export function advanceExpiredDispatchAttempts() {
  const now = nowIso();
  const expired = db.prepare(`
    SELECT *
    FROM dispatch_attempts
    WHERE status = 'offered'
      AND expires_at IS NOT NULL
      AND expires_at <= ?
    ORDER BY expires_at ASC
    LIMIT 25
  `).all(now);

  for (const attempt of expired) {
    db.prepare("UPDATE dispatch_attempts SET status = 'timed_out', timed_out_at = ?, updated_at = ? WHERE id = ?").run(now, now, attempt.id);
    db.prepare(`
      UPDATE delivery_batches
      SET dispatch_status = 'offer_expired',
          rider_assignment_status = 'offer_expired',
          blocking_step = 'ready_to_find_rider',
          updated_at = ?
      WHERE id = ? AND current_dispatch_attempt_id = ?
    `).run(now, attempt.delivery_batch_id, attempt.id);
    recordDispatchEvent({
      batchId: attempt.delivery_batch_id,
      attemptId: attempt.id,
      riderId: attempt.rider_id,
      eventType: "rider_timed_out",
      note: "Dispatch offer expired automatically.",
      statusAfter: "offer_expired",
    });
    updateReliabilityScore(attempt.rider_id, "rider");
    offerNextRiderForBatch(attempt.delivery_batch_id, { internal: true });
  }

  return expired.length;
}

export function advanceDueReadinessAndDispatch() {
  const now = nowIso();
  const due = db.prepare(`
    SELECT *
    FROM pickup_tasks
    WHERE seller_confirmed_availability = 1
      AND seller_marked_ready = 0
      AND ready_at IS NOT NULL
      AND ready_at <= ?
      AND status IN ('package_ready_pending','seller_confirmation_pending')
    LIMIT 50
  `).all(now);

  for (const task of due) {
    db.prepare(`
      UPDATE pickup_tasks
      SET seller_marked_ready = 1,
          status = 'package_ready',
          updated_at = ?
      WHERE id = ?
    `).run(now, task.id);
    db.prepare(`
      UPDATE orders
      SET status = CASE WHEN payment_status = 'paid' THEN 'ready_for_delivery' ELSE status END,
          stage4_status = 'package_ready',
          fulfillment_status = 'package_ready',
          seller_ready_status = 'ready',
          auto_dispatch_status = 'ready_for_dispatch',
          delivery_status = 'ready_for_pickup',
          updated_at = ?
      WHERE id = ?
    `).run(now, task.order_id);
    maybeMarkBatchReady(task.delivery_batch_id);
  }

  return due.length;
}

function createSubstitutionOptionsForOrder(orderId) {
  if (!env.enableAutomatedSubstitutions) return [];
  const item = db.prepare(`
    SELECT order_items.*, products.category, orders.parent_order_id
    FROM order_items
    JOIN products ON products.id = order_items.product_id
    JOIN orders ON orders.id = order_items.order_id
    WHERE order_items.order_id = ?
    LIMIT 1
  `).get(orderId);
  if (!item) return [];
  const suggestions = db.prepare(`
    SELECT products.*
    FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE products.id != ?
      AND products.category = ?
      AND products.status = 'active'
      AND stores.status = 'active'
    ORDER BY products.updated_at DESC
    LIMIT 5
  `).all(item.product_id, item.category);
  const now = nowIso();
  for (const product of suggestions) {
    db.prepare(`
      INSERT INTO substitution_options (
        id, parent_order_id, unavailable_order_item_id, suggested_product_id, status, reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'suggested', 'Similar available item from Gleenc inventory.', ?, ?)
    `).run(createId("sub"), item.parent_order_id || null, item.id, product.id, now, now);
  }
  return suggestions;
}

function riderCapacityValue(value, type) {
  if (type === "size") {
    const map = {
      small_only: "small",
      small_medium: "medium",
      small_medium_large: "large",
      large_and_bulky: "large",
      extra_large_supported: "extra_large",
    };
    return map[value] || "medium";
  }
  const map = {
    very_light_only: "very_light",
    up_to_light: "light",
    up_to_medium: "medium",
    up_to_heavy: "heavy",
    very_heavy_supported: "very_heavy",
  };
  return map[value] || "medium";
}

function riderVehicleCapability(transportType = "motorcycle") {
  const normalized = String(transportType || "motorcycle").toLowerCase();
  if (normalized.includes("walk")) return "walking_ok";
  if (normalized.includes("bicycle") || normalized.includes("bike_only")) return "bicycle_or_above";
  if (normalized.includes("tricycle") || normalized.includes("keke")) return "tricycle_or_above";
  if (normalized.includes("car") || normalized.includes("van")) return "car_or_van_required";
  return "motorcycle_or_above";
}

function riderCanHandle(rider, batch) {
  const eligibility = evaluateRiderEligibility(rider.rider_id || rider.user_id, {
    packageValueKobo: batch.package_value_kobo,
    highValue: batch.risk_level === "high" || batch.risk_level === "critical",
    maxActiveAssignments: 1,
  });
  if (!eligibility.eligible) return false;
  const capacity = serializeCapacity(rider);
  if (!capacity?.canReceiveAutoDispatch) return false;
  if (!["online", "online_gps_active", "online_zone_only"].includes(capacity.availabilityMode) && rider.availability !== "online") return false;
  if (Number(capacity.currentActiveBatchCount || 0) > 0 || rider.availability === "busy") return false;
  if (rank(riderCapacityValue(capacity.maxPackageSize, "size"), SIZE_ORDER) < rank(batch.package_size_summary, SIZE_ORDER)) return false;
  if (rank(riderCapacityValue(capacity.maxWeightClass, "weight"), WEIGHT_ORDER) < rank(batch.weight_class_summary, WEIGHT_ORDER)) return false;
  if (batch.fragility_summary === "very_fragile" && capacity.fragileHandlingAbility !== "can_handle_very_fragile") return false;
  if (batch.fragility_summary === "fragile" && capacity.fragileHandlingAbility === "cannot_handle_fragile") return false;
  if (rank(riderVehicleCapability(capacity.transportType), VEHICLE_ORDER) < rank(batch.required_vehicle_type, VEHICLE_ORDER)) {
    if (!(capacity.transportType === "car" || capacity.transportType === "van")) return false;
  }
  if (batch.requires_gps && capacity.gpsPermissionStatus !== "gps_enabled" && !String(capacity.availabilityMode).includes("gps")) return false;
  const zones = new Set(capacity.serviceZoneIds);
  if (zones.size && batch.source_zone_id && !zones.has(batch.source_zone_id)) return false;
  if (!zones.size && !env.allowZoneOnlyRiderDispatch) return false;
  return true;
}

function dispatchScore(rider, batch) {
  const capacity = serializeCapacity(rider);
  let score = 50;
  if (capacity.currentZoneId && capacity.currentZoneId === batch.source_zone_id) score += 20;
  if (capacity.gpsPermissionStatus === "gps_enabled" || String(capacity.availabilityMode).includes("gps")) score += 12;
  if (rider.current_lat != null || rider.last_known_latitude != null) score += 5;
  score += Number(rider.rating_average || 0) * 4;
  score += Number(capacity.acceptanceRate || 0) * 15;
  score += Number(capacity.responseSpeedScore || 0) * 10;
  score += Number(capacity.reliabilityScore || 0) * 15;
  score -= Number(capacity.currentActiveBatchCount || 0) * 20;
  score -= Number(capacity.rejectionRate || 0) * 15;
  if (batch.risk_level === "high") score -= 4;
  return Number(score.toFixed(2));
}

function publicRiderSnapshot(rider, batch, score = null) {
  const capacity = serializeCapacity(rider);
  const safeName = clean(rider.name || "Verified rider", 80);
  return {
    id: rider.rider_id || rider.user_id,
    name: safeName,
    displayName: safeName,
    dispatchScore: score == null ? dispatchScore(rider, batch) : score,
    availabilityMode: capacity.availabilityMode,
    currentZoneId: capacity.currentZoneId,
    transportType: capacity.transportType,
    maxPackageSize: capacity.maxPackageSize,
    maxWeightClass: capacity.maxWeightClass,
    fragileHandlingAbility: capacity.fragileHandlingAbility,
    deliveryBagType: capacity.deliveryBagType,
    currentActiveBatchCount: capacity.currentActiveBatchCount,
    acceptanceRate: capacity.acceptanceRate,
    responseSpeedScore: capacity.responseSpeedScore,
    reliabilityScore: capacity.reliabilityScore,
    matchSummary: [
      capacity.transportType,
      capacity.currentZoneId && capacity.currentZoneId === batch.source_zone_id ? "near pickup zone" : "",
      capacity.gpsPermissionStatus === "gps_enabled" ? "GPS enabled" : "zone dispatch",
    ].filter(Boolean).join(" · "),
    privacyNote: "Private phone, KYC, face/NIN and payout data stay hidden until the delivery workflow allows contact.",
  };
}

function riderBatchDiagnostics(rider, batch, attemptedRiderIds = new Set()) {
  const reasons = [];
  const riderId = rider.rider_id || rider.user_id;
  const capacity = serializeCapacity(rider);
  const verification = evaluateRiderEligibility(riderId, {
    packageValueKobo: batch.package_value_kobo,
    highValue: batch.risk_level === "high" || batch.risk_level === "critical",
    maxActiveAssignments: 1,
  });

  if (attemptedRiderIds.has(riderId)) reasons.push("already_contacted_for_this_batch");
  if (!verification.eligible) {
    reasons.push(...(verification.blockingReasons || []).map((reason) => reason.code || "rider_not_eligible"));
    if (!verification.blockingReasons?.length) reasons.push("rider_not_eligible");
  }
  if (!capacity?.canReceiveAutoDispatch) reasons.push("auto_dispatch_disabled");
  if (!["online", "online_gps_active", "online_zone_only"].includes(capacity.availabilityMode) && rider.availability !== "online") {
    reasons.push("rider_offline");
  }
  if (Number(capacity.currentActiveBatchCount || 0) > 0 || rider.availability === "busy") reasons.push("rider_busy");
  if (rank(riderCapacityValue(capacity.maxPackageSize, "size"), SIZE_ORDER) < rank(batch.package_size_summary, SIZE_ORDER)) {
    reasons.push("package_size_too_large");
  }
  if (rank(riderCapacityValue(capacity.maxWeightClass, "weight"), WEIGHT_ORDER) < rank(batch.weight_class_summary, WEIGHT_ORDER)) {
    reasons.push("package_too_heavy");
  }
  if (batch.fragility_summary === "very_fragile" && capacity.fragileHandlingAbility !== "can_handle_very_fragile") {
    reasons.push("very_fragile_not_supported");
  }
  if (batch.fragility_summary === "fragile" && capacity.fragileHandlingAbility === "cannot_handle_fragile") {
    reasons.push("fragile_not_supported");
  }
  if (rank(riderVehicleCapability(capacity.transportType), VEHICLE_ORDER) < rank(batch.required_vehicle_type, VEHICLE_ORDER)) {
    if (!(capacity.transportType === "car" || capacity.transportType === "van")) reasons.push("vehicle_not_supported");
  }
  if (batch.requires_gps && capacity.gpsPermissionStatus !== "gps_enabled" && !String(capacity.availabilityMode).includes("gps")) {
    reasons.push("gps_required");
  }
  const zones = new Set(capacity.serviceZoneIds);
  if (zones.size && batch.source_zone_id && !zones.has(batch.source_zone_id)) reasons.push("outside_service_zone");
  if (!zones.size && !env.allowZoneOnlyRiderDispatch) reasons.push("no_service_zone");

  return {
    rider,
    riderId,
    score: dispatchScore(rider, batch),
    eligible: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    verification,
  };
}

function listRiderCandidatesForBatchInternal(batchId, { includeExcluded = false } = {}) {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) throw new HttpError(404, "Delivery batch was not found.");
  const attempted = new Set(
    db.prepare("SELECT rider_id FROM dispatch_attempts WHERE delivery_batch_id = ?").all(batchId).map((row) => row.rider_id),
  );
  const riders = db.prepare(`
    SELECT users.id AS rider_id, users.name, users.phone, users.avatar_url, rider_profiles.*
    FROM rider_profiles
    JOIN users ON users.id = rider_profiles.user_id
    WHERE users.role = 'rider'
      AND users.is_active = 1
      AND rider_profiles.safety_status = 'normal'
  `).all();
  const diagnostics = riders.map((rider) => riderBatchDiagnostics(rider, batch, attempted));
  const candidates = diagnostics
    .filter((item) => item.eligible)
    .sort((a, b) => b.score - a.score);
  const excluded = includeExcluded
    ? diagnostics
        .filter((item) => !item.eligible)
        .sort((a, b) => b.score - a.score)
    : [];
  return { batch, candidates, excluded };
}

function eligibleRidersForBatch(batchId) {
  return listRiderCandidatesForBatchInternal(batchId).candidates;
}

function assertSellerOrAdminCanDispatch(auth, batchId) {
  if (!auth || !["admin", "seller"].includes(auth.role)) throw new HttpError(403, "Seller or admin access is required.");
  if (auth.role === "admin") return;
  const sellerTask = db.prepare("SELECT id FROM pickup_tasks WHERE delivery_batch_id = ? AND seller_id = ?").get(batchId, auth.user_id);
  if (!sellerTask) throw new HttpError(403, "Only a seller in this delivery batch can manage rider dispatch.");
}

function assertBatchReadyForRiderOffer(batchId) {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) throw new HttpError(404, "Delivery batch was not found.");
  if (batch.assigned_rider_id) throw new HttpError(422, "A rider is already assigned to this delivery batch.");
  const tasks = db.prepare(`
    SELECT pickup_tasks.*, orders.payment_status, orders.payment_method, orders.status AS order_status
    FROM pickup_tasks
    LEFT JOIN orders ON orders.id = pickup_tasks.order_id
    WHERE pickup_tasks.delivery_batch_id = ?
      AND pickup_tasks.status != 'seller_rejected'
  `).all(batchId);
  if (!tasks.length) throw new HttpError(422, "This delivery batch has no active seller package.");
  if (tasks.some((task) => !batchSafePaymentReady({
    payment_status: task.payment_status,
    payment_method: task.payment_method,
    status: task.order_status,
  }))) {
    throw new HttpError(422, "Payment must be confirmed or in the protected pay-on-delivery flow before rider dispatch starts.");
  }
  if (tasks.some((task) => !task.seller_confirmed_availability)) {
    throw new HttpError(422, "Every seller in this batch must confirm stock availability first.");
  }
  if (tasks.some((task) => !task.seller_marked_ready)) {
    throw new HttpError(422, "Every seller in this batch must mark their package ready before rider dispatch.");
  }
  return { batch, tasks };
}

export function listRiderCandidatesForBatch(auth, batchId) {
  assertSellerOrAdminCanDispatch(auth, batchId);
  advanceDueReadinessAndDispatch();
  advanceExpiredDispatchAttempts();
  assertBatchReadyForRiderOffer(batchId);
  const { batch, candidates, excluded } = listRiderCandidatesForBatchInternal(batchId, { includeExcluded: auth.role === "admin" });
  const safeCandidates = candidates.map((candidate) => publicRiderSnapshot(candidate.rider, batch, candidate.score));
  const safeExcluded = auth.role === "admin"
    ? excluded.map((candidate) => ({
        ...publicRiderSnapshot(candidate.rider, batch, candidate.score),
        exclusionReasons: candidate.reasons,
      }))
    : [];
  const now = nowIso();
  db.prepare(`
    UPDATE delivery_batches
    SET candidate_snapshot_json = ?,
        excluded_candidate_snapshot_json = ?,
        blocking_step = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(safeCandidates),
    JSON.stringify(safeExcluded),
    deriveBatchBlockingStep(batchId),
    now,
    batchId,
  );
  return {
    batch: getDeliveryBatchById(batchId),
    riders: safeCandidates,
    excludedRiders: safeExcluded,
  };
}

export function startDispatchForBatch(auth, batchId) {
  if (auth && !["admin", "seller"].includes(auth.role)) throw new HttpError(403, "Only admin or seller automation can start dispatch.");
  if (auth?.role === "seller") assertSellerOrAdminCanDispatch(auth, batchId);
  advanceDueReadinessAndDispatch();
  advanceExpiredDispatchAttempts();
  assertBatchReadyForRiderOffer(batchId);
  return offerNextRiderForBatch(batchId, { internal: true });
}

function createDispatchOfferForCandidate(batch, candidate, { internal = false, assignmentMode = "automatic", actor = null } = {}) {
  const batchId = batch.id;
  const existingOpen = db.prepare(`
    SELECT * FROM dispatch_attempts
    WHERE delivery_batch_id = ? AND status = 'offered'
    ORDER BY offered_at DESC
    LIMIT 1
  `).get(batchId);
  if (existingOpen && dispatchRemainingSeconds(existingOpen.expires_at) > 0) {
    return { batch: getDeliveryBatchById(batchId), attempt: serializeAttempt(existingOpen), internal };
  }

  const now = nowIso();
  const policy = resolveDispatchTimeoutPolicy({
    sellerType: batch.batch_type === "local_market" ? "local_market" : "campus",
    marketSource: batch.batch_type,
    packageSummary: `${batch.package_size_summary} ${batch.weight_class_summary} ${batch.fragility_summary}`,
    isHeavyFragile: ["heavy", "very_heavy"].includes(batch.weight_class_summary) || batch.fragility_summary !== "not_fragile",
  });
  const windowSeconds = offerWindowSeconds();
  const attemptId = createId("dsp");
  const attemptNumber = Number(batch.dispatch_attempt_count || 0) + 1;
  const riderId = candidate.rider.rider_id || candidate.rider.user_id;
  const riderSnapshot = publicRiderSnapshot(candidate.rider, batch, candidate.score);
  const expiresAt = buildDispatchExpiresAt(now, windowSeconds);

  db.prepare(`
    INSERT INTO dispatch_attempts (
      id, delivery_batch_id, rider_id, dispatch_score, status, offered_at,
      expires_at, attempt_number, assignment_mode, offer_window_seconds,
      safe_rider_snapshot_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'offered', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    attemptId,
    batchId,
    riderId,
    candidate.score,
    now,
    expiresAt,
    attemptNumber,
    assignmentMode,
    windowSeconds,
    JSON.stringify(riderSnapshot),
    now,
    now,
  );
  db.prepare(`
    UPDATE delivery_batches
    SET dispatch_status = 'offer_pending',
        rider_assignment_status = 'offer_pending',
        blocking_step = 'rider_offer_pending',
        assignment_mode = ?,
        current_dispatch_attempt_id = ?,
        offer_window_seconds = ?,
        dispatch_attempt_count = ?,
        auto_dispatch_started_at = COALESCE(auto_dispatch_started_at, ?),
        auto_dispatch_expires_at = ?,
        assigned_by_seller_id = CASE WHEN ? = 'manual' THEN ? ELSE assigned_by_seller_id END,
        assigned_manually_at = CASE WHEN ? = 'manual' THEN ? ELSE assigned_manually_at END,
        updated_at = ?
    WHERE id = ?
  `).run(
    assignmentMode,
    attemptId,
    windowSeconds,
    attemptNumber,
    now,
    expiresAt,
    assignmentMode,
    actor?.user_id || null,
    assignmentMode,
    now,
    now,
    batchId,
  );
  db.prepare(`
    UPDATE orders
    SET auto_dispatch_status = 'offer_sent',
        dispatch_status = 'offer_pending',
        delivery_status = 'rider_offer_sent',
        updated_at = ?
    WHERE delivery_batch_id = ?
  `).run(now, batchId);
  recordDispatchEvent({
    batchId,
    attemptId,
    riderId,
    actorId: actor?.user_id || null,
    actorRole: actor?.role || "",
    eventType: assignmentMode === "manual" ? "seller_sent_rider_offer" : "rider_offered",
    note: `Offer expires in ${windowSeconds} seconds.`,
    statusBefore: batch.dispatch_status || "",
    statusAfter: "offer_pending",
    metadata: {
      assignmentMode,
      offerWindowSeconds: windowSeconds,
      dispatchTimeoutPolicy: policy.policyKey,
    },
  });

  createNotification({
    userId: riderId,
    type: "order",
    title: assignmentMode === "manual" ? "Seller sent a delivery offer" : "New delivery batch",
    body: "You have a delivery batch offer. Open Gleenc Rider to accept or reject it.",
    actionLabel: "View dispatch",
    actionPath: `/rider/assignments`,
  });
  notificationEvent({
    userId: riderId,
    role: "rider",
    eventKey: "new_dispatch_offer",
    title: "New delivery batch",
    relatedBatchId: batchId,
  });

  return { batch: getDeliveryBatchById(batchId), attempt: serializeAttempt(db.prepare("SELECT * FROM dispatch_attempts WHERE id = ?").get(attemptId)), internal };
}

export function offerNextRiderForBatch(batchId, { internal = false } = {}) {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) throw new HttpError(404, "Delivery batch was not found.");
  assertBatchReadyForRiderOffer(batchId);
  const existingOpen = db.prepare(`
    SELECT * FROM dispatch_attempts
    WHERE delivery_batch_id = ? AND status = 'offered'
    ORDER BY attempt_number DESC
    LIMIT 1
  `).get(batchId);
  if (existingOpen && dispatchRemainingSeconds(existingOpen.expires_at) > 0) {
    return { batch: getDeliveryBatchById(batchId), attempt: serializeAttempt(existingOpen) };
  }
  const attempts = Number(batch.dispatch_attempt_count || 0);
  if (attempts >= env.maxDispatchAttempts) {
    const reason = "No rider accepted this batch within the dispatch attempt limit. Please manually assign an available rider from your seller dashboard.";
    unlockManualAssignmentForBatch(batchId, reason);
    return { batch: getDeliveryBatchById(batchId), attempt: null, sellerManualAssignmentRequired: true };
  }
  const [candidate] = eligibleRidersForBatch(batchId);
  if (!candidate) {
    const reason = "No compatible rider is online for this zone/capacity right now. Please manually assign an available rider from your seller dashboard.";
    unlockManualAssignmentForBatch(batchId, reason);
    return { batch: getDeliveryBatchById(batchId), attempt: null, sellerManualAssignmentRequired: true };
  }

  return createDispatchOfferForCandidate(batch, candidate, { internal, assignmentMode: "automatic" });
}

export function sendDeliveryOfferToRider(auth, batchId, input = {}) {
  assertSellerOrAdminCanDispatch(auth, batchId);
  advanceDueReadinessAndDispatch();
  advanceExpiredDispatchAttempts();
  const { batch } = assertBatchReadyForRiderOffer(batchId);
  const existingOpen = db.prepare(`
    SELECT * FROM dispatch_attempts
    WHERE delivery_batch_id = ? AND status = 'offered'
    ORDER BY offered_at DESC
    LIMIT 1
  `).get(batchId);
  if (existingOpen && dispatchRemainingSeconds(existingOpen.expires_at) > 0) {
    throw new HttpError(409, "A rider offer is already pending for this batch.");
  }

  const riderId = clean(input.riderId, 140);
  if (!riderId) throw new HttpError(422, "Select a rider before sending a delivery offer.");
  const { candidates } = listRiderCandidatesForBatchInternal(batchId);
  const candidate = candidates.find((item) => item.riderId === riderId);
  if (!candidate) throw new HttpError(422, "This rider is no longer eligible for this delivery batch.");
  return createDispatchOfferForCandidate(batch, candidate, { assignmentMode: "manual", actor: auth });
}

function requireRider(auth) {
  if (!auth) throw new HttpError(401, "Please log in.");
  if (auth.role !== "rider") throw new HttpError(403, "Rider account required.");
  return auth.user_id || auth.id;
}

function assignmentExists(orderId, riderId) {
  return db.prepare("SELECT * FROM rider_assignments WHERE order_type = 'store_order' AND order_id = ? AND rider_id = ?").get(orderId, riderId);
}

function createAssignmentsForBatch(batchId, riderId) {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  const tasks = db.prepare(`
    SELECT pickup_tasks.*, orders.*, stores.name AS store_name, stores.whatsapp_phone, stores.phone AS store_phone,
           stores.allow_rider_whatsapp_contact, users.name AS seller_name, users.phone AS seller_user_phone,
           delivery_tasks.delivery_otp_hash
    FROM pickup_tasks
    JOIN orders ON orders.id = pickup_tasks.order_id
    JOIN stores ON stores.id = orders.store_id
    JOIN users ON users.id = orders.seller_id
    JOIN delivery_tasks ON delivery_tasks.delivery_batch_id = pickup_tasks.delivery_batch_id
    WHERE pickup_tasks.delivery_batch_id = ?
      AND pickup_tasks.status != 'seller_rejected'
    ORDER BY pickup_tasks.pickup_sequence ASC
  `).all(batchId);
  const now = nowIso();
  const created = [];

  for (const task of tasks) {
    const existing = assignmentExists(task.order_id, riderId);
    if (existing) {
      created.push(existing);
      continue;
    }
    const assignmentId = createId("ras");
    db.prepare(`
      INSERT INTO rider_assignments (
        id, order_id, order_type, rider_id, seller_id, buyer_id, store_id, listing_id,
        market_source, seller_type, market_id, market_name, campus_name, pickup_landmark,
        seller_allows_whatsapp, status, dispatch_timeout_seconds, dispatch_expires_at,
        dispatch_timeout_policy, payment_status, payment_confirmed_at, pickup_code_hash,
        delivery_code_hash, pickup_address, pickup_lat, pickup_lng, delivery_address,
        delivery_lat, delivery_lng, seller_name, seller_phone, seller_whatsapp, buyer_name,
        buyer_phone, package_summary, package_tag_code, package_value_kobo, delivery_fee_kobo,
        accepted_at,
        delivery_batch_id, pickup_task_id, created_at, updated_at
      ) VALUES (?, ?, 'store_order', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assignmentId,
      task.order_id,
      riderId,
      task.seller_id,
      task.buyer_id,
      task.store_id,
      batch.batch_type,
      task.seller_type || "",
      task.market_id || null,
      task.market_name || "",
      task.campus || "",
      task.pickup_landmark || task.pickup_location || "",
      task.allow_rider_whatsapp_contact !== 0 ? 1 : 0,
      env.riderDispatchTimeoutCampusSeconds,
      task.confirmation_deadline_at || null,
      batch.batch_type || "batch",
      task.payment_status === "paid" ? "paid" : "unpaid",
      task.payment_status === "paid" ? now : null,
      task.pickup_otp_hash,
      task.delivery_otp_hash,
      task.pickup_location || task.store_pickup_location || task.pickup_landmark || "",
      task.pickup_lat || null,
      task.pickup_lng || null,
      task.delivery_address || task.pickup_location || "",
      task.delivery_lat || null,
      task.delivery_lng || null,
      task.seller_name || task.store_name || "Seller",
      task.seller_user_phone || task.store_phone || "",
      task.whatsapp_phone || task.store_phone || "",
      task.buyer_name || "Buyer",
      task.buyer_phone || "",
      `Batch pickup ${task.pickup_sequence}: ${task.order_code}`,
      task.package_tag_code || "",
      task.total_kobo || 0,
      task.delivery_fee_kobo || 0,
      now,
      batchId,
      task.id,
      now,
      now,
    );
    db.prepare(`
      UPDATE orders
      SET assigned_rider_id = ?,
          rider_assignment_id = ?,
          status = CASE WHEN payment_status = 'paid' THEN 'ready_for_delivery' ELSE status END,
          auto_dispatch_status = 'rider_accepted',
          dispatch_status = 'rider_assigned',
          delivery_status = 'rider_assigned',
          updated_at = ?
      WHERE id = ?
    `).run(riderId, assignmentId, now, task.order_id);
    created.push(db.prepare("SELECT * FROM rider_assignments WHERE id = ?").get(assignmentId));
  }

  return created;
}

export function riderAcceptDispatch(auth, dispatchId) {
  const riderId = requireRider(auth);
  const attempt = db.prepare("SELECT * FROM dispatch_attempts WHERE id = ? AND rider_id = ?").get(dispatchId, riderId);
  if (!attempt) throw new HttpError(404, "Dispatch offer was not found.");
  if (attempt.status !== "offered") throw new HttpError(422, "This dispatch offer is no longer active.");
  if (dispatchRemainingSeconds(attempt.expires_at) !== null && dispatchRemainingSeconds(attempt.expires_at) <= 0) {
    riderTimeoutDispatch(auth, dispatchId);
    throw new HttpError(410, "This dispatch offer expired. Another rider is being contacted.");
  }
  const now = nowIso();
  return transaction(() => {
    const batchBefore = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(attempt.delivery_batch_id);
    if (!batchBefore) throw new HttpError(404, "Delivery batch was not found.");
    if (batchBefore.assigned_rider_id && batchBefore.assigned_rider_id !== riderId) {
      throw new HttpError(409, "Another rider has already accepted this delivery batch.");
    }
    const attemptUpdate = db.prepare(`
      UPDATE dispatch_attempts
      SET status = 'accepted', accepted_at = ?, updated_at = ?
      WHERE id = ? AND status = 'offered'
    `).run(now, now, dispatchId);
    if (!attemptUpdate.changes) throw new HttpError(409, "This dispatch offer is no longer active.");
    const batchUpdate = db.prepare(`
      UPDATE delivery_batches
      SET status = 'rider_assigned',
          dispatch_status = 'rider_assigned',
          rider_assignment_status = 'assigned',
          blocking_step = 'rider_assigned',
          assigned_rider_id = ?,
          current_dispatch_attempt_id = ?,
          rider_accepted_at = ?,
          updated_at = ?
      WHERE id = ?
        AND (assigned_rider_id IS NULL OR assigned_rider_id = ?)
    `).run(riderId, dispatchId, now, now, attempt.delivery_batch_id, riderId);
    if (!batchUpdate.changes) throw new HttpError(409, "Another rider has already accepted this delivery batch.");
    db.prepare(`
      UPDATE dispatch_attempts
      SET status = 'superseded', rejection_reason = 'Another rider accepted this batch.', updated_at = ?
      WHERE delivery_batch_id = ? AND id != ? AND status = 'offered'
    `).run(now, attempt.delivery_batch_id, dispatchId);
    db.prepare("UPDATE pickup_tasks SET status = 'pickup_in_progress', updated_at = ? WHERE delivery_batch_id = ? AND status != 'seller_rejected'").run(now, attempt.delivery_batch_id);
    db.prepare("UPDATE delivery_tasks SET status = 'pickup_in_progress', updated_at = ? WHERE delivery_batch_id = ?").run(now, attempt.delivery_batch_id);
    db.prepare(`
      UPDATE rider_profiles
      SET availability = 'busy', availability_mode = 'busy',
          current_active_batch_count = current_active_batch_count + 1,
          updated_at = ?
      WHERE user_id = ?
    `).run(now, riderId);
    const assignments = createAssignmentsForBatch(attempt.delivery_batch_id, riderId);
    db.prepare(`
      UPDATE orders
      SET auto_dispatch_status = 'rider_accepted',
          dispatch_status = 'rider_assigned',
          delivery_status = 'rider_assigned',
          updated_at = ?
      WHERE delivery_batch_id = ?
    `).run(now, attempt.delivery_batch_id);
    recordDispatchEvent({
      batchId: attempt.delivery_batch_id,
      attemptId: dispatchId,
      riderId,
      actorId: riderId,
      actorRole: "rider",
      eventType: "rider_accepted",
      statusBefore: batchBefore.dispatch_status || "",
      statusAfter: "rider_assigned",
    });
    assignments.forEach((assignment) => {
      try {
        createDeliveryAssignmentConversation(riderId, assignment.id);
      } catch {
        // The assignment remains valid even if chat hydration is retried from the UI.
      }
    });
    updateReliabilityScore(riderId, "rider");
    notifyBatchParties(attempt.delivery_batch_id, "Rider assigned", "A rider accepted the delivery batch. Open Gleenc to track progress.", "rider_assigned");
    return { batch: getDeliveryBatchById(attempt.delivery_batch_id), assignments };
  });
}

export function riderRejectDispatch(auth, dispatchId, reason = "") {
  const riderId = requireRider(auth);
  const attempt = db.prepare("SELECT * FROM dispatch_attempts WHERE id = ? AND rider_id = ?").get(dispatchId, riderId);
  if (!attempt) throw new HttpError(404, "Dispatch offer was not found.");
  if (attempt.status !== "offered") throw new HttpError(422, "This dispatch offer is no longer active.");
  const now = nowIso();
  db.prepare("UPDATE dispatch_attempts SET status = 'rejected', rejected_at = ?, rejection_reason = ?, updated_at = ? WHERE id = ?").run(now, clean(reason, 300), now, dispatchId);
  db.prepare(`
    UPDATE delivery_batches
    SET dispatch_status = 'offer_declined',
        rider_assignment_status = 'offer_declined',
        blocking_step = 'ready_to_find_rider',
        rider_declined_at = ?,
        updated_at = ?
    WHERE id = ? AND current_dispatch_attempt_id = ?
  `).run(now, now, attempt.delivery_batch_id, dispatchId);
  recordDispatchEvent({
    batchId: attempt.delivery_batch_id,
    attemptId: dispatchId,
    riderId,
    actorId: riderId,
    actorRole: "rider",
    eventType: "rider_rejected",
    note: clean(reason, 300),
    statusAfter: "offer_declined",
  });
  updateReliabilityScore(riderId, "rider");
  if (attempt.assignment_mode === "manual") {
    syncBatchWorkflowState(attempt.delivery_batch_id, { riderAssignmentStatus: "ready" });
    return { batch: getDeliveryBatchById(attempt.delivery_batch_id), attempt: null, manualSelectionRequired: true };
  }
  return offerNextRiderForBatch(attempt.delivery_batch_id, { internal: true });
}

export function riderTimeoutDispatch(auth, dispatchId) {
  const riderId = requireRider(auth);
  const attempt = db.prepare("SELECT * FROM dispatch_attempts WHERE id = ? AND rider_id = ?").get(dispatchId, riderId);
  if (!attempt) throw new HttpError(404, "Dispatch offer was not found.");
  if (attempt.status !== "offered") return { batch: getDeliveryBatchById(attempt.delivery_batch_id), attempt: serializeAttempt(attempt) };
  const now = nowIso();
  db.prepare("UPDATE dispatch_attempts SET status = 'timed_out', timed_out_at = ?, updated_at = ? WHERE id = ?").run(now, now, dispatchId);
  db.prepare(`
    UPDATE delivery_batches
    SET dispatch_status = 'offer_expired',
        rider_assignment_status = 'offer_expired',
        blocking_step = 'ready_to_find_rider',
        updated_at = ?
    WHERE id = ? AND current_dispatch_attempt_id = ?
  `).run(now, attempt.delivery_batch_id, dispatchId);
  recordDispatchEvent({
    batchId: attempt.delivery_batch_id,
    attemptId: dispatchId,
    riderId,
    actorId: riderId,
    actorRole: "rider",
    eventType: "rider_timed_out",
    statusAfter: "offer_expired",
  });
  updateReliabilityScore(riderId, "rider");
  if (attempt.assignment_mode === "manual") {
    syncBatchWorkflowState(attempt.delivery_batch_id, { riderAssignmentStatus: "ready" });
    return { batch: getDeliveryBatchById(attempt.delivery_batch_id), attempt: null, manualSelectionRequired: true };
  }
  return offerNextRiderForBatch(attempt.delivery_batch_id, { internal: true });
}

export function listRiderDispatches(auth) {
  const riderId = requireRider(auth);
  advanceDueReadinessAndDispatch();
  advanceExpiredDispatchAttempts();
  const profile = db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(riderId);
  const eligibility = evaluateRiderEligibility(riderId, { maxActiveAssignments: 2 });
  if (!profile || !eligibility.eligible) {
    throw new HttpError(403, "Your rider account is not ready for dispatch yet.", eligibility.blockingReasons);
  }

  return db.prepare(`
    SELECT * FROM dispatch_attempts
    WHERE rider_id = ?
      AND status IN ('offered','accepted')
    ORDER BY offered_at DESC
    LIMIT 40
  `).all(riderId).map((attempt) => {
    const batch = getDeliveryBatchById(attempt.delivery_batch_id);
    const offeredOnly = attempt.status === "offered";
    const safeBatch = batch && offeredOnly
      ? {
          ...batch,
          pickupTasks: (batch.pickupTasks || []).map((task) => ({
            ...task,
            orderId: null,
            orderCode: "",
            packageTagCode: "",
            pickupLandmark: "Pickup details unlock after acceptance",
            sellerPickupCode: undefined,
            packageInstruction: "",
            orderItems: [],
          })),
          deliveryTask: batch.deliveryTask
            ? {
                ...batch.deliveryTask,
                deliveryLandmark: "Delivery details unlock after pickup verification",
              }
            : null,
        }
      : batch;
    return {
      ...serializeAttempt(attempt),
      batch: safeBatch
        ? {
            ...safeBatch,
            deliveryFeeKobo: 0,
            deliveryFee: 0,
            packageValueKobo: 0,
            packageValue: 0,
          }
        : null,
    };
  });
}

function notifyBatchParties(batchId, title, body, eventKey) {
  const parties = db.prepare(`
    SELECT DISTINCT orders.buyer_id AS user_id, 'buyer' AS role, orders.id AS order_id
    FROM pickup_tasks
    JOIN orders ON orders.id = pickup_tasks.order_id
    WHERE pickup_tasks.delivery_batch_id = ?
    UNION
    SELECT DISTINCT pickup_tasks.seller_id AS user_id, 'seller' AS role, pickup_tasks.order_id AS order_id
    FROM pickup_tasks
    WHERE pickup_tasks.delivery_batch_id = ?
  `).all(batchId, batchId);
  createNotificationForUsers(parties.map((party) => party.user_id), {
    type: "order",
    title,
    body,
    actionLabel: "View orders",
    actionPath: "/orders",
  });
  parties.forEach((party) => notificationEvent({
    userId: party.user_id,
    role: party.role,
    eventKey,
    title,
    body,
    relatedOrderId: party.order_id,
    relatedBatchId: batchId,
  }));
}

function notifyBatchSellersManualAssignment(batchId, reason) {
  const sellers = db.prepare(`
    SELECT DISTINCT pickup_tasks.seller_id AS user_id, pickup_tasks.order_id AS order_id
    FROM pickup_tasks
    WHERE pickup_tasks.delivery_batch_id = ?
  `).all(batchId);

  createNotificationForUsers(sellers.map((seller) => seller.user_id), {
    type: "order",
    title: "Manual rider assignment required",
    body: reason,
    actionLabel: "Assign rider",
    actionPath: "/dashboard",
  });

  sellers.forEach((seller) => notificationEvent({
    userId: seller.user_id,
    role: "seller",
    eventKey: "manual_rider_assignment_required",
    title: "Manual rider assignment required",
    body: reason,
    relatedOrderId: seller.order_id,
    relatedBatchId: batchId,
  }));
}

function assertRiderCapacityEditable(riderId) {
  const existing = db.prepare("SELECT * FROM rider_capacity_profiles WHERE rider_id = ?").get(riderId);
  const riderProfile = db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(riderId);
  const unlockUntil = riderProfile?.capacity_change_unlocked_until || existing?.capacity_change_unlocked_until || "";
  const unlockedByAdmin = unlockUntil && new Date(unlockUntil).getTime() > Date.now();

  if ((existing?.capacity_locked === 1 || riderProfile?.capacity_locked === 1) && !unlockedByAdmin) {
    throw new HttpError(423, "Delivery capacity is locked after onboarding. Contact admin support to request a capacity change.");
  }

  return { existing, riderProfile, unlockedByAdmin };
}

export function updateRiderCapacity(auth, input = {}) {
  const riderId = requireRider(auth);
  const now = nowIso();
  const { existing } = assertRiderCapacityEditable(riderId);

  const payload = {
    transportType: clean(input.transportType ?? existing?.transport_type ?? "motorcycle", 60),
    maxPackageSize: clean(input.maxPackageSize ?? existing?.max_package_size ?? "small_medium", 60),
    maxWeightClass: clean(input.maxWeightClass ?? existing?.max_weight_class ?? "up_to_medium", 60),
    fragileHandlingAbility: clean(input.fragileHandlingAbility ?? existing?.fragile_handling_ability ?? "can_handle_fragile", 80),
    deliveryBagType: clean(input.deliveryBagType ?? existing?.delivery_bag_type ?? "medium_delivery_bag", 80),
    serviceZoneIds: Array.isArray(input.serviceZoneIds) ? input.serviceZoneIds.map(String) : safeJsonArray(existing?.service_zone_ids, []),
    currentZoneId: clean(input.currentZoneId ?? existing?.current_zone_id ?? "", 140) || null,
    gpsPermissionStatus: clean(input.gpsPermissionStatus ?? existing?.gps_permission_status ?? "gps_disabled", 80),
    availabilityMode: clean(input.availabilityMode ?? existing?.availability_mode ?? "offline", 80),
    canReceiveAutoDispatch: input.canReceiveAutoDispatch === undefined ? existing?.can_receive_auto_dispatch !== 0 : Boolean(input.canReceiveAutoDispatch),
  };

  const id = existing?.id || createId("rcp");
  db.prepare(`
    INSERT INTO rider_capacity_profiles (
      id, rider_id, transport_type, max_package_size, max_weight_class,
      fragile_handling_ability, delivery_bag_type,
      service_zone_ids, current_zone_id, gps_permission_status, availability_mode,
      can_receive_auto_dispatch, capacity_locked, capacity_change_unlocked_until, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
    ON CONFLICT(rider_id) DO UPDATE SET
      transport_type = excluded.transport_type,
      max_package_size = excluded.max_package_size,
      max_weight_class = excluded.max_weight_class,
      fragile_handling_ability = excluded.fragile_handling_ability,
      delivery_bag_type = excluded.delivery_bag_type,
      service_zone_ids = excluded.service_zone_ids,
      current_zone_id = excluded.current_zone_id,
      gps_permission_status = excluded.gps_permission_status,
      availability_mode = excluded.availability_mode,
      can_receive_auto_dispatch = excluded.can_receive_auto_dispatch,
      capacity_locked = 1,
      capacity_change_unlocked_until = NULL,
      updated_at = excluded.updated_at
  `).run(
    id,
    riderId,
    payload.transportType,
    payload.maxPackageSize,
    payload.maxWeightClass,
    payload.fragileHandlingAbility,
    payload.deliveryBagType,
    JSON.stringify(payload.serviceZoneIds),
    payload.currentZoneId,
    payload.gpsPermissionStatus,
    payload.availabilityMode,
    booleanInt(payload.canReceiveAutoDispatch),
    existing ? existing.created_at : now,
    now,
  );
  db.prepare(`
    UPDATE rider_profiles
    SET transport_type = ?, max_package_size = ?, max_weight_class = ?,
        fragile_handling_ability = ?, delivery_bag_type = ?,
        service_zone_ids = ?, current_zone_id = ?,
        gps_permission_status = ?, availability_mode = ?, can_receive_auto_dispatch = ?,
        capacity_locked = 1, capacity_change_unlocked_until = NULL,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    payload.transportType,
    payload.maxPackageSize,
    payload.maxWeightClass,
    payload.fragileHandlingAbility,
    payload.deliveryBagType,
    JSON.stringify(payload.serviceZoneIds),
    payload.currentZoneId,
    payload.gpsPermissionStatus,
    payload.availabilityMode,
    booleanInt(payload.canReceiveAutoDispatch),
    now,
    riderId,
  );
  setRiderServiceZones(riderId, payload.serviceZoneIds);
  return getRiderCapacity(auth);
}

function setRiderServiceZones(riderId, zoneIds) {
  const now = nowIso();
  db.prepare("DELETE FROM rider_service_zones WHERE rider_id = ?").run(riderId);
  for (const zoneId of zoneIds) {
    db.prepare(`
      INSERT INTO rider_service_zones (id, rider_id, zone_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(rider_id, zone_id) DO NOTHING
    `).run(createId("rsz"), riderId, zoneId, now);
  }
}

export function getRiderCapacity(auth) {
  const riderId = requireRider(auth);
  const row = db.prepare(`
    SELECT rider_profiles.user_id AS rider_id, rider_profiles.*
    FROM rider_profiles
    WHERE rider_profiles.user_id = ?
  `).get(riderId);
  return serializeCapacity(row);
}

export function updateRiderServiceZones(auth, zoneIds = []) {
  const riderId = requireRider(auth);
  assertRiderCapacityEditable(riderId);
  const cleanZoneIds = Array.isArray(zoneIds) ? zoneIds.map(String) : [];
  setRiderServiceZones(riderId, cleanZoneIds);
  db.prepare("UPDATE rider_profiles SET service_zone_ids = ?, updated_at = ? WHERE user_id = ?").run(JSON.stringify(cleanZoneIds), nowIso(), riderId);
  return getRiderCapacity(auth);
}

export function updateRiderCurrentZone(auth, input = {}) {
  const riderId = requireRider(auth);
  assertRiderCapacityEditable(riderId);
  const zoneId = clean(input.currentZoneId || input.zoneId, 140);
  if (!zoneId) throw new HttpError(422, "Current zone is required.");
  const now = nowIso();
  db.prepare(`
    UPDATE rider_profiles
    SET current_zone_id = ?, availability_mode = CASE WHEN availability = 'online' THEN 'online_zone_only' ELSE availability_mode END,
        updated_at = ?
    WHERE user_id = ?
  `).run(zoneId, now, riderId);
  db.prepare(`
    INSERT INTO rider_location_events (
      id, rider_id, zone_id, gps_permission_status, source, created_at
    ) VALUES (?, ?, ?, 'gps_disabled', 'manual_zone', ?)
  `).run(createId("rle"), riderId, zoneId, now);
  return getRiderCapacity(auth);
}

export function updateRiderLocationPermission(auth, input = {}) {
  const riderId = requireRider(auth);
  const status = clean(input.gpsPermissionStatus || input.status || "gps_disabled", 80);
  const now = nowIso();
  db.prepare(`
    UPDATE rider_profiles
    SET gps_permission_status = ?,
        availability_mode = CASE
          WHEN availability = 'online' AND ? = 'gps_enabled' THEN 'online_gps_active'
          WHEN availability = 'online' THEN 'online_zone_only'
          ELSE availability_mode
        END,
        last_known_latitude = COALESCE(?, last_known_latitude),
        last_known_longitude = COALESCE(?, last_known_longitude),
        last_known_accuracy = COALESCE(?, last_known_accuracy),
        last_known_at = COALESCE(?, last_known_at),
        updated_at = ?
    WHERE user_id = ?
  `).run(
    status,
    status,
    input.latitude ?? null,
    input.longitude ?? null,
    input.accuracyMeters ?? null,
    input.latitude != null && input.longitude != null ? now : null,
    now,
    riderId,
  );
  db.prepare(`
    INSERT INTO rider_location_events (
      id, rider_id, zone_id, latitude, longitude, accuracy_meters,
      gps_permission_status, source, created_at
    ) VALUES (?, ?, (SELECT current_zone_id FROM rider_profiles WHERE user_id = ?), ?, ?, ?, ?, 'device_or_permission', ?)
  `).run(createId("rle"), riderId, riderId, input.latitude ?? null, input.longitude ?? null, input.accuracyMeters ?? null, status, now);
  return getRiderCapacity(auth);
}

export function listAdminDispatches() {
  const batches = db.prepare("SELECT * FROM delivery_batches ORDER BY updated_at DESC LIMIT 150").all().map((row) => getDeliveryBatchById(row.id));
  return {
    dispatches: batches,
    stats: {
      pending: batches.filter((batch) => ["pending", "ready_for_dispatch"].includes(batch.dispatchStatus)).length,
      offered: batches.filter((batch) => ["rider_offered", "offer_pending"].includes(batch.dispatchStatus)).length,
      accepted: batches.filter((batch) => ["rider_accepted", "rider_assigned"].includes(batch.dispatchStatus)).length,
      noRider: batches.filter((batch) => ["no_rider_available", "assignment_failed"].includes(batch.dispatchStatus)).length,
      highRisk: batches.filter((batch) => batch.riskLevel === "high" || batch.riskLevel === "critical").length,
    },
  };
}

export function listInterventionQueue({ status = "open" } = {}) {
  const params = [];
  let where = "";
  if (status) {
    where = "WHERE status = ?";
    params.push(status);
  }
  return db.prepare(`SELECT * FROM intervention_queue ${where} ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC LIMIT 200`).all(...params).map(serializeIntervention);
}

export function adminReassignBatch(_auth, batchId, input = {}) {
  const riderId = clean(input.riderId, 140);
  if (!riderId) return offerNextRiderForBatch(batchId, { internal: true });
  const now = nowIso();
  db.prepare("UPDATE dispatch_attempts SET status = 'rejected', rejection_reason = 'Admin manual reassignment', updated_at = ? WHERE delivery_batch_id = ? AND status = 'offered'").run(now, batchId);
  return sendDeliveryOfferToRider(_auth, batchId, { riderId });
}

export function adminHoldBatch(_auth, batchId, reason = "") {
  const now = nowIso();
  db.prepare("UPDATE delivery_batches SET status = 'on_hold', dispatch_status = 'on_hold', updated_at = ? WHERE id = ?").run(now, batchId);
  db.prepare(`
    INSERT INTO payout_hold_events (id, delivery_batch_id, reason, status, created_at)
    VALUES (?, ?, ?, 'on_hold', ?)
  `).run(createId("phe"), batchId, clean(reason || "Admin placed batch on hold.", 700), now);
  queueIntervention({ type: "batch_on_hold", priority: "high", relatedBatchId: batchId, reason: reason || "Admin placed batch on hold." });
  return getDeliveryBatchById(batchId);
}

export function adminCancelBatch(auth, batchId, reason = "") {
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(batchId);
  if (!batch) throw new HttpError(404, "Delivery batch was not found.");
  const now = nowIso();
  const safeReason = clean(reason || "Batch cancelled by admin.", 700);
  db.prepare("UPDATE delivery_batches SET status = 'cancelled', dispatch_status = 'cancelled', updated_at = ? WHERE id = ?").run(now, batchId);
  db.prepare("UPDATE pickup_tasks SET status = 'cancelled', updated_at = ? WHERE delivery_batch_id = ? AND status != 'picked_up'").run(now, batchId);
  db.prepare("UPDATE orders SET status = 'cancelled', fulfillment_status = 'cancelled', updated_at = ? WHERE delivery_batch_id = ?").run(now, batchId);
  db.prepare(`
    INSERT INTO cancellation_events (
      id, parent_order_id, actor_id, actor_role, reason, status_before, status_after, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'cancelled', ?)
  `).run(createId("can"), batch.parent_order_id, auth.user_id, auth.role, safeReason, batch.status, now);
  notifyBatchParties(batchId, "Delivery batch cancelled", "A delivery batch was cancelled. Open Gleenc for details.", "batch_cancelled");
  return getDeliveryBatchById(batchId);
}

export function adminSplitBatch(_auth, batchId) {
  const batch = getDeliveryBatchById(batchId);
  if (!batch) throw new HttpError(404, "Delivery batch was not found.");
  queueIntervention({
    type: "batch_split_required",
    priority: "medium",
    relatedBatchId: batchId,
    reason: "Batch split requested. Manual review is queued for safe split rules.",
  });
  return batch;
}

export function updateReliabilityScore(userId, role) {
  if (!env.enableAutomatedReliabilityScoring || !userId || !role) return null;
  const now = nowIso();
  let score = 1;
  let confirmationSpeedScore = 1;
  let cancellationScore = 1;
  let complaintScore = 1;
  let acceptanceScore = 1;
  let deliveryScore = 1;
  let paymentScore = 1;
  let disputeScore = 1;

  if (role === "seller") {
    const totalTasks = Number(db.prepare("SELECT COUNT(*) AS count FROM pickup_tasks WHERE seller_id = ?").get(userId).count || 0);
    const rejected = Number(db.prepare("SELECT COUNT(*) AS count FROM pickup_tasks WHERE seller_id = ? AND status = 'seller_rejected'").get(userId).count || 0);
    const ready = Number(db.prepare("SELECT COUNT(*) AS count FROM pickup_tasks WHERE seller_id = ? AND seller_marked_ready = 1").get(userId).count || 0);
    cancellationScore = totalTasks ? Math.max(0, 1 - rejected / totalTasks) : 1;
    confirmationSpeedScore = totalTasks ? Math.min(1, ready / totalTasks + 0.2) : 1;
  } else if (role === "rider") {
    const totalAttempts = Number(db.prepare("SELECT COUNT(*) AS count FROM dispatch_attempts WHERE rider_id = ?").get(userId).count || 0);
    const accepted = Number(db.prepare("SELECT COUNT(*) AS count FROM dispatch_attempts WHERE rider_id = ? AND status = 'accepted'").get(userId).count || 0);
    const rejected = Number(db.prepare("SELECT COUNT(*) AS count FROM dispatch_attempts WHERE rider_id = ? AND status IN ('rejected','timed_out')").get(userId).count || 0);
    acceptanceScore = totalAttempts ? accepted / totalAttempts : 1;
    cancellationScore = totalAttempts ? Math.max(0, 1 - rejected / totalAttempts) : 1;
    deliveryScore = Number(db.prepare("SELECT COUNT(*) AS count FROM rider_assignments WHERE rider_id = ? AND status = 'delivered'").get(userId).count || 0) > 0 ? 1 : 0.8;
    db.prepare("UPDATE rider_profiles SET acceptance_rate = ?, rejection_rate = ?, reliability_score = ?, updated_at = ? WHERE user_id = ?").run(
      acceptanceScore,
      totalAttempts ? rejected / totalAttempts : 0,
      Math.max(0, Math.min(1, (acceptanceScore + cancellationScore + deliveryScore) / 3)),
      now,
      userId,
    );
  } else if (role === "buyer") {
    const orders = Number(db.prepare("SELECT COUNT(*) AS count FROM orders WHERE buyer_id = ?").get(userId).count || 0);
    const cancelled = Number(db.prepare("SELECT COUNT(*) AS count FROM orders WHERE buyer_id = ? AND status = 'cancelled'").get(userId).count || 0);
    cancellationScore = orders ? Math.max(0, 1 - cancelled / orders) : 1;
  }

  score = Math.max(0, Math.min(1, (
    confirmationSpeedScore +
    cancellationScore +
    complaintScore +
    acceptanceScore +
    deliveryScore +
    paymentScore +
    disputeScore
  ) / 7));

  const id = db.prepare("SELECT id FROM reliability_scores WHERE user_id = ? AND role = ?").get(userId, role)?.id || createId("rel");
  db.prepare(`
    INSERT INTO reliability_scores (
      id, user_id, role, score, confirmation_speed_score, cancellation_score,
      complaint_score, acceptance_score, delivery_score, payment_score,
      dispute_score, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, role) DO UPDATE SET
      score = excluded.score,
      confirmation_speed_score = excluded.confirmation_speed_score,
      cancellation_score = excluded.cancellation_score,
      complaint_score = excluded.complaint_score,
      acceptance_score = excluded.acceptance_score,
      delivery_score = excluded.delivery_score,
      payment_score = excluded.payment_score,
      dispute_score = excluded.dispute_score,
      updated_at = excluded.updated_at
  `).run(
    id,
    userId,
    role,
    score,
    confirmationSpeedScore,
    cancellationScore,
    complaintScore,
    acceptanceScore,
    deliveryScore,
    paymentScore,
    disputeScore,
    now,
  );

  return db.prepare("SELECT * FROM reliability_scores WHERE user_id = ? AND role = ?").get(userId, role);
}

export function listReliabilityScores(role = "") {
  const params = [];
  let where = "";
  if (role) {
    where = "WHERE role = ?";
    params.push(role);
  }
  return db.prepare(`SELECT * FROM reliability_scores ${where} ORDER BY score ASC, updated_at DESC LIMIT 200`).all(...params).map((row) => ({
    id: row.id,
    userId: row.user_id,
    role: row.role,
    score: Number(row.score || 0),
    confirmationSpeedScore: Number(row.confirmation_speed_score || 0),
    cancellationScore: Number(row.cancellation_score || 0),
    complaintScore: Number(row.complaint_score || 0),
    acceptanceScore: Number(row.acceptance_score || 0),
    deliveryScore: Number(row.delivery_score || 0),
    paymentScore: Number(row.payment_score || 0),
    disputeScore: Number(row.dispute_score || 0),
    updatedAt: row.updated_at,
  }));
}

export function getOwnReliability(auth) {
  const role = auth.role;
  return updateReliabilityScore(auth.user_id, role) || db.prepare("SELECT * FROM reliability_scores WHERE user_id = ? AND role = ?").get(auth.user_id, role);
}

export function checkoutGroupingPreview(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return { groups: [], totalDeliveryFeeKobo: 0, totalDeliveryFee: 0 };
  const productIds = items.map((item) => clean(item.productId || item.id, 140)).filter(Boolean);
  if (!productIds.length) return { groups: [], totalDeliveryFeeKobo: 0, totalDeliveryFee: 0 };
  const products = productIds.map((id) => db.prepare(`
    SELECT products.*, stores.seller_type, stores.market_id, stores.campus, stores.location_area, stores.pickup_zone_id
    FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE products.id = ?
  `).get(id)).filter(Boolean);
  const grouped = new Map();
  products.forEach((product) => {
    const profile = profileFromProduct(product);
    const batchType = inferBatchType(product);
    const separate = profile.requiresSeparateDelivery;
    const key = separate ? `single:${product.id}` : [batchType, product.market_id || product.campus || product.location_area || "general"].join(":");
    const group = grouped.get(key) || { batchType, products: [], profiles: [] };
    group.products.push(product);
    group.profiles.push(profile);
    grouped.set(key, group);
  });
  const groups = Array.from(grouped.values()).map((group, index) => {
    const summary = packageSnapshotForOrderItems(group.products);
    const zone = findZoneForText(group.products[0]?.campus || group.products[0]?.location_area || "");
    const feeKobo = batchFeeKobo({ zone, pickupCount: new Set(group.products.map((product) => product.store_id)).size || 1, summary });
    return {
      id: `preview-${index + 1}`,
      batchType: group.batchType,
      itemCount: group.products.length,
      sellerCount: new Set(group.products.map((product) => product.store_id)).size,
      packageSizeSummary: summary.packageSizeSummary,
      weightClassSummary: summary.weightClassSummary,
      fragilitySummary: summary.fragilitySummary,
      requiredVehicleType: summary.requiredVehicleType,
      requiresGps: summary.requiresGps,
      requiresPhotoProof: summary.requiresPhotoProof,
      canBatch: summary.canBatch,
      deliveryFeeKobo: feeKobo,
      deliveryFee: koboToNaira(feeKobo),
      riskLevel: summary.riskLevel,
      products: group.products.map((product) => ({ id: product.id, name: product.name, category: product.category })),
    };
  });
  const totalDeliveryFeeKobo = groups.reduce((sum, group) => sum + group.deliveryFeeKobo, 0);
  return { groups, totalDeliveryFeeKobo, totalDeliveryFee: koboToNaira(totalDeliveryFeeKobo) };
}

export function updateSellerProductStock(auth, productId, input = {}) {
  if (!["seller", "admin"].includes(auth.role)) throw new HttpError(403, "Seller access is required.");
  const product = db.prepare(`
    SELECT products.*, stores.owner_id
    FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE products.id = ?
  `).get(productId);
  if (!product) throw new HttpError(404, "Product was not found.");
  if (auth.role !== "admin" && product.owner_id !== auth.user_id) {
    throw new HttpError(403, "You can only update your own product stock.");
  }
  const oldQuantity = Number(product.stock || 0);
  const oldStatus = product.stock_status || product.availability_status || "";
  const nextQuantity = input.quantity === undefined ? oldQuantity : Math.max(0, Number(input.quantity || 0));
  const nextStatus = clean(
    input.stockStatus ||
      (nextQuantity <= 0 ? "out_of_stock" : nextQuantity <= 3 ? "low_stock" : "in_stock"),
    80,
  );
  const productStatus = nextStatus === "out_of_stock" ? "out_of_stock" : product.status === "out_of_stock" ? "active" : product.status;
  const now = nowIso();
  db.prepare(`
    UPDATE products
    SET stock = ?, stock_status = ?, availability_status = ?,
        status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextQuantity,
    nextStatus,
    nextStatus === "out_of_stock" ? "out_of_stock" : product.availability_status || "available_now",
    productStatus,
    now,
    productId,
  );
  db.prepare(`
    INSERT INTO stock_events (
      id, product_id, store_id, old_quantity, new_quantity, old_status, new_status, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("stk"),
    productId,
    product.store_id,
    oldQuantity,
    nextQuantity,
    oldStatus,
    nextStatus,
    clean(input.note || "", 500),
    now,
  );
  return serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(productId));
}

export function listSubstitutionOptions(auth, orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (auth.role !== "admin" && order.buyer_id !== auth.user_id && order.seller_id !== auth.user_id) {
    throw new HttpError(403, "You cannot view substitutions for this order.");
  }
  const options = db.prepare(`
    SELECT substitution_options.*, products.name AS product_name, products.price_kobo,
           products.image_urls, stores.name AS store_name
    FROM substitution_options
    JOIN products ON products.id = substitution_options.suggested_product_id
    JOIN stores ON stores.id = products.store_id
    WHERE substitution_options.parent_order_id = ?
       OR substitution_options.unavailable_order_item_id IN (
          SELECT id FROM order_items WHERE order_id = ?
       )
    ORDER BY substitution_options.created_at DESC
  `).all(order.parent_order_id || "", orderId);
  return options.map((row) => ({
    id: row.id,
    parentOrderId: row.parent_order_id || null,
    unavailableOrderItemId: row.unavailable_order_item_id || null,
    suggestedProductId: row.suggested_product_id,
    productName: row.product_name,
    storeName: row.store_name,
    priceKobo: Number(row.price_kobo || 0),
    price: koboToNaira(row.price_kobo),
    imageUrls: safeJsonArray(row.image_urls),
    status: row.status,
    reason: row.reason || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function acceptSubstitution(auth, orderId, input = {}) {
  const optionId = clean(input.optionId, 140);
  if (!optionId) throw new HttpError(422, "Substitution option is required.");
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (order.buyer_id !== auth.user_id && auth.role !== "admin") {
    throw new HttpError(403, "Only the buyer or admin can accept substitution.");
  }
  const now = nowIso();
  db.prepare("UPDATE substitution_options SET status = 'accepted', updated_at = ? WHERE id = ?").run(now, optionId);
  createNotification({
    userId: order.seller_id,
    type: "order",
    title: "Buyer accepted a substitution",
    body: "A buyer accepted an alternative item. Open Gleenc to continue fulfillment.",
    actionLabel: "View order",
    actionPath: `/orders/${order.id}`,
  });
  return { options: listSubstitutionOptions(auth, orderId) };
}

export function removeUnavailableItem(auth, orderId, input = {}) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (order.buyer_id !== auth.user_id && auth.role !== "admin") {
    throw new HttpError(403, "Only the buyer or admin can remove unavailable items.");
  }
  const now = nowIso();
  db.prepare("UPDATE substitution_options SET status = 'removed', updated_at = ? WHERE id = ?").run(now, clean(input.optionId, 140));
  db.prepare(`
    INSERT INTO refund_decision_events (
      id, parent_order_id, order_id, decision, reason, amount_kobo, created_at
    ) VALUES (?, ?, ?, 'remove_item_recalculate', ?, ?, ?)
  `).run(
    createId("rde"),
    order.parent_order_id || null,
    orderId,
    clean(input.reason || "Buyer removed unavailable item.", 700),
    Number(order.total_kobo || 0),
    now,
  );
  return { ok: true };
}

export function verifyPickupTask(auth, pickupTaskId, input = {}) {
  const riderId = requireRider(auth);
  const task = db.prepare("SELECT * FROM pickup_tasks WHERE id = ?").get(pickupTaskId);
  if (!task) throw new HttpError(404, "Pickup task was not found.");
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(task.delivery_batch_id);
  if (batch?.assigned_rider_id !== riderId) throw new HttpError(403, "This pickup is not assigned to you.");
  const proofUrl = clean(input.proofUrl || input.fileUrl || "", 500);
  if (!proofUrl) throw new HttpError(422, "Upload a pickup proof photo before verifying seller pickup.");
  assertOtpAttemptAllowed("pickup_tasks", "id", task, "seller pickup");
  if (hashOtp(input.sellerPickupCode || input.otp) !== task.pickup_otp_hash) {
    recordFailedOtpAttempt("pickup_tasks", "id", task);
    queueIntervention({
      type: "failed_pickup_otp",
      priority: "high",
      relatedOrderId: task.order_id,
      relatedBatchId: task.delivery_batch_id,
      relatedSellerId: task.seller_id,
      relatedRiderId: riderId,
      reason: "Rider entered an invalid seller pickup OTP.",
    });
    throw new HttpError(422, "Seller pickup OTP is not correct.");
  }
  const now = nowIso();
  db.prepare(`
    UPDATE pickup_tasks
    SET status = 'picked_up',
        picked_up_at = ?,
        seller_pickup_code_verified_at = ?,
        code_attempt_count = 0,
        last_code_attempt_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, now, pickupTaskId);
  db.prepare(`
    UPDATE orders
    SET status = 'out_for_delivery',
        fulfillment_status = 'picked_up_from_seller',
        seller_pickup_code_verified_at = ?,
        pickup_verified_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, now, task.order_id);
  db.prepare(`
    INSERT INTO delivery_proofs (
      id, delivery_batch_id, pickup_task_id, rider_id, proof_type, proof_url,
      note, latitude, longitude, accuracy_meters, created_at
    ) VALUES (?, ?, ?, ?, 'pickup', ?, ?, ?, ?, ?, ?)
  `).run(
    createId("dpf"),
    task.delivery_batch_id,
    pickupTaskId,
    riderId,
    proofUrl,
    clean(input.note || "", 500),
    input.latitude ?? null,
    input.longitude ?? null,
    input.accuracyMeters ?? null,
    now,
  );
  const remaining = db.prepare("SELECT COUNT(*) AS count FROM pickup_tasks WHERE delivery_batch_id = ? AND status != 'picked_up' AND status != 'seller_rejected'").get(task.delivery_batch_id).count;
  if (!remaining) {
    db.prepare(`
      UPDATE delivery_batches
      SET status = 'out_for_delivery',
          dispatch_status = 'in_transit',
          delivery_workflow_status = 'in_transit',
          blocking_step = 'buyer_delivery_verification',
          updated_at = ?
      WHERE id = ?
    `).run(now, task.delivery_batch_id);
    db.prepare("UPDATE delivery_tasks SET status = 'out_for_delivery', updated_at = ? WHERE delivery_batch_id = ?").run(now, task.delivery_batch_id);
    recordDispatchEvent({
      batchId: task.delivery_batch_id,
      riderId,
      actorId: riderId,
      actorRole: "rider",
      eventType: "pickup_confirmed",
      statusAfter: "in_transit",
    });
    notifyBatchParties(task.delivery_batch_id, "Rider picked up your package", "The rider has completed pickup and is moving to delivery.", "rider_picked_up_package");
  } else {
    recordDispatchEvent({
      batchId: task.delivery_batch_id,
      riderId,
      actorId: riderId,
      actorRole: "rider",
      eventType: "seller_pickup_verified",
      statusAfter: "pickup_confirmed",
    });
  }
  return { pickupTask: serializePickupTask(db.prepare("SELECT * FROM pickup_tasks WHERE id = ?").get(pickupTaskId)), batch: getDeliveryBatchById(task.delivery_batch_id) };
}

export function verifyDeliveryTask(auth, deliveryTaskId, input = {}) {
  const riderId = requireRider(auth);
  const task = db.prepare("SELECT * FROM delivery_tasks WHERE id = ?").get(deliveryTaskId);
  if (!task) throw new HttpError(404, "Delivery task was not found.");
  const batch = db.prepare("SELECT * FROM delivery_batches WHERE id = ?").get(task.delivery_batch_id);
  if (batch?.assigned_rider_id !== riderId) throw new HttpError(403, "This delivery is not assigned to you.");
  const proofUrl = clean(input.proofUrl || input.fileUrl || "", 500);
  if (!proofUrl) throw new HttpError(422, "Upload a delivery proof photo before verifying buyer delivery.");
  assertOtpAttemptAllowed("delivery_tasks", "id", task, "buyer delivery");
  if (hashOtp(input.customerDeliveryCode || input.deliveryOtp || input.otp) !== task.delivery_otp_hash) {
    recordFailedOtpAttempt("delivery_tasks", "id", task);
    queueIntervention({
      type: "failed_delivery_otp",
      priority: "high",
      relatedBatchId: task.delivery_batch_id,
      relatedUserId: task.buyer_id,
      relatedRiderId: riderId,
      reason: "Rider entered an invalid buyer delivery OTP.",
    });
    throw new HttpError(422, "Buyer delivery OTP is not correct.");
  }
  const now = nowIso();
  db.prepare(`
    UPDATE delivery_tasks
    SET status = 'delivered',
        delivered_at = ?,
        buyer_delivery_code_verified_at = ?,
        code_attempt_count = 0,
        last_code_attempt_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, now, deliveryTaskId);
  db.prepare(`
    UPDATE delivery_batches
    SET status = 'delivered',
        dispatch_status = 'completed',
        delivery_workflow_status = 'completed',
        payout_workflow_status = 'ready_for_payout',
        blocking_step = 'completed',
        updated_at = ?
    WHERE id = ?
  `).run(now, task.delivery_batch_id);
  db.prepare(`
    UPDATE orders
    SET status = 'delivered',
        fulfillment_status = 'delivered',
        buyer_delivery_code_verified_at = ?,
        delivery_verified_at = ?,
        delivered_at = ?,
        updated_at = ?
    WHERE delivery_batch_id = ?
  `).run(now, now, now, now, task.delivery_batch_id);
  const activeBatchCount = Number(
    db.prepare("SELECT current_active_batch_count FROM rider_profiles WHERE user_id = ?").get(riderId)?.current_active_batch_count || 0,
  );
  db.prepare(`
    UPDATE rider_profiles
    SET availability = 'online',
        availability_mode = CASE
          WHEN gps_permission_status = 'gps_enabled' THEN 'online_gps_active'
          ELSE 'online_zone_only'
        END,
        current_active_batch_count = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(Math.max(0, activeBatchCount - 1), now, riderId);
  db.prepare(`
    INSERT INTO delivery_proofs (
      id, delivery_batch_id, delivery_task_id, rider_id, proof_type, proof_url,
      note, latitude, longitude, accuracy_meters, created_at
    ) VALUES (?, ?, ?, ?, 'delivery', ?, ?, ?, ?, ?, ?)
  `).run(
    createId("dpf"),
    task.delivery_batch_id,
    deliveryTaskId,
    riderId,
    proofUrl,
    clean(input.note || "", 500),
    input.latitude ?? null,
    input.longitude ?? null,
    input.accuracyMeters ?? null,
    now,
  );
  recordDispatchEvent({
    batchId: task.delivery_batch_id,
    riderId,
    actorId: riderId,
    actorRole: "rider",
    eventType: "delivery_completed",
    statusAfter: "completed",
  });
  notifyBatchParties(task.delivery_batch_id, "Delivery completed", "Your Gleenc delivery batch has been marked delivered.", "delivery_completed");
  updateReliabilityScore(riderId, "rider");
  return { deliveryTask: task, batch: getDeliveryBatchById(task.delivery_batch_id) };
}

export function addTaskProof(auth, taskType, taskId, input = {}) {
  const riderId = requireRider(auth);
  const table = taskType === "delivery" ? "delivery_tasks" : "pickup_tasks";
  const task = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(taskId);
  if (!task) throw new HttpError(404, "Task was not found.");
  const now = nowIso();
  db.prepare(`
    INSERT INTO delivery_proofs (
      id, delivery_batch_id, ${taskType === "delivery" ? "delivery_task_id" : "pickup_task_id"},
      rider_id, proof_type, proof_url, note, latitude, longitude, accuracy_meters, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("dpf"),
    task.delivery_batch_id,
    taskId,
    riderId,
    taskType,
    clean(input.proofUrl || input.fileUrl || "", 500) || null,
    clean(input.note || "", 500),
    input.latitude ?? null,
    input.longitude ?? null,
    input.accuracyMeters ?? null,
    now,
  );
  return { ok: true };
}
