import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId, slugify } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import {
  createStore,
  findStoreByOwnerId,
  findStoreBySlug,
} from "../repositories/store.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { getPayoutAccount } from "./trust.service.js";
import {
  createMarketRequestForSeller,
  ensureSellerCategoryRequest,
} from "./market.service.js";
import {
  ensureVerificationCase,
  submitRequirementForUser,
} from "./verification.service.js";

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function booleanFromInput(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === "on" || value === "1";
}

function sellerTypeFromInput(value) {
  const next = clean(value || "campus", 40);
  if (next === "nearby") return "campus";
  return ["used_market", "campus", "local_market"].includes(next) ? next : "campus";
}

function jsonFromMarketRequest(input = {}) {
  const marketRequest = {
    marketName: clean(input.marketRequestName || input.requestedMarketName, 120),
    state: clean(input.marketRequestState, 80),
    cityArea: clean(input.marketRequestCityArea, 120),
    addressLandmark: clean(input.marketRequestAddressLandmark, 240),
    approximateLocation: clean(input.marketRequestApproximateLocation, 240),
    sells: clean(input.marketRequestSells, 240),
    shopDetails: clean(input.marketRequestShopDetails, 240),
    contactPhone: clean(input.marketRequestContactPhone || input.phone, 40),
  };

  return Object.fromEntries(Object.entries(marketRequest).filter(([, value]) => value));
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMappedNigeriaLocation(location = {}) {
  return (
    location.lat !== null &&
    location.lng !== null &&
    location.lat >= 4 &&
    location.lat <= 14.7 &&
    location.lng >= 2.5 &&
    location.lng <= 15
  );
}

function structuredLocationFromInput(input = {}, existing = {}, store = {}) {
  return {
    country: pickNext(input.country, existing?.country, store?.country || "Nigeria"),
    state: pickNext(input.state, existing?.state, store?.state),
    city: pickNext(input.city, existing?.city, store?.city),
    nearestCampus: pickNext(
      input.nearestCampus,
      existing?.nearest_campus,
      store?.nearest_campus || existing?.campus || store?.campus,
    ),
    nearestMarketplace: pickNext(
      input.nearestMarketplace,
      existing?.nearest_marketplace,
      store?.nearest_marketplace,
    ),
    street: pickNext(
      input.street,
      existing?.street,
      store?.street || input.pickupLocation || existing?.pickup_location || store?.pickup_location,
    ),
    placeId: pickNext(input.pickupPlaceId || input.placeId, existing?.pickup_place_id, store?.pickup_place_id),
    lat: numberOrNull(input.pickupLat ?? input.lat ?? store?.pickup_lat),
    lng: numberOrNull(input.pickupLng ?? input.lng ?? store?.pickup_lng),
    verifiedAt: pickNext(
      input.locationVerifiedAt,
      existing?.location_verified_at,
      store?.location_verified_at,
    ),
  };
}

function syncStructuredSellerLocation(userId, store, input, existing) {
  const location = structuredLocationFromInput(input, existing, store);
  const now = new Date().toISOString();
  const verifiedAt =
    isMappedNigeriaLocation(location) && location.placeId
      ? location.verifiedAt || now
      : null;

  db.prepare(`
    UPDATE seller_verification_profiles
    SET country = ?, state = ?, city = ?, nearest_campus = ?,
        nearest_marketplace = ?, street = ?, pickup_place_id = ?,
        location_verified_at = ?, updated_at = ?
    WHERE user_id = ?
  `).run(
    location.country, location.state, location.city, location.nearestCampus,
    location.nearestMarketplace, location.street, location.placeId,
    verifiedAt, now, userId,
  );

  db.prepare(`
    UPDATE stores
    SET country = ?, state = ?, city = ?, nearest_campus = ?,
        nearest_marketplace = ?, street = ?, pickup_place_id = ?,
        location_verified_at = ?, pickup_lat = ?, pickup_lng = ?, updated_at = ?
    WHERE id = ?
  `).run(
    location.country, location.state, location.city, location.nearestCampus,
    location.nearestMarketplace, location.street, location.placeId,
    verifiedAt, location.lat, location.lng, now, store.id,
  );

  const pickup = db.prepare(`
    SELECT id FROM seller_pickup_locations
    WHERE seller_id = ? AND is_default = 1
    LIMIT 1
  `).get(userId);
  const values = [
    store.id, location.street, location.city, location.nearestCampus,
    location.nearestMarketplace, location.country, location.state, location.city,
    location.nearestCampus, location.nearestMarketplace, location.street,
    location.placeId, verifiedAt, location.lat, location.lng,
    location.placeId ? "geocoded" : "manual", now,
  ];
  if (pickup) {
    db.prepare(`
      UPDATE seller_pickup_locations
      SET store_id = ?, address = ?, area = ?, campus = ?, market_name = ?,
          country = ?, state = ?, city = ?, nearest_campus = ?,
          nearest_marketplace = ?, street = ?, place_id = ?, verified_at = ?,
          lat = ?, lng = ?, source = ?, updated_at = ?
      WHERE id = ?
    `).run(...values, pickup.id);
  } else {
    db.prepare(`
      INSERT INTO seller_pickup_locations (
        id, seller_id, store_id, label, address, area, campus, market_name,
        country, state, city, nearest_campus, nearest_marketplace, street,
        place_id, verified_at, lat, lng, source, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, 'Default pickup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(createId("spl"), userId, ...values.slice(0, -1), now, now);
  }

  return { ...location, verifiedAt };
}

function uniqueStoreSlug(storeName) {
  const base = slugify(storeName || "gleank-store") || "gleank-store";
  let candidate = base;
  let suffix = 2;

  while (findStoreBySlug(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function defaultStoreName(user) {
  const firstName = clean(user?.name, 60).split(/\s+/)[0] || "Gleenc";
  return `${firstName} Store`;
}

function hasActiveSellerSubscription(userId) {
  const subscription = db
    .prepare("SELECT status, current_period_end FROM seller_subscriptions WHERE user_id = ?")
    .get(userId);

  if (!subscription || subscription.status !== "active") return false;
  if (!subscription.current_period_end) return false;

  return new Date(subscription.current_period_end).getTime() > Date.now();
}

const SELLER_ONBOARDING_STEPS = [
  {
    key: "store_details",
    step: 1,
    label: "Store, Contact & Pickup Location",
  },
  {
    key: "documents_business",
    step: 2,
    label: "Identity, Face & Seller Trust",
  },
  {
    key: "review_submit",
    step: 3,
    label: "Payout, Agreement & Final Review",
  },
];

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function uniqueArray(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function clampStep(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(SELLER_ONBOARDING_STEPS.length, Math.max(1, Math.round(parsed)));
}

function firstIncompleteStep(completedSteps) {
  const completed = new Set(completedSteps);
  const pending = SELLER_ONBOARDING_STEPS.find((item) => !completed.has(item.key));
  return pending?.step || SELLER_ONBOARDING_STEPS.length;
}

function hasText(value, minLength = 1) {
  return clean(value, 1500).length >= minLength;
}

function sellerStoreDetailsComplete(row, store) {
  return Boolean(
    row?.seller_type &&
      hasText(store?.name, 2) &&
      hasText(store?.category || row?.store_category || "General", 2),
  );
}

function sellerLocationMissing(row, store = {}) {
  const sellerType = sellerTypeFromInput(row?.seller_type);
  const marketRequest = parseJsonObject(row?.market_request_json);
  const missing = [];

  if (!hasText(row?.country)) missing.push("Country");
  if (!hasText(row?.state)) missing.push("State");
  if (!hasText(row?.city)) missing.push("City");
  if (!hasText(row?.nearest_campus)) missing.push("Nearest campus");
  if (!hasText(row?.nearest_marketplace)) missing.push("Nearest marketplace");
  if (!hasText(row?.street)) missing.push("Street address");
  if (!hasText(row?.pickup_place_id) || !row?.location_verified_at) {
    missing.push("Confirmed map pin");
  }
  if (!isMappedNigeriaLocation({ lat: numberOrNull(store?.pickup_lat), lng: numberOrNull(store?.pickup_lng) })) {
    missing.push("Mapped pickup location within Nigeria");
  }

  if (sellerType === "campus") {
    if (!hasText(row?.campus)) missing.push("Campus");
    if (!hasText(row?.pickup_location)) missing.push("Campus pickup point");
    if (!hasText(row?.nearest_landmark)) missing.push("Nearest landmark");
  }

  if (sellerType === "local_market") {
    if (!row?.market_id && !Object.keys(marketRequest).length) {
      missing.push("Approved market or market approval request");
    }
    if (!hasText(row?.shop_stall_number)) missing.push("Shop/stall number");
    if (!hasText(row?.shop_section)) missing.push("Line/section/block");
    if (!hasText(row?.nearest_landmark)) missing.push("Market landmark");
    if (!hasText(row?.pickup_location)) missing.push("Pickup point");
    if (!hasText(row?.location_area)) missing.push("Area/location note");
  }

  if (sellerType === "used_market") {
    if (!hasText(row?.location_area)) missing.push("Area/location");
    if (!hasText(row?.pickup_location)) missing.push("Pickup preference");
    if (!hasText(row?.nearest_landmark)) missing.push("Nearest landmark");
  }

  return missing;
}

function buildSellerVerificationProgress(row) {
  const user = row?.user_id ? findUserById(row.user_id) : null;
  const store = row?.user_id ? findStoreByOwnerId(row.user_id) : null;
  const missingRequirements = [];
  const completedSteps = [];
  const savedCompletedSteps = parseJsonArray(row?.completed_steps_json);
  const savedLockedSteps = parseJsonArray(row?.locked_steps_json);

  if (!user?.email_verified) missingRequirements.push("Email verification");
  if (!user?.phone_verified && !hasText(row?.phone) && !hasText(user?.phone)) {
    missingRequirements.push("Phone/contact details");
  }
  if (!row?.seller_type) missingRequirements.push("Seller type");
  const locationMissing = sellerLocationMissing(row, store);
  const contactReady =
    user?.phone_verified || hasText(row?.phone) || hasText(user?.phone);

  if (
    !sellerStoreDetailsComplete(row, store) ||
    locationMissing.length ||
    !contactReady
  ) {
    missingRequirements.push("Store name and primary category");
  } else {
    completedSteps.push("store_details");
  }

  if (locationMissing.length) {
    missingRequirements.push(...locationMissing);
  }

  if (!row?.face_verified) missingRequirements.push("Face verification");

  if (!row?.identity_proof_url) missingRequirements.push("Identity document");
  if (!hasText(row?.business_description, 20)) {
    missingRequirements.push("Business description of at least 20 characters");
  }
  if (!row?.agreement_accepted) missingRequirements.push("Seller agreement");

  if (
    row?.face_verified &&
    row?.identity_proof_url &&
    hasText(row?.business_description, 20) &&
    row?.agreement_accepted
  ) {
    completedSteps.push("documents_business");
  }

  const uniqueCompletedSteps = uniqueArray([...savedCompletedSteps, ...completedSteps]);
  const canSubmit =
    missingRequirements.length === 0 &&
    !["pending_verification", "verified", "suspended"].includes(row?.status || "draft");

  if (
    canSubmit ||
    ["pending_verification", "verified"].includes(row?.status || "") ||
    row?.submitted_at
  ) {
    uniqueCompletedSteps.push("review_submit");
  }

  let lockedSteps = uniqueArray(savedLockedSteps);

  if (["pending_verification", "verified"].includes(row?.status || "")) {
    lockedSteps = SELLER_ONBOARDING_STEPS.map((item) => item.key);
  }

  if (row?.admin_review_status === "resubmission_requested") {
    const currentStepKey = SELLER_ONBOARDING_STEPS.find(
      (item) => item.step === clampStep(row.current_step, firstIncompleteStep(uniqueCompletedSteps)),
    )?.key;
    lockedSteps = lockedSteps.filter((key) => key !== currentStepKey);
  }

  const currentStep = ["pending_verification", "verified"].includes(row?.status || "")
    ? 3
    : clampStep(row?.current_step, firstIncompleteStep(uniqueCompletedSteps));

  return {
    currentStep,
    completedSteps: uniqueArray(uniqueCompletedSteps),
    lockedSteps: uniqueArray(lockedSteps),
    canSubmit,
    missingRequirements: uniqueArray(missingRequirements),
    adminReviewStatus:
      row?.admin_review_status ||
      (row?.status === "pending_verification" ? "pending" : "not_started"),
  };
}

function syncSellerVerificationProgress(userId, preferredStep) {
  const row = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);

  if (!row) return null;

  const progress = buildSellerVerificationProgress(row);
  const currentStep = ["pending_verification", "verified"].includes(row.status)
    ? 3
    : clampStep(preferredStep, progress.currentStep);
  const adminReviewStatus =
    row.admin_review_status ||
    (row.status === "pending_verification" ? "pending" : "not_started");

  db.prepare(`
    UPDATE seller_verification_profiles
    SET current_step = ?,
        completed_steps_json = ?,
        locked_steps_json = ?,
        admin_review_status = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    currentStep,
    JSON.stringify(progress.completedSteps),
    JSON.stringify(progress.lockedSteps),
    adminReviewStatus,
    new Date().toISOString(),
    userId,
  );

  return getSellerVerification(userId);
}

export function ensureSellerStoreForUser(userId, input = {}) {
  const existingStore = findStoreByOwnerId(userId);
  const user = findUserById(userId);
  const now = new Date().toISOString();

  if (!user) throw new HttpError(404, "Account was not found.");
  if (user.role !== "seller") {
    throw new HttpError(
      403,
      "Seller onboarding requires a seller account. Gleenc will not convert buyer or rider accounts into sellers automatically.",
    );
  }

  if (existingStore) {
    return existingStore;
  }

  const storeName = clean(
    input.storeName || input.businessName || defaultStoreName(user),
    100,
  );

  if (storeName.length < 2) {
    throw new HttpError(422, "Enter a store name for your seller profile.");
  }

  const store = createStore({
    id: createId("sto"),
    ownerId: userId,
    slug: uniqueStoreSlug(storeName),
    name: storeName,
    description: clean(input.businessDescription, 1500),
    campus: clean(input.sellerCampus || input.campus || user.campus, 80),
    category: clean(input.storeCategory || input.category || "General", 80),
    phone: clean(input.sellerPhone || input.phone || user.phone, 30),
    sellerType: sellerTypeFromInput(input.sellerType),
    operatingHours: clean(input.operatingHours, 160),
    whatsappPhone: clean(input.whatsappPhone || input.sellerWhatsapp || input.phone || user.phone, 30),
    allowRiderWhatsAppContact: booleanFromInput(input.allowRiderWhatsAppContact, true),
    locationArea: clean(input.locationArea || input.areaLocation || input.campus || user.campus, 160),
    pickupLocation: clean(input.pickupLocation, 180),
    nearestLandmark: clean(input.nearestLandmark || input.landmark, 160),
    marketId: clean(input.marketId, 140) || null,
    shopStallNumber: clean(input.shopStallNumber || input.stallNumber, 80),
    shopSection: clean(input.shopSection, 120),
    pickupLat: numberOrNull(input.pickupLat),
    pickupLng: numberOrNull(input.pickupLng),
    status: "active",
    verified: false,
    createdAt: now,
    updatedAt: now,
  });

  return store;
}

export function serializeSellerVerification(row) {
  if (!row) {
    return {
      id: "",
      status: "draft",
      isComplete: false,
      currentStep: 1,
      completedSteps: [],
      lockedSteps: [],
      canSubmit: false,
      missingRequirements: ["Seller setup has not started"],
      adminReviewStatus: "not_started",
      fullName: "",
      phone: "",
      campus: "",
      country: "Nigeria",
      state: "",
      city: "",
      nearestCampus: "",
      nearestMarketplace: "",
      street: "",
      pickupPlaceId: "",
      locationVerifiedAt: null,
      sellerType: "campus",
      locationArea: "",
      pickupLocation: "",
      nearestLandmark: "",
      marketId: null,
      marketRequest: {},
      shopStallNumber: "",
      shopSection: "",
      whatsappPhone: "",
      allowRiderWhatsAppContact: true,
      operatingHours: "",
      studentId: "",
      identityProofUrl: null,
      faceVerified: false,
      faceProvider: "",
      faceReference: "",
      faceVerifiedAt: null,
      businessDescription: "",
      agreementAccepted: false,
      note: "",
      submittedAt: null,
      submittedForReviewAt: null,
      resubmissionRequestedAt: null,
      verifiedAt: null,
    };
  }

  const progress = buildSellerVerificationProgress(row);
  const isComplete = Boolean(
    row.full_name &&
      row.phone &&
      (row.seller_type !== "campus" || row.campus) &&
      (row.seller_type !== "local_market" || row.market_id || row.market_request_json) &&
      row.country && row.state && row.city && row.nearest_campus &&
      row.nearest_marketplace && row.street && row.location_verified_at &&
      row.face_verified &&
      row.business_description &&
      row.agreement_accepted,
  );

  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id || null,
    fullName: row.full_name,
    phone: row.phone,
    campus: row.campus,
    country: row.country || "Nigeria",
    state: row.state || "",
    city: row.city || "",
    nearestCampus: row.nearest_campus || row.campus || "",
    nearestMarketplace: row.nearest_marketplace || "",
    street: row.street || row.pickup_location || "",
    pickupPlaceId: row.pickup_place_id || "",
    locationVerifiedAt: row.location_verified_at || null,
    sellerType: row.seller_type || "campus",
    locationArea: row.location_area || "",
    pickupLocation: row.pickup_location || "",
    nearestLandmark: row.nearest_landmark || "",
    marketId: row.market_id || null,
    marketRequest: (() => {
      try {
        return JSON.parse(row.market_request_json || "{}");
      } catch {
        return {};
      }
    })(),
    shopStallNumber: row.shop_stall_number || "",
    shopSection: row.shop_section || "",
    whatsappPhone: row.whatsapp_phone || "",
    allowRiderWhatsAppContact: row.allow_rider_whatsapp_contact !== 0,
    operatingHours: row.operating_hours || "",
    studentId: row.student_id,
    identityProofUrl: row.identity_proof_url || null,
    faceVerified: Boolean(row.face_verified),
    faceProvider: row.face_provider || "",
    faceReference: row.face_reference || "",
    faceVerifiedAt: row.face_verified_at || null,
    businessDescription: row.business_description,
    agreementAccepted: Boolean(row.agreement_accepted),
    status: row.status,
    note: row.note || "",
    submittedAt: row.submitted_at || null,
    currentStep: progress.currentStep,
    completedSteps: progress.completedSteps,
    lockedSteps: progress.lockedSteps,
    canSubmit: progress.canSubmit,
    missingRequirements: progress.missingRequirements,
    adminReviewStatus: progress.adminReviewStatus,
    submittedForReviewAt: row.submitted_for_review_at || row.submitted_at || null,
    resubmissionRequestedAt: row.resubmission_requested_at || null,
    verifiedAt: row.verified_at || null,
    isComplete,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getSellerVerification(userId) {
  const row = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);
  return serializeSellerVerification(row);
}

function pickNext(inputValue, existingValue, fallback = "") {
  const value = clean(inputValue, 1500);
  return value || existingValue || fallback;
}

export function updateSellerOnboardingDraft(userId, input = {}, identityProofUrl = null) {
  const existing = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);

  if (
    existing &&
    ["pending_verification", "verified", "suspended"].includes(existing.status) &&
    existing.admin_review_status !== "resubmission_requested"
  ) {
    throw new HttpError(
      403,
      "Your seller verification is locked while admin review is active.",
    );
  }

  const store = ensureSellerStoreForUser(userId, input);
  const now = new Date().toISOString();
  const sellerType = sellerTypeFromInput(input.sellerType || existing?.seller_type || store.seller_type);
  const marketRequest = Object.keys(jsonFromMarketRequest(input)).length
    ? jsonFromMarketRequest(input)
    : (() => {
        try {
          return JSON.parse(existing?.market_request_json || "{}");
        } catch {
          return {};
        }
      })();

  const next = {
    sellerType,
    storeName: pickNext(input.storeName || input.businessName, store.name, defaultStoreName(findUserById(userId))),
    storeCategory: pickNext(input.storeCategory || input.category, store.category, "General"),
    fullName: pickNext(input.fullName || input.name, existing?.full_name, findUserById(userId)?.name || ""),
    phone: pickNext(input.sellerPhone || input.phone, existing?.phone, store.phone),
    campus: pickNext(input.sellerCampus || input.campus, existing?.campus, store.campus),
    locationArea: pickNext(input.locationArea || input.areaLocation, existing?.location_area, store.location_area || store.campus),
    pickupLocation: pickNext(input.pickupLocation, existing?.pickup_location, store.pickup_location),
    nearestLandmark: pickNext(input.nearestLandmark || input.landmark, existing?.nearest_landmark, store.nearest_landmark),
    marketId: pickNext(input.marketId, existing?.market_id, store.market_id || ""),
    marketRequest,
    shopStallNumber: pickNext(input.shopStallNumber || input.stallNumber, existing?.shop_stall_number, store.shop_stall_number),
    shopSection: pickNext(input.shopSection, existing?.shop_section, store.shop_section),
    whatsappPhone: pickNext(input.whatsappPhone || input.sellerWhatsapp, existing?.whatsapp_phone, store.whatsapp_phone || store.phone),
    allowRiderWhatsAppContact: booleanFromInput(
      input.allowRiderWhatsAppContact,
      existing ? existing.allow_rider_whatsapp_contact !== 0 : store.allow_rider_whatsapp_contact !== 0,
    ),
    operatingHours: pickNext(input.operatingHours, existing?.operating_hours, store.operating_hours),
    studentId: pickNext(input.studentId, existing?.student_id, ""),
    identityProofUrl: identityProofUrl || existing?.identity_proof_url || null,
    faceVerified: booleanFromInput(
      input.faceVerified,
      existing ? existing.face_verified !== 0 : false,
    ),
    faceProvider: pickNext(input.faceProvider, existing?.face_provider, env.livenessProvider),
    faceReference: pickNext(input.faceReference || input.livenessReference, existing?.face_reference, ""),
    businessDescription: pickNext(input.businessDescription, existing?.business_description, store.description),
    agreementAccepted: booleanFromInput(
      input.agreementAccepted,
      existing ? existing.agreement_accepted !== 0 : false,
    ),
  };
  const structuredLocation = structuredLocationFromInput(input, existing, store);

  transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE seller_verification_profiles
        SET store_id = ?, seller_type = ?, full_name = ?, phone = ?, campus = ?,
            location_area = ?, pickup_location = ?, nearest_landmark = ?,
            market_id = ?, market_request_json = ?, shop_stall_number = ?,
            shop_section = ?, whatsapp_phone = ?, allow_rider_whatsapp_contact = ?,
            operating_hours = ?, student_id = ?, identity_proof_url = ?,
            face_verified = ?, face_provider = ?, face_reference = ?,
            face_verified_at = ?, business_description = ?, agreement_accepted = ?,
            status = CASE
              WHEN status IN ('verified', 'suspended', 'pending_verification') THEN status
              ELSE 'draft'
            END,
            updated_at = ?
        WHERE user_id = ?
      `).run(
        store.id,
        next.sellerType,
        next.fullName,
        next.phone,
        next.campus,
        next.locationArea,
        next.pickupLocation,
        next.nearestLandmark,
        next.marketId || null,
        JSON.stringify(next.marketRequest),
        next.shopStallNumber,
        next.shopSection,
        next.whatsappPhone,
        next.allowRiderWhatsAppContact ? 1 : 0,
        next.operatingHours,
        next.studentId,
        next.identityProofUrl,
        next.faceVerified ? 1 : 0,
        next.faceProvider,
        next.faceReference,
        next.faceVerified ? existing?.face_verified_at || now : null,
        next.businessDescription,
        next.agreementAccepted ? 1 : 0,
        now,
        userId,
      );
    } else {
      db.prepare(`
        INSERT INTO seller_verification_profiles (
          id, user_id, store_id, seller_type, full_name, phone, campus,
          location_area, pickup_location, nearest_landmark, market_id,
          market_request_json, shop_stall_number, shop_section, whatsapp_phone,
          allow_rider_whatsapp_contact, operating_hours, student_id,
          identity_proof_url, face_verified, face_provider, face_reference,
          face_verified_at, business_description, agreement_accepted,
          status, note, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          'draft', '', ?, ?
        )
      `).run(
        createId("svp"),
        userId,
        store.id,
        next.sellerType,
        next.fullName,
        next.phone,
        next.campus,
        next.locationArea,
        next.pickupLocation,
        next.nearestLandmark,
        next.marketId || null,
        JSON.stringify(next.marketRequest),
        next.shopStallNumber,
        next.shopSection,
        next.whatsappPhone,
        next.allowRiderWhatsAppContact ? 1 : 0,
        next.operatingHours,
        next.studentId,
        next.identityProofUrl,
        next.faceVerified ? 1 : 0,
        next.faceProvider,
        next.faceReference,
        next.faceVerified ? now : null,
        next.businessDescription,
        next.agreementAccepted ? 1 : 0,
        now,
        now,
      );
    }

    db.prepare(`
      UPDATE stores
      SET name = ?, description = ?, category = ?, seller_type = ?, campus = ?,
          location_area = ?, pickup_location = ?, nearest_landmark = ?,
          market_id = ?, shop_stall_number = ?, shop_section = ?,
          whatsapp_phone = ?, allow_rider_whatsapp_contact = ?,
          operating_hours = ?, phone = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.storeName,
      next.businessDescription || store.description || "",
      next.storeCategory,
      next.sellerType,
      next.campus,
      next.locationArea,
      next.pickupLocation,
      next.nearestLandmark,
      next.marketId || null,
      next.shopStallNumber,
      next.shopSection,
      next.whatsappPhone,
      next.allowRiderWhatsAppContact ? 1 : 0,
      next.operatingHours,
      next.phone,
      now,
      store.id,
    );

    if (next.sellerType === "local_market" && Object.keys(next.marketRequest).length) {
      createMarketRequestForSeller(userId, {
        ...next.marketRequest,
        marketName: next.marketRequest.marketName,
        state: next.marketRequest.state,
        cityArea: next.marketRequest.cityArea,
        addressLandmark: next.marketRequest.addressLandmark,
        approximateLocation: next.marketRequest.approximateLocation,
        whatSells: next.marketRequest.sells || next.storeCategory,
        shopDetails: next.marketRequest.shopDetails || next.shopStallNumber,
        contactPhone: next.marketRequest.contactPhone || next.phone,
      });
    }

    if (next.sellerType === "local_market") {
      ensureSellerCategoryRequest({
        sellerId: userId,
        storeId: store.id,
        marketId: next.sellerType === "local_market" ? next.marketId || null : null,
        categoryName: next.storeCategory,
      });
    }
  });

  syncStructuredSellerLocation(userId, store, {
    ...input,
    ...structuredLocation,
    pickupPlaceId: structuredLocation.placeId,
    pickupLat: structuredLocation.lat,
    pickupLng: structuredLocation.lng,
    locationVerifiedAt: structuredLocation.verifiedAt,
  }, existing);

  return syncSellerVerificationProgress(
    userId,
    input.nextStep || input.currentStep || existing?.current_step || 1,
  );
}

function submitSellerRequirementIfReviewable(
  userId,
  sellerType,
  code,
  input,
) {
  const caseRow = ensureVerificationCase(userId, "seller", { sellerType });
  const requirement = db
    .prepare(
      "SELECT * FROM verification_requirements WHERE case_id = ? AND code = ?",
    )
    .get(caseRow.id, code);

  if (!requirement) return null;
  if (["submitted", "under_review"].includes(requirement.status)) return null;

  if (requirement.status === "approved") {
    const reopen = db
      .prepare(`
        SELECT status
        FROM verification_resubmission_requests
        WHERE requirement_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(requirement.id);
    if (reopen?.status !== "approved") return null;
  }

  return submitRequirementForUser(userId, "seller", code, input);
}

function sellerStagePayload(userId) {
  const profile = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);
  const store = findStoreByOwnerId(userId);
  const payout = getPayoutAccount(userId);
  const marketRequest = parseJsonObject(profile?.market_request_json);
  const sellerType = sellerTypeFromInput(
    profile?.seller_type || store?.seller_type || "campus",
  );

  return {
    profile,
    store,
    payout,
    sellerType,
    shared: {
      sellerType,
      storeName: store?.name || "",
      storeCategory: store?.category || "General",
      fullName: profile?.full_name || "",
      phone: profile?.phone || store?.phone || "",
      campus: profile?.campus || store?.campus || "",
      locationArea: profile?.location_area || store?.location_area || "",
      pickupLocation:
        profile?.pickup_location || store?.pickup_location || "",
      nearestLandmark:
        profile?.nearest_landmark || store?.nearest_landmark || "",
      marketId: profile?.market_id || store?.market_id || "",
      marketSelection:
        profile?.market_id ||
        store?.market_id ||
        marketRequest.marketName ||
        marketRequest.cityArea ||
        "",
      shopStallNumber:
        profile?.shop_stall_number || store?.shop_stall_number || "",
      shopSection: profile?.shop_section || store?.shop_section || "",
      whatsappPhone:
        profile?.whatsapp_phone || store?.whatsapp_phone || "",
      operatingHours:
        profile?.operating_hours || store?.operating_hours || "",
      businessDescription:
        profile?.business_description || store?.description || "",
      agreementAccepted: Boolean(profile?.agreement_accepted),
    },
  };
}

function submitSellerVerificationStageRequirements(userId, stage) {
  const stageNumber = Math.min(3, Math.max(1, Number(stage || 1)));
  const { profile, payout, sellerType, shared } = sellerStagePayload(userId);
  const progress = buildSellerVerificationProgress(profile);

  if (
    stageNumber === 1 &&
    !progress.completedSteps.includes("store_details")
  ) {
    throw new HttpError(
      422,
      "Complete the store, contact, and pickup-location details before submitting Stage 1.",
    );
  }

  if (
    stageNumber === 2 &&
    !progress.completedSteps.includes("documents_business")
  ) {
    throw new HttpError(
      422,
      "Complete face verification, identity document, business description, and seller agreement before submitting Stage 2.",
    );
  }

  if (stageNumber === 3 && !payout?.isComplete) {
    throw new HttpError(
      422,
      "Save a complete payout account before submitting Stage 3.",
    );
  }

  if (stageNumber === 1) {
    submitSellerRequirementIfReviewable(
      userId,
      sellerType,
      "seller_store_identity",
      { payload: shared, provider: "seller_onboarding_stage_1" },
    );
    submitSellerRequirementIfReviewable(
      userId,
      sellerType,
      "seller_pickup_information",
      { payload: shared, provider: "seller_onboarding_stage_1" },
    );

    if (sellerType === "local_market") {
      submitSellerRequirementIfReviewable(
        userId,
        sellerType,
        "seller_market_selection",
        { payload: shared, provider: "seller_onboarding_stage_1" },
      );
    }
  }

  if (stageNumber === 2) {
    submitSellerRequirementIfReviewable(
      userId,
      sellerType,
      "seller_identity_selfie",
      {
        payload: {
          faceVerified: Boolean(profile?.face_verified),
          faceProvider: profile?.face_provider || "seller_onboarding",
          faceReference: profile?.face_reference || "",
        },
        documentUrls: [profile?.identity_proof_url].filter(Boolean),
        provider: profile?.face_provider || "seller_onboarding",
        providerReference: profile?.face_reference || "",
        providerStatus: profile?.face_verified ? "verified" : "submitted",
      },
    );

    if (sellerType === "campus") {
      submitSellerRequirementIfReviewable(
        userId,
        sellerType,
        "seller_campus_identity",
        {
          payload: {
            campus: shared.campus,
            studentId: profile?.student_id || "",
          },
          documentUrls: [profile?.identity_proof_url].filter(Boolean),
          provider: "seller_onboarding_stage_2",
        },
      );
    }

    if (sellerType === "local_market") {
      submitSellerRequirementIfReviewable(
        userId,
        sellerType,
        "seller_shop_identity",
        {
          payload: shared,
          documentUrls: [profile?.identity_proof_url].filter(Boolean),
          provider: "seller_onboarding_stage_2",
        },
      );
    }

    if (sellerType === "used_market") {
      submitSellerRequirementIfReviewable(
        userId,
        sellerType,
        "seller_used_item_authenticity",
        {
          payload: shared,
          documentUrls: [profile?.identity_proof_url].filter(Boolean),
          provider: "seller_onboarding_stage_2",
        },
      );
    }
  }

  if (stageNumber === 3) {
    submitSellerRequirementIfReviewable(
      userId,
      sellerType,
      "seller_payout_account",
      {
        payload: {
          bankName: payout.bankName,
          accountName: payout.accountName,
          accountLast4: payout.accountLast4,
        },
        provider: "seller_onboarding_stage_3",
      },
    );
    submitSellerRequirementIfReviewable(
      userId,
      sellerType,
      "seller_operational_agreement",
      { payload: shared, provider: "seller_onboarding_stage_3" },
    );
  }

  db.prepare(`
    UPDATE seller_verification_profiles
    SET current_step = ?,
        admin_review_status = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    stageNumber,
    `stage_${stageNumber}_pending`,
    new Date().toISOString(),
    userId,
  );

  return getSellerVerification(userId);
}

export function submitSellerVerificationStage(
  userId,
  stage,
  input = {},
  identityProofUrl = null,
) {
  updateSellerOnboardingDraft(userId, input, identityProofUrl);
  return submitSellerVerificationStageRequirements(userId, stage);
}

export function upsertSellerVerification(userId, input, identityProofUrl = null) {
  const store = ensureSellerStoreForUser(userId, input);
  const user = findUserById(userId);

  const existing = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);
  const submittedMarketRequest = jsonFromMarketRequest(input);
  const existingMarketRequest = parseJsonObject(existing?.market_request_json);
  const marketRequest = Object.keys(submittedMarketRequest).length
    ? submittedMarketRequest
    : existingMarketRequest;
  const sellerType = sellerTypeFromInput(
    input.sellerType || existing?.seller_type || store.seller_type,
  );

  const next = {
    sellerType,
    storeName: clean(input.storeName || input.businessName || store.name || defaultStoreName(user), 100),
    storeCategory: clean(input.storeCategory || input.category || store.category || "General", 80),
    fullName: pickNext(input.fullName || input.name, existing?.full_name, user?.name || ""),
    phone: pickNext(input.sellerPhone || input.phone, existing?.phone, store.phone || user?.phone || ""),
    campus: pickNext(input.sellerCampus || input.campus, existing?.campus, store.campus || user?.campus || ""),
    locationArea: pickNext(input.locationArea || input.areaLocation, existing?.location_area, store.location_area || store.campus || ""),
    pickupLocation: pickNext(input.pickupLocation, existing?.pickup_location, store.pickup_location || ""),
    nearestLandmark: pickNext(input.nearestLandmark || input.landmark, existing?.nearest_landmark, store.nearest_landmark || ""),
    marketId: pickNext(input.marketId, existing?.market_id, store.market_id || ""),
    marketRequest,
    shopStallNumber: pickNext(input.shopStallNumber || input.stallNumber, existing?.shop_stall_number, store.shop_stall_number || ""),
    shopSection: pickNext(input.shopSection, existing?.shop_section, store.shop_section || ""),
    whatsappPhone: pickNext(input.whatsappPhone || input.sellerWhatsapp, existing?.whatsapp_phone, store.whatsapp_phone || input.phone || user?.phone || ""),
    allowRiderWhatsAppContact: booleanFromInput(input.allowRiderWhatsAppContact, true),
    operatingHours: pickNext(input.operatingHours, existing?.operating_hours, store.operating_hours || ""),
    studentId: pickNext(input.studentId, existing?.student_id, ""),
    identityProofUrl: identityProofUrl || existing?.identity_proof_url || null,
    faceVerified:
      input.faceVerified === true ||
      input.faceVerified === "true" ||
      input.faceVerified === "on" ||
      input.faceVerified === "1" ||
      Boolean(existing?.face_verified),
    faceProvider: clean(input.faceProvider || existing?.face_provider || env.livenessProvider, 80),
    faceReference: clean(
      input.faceReference ||
        input.livenessReference ||
      existing?.face_reference ||
      `local-face-${Date.now()}`,
      160,
    ),
    businessDescription: pickNext(input.businessDescription, existing?.business_description, store.description || ""),
    agreementAccepted: booleanFromInput(
      input.agreementAccepted,
      existing ? existing.agreement_accepted !== 0 : false,
    ),
  };
  const structuredLocation = structuredLocationFromInput(input, existing, store);

  if (!user?.email_verified) {
    throw new HttpError(422, "Verify your email before submitting seller verification.");
  }

  if (!next.storeName || !next.storeCategory) {
    throw new HttpError(422, "Complete seller type, store name, and primary category.");
  }

  if (!next.fullName || !next.phone || !next.sellerType) {
    throw new HttpError(422, "Complete seller name, phone, and seller type.");
  }

  if (
    !structuredLocation.country ||
    !structuredLocation.state ||
    !structuredLocation.city ||
    !structuredLocation.nearestCampus ||
    !structuredLocation.nearestMarketplace ||
    !structuredLocation.street ||
    !structuredLocation.placeId ||
    structuredLocation.lat === null ||
    structuredLocation.lng === null
  ) {
    throw new HttpError(
      422,
      "Complete country, state, city, nearest campus, nearest marketplace and street, then confirm the address map pin.",
    );
  }

  if (
    structuredLocation.lat < 4 ||
    structuredLocation.lat > 14.7 ||
    structuredLocation.lng < 2.5 ||
    structuredLocation.lng > 15
  ) {
    throw new HttpError(
      422,
      "Confirm a mapped pickup location within Nigeria before submitting seller verification.",
    );
  }

  if (next.sellerType === "campus" && (!next.campus || !next.pickupLocation || !next.nearestLandmark)) {
    throw new HttpError(422, "Campus sellers must complete campus, campus pickup point, and nearest landmark.");
  }

  if (
    next.sellerType === "local_market" &&
    ((!next.marketId && !Object.keys(next.marketRequest).length) ||
      !next.shopStallNumber ||
      !next.shopSection ||
      !next.nearestLandmark ||
      !next.pickupLocation ||
      !next.locationArea)
  ) {
    throw new HttpError(422, "Complete market, stall, section, landmark, pickup point, and area details.");
  }

  if (
    next.sellerType === "used_market" &&
    (!next.locationArea || !next.pickupLocation || !next.nearestLandmark)
  ) {
    throw new HttpError(422, "Complete used market location, pickup preference, and nearest landmark.");
  }

  if (!next.faceVerified) {
    throw new HttpError(422, "Complete live face verification before submitting seller verification.");
  }

  if (!next.identityProofUrl) {
    throw new HttpError(422, "Upload a clear seller identity document before submitting verification.");
  }

  if (next.businessDescription.length < 20) {
    throw new HttpError(422, "Describe what your store sells in at least 20 characters.");
  }

  if (!next.agreementAccepted) {
    throw new HttpError(422, "Accept the seller agreement before submitting verification.");
  }

  const now = new Date().toISOString();
  const status = "pending_verification";
  const verifiedAt = null;
  const note =
    "Seller verification Stage 3 is under admin review. Stage 2 approval already controls product-upload access.";

  transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE seller_verification_profiles
        SET store_id = ?, seller_type = ?, full_name = ?, phone = ?, campus = ?,
            location_area = ?, pickup_location = ?, nearest_landmark = ?,
            market_id = ?, market_request_json = ?, shop_stall_number = ?,
            shop_section = ?, whatsapp_phone = ?, allow_rider_whatsapp_contact = ?,
            operating_hours = ?, student_id = ?,
            identity_proof_url = ?, face_verified = ?, face_provider = ?,
            face_reference = ?, face_verified_at = ?, business_description = ?,
            agreement_accepted = ?, status = ?, note = ?, submitted_at = ?,
            verified_at = ?, updated_at = ?
        WHERE user_id = ?
      `).run(
        store.id,
        next.sellerType,
        next.fullName,
        next.phone,
        next.campus,
        next.locationArea,
        next.pickupLocation,
        next.nearestLandmark,
        next.marketId || null,
        JSON.stringify(next.marketRequest),
        next.shopStallNumber,
        next.shopSection,
        next.whatsappPhone,
        next.allowRiderWhatsAppContact ? 1 : 0,
        next.operatingHours,
        next.studentId,
        next.identityProofUrl,
        next.faceVerified ? 1 : 0,
        next.faceProvider,
        next.faceReference,
        next.faceVerified ? existing?.face_verified_at || now : null,
        next.businessDescription,
        next.agreementAccepted ? 1 : 0,
        status,
        note,
        now,
        verifiedAt,
        now,
        userId,
      );
    } else {
      db.prepare(`
        INSERT INTO seller_verification_profiles (
          id, user_id, store_id, seller_type, full_name, phone, campus,
          location_area, pickup_location, nearest_landmark, market_id,
          market_request_json, shop_stall_number, shop_section, whatsapp_phone,
          allow_rider_whatsapp_contact, operating_hours, student_id,
          identity_proof_url, face_verified, face_provider, face_reference,
          face_verified_at, business_description, agreement_accepted,
          status, note, submitted_at, verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createId("svp"),
        userId,
        store.id,
        next.sellerType,
        next.fullName,
        next.phone,
        next.campus,
        next.locationArea,
        next.pickupLocation,
        next.nearestLandmark,
        next.marketId || null,
        JSON.stringify(next.marketRequest),
        next.shopStallNumber,
        next.shopSection,
        next.whatsappPhone,
        next.allowRiderWhatsAppContact ? 1 : 0,
        next.operatingHours,
        next.studentId,
        next.identityProofUrl,
        next.faceVerified ? 1 : 0,
        next.faceProvider,
        next.faceReference,
        next.faceVerified ? now : null,
        next.businessDescription,
        next.agreementAccepted ? 1 : 0,
        status,
        note,
        now,
        verifiedAt,
        now,
        now,
      );
    }

    db.prepare(`
      UPDATE stores
      SET name = ?, description = ?, category = ?, seller_type = ?, campus = ?, location_area = ?, pickup_location = ?,
          nearest_landmark = ?, market_id = ?, shop_stall_number = ?,
          shop_section = ?, whatsapp_phone = ?, allow_rider_whatsapp_contact = ?,
          operating_hours = ?, phone = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.storeName,
      next.businessDescription || store.description || "",
      next.storeCategory,
      next.sellerType,
      next.campus || "",
      next.locationArea,
      next.pickupLocation,
      next.nearestLandmark,
      next.marketId || null,
      next.shopStallNumber,
      next.shopSection,
      next.whatsappPhone,
      next.allowRiderWhatsAppContact ? 1 : 0,
      next.operatingHours,
      next.phone,
      now,
      store.id,
    );

    if (next.sellerType === "local_market" && next.marketId) {
      db.prepare(`
        INSERT INTO seller_market_profiles (
          id, market_id, store_id, stall_number, address_note, shop_section,
          market_landmark, pickup_point, pickup_lat, pickup_lng, risk_level,
          admin_note, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'standard', '', 'pending', ?, ?)
        ON CONFLICT(store_id) DO UPDATE SET
          market_id = excluded.market_id,
          stall_number = excluded.stall_number,
          address_note = excluded.address_note,
          shop_section = excluded.shop_section,
          market_landmark = excluded.market_landmark,
          pickup_point = excluded.pickup_point,
          pickup_lat = excluded.pickup_lat,
          pickup_lng = excluded.pickup_lng,
          status = CASE
            WHEN seller_market_profiles.status = 'approved' THEN 'approved'
            ELSE 'pending'
          END,
          updated_at = excluded.updated_at
      `).run(
        createId("smp"),
        next.marketId,
        store.id,
        next.shopStallNumber,
        next.locationArea || next.pickupLocation,
        next.shopSection,
        next.nearestLandmark,
        next.pickupLocation,
        numberOrNull(input.pickupLat),
        numberOrNull(input.pickupLng),
        now,
        now,
      );
    }

    if (next.sellerType === "local_market" && Object.keys(next.marketRequest).length) {
      createMarketRequestForSeller(userId, {
        ...next.marketRequest,
        marketName: next.marketRequest.marketName,
        state: next.marketRequest.state,
        cityArea: next.marketRequest.cityArea,
        addressLandmark: next.marketRequest.addressLandmark,
        approximateLocation: next.marketRequest.approximateLocation,
        whatSells: next.marketRequest.sells || next.storeCategory,
        shopDetails: next.marketRequest.shopDetails || next.shopStallNumber,
        contactPhone: next.marketRequest.contactPhone || next.phone,
      });
    }

    if (next.sellerType === "local_market") {
      ensureSellerCategoryRequest({
        sellerId: userId,
        storeId: store.id,
        marketId: next.sellerType === "local_market" ? next.marketId || null : null,
        categoryName: next.storeCategory,
      });
    }

    if (status === "verified") {
      db.prepare(`
        UPDATE stores
        SET verified = 1, verification_status = 'verified', verification_note = ?, verified_at = ?, updated_at = ?
        WHERE id = ?
      `).run(note, now, now, store.id);
    } else {
      db.prepare(`
        UPDATE stores
        SET verification_status = 'pending_verification', verification_note = ?, updated_at = ?
        WHERE id = ?
      `).run(note, now, store.id);
    }

    const allStepKeys = SELLER_ONBOARDING_STEPS.map((item) => item.key);

    db.prepare(`
      UPDATE seller_verification_profiles
      SET current_step = 3,
          completed_steps_json = ?,
          locked_steps_json = ?,
          submitted_for_review_at = COALESCE(submitted_for_review_at, ?),
          admin_review_status = ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(
      JSON.stringify(allStepKeys),
      JSON.stringify(allStepKeys),
      now,
      status === "verified" ? "approved" : "pending",
      now,
      userId,
    );
  });

  syncStructuredSellerLocation(userId, store, {
    ...input,
    ...structuredLocation,
    pickupPlaceId: structuredLocation.placeId,
    pickupLat: structuredLocation.lat,
    pickupLng: structuredLocation.lng,
    locationVerifiedAt: structuredLocation.verifiedAt,
  }, existing);

  submitSellerVerificationStageRequirements(userId, 1);
  submitSellerVerificationStageRequirements(userId, 2);
  submitSellerVerificationStageRequirements(userId, 3);

  return getSellerVerification(userId);
}

export function getSellerReadiness(userId) {
  const user = findUserById(userId);
  const store = findStoreByOwnerId(userId);
  const verification = getSellerVerification(userId);
  const payoutAccount = getPayoutAccount(userId);

  return {
    store,
    verification,
    payoutAccount,
    hasStore: Boolean(store),
    emailReady: Boolean(user?.email_verified),
    phoneReady: Boolean(user?.phone_verified || verification.phone || user?.phone),
    faceReady: Boolean(verification.faceVerified),
    verificationReady: verification.status === "verified",
    subscriptionActive: hasActiveSellerSubscription(userId),
    payoutReady: Boolean(payoutAccount?.isComplete),
    platformFeeReady: Boolean(store && Number(env.platformFeePercent || 0) > 0),
  };
}

export function assertSellerVerified(user) {
  const userId = user.user_id || user.id;
  if (!user.email_verified) {
    throw new HttpError(403, "Verify your email before using seller tools.");
  }

  const verification = getSellerVerification(userId);
  const caseRow = ensureVerificationCase(userId, "seller", {
    sellerType: verification.sellerType,
  });
  const stageTwoApproved =
    Number(caseRow?.current_verified_level || 0) >= 2;

  if (
    verification.status !== "verified" &&
    !stageTwoApproved &&
    !(!env.isProduction && env.autoActivateSellerSubscription)
  ) {
    throw new HttpError(
      403,
      "Admin must approve seller verification Stage 2 before you can upload products or services.",
    );
  }

  return verification;
}
