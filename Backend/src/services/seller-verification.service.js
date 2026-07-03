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

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
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
      row.campus &&
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

export function upsertSellerVerification(userId, input, identityProofUrl = null) {
  const store = ensureSellerStoreForUser(userId, input);

  const existing = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);

  const next = {
    fullName: clean(input.fullName || input.name, 120),
    phone: clean(input.sellerPhone || input.phone, 40),
    campus: clean(input.sellerCampus || input.campus, 100),
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

  if (!next.fullName || !next.phone || !next.campus) {
    throw new HttpError(422, "Complete seller name, phone, and campus.");
  }

  if (!next.faceVerified) {
    throw new HttpError(422, "Complete live face verification before submitting seller verification.");
  }

  if (next.businessDescription.length < 20) {
    throw new HttpError(422, "Describe what your campus store sells in at least 20 characters.");
  }

  if (!next.agreementAccepted) {
    throw new HttpError(422, "Accept the seller agreement before submitting verification.");
  }

  const now = new Date().toISOString();
  const status = env.autoActivateSellerSubscription ? "verified" : "pending_verification";
  const verifiedAt = status === "verified" ? now : null;
  const note = status === "verified"
    ? "Development auto-verification. Use admin review before production."
    : "Seller verification is under review.";

  transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE seller_verification_profiles
        SET store_id = ?, full_name = ?, phone = ?, campus = ?, student_id = ?,
            identity_proof_url = ?, face_verified = ?, face_provider = ?,
            face_reference = ?, face_verified_at = ?, business_description = ?,
            agreement_accepted = ?, status = ?, note = ?, submitted_at = ?,
            verified_at = ?, updated_at = ?
        WHERE user_id = ?
      `).run(
        store.id,
        next.fullName,
        next.phone,
        next.campus,
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
          id, user_id, store_id, full_name, phone, campus, student_id,
          identity_proof_url, face_verified, face_provider, face_reference,
          face_verified_at, business_description, agreement_accepted,
          status, note, submitted_at, verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createId("svp"),
        userId,
        store.id,
        next.fullName,
        next.phone,
        next.campus,
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
