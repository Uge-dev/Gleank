import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { findStoreByOwnerId } from "../repositories/store.repository.js";
import { getPayoutAccount } from "./trust.service.js";

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
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
      row.student_id &&
      row.identity_proof_url &&
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
  const store = findStoreByOwnerId(userId);
  if (!store) throw new HttpError(404, "Create your seller store before verification.");

  const existing = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);

  const next = {
    fullName: clean(input.fullName || input.name, 120),
    phone: clean(input.sellerPhone || input.phone, 40),
    campus: clean(input.sellerCampus || input.campus, 100),
    studentId: clean(input.studentId, 100),
    identityProofUrl: identityProofUrl || existing?.identity_proof_url || null,
    businessDescription: clean(input.businessDescription, 1200),
    agreementAccepted:
      input.agreementAccepted === true ||
      input.agreementAccepted === "true" ||
      input.agreementAccepted === "on" ||
      input.agreementAccepted === "1",
  };

  if (!next.fullName || !next.phone || !next.campus || !next.studentId) {
    throw new HttpError(422, "Complete seller name, phone, campus, and student ID.");
  }

  if (!next.identityProofUrl) {
    throw new HttpError(422, "Upload your student ID or identity proof image.");
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
            identity_proof_url = ?, business_description = ?, agreement_accepted = ?,
            status = ?, note = ?, submitted_at = ?, verified_at = ?, updated_at = ?
        WHERE user_id = ?
      `).run(
        store.id,
        next.fullName,
        next.phone,
        next.campus,
        next.studentId,
        next.identityProofUrl,
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
          identity_proof_url, business_description, agreement_accepted,
          status, note, submitted_at, verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createId("svp"),
        userId,
        store.id,
        next.fullName,
        next.phone,
        next.campus,
        next.studentId,
        next.identityProofUrl,
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
  const store = findStoreByOwnerId(userId);
  const verification = getSellerVerification(userId);
  const payoutAccount = getPayoutAccount(userId);

  return {
    store,
    verification,
    payoutAccount,
    hasStore: Boolean(store),
    emailReady: true,
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
