import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";

function clean(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function maskAccountNumber(value) {
  const digits = onlyDigits(value);
  if (digits.length < 6) return "";
  return `${digits.slice(0, 2)}••••${digits.slice(-4)}`;
}

export function serializeTrustProfile(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone,
    campus: row.campus,
    areaLocation: row.area_location || row.campus || "",
    pickupPreference: row.pickup_preference || "",
    sellerType: row.seller_type || "used_market",
    verificationLevel: Number(row.verification_level || 1),
    department: row.department,
    level: row.level,
    studentId: row.student_id,
    identityProofUrl: row.identity_proof_url || null,
    faceVerified: Boolean(row.face_verified),
    faceProvider: row.face_provider || "",
    faceReference: row.face_reference || "",
    faceVerifiedAt: row.face_verified_at || null,
    status: row.status,
    isComplete: Boolean(
      row.full_name &&
        row.phone &&
        (row.area_location || row.campus) &&
        row.face_verified,
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializePayoutAccount(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumberMasked: row.account_number_masked,
    accountLast4: row.account_last4,
    payoutVerified: Boolean(row.payout_verified),
    isComplete: Boolean(row.bank_name && row.account_name && row.account_last4),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTrustProfile(userId) {
  return serializeTrustProfile(
    db.prepare("SELECT * FROM user_trust_profiles WHERE user_id = ?").get(userId),
  );
}

export function getPayoutAccount(userId) {
  return serializePayoutAccount(
    db.prepare("SELECT * FROM user_payout_accounts WHERE user_id = ?").get(userId),
  );
}

export function getTrustStatus(userId) {
  const trustProfile = getTrustProfile(userId);
  const payoutAccount = getPayoutAccount(userId);

  return {
    trustProfile,
    payoutAccount,
    canSubmitUsedListing: Boolean(trustProfile?.isComplete && payoutAccount?.isComplete),
  };
}

export function upsertTrustProfile(userId, input, identityProofUrl = null) {
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT * FROM user_trust_profiles WHERE user_id = ?")
    .get(userId);

  const next = {
    fullName: clean(input.fullName || input.name, 100),
    phone: clean(input.trustPhone || input.phone, 30),
    areaLocation: clean(input.areaLocation || input.locationArea || input.trustCampus || input.campus, 120),
    pickupPreference: clean(input.pickupPreference || input.deliveryOption || "", 120),
    sellerType: "used_market",
    verificationLevel: Number(existing?.verification_level || 1),
    campus: clean(input.trustCampus || input.campus || input.areaLocation || input.locationArea || "General", 80),
    department: "",
    level: "",
    studentId: clean(input.studentId, 80),
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
  };

  if (!next.fullName || !next.phone || !next.areaLocation) {
    throw new HttpError(
      422,
      "Complete your trust profile with full name, phone, and area/location before uploading used items.",
    );
  }

  if (!next.faceVerified) {
    throw new HttpError(422, "Complete live face verification before uploading used items.");
  }

  if (existing) {
    db.prepare(`
      UPDATE user_trust_profiles
      SET full_name = ?, phone = ?, campus = ?, department = ?, level = ?,
          student_id = ?, identity_proof_url = ?, face_verified = ?,
          face_provider = ?, face_reference = ?, face_verified_at = ?,
          area_location = ?, pickup_preference = ?, seller_type = ?,
          verification_level = ?, status = 'pending', updated_at = ?
      WHERE user_id = ?
    `).run(
      next.fullName,
      next.phone,
      next.campus,
      next.department,
      next.level,
      next.studentId,
      next.identityProofUrl,
      next.faceVerified ? 1 : 0,
      next.faceProvider,
      next.faceReference,
      next.faceVerified ? existing?.face_verified_at || now : null,
      next.areaLocation,
      next.pickupPreference,
      next.sellerType,
      next.verificationLevel,
      now,
      userId,
    );
  } else {
    db.prepare(`
      INSERT INTO user_trust_profiles (
        id, user_id, full_name, phone, campus, department, level,
        student_id, identity_proof_url, face_verified, face_provider,
        face_reference, face_verified_at, area_location, pickup_preference,
        seller_type, verification_level, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      createId("trp"),
      userId,
      next.fullName,
      next.phone,
      next.campus,
      next.department,
      next.level,
      next.studentId,
      next.identityProofUrl,
      next.faceVerified ? 1 : 0,
      next.faceProvider,
      next.faceReference,
      next.faceVerified ? now : null,
      next.areaLocation,
      next.pickupPreference,
      next.sellerType,
      next.verificationLevel,
      now,
      now,
    );
  }

  return getTrustProfile(userId);
}

export function upsertPayoutAccount(userId, input) {
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT * FROM user_payout_accounts WHERE user_id = ?")
    .get(userId);

  const bankName = clean(input.bankName, 80);
  const accountName = clean(input.accountName, 100).toUpperCase();
  const digits = onlyDigits(input.accountNumber);
  const accountNumberMasked = maskAccountNumber(digits);
  const accountLast4 = digits.slice(-4);

  if (!bankName || !accountName || digits.length < 10) {
    throw new HttpError(
      422,
      "Add valid payout details: bank name, account name, and account number.",
    );
  }

  if (existing) {
    db.prepare(`
      UPDATE user_payout_accounts
      SET bank_name = ?, account_name = ?, account_number_masked = ?,
          account_last4 = ?, payout_verified = 0, updated_at = ?
      WHERE user_id = ?
    `).run(bankName, accountName, accountNumberMasked, accountLast4, now, userId);
  } else {
    db.prepare(`
      INSERT INTO user_payout_accounts (
        id, user_id, bank_name, account_name, account_number_masked,
        account_last4, payout_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      createId("pay"),
      userId,
      bankName,
      accountName,
      accountNumberMasked,
      accountLast4,
      now,
      now,
    );
  }

  return getPayoutAccount(userId);
}

export function ensureUsedMarketTrust(userId) {
  const status = getTrustStatus(userId);

  if (!status.trustProfile?.isComplete) {
    throw new HttpError(422, "Complete your trust profile before uploading a used item.");
  }

  if (!status.payoutAccount?.isComplete) {
    throw new HttpError(422, "Add your payout account before uploading a used item.");
  }

  return status;
}
