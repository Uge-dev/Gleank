import crypto from "node:crypto";
import { db, transaction } from "../db/database.js";
import "../db/rider-migrations.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createSession, deleteSession, sessionCookieOptions, sessionCookieName } from "../lib/session.js";
import { serializeUser } from "../lib/serializers.js";
import { loginUser, registerUser } from "./auth.service.js";
import { createNotification, listNotifications, markNotificationRead } from "./notification.service.js";

const ACTIVE_ASSIGNMENT_STATUSES = new Set(["assigned", "accepted", "arrived_pickup", "picked_up", "out_for_delivery"]);
const PICKUP_ALLOWED_STATUSES = new Set(["accepted", "arrived_pickup"]);
const COMPLETE_ALLOWED_STATUSES = new Set(["picked_up", "out_for_delivery"]);
const MAX_PROOF_DISTANCE_METERS = Number(process.env.RIDER_PROOF_RADIUS_METERS || 500);

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function secret() {
  return process.env.RIDER_OTP_SECRET || env.jwtSecret || "gleank-rider-otp-secret";
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

function phoneForWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
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

function serializeProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone,
    whatsappPhone: row.whatsapp_phone,
    vehicleType: row.vehicle_type,
    vehiclePlate: row.vehicle_plate,
    coverageArea: row.coverage_area,
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    verificationLevel: row.verification_level,
    maxPackageValueKobo: row.max_package_value_kobo,
    maxPackageValue: money(row.max_package_value_kobo),
    availability: row.availability,
    currentLocation: row.current_lat == null || row.current_lng == null ? null : {
      lat: row.current_lat,
      lng: row.current_lng,
      accuracyMeters: row.current_accuracy_meters || 0,
      updatedAt: row.last_location_at,
    },
    safetyStatus: row.safety_status,
    ratingAverage: row.rating_average,
    completedDeliveries: row.completed_deliveries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAssignment(row, { revealPrivate = false } = {}) {
  if (!row) return null;
  const pickedUp = ["picked_up", "out_for_delivery", "delivered"].includes(row.status);
  const reveal = revealPrivate || pickedUp;
  return {
    id: row.id,
    orderId: row.order_id,
    orderType: row.order_type,
    riderId: row.rider_id,
    sellerId: row.seller_id,
    buyerId: reveal ? row.buyer_id : null,
    status: row.status,
    paymentStatus: row.payment_status,
    pickupPoint: {
      address: row.pickup_address,
      lat: row.pickup_lat,
      lng: row.pickup_lng,
    },
    deliveryPoint: {
      address: row.delivery_address,
      lat: row.delivery_lat,
      lng: row.delivery_lng,
    },
    deliveryLocation: row.delivery_address,
    sellerName: row.seller_name,
    sellerPhone: row.seller_phone,
    sellerWhatsApp: phoneForWhatsapp(row.seller_whatsapp || row.seller_phone),
    buyerName: reveal ? row.buyer_name : "Locked until pickup",
    buyerPhone: reveal ? row.buyer_phone : "",
    packageSummary: reveal ? row.package_summary : "Package details unlock after seller pickup OTP is verified.",
    packageValueKobo: row.package_value_kobo,
    packageValue: money(row.package_value_kobo),
    deliveryFeeKobo: row.delivery_fee_kobo,
    deliveryFee: money(row.delivery_fee_kobo),
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

function requireRiderUser(auth) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  if (auth.role !== "rider") throw new HttpError(403, "Rider dashboard requires a rider account.");
  return auth.user_id || auth.id;
}

function requireVerifiedRider(userId) {
  const profile = getRiderProfile(userId);
  if (!profile) throw new HttpError(404, "Rider profile was not found.");
  if (profile.verification_status !== "verified") {
    throw new HttpError(403, "Your rider account must be verified before handling deliveries.");
  }
  if (profile.safety_status === "suspended" || profile.verification_status === "suspended") {
    throw new HttpError(403, "Your rider account is currently suspended.");
  }
  return profile;
}

function assignmentByIdForRider(riderId, assignmentId) {
  return db.prepare("SELECT * FROM rider_assignments WHERE id = ? AND rider_id = ?").get(assignmentId, riderId);
}

function assignmentByOrderForRider(riderId, orderId) {
  return db.prepare("SELECT * FROM rider_assignments WHERE order_id = ? AND rider_id = ?").get(orderId, riderId);
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

function proofUrlFromInput(input) {
  return clean(input.proofUrl || input.proofFileName || "", 500);
}

function requireProofLocationNear(point, expectedPoint, label) {
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
  const active = db.prepare(`
    SELECT COUNT(*) AS count FROM rider_assignments
    WHERE rider_id = ? AND status IN ('accepted','arrived_pickup','picked_up','out_for_delivery')
  `).get(userId).count;
  const completed = db.prepare("SELECT COUNT(*) AS count FROM rider_assignments WHERE rider_id = ? AND status = 'delivered'").get(userId).count;
  const earnings = db.prepare("SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM rider_earnings WHERE rider_id = ?").get(userId).total;
  return {
    assigned: Number(assigned || 0),
    active: Number(active || 0),
    completed: Number(completed || 0),
    totalEarningsKobo: Number(earnings || 0),
    totalEarnings: money(earnings),
  };
}

export async function registerRider(input, meta = {}) {
  const result = await registerUser({
    name: input.name,
    email: input.email,
    password: input.password,
    role: "rider",
    campus: input.campus || "General",
    phone: input.phone,
    storeName: "",
  }, meta);

  const now = nowIso();
  transaction(() => {
    db.prepare(`
      INSERT INTO rider_profiles (
        id, user_id, full_name, phone, whatsapp_phone, vehicle_type, vehicle_plate,
        coverage_area, home_address, emergency_contact_name, emergency_contact_phone,
        guarantor_name, guarantor_phone, identity_document_url, selfie_url, nin_last4,
        verification_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
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
      now,
      now,
    );
  });

  return {
    ...result,
    riderProfile: serializeProfile(getRiderProfile(result.user.id)),
  };
}

export async function loginRider(input, meta = {}) {
  const result = await loginUser(input, meta);
  if (result.user.role !== "rider") {
    throw new HttpError(403, "This login is not a rider account.");
  }
  return {
    ...result,
    riderProfile: serializeProfile(getRiderProfile(result.user.id)),
  };
}

export function logoutRider(cookieToken) {
  deleteSession(cookieToken);
}

export function getRiderSession(auth) {
  const userId = requireRiderUser(auth);
  return {
    user: serializeUser(auth),
    riderProfile: serializeProfile(getRiderProfile(userId)),
  };
}

export function updateRiderAvailability(auth, input) {
  const userId = requireRiderUser(auth);
  const profile = input.availability === "online" ? requireVerifiedRider(userId) : getRiderProfile(userId);
  if (!profile) throw new HttpError(404, "Rider profile was not found.");
  const now = nowIso();
  const location = input.currentLocation || null;
  db.prepare(`
    UPDATE rider_profiles
    SET availability = ?,
        current_lat = COALESCE(?, current_lat),
        current_lng = COALESCE(?, current_lng),
        current_accuracy_meters = COALESCE(?, current_accuracy_meters),
        last_location_at = COALESCE(?, last_location_at),
        updated_at = ?
    WHERE user_id = ?
  `).run(
    input.availability,
    location?.lat ?? null,
    location?.lng ?? null,
    location?.accuracyMeters ?? null,
    location ? now : null,
    now,
    userId,
  );
  if (location) recordLocation(userId, location);
  return serializeProfile(getRiderProfile(userId));
}

export function updateRiderLocation(auth, input) {
  const userId = requireRiderUser(auth);
  requireVerifiedRider(userId);
  const location = input.currentLocation;
  const now = nowIso();
  db.prepare(`
    UPDATE rider_profiles
    SET current_lat = ?, current_lng = ?, current_accuracy_meters = ?, last_location_at = ?, updated_at = ?
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
    LIMIT 80
  `).all(userId);
  return {
    profile: serializeProfile(profile),
    stats: statsForRider(userId),
    assignments: rows.filter((row) => ACTIVE_ASSIGNMENT_STATUSES.has(row.status)).map((row) => serializeAssignment(row)),
    completed: rows.filter((row) => row.status === "delivered").map((row) => serializeAssignment(row, { revealPrivate: true })),
    notifications: listNotifications(userId),
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

export function listAvailableRiders(auth) {
  if (!auth || !["seller", "admin"].includes(auth.role)) throw new HttpError(403, "Only sellers or admins can view available riders.");
  return db.prepare(`
    SELECT users.id, users.name, users.phone, rider_profiles.*
    FROM rider_profiles
    JOIN users ON users.id = rider_profiles.user_id
    WHERE users.is_active = 1
      AND rider_profiles.verification_status = 'verified'
      AND rider_profiles.availability = 'online'
      AND rider_profiles.safety_status = 'normal'
    ORDER BY rider_profiles.rating_average DESC, rider_profiles.completed_deliveries DESC
    LIMIT 100
  `).all().map((row) => ({
    id: row.user_id,
    name: row.name || row.full_name,
    phone: row.phone,
    profile: serializeProfile(row),
  }));
}

function loadOrderForAssignment(auth, orderType, orderId) {
  const table = orderTable(orderType);
  const order = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(orderId);
  if (!order) throw new HttpError(404, "Order was not found.");
  if (auth.role === "seller" && order.seller_id !== (auth.user_id || auth.id)) {
    throw new HttpError(403, "You can only assign your own seller orders.");
  }
  if (order.payment_status !== "paid") {
    throw new HttpError(422, "This order cannot be assigned until platform payment is confirmed.");
  }
  return order;
}

export function createRiderAssignment(auth, input) {
  if (!auth || !["seller", "admin"].includes(auth.role)) throw new HttpError(403, "Only sellers or admins can assign deliveries.");
  const order = loadOrderForAssignment(auth, input.orderType, input.orderId);
  const rider = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'rider' AND is_active = 1").get(input.riderId);
  if (!rider) throw new HttpError(404, "Selected rider was not found.");
  const riderProfile = requireVerifiedRider(input.riderId);
  if (riderProfile.availability === "offline") throw new HttpError(422, "Selected rider is currently offline.");
  if (Number(input.packageValueKobo || order.total_kobo || 0) > Number(riderProfile.max_package_value_kobo || 0)) {
    throw new HttpError(422, "This package value is above the rider's current verification limit.");
  }

  const pickupCode = generateOtp();
  const deliveryCode = generateOtp();
  const now = nowIso();
  const id = createId("ras");
  transaction(() => {
    db.prepare(`
      INSERT INTO rider_assignments (
        id, order_id, order_type, rider_id, seller_id, buyer_id, store_id, listing_id,
        status, payment_status, payment_confirmed_at, pickup_code_hash, delivery_code_hash,
        pickup_address, pickup_lat, pickup_lng, delivery_address, delivery_lat, delivery_lng,
        seller_name, seller_phone, seller_whatsapp, buyer_name, buyer_phone, package_summary,
        package_value_kobo, delivery_fee_kobo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.orderId,
      input.orderType,
      input.riderId,
      order.seller_id,
      order.buyer_id,
      order.store_id || null,
      order.listing_id || null,
      now,
      hashOtp(pickupCode),
      hashOtp(deliveryCode),
      input.pickupPoint.address,
      input.pickupPoint.lat,
      input.pickupPoint.lng,
      input.deliveryPoint.address,
      input.deliveryPoint.lat,
      input.deliveryPoint.lng,
      input.sellerName || order.seller_name || "Seller",
      input.sellerPhone || "",
      phoneForWhatsapp(input.sellerWhatsApp || input.sellerPhone || ""),
      input.buyerName || order.buyer_name || "Buyer",
      input.buyerPhone || order.buyer_phone || "",
      input.packageSummary || order.note || "Gleank delivery package",
      input.packageValueKobo || order.total_kobo || 0,
      input.deliveryFeeKobo || order.delivery_fee_kobo || 0,
      now,
      now,
    );
    updateConnectedOrderAssignment(input.orderType, input.orderId, id, input.riderId, input.orderType === "used_order" ? "meetup_or_delivery" : "ready_for_delivery");
    createNotification({
      userId: input.riderId,
      type: "order",
      title: "New delivery assigned",
      body: `A paid Gleank delivery has been assigned to you for pickup at ${input.pickupPoint.address}.`,
      actionLabel: "View delivery",
      actionPath: `/rider/assignments/${id}`,
    });
  });

  return {
    assignment: serializeAssignment(db.prepare("SELECT * FROM rider_assignments WHERE id = ?").get(id)),
    sellerPickupCode: process.env.NODE_ENV === "production" ? undefined : pickupCode,
    buyerDeliveryCode: process.env.NODE_ENV === "production" ? undefined : deliveryCode,
    codeDeliveryNote: "In production, send sellerPickupCode to seller and buyerDeliveryCode to buyer through secure notification/SMS/email, not to the rider.",
  };
}

export function acceptRiderAssignment(auth, assignmentId) {
  const riderId = requireRiderUser(auth);
  const profile = requireVerifiedRider(riderId);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  if (row.status !== "assigned") throw new HttpError(422, "This delivery cannot be accepted now.");
  if (row.payment_status !== "paid") throw new HttpError(422, "Delivery is blocked until platform payment is confirmed.");
  if (profile.availability === "offline") throw new HttpError(422, "Go online before accepting a delivery.");
  if (Number(row.package_value_kobo || 0) > Number(profile.max_package_value_kobo || 0)) {
    throw new HttpError(422, "This package value is above your current rider verification limit.");
  }
  const now = nowIso();
  db.prepare("UPDATE rider_assignments SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?").run(now, now, assignmentId);
  db.prepare("UPDATE rider_profiles SET availability = 'busy', updated_at = ? WHERE user_id = ?").run(now, riderId);
  return serializeAssignment(assignmentByIdForRider(riderId, assignmentId));
}

async function googleRouteEstimate({ origin, destination }) {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || "";
  if (!apiKey) {
    if (env.isProduction || process.env.REQUIRE_GOOGLE_ROUTES === "true") {
      throw new HttpError(500, "Google Routes API key is not configured on the backend.");
    }
    const km = Number((distanceMeters(origin, destination) / 1000).toFixed(2));
    return {
      distanceKm: km,
      durationMinutes: Math.max(1, Math.ceil((km / 18) * 60)),
      trafficDurationMinutes: Math.max(1, Math.ceil((km / 14) * 60)),
      source: "haversine_development_fallback",
      rawResponse: {},
    };
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.staticDuration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "TWO_WHEELER",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      units: "METRIC",
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status || 502, body?.error?.message || "Google route calculation failed.", body);
  }
  const route = body?.routes?.[0];
  if (!route) throw new HttpError(502, "Google route calculation returned no route.");
  const distanceKm = Number(((Number(route.distanceMeters || 0)) / 1000).toFixed(2));
  const durationSeconds = Number(String(route.duration || "0s").replace("s", "")) || 0;
  const staticSeconds = Number(String(route.staticDuration || "0s").replace("s", "")) || durationSeconds;
  return {
    distanceKm,
    durationMinutes: Math.max(1, Math.ceil(staticSeconds / 60)),
    trafficDurationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    source: "google_routes_api",
    rawResponse: body,
  };
}

export async function getRouteEstimate(auth, assignmentId, query) {
  const riderId = requireRiderUser(auth);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  const origin = { lat: query.lat, lng: query.lng };
  const destination = query.target === "delivery"
    ? { lat: row.delivery_lat, lng: row.delivery_lng }
    : { lat: row.pickup_lat, lng: row.pickup_lng };
  if (destination.lat == null || destination.lng == null) throw new HttpError(422, "Delivery location coordinates are missing.");

  const result = await googleRouteEstimate({ origin, destination });
  const now = nowIso();
  db.prepare(`
    INSERT INTO rider_route_estimates (
      id, rider_id, assignment_id, target, origin_lat, origin_lng, destination_lat, destination_lng,
      distance_km, duration_minutes, traffic_duration_minutes, source, raw_response, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId("rre"), riderId, assignmentId, query.target, origin.lat, origin.lng,
    destination.lat, destination.lng, result.distanceKm, result.durationMinutes,
    result.trafficDurationMinutes, result.source, JSON.stringify(result.rawResponse || {}), now,
  );
  return {
    [query.target === "delivery" ? "routeToDelivery" : "routeToPickup"]: {
      origin,
      destination,
      distanceKm: result.distanceKm,
      durationMinutes: result.durationMinutes,
      trafficDurationMinutes: result.trafficDurationMinutes,
      source: result.source,
      calculatedAt: now,
    },
  };
}

export function verifyPickup(auth, assignmentId, input) {
  const riderId = requireRiderUser(auth);
  requireVerifiedRider(riderId);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  if (!PICKUP_ALLOWED_STATUSES.has(row.status)) throw new HttpError(422, "Pickup cannot be verified at this stage.");
  if (row.payment_status !== "paid") throw new HttpError(422, "Pickup is blocked until platform payment is confirmed.");
  if (!verifyOtp(input.sellerPickupCode, row.pickup_code_hash)) throw new HttpError(422, "Seller pickup OTP is incorrect.");
  requireProofLocationNear(input.proofLocation, { lat: row.pickup_lat, lng: row.pickup_lng }, "Pickup proof");

  const now = nowIso();
  transaction(() => {
    db.prepare(`
      UPDATE rider_assignments
      SET status = 'picked_up', pickup_proof_url = ?, pickup_proof_note = ?,
          pickup_proof_lat = ?, pickup_proof_lng = ?, pickup_proof_accuracy_meters = ?,
          pickup_proof_created_at = ?, picked_up_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      proofUrlFromInput(input), clean(input.proofNote, 500), input.proofLocation.lat,
      input.proofLocation.lng, input.proofLocation.accuracyMeters || 0, now, now, now, assignmentId,
    );
    updateConnectedOrderAssignment(row.order_type, row.order_id, assignmentId, riderId, row.order_type === "used_order" ? "meetup_or_delivery" : "out_for_delivery");
    createNotification({
      userId: row.seller_id,
      type: "order",
      title: "Package picked up",
      body: "The rider has verified pickup with OTP and GPS proof.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
  });

  return serializeAssignment(assignmentByIdForRider(riderId, assignmentId), { revealPrivate: true });
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
  if (!verifyOtp(input.customerDeliveryCode, row.delivery_code_hash)) throw new HttpError(422, "Buyer delivery OTP is incorrect.");
  requireProofLocationNear(input.proofLocation, { lat: row.delivery_lat, lng: row.delivery_lng }, "Delivery proof");

  const now = nowIso();
  transaction(() => {
    db.prepare(`
      UPDATE rider_assignments
      SET status = 'delivered', delivery_proof_url = ?, delivery_proof_note = ?,
          delivery_proof_lat = ?, delivery_proof_lng = ?, delivery_proof_accuracy_meters = ?,
          delivery_proof_created_at = ?, delivered_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      proofUrlFromInput(input), clean(input.proofNote, 500), input.proofLocation.lat,
      input.proofLocation.lng, input.proofLocation.accuracyMeters || 0, now, now, now, row.id,
    );
    updateConnectedOrderDelivered(row);
    db.prepare(`
      INSERT INTO rider_earnings (id, rider_id, assignment_id, order_id, order_type, amount_kobo, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?)
      ON CONFLICT(assignment_id) DO UPDATE SET status = 'available', updated_at = excluded.updated_at
    `).run(createId("reg"), riderId, row.id, row.order_id, row.order_type, row.delivery_fee_kobo || 0, now, now);
    db.prepare(`
      UPDATE rider_profiles
      SET availability = 'online', completed_deliveries = completed_deliveries + 1, updated_at = ?
      WHERE user_id = ?
    `).run(now, riderId);
    createNotification({
      userId: row.buyer_id,
      type: "order",
      title: "Order delivered",
      body: "Your Gleank order has been delivered and confirmed with OTP.",
      actionLabel: "View order",
      actionPath: row.order_type === "used_order" ? `/used-orders/${row.order_id}` : `/orders/${row.order_id}`,
    });
  });
  return serializeAssignment(assignmentByOrderForRider(riderId, orderId), { revealPrivate: true });
}

export function failAssignment(auth, assignmentId, input) {
  const riderId = requireRiderUser(auth);
  const row = assignmentByIdForRider(riderId, assignmentId);
  if (!row) throw new HttpError(404, "Delivery assignment was not found.");
  if (["delivered", "cancelled", "failed"].includes(row.status)) throw new HttpError(422, "This delivery is already closed.");
  const now = nowIso();
  transaction(() => {
    db.prepare("UPDATE rider_assignments SET status = 'failed', fail_reason = ?, failed_at = ?, updated_at = ? WHERE id = ?").run(clean(input.note, 500), now, now, assignmentId);
    db.prepare("UPDATE rider_profiles SET availability = 'online', updated_at = ? WHERE user_id = ?").run(now, riderId);
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
    body: "Gleank support has received your rider safety report.",
    actionLabel: "Open safety center",
    actionPath: "/rider/safety",
  });
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

export function cookieConfig() {
  return { sessionCookieName, sessionCookieOptions: sessionCookieOptions() };
}

export function adminListRiders(auth, status = "") {
  if (!auth || auth.role !== "admin") throw new HttpError(403, "Only admins can manage riders.");
  const params = [];
  let where = "WHERE users.role = 'rider'";
  if (status) {
    where += " AND rider_profiles.verification_status = ?";
    params.push(status);
  }
  return db.prepare(`
    SELECT users.id AS user_id, users.name, users.email, users.phone AS user_phone, users.is_active,
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
      isActive: Boolean(row.is_active),
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
  const now = nowIso();
  db.prepare(`
    UPDATE rider_profiles
    SET verification_status = ?,
        verification_note = ?,
        verification_level = COALESCE(?, verification_level),
        max_package_value_kobo = COALESCE(?, max_package_value_kobo),
        safety_status = COALESCE(?, safety_status),
        availability = CASE WHEN ? IN ('rejected','suspended') THEN 'offline' ELSE availability END,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    input.verificationStatus,
    clean(input.verificationNote, 500),
    input.verificationLevel ?? null,
    input.maxPackageValueKobo ?? null,
    input.safetyStatus ?? null,
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
