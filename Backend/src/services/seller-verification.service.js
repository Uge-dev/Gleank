import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId, slugify } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import {
  createStore,
  findStoreByOwnerId,
  findStoreBySlug,
} from "../repositories/store.repository.js";
import { findUserById, updateUserRole } from "../repositories/user.repository.js";
import { getPayoutAccount } from "./trust.service.js";
import {
  createMarketRequestForSeller,
  ensureSellerCategoryRequest,
} from "./market.service.js";

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function booleanFromInput(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === "on" || value === "1";
}

function sellerTypeFromInput(value) {
  const next = clean(value || "campus", 40);
  return ["used_market", "campus", "local_market", "nearby"].includes(next)
    ? next
    : "campus";
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

export function ensureSellerStoreForUser(userId, input = {}) {
  const existingStore = findStoreByOwnerId(userId);
  const user = findUserById(userId);
  const now = new Date().toISOString();

  if (!user) throw new HttpError(404, "Account was not found.");

  if (existingStore) {
    if (user.role !== "seller" && user.role !== "admin") {
      updateUserRole(userId, "seller", now);
    }

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

  updateUserRole(userId, "seller", now);

  return store;
}

export function serializeSellerVerification(row) {
  if (!row) {
    return {
      id: "",
      status: "draft",
      isComplete: false,
      fullName: "",
      phone: "",
      campus: "",
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
      verifiedAt: null,
    };
  }

  const isComplete = Boolean(
    row.full_name &&
      row.phone &&
      (row.seller_type !== "campus" || row.campus) &&
      (row.seller_type !== "local_market" || row.market_id || row.market_request_json) &&
      (row.seller_type !== "nearby" || row.location_area) &&
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

export function updateSellerOnboardingDraft(userId, input = {}) {
  const store = ensureSellerStoreForUser(userId, input);
  const existing = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);
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
    businessDescription: pickNext(input.businessDescription, existing?.business_description, store.description),
  };

  transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE seller_verification_profiles
        SET store_id = ?, seller_type = ?, full_name = ?, phone = ?, campus = ?,
            location_area = ?, pickup_location = ?, nearest_landmark = ?,
            market_id = ?, market_request_json = ?, shop_stall_number = ?,
            shop_section = ?, whatsapp_phone = ?, allow_rider_whatsapp_contact = ?,
            operating_hours = ?, business_description = ?,
            status = CASE
              WHEN status IN ('verified', 'suspended', 'rejected') THEN status
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
        next.businessDescription,
        now,
        userId,
      );
    } else {
      db.prepare(`
        INSERT INTO seller_verification_profiles (
          id, user_id, store_id, seller_type, full_name, phone, campus,
          location_area, pickup_location, nearest_landmark, market_id,
          market_request_json, shop_stall_number, shop_section, whatsapp_phone,
          allow_rider_whatsapp_contact, operating_hours, business_description,
          status, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', '', ?, ?)
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
        next.businessDescription,
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

    if (["local_market", "nearby"].includes(next.sellerType)) {
      ensureSellerCategoryRequest({
        sellerId: userId,
        storeId: store.id,
        marketId: next.sellerType === "local_market" ? next.marketId || null : null,
        categoryName: next.storeCategory,
      });
    }
  });

  return getSellerVerification(userId);
}

export function upsertSellerVerification(userId, input, identityProofUrl = null) {
  const store = ensureSellerStoreForUser(userId, input);

  const existing = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);

  const next = {
    sellerType: sellerTypeFromInput(input.sellerType),
    storeName: clean(input.storeName || input.businessName || store.name, 100),
    storeCategory: clean(input.storeCategory || input.category || store.category || "General", 80),
    fullName: clean(input.fullName || input.name, 120),
    phone: clean(input.sellerPhone || input.phone, 40),
    campus: clean(input.sellerCampus || input.campus, 100),
    locationArea: clean(input.locationArea || input.areaLocation || input.campus, 160),
    pickupLocation: clean(input.pickupLocation, 180),
    nearestLandmark: clean(input.nearestLandmark || input.landmark, 160),
    marketId: clean(input.marketId, 140),
    marketRequest: jsonFromMarketRequest(input),
    shopStallNumber: clean(input.shopStallNumber || input.stallNumber, 80),
    shopSection: clean(input.shopSection, 120),
    whatsappPhone: clean(input.whatsappPhone || input.sellerWhatsapp || input.phone, 40),
    allowRiderWhatsAppContact: booleanFromInput(input.allowRiderWhatsAppContact, true),
    operatingHours: clean(input.operatingHours, 160),
    studentId: clean(input.studentId, 100),
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
    businessDescription: clean(input.businessDescription, 1200),
    agreementAccepted:
      input.agreementAccepted === true ||
      input.agreementAccepted === "true" ||
      input.agreementAccepted === "on" ||
      input.agreementAccepted === "1",
  };

  if (!next.fullName || !next.phone || !next.sellerType) {
    throw new HttpError(422, "Complete seller name, phone, and seller type.");
  }

  if (next.sellerType === "campus" && !next.campus) {
    throw new HttpError(422, "Campus sellers must select a campus.");
  }

  if (next.sellerType === "local_market" && !next.marketId && !Object.keys(next.marketRequest).length) {
    throw new HttpError(422, "Select an approved local market or request market approval.");
  }

  if ((next.sellerType === "nearby" || next.sellerType === "used_market") && !next.locationArea) {
    throw new HttpError(422, "Enter your area/location for this seller type.");
  }

  if (!next.faceVerified) {
    throw new HttpError(422, "Complete live face verification before submitting seller verification.");
  }

  if (next.businessDescription.length < 20) {
    throw new HttpError(422, "Describe what your store sells in at least 20 characters.");
  }

  if (!next.agreementAccepted) {
    throw new HttpError(422, "Accept the seller agreement before submitting verification.");
  }

  const now = new Date().toISOString();
  const canSelfVerify =
    env.autoActivateSellerSubscription || hasActiveSellerSubscription(userId);
  const requiresAdminApproval = ["local_market", "nearby"].includes(next.sellerType);
  const status = canSelfVerify && !requiresAdminApproval ? "verified" : "pending_verification";
  const verifiedAt = status === "verified" ? now : null;
  const note = status === "verified"
    ? "Seller verification completed after payment, face check, and agreement confirmation."
    : "Seller verification is under review.";

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

    if (["local_market", "nearby"].includes(next.sellerType)) {
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
  });

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
    verificationReady: verification.status === "verified",
    payoutReady: Boolean(payoutAccount?.isComplete),
  };
}

export function assertSellerVerified(user) {
  const userId = user.user_id || user.id;
  if (!user.email_verified) {
    throw new HttpError(403, "Verify your email before using seller tools.");
  }

  const verification = getSellerVerification(userId);
  if (verification.status !== "verified") {
    if (!env.isProduction && env.autoActivateSellerSubscription) {
      return verification;
    }
    throw new HttpError(403, "Complete seller verification before publishing products or services.");
  }

  return verification;
}
