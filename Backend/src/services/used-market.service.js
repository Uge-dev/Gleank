import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { getPayoutAccount, getTrustProfile, ensureUsedMarketTrust } from "./trust.service.js";

const MAX_USED_IMAGES = 10;

const selectListing = `
  SELECT used_listings.*, users.name AS seller_name,
         users.phone AS seller_phone,
         trust.status AS trust_status,
         trust.identity_proof_url AS trust_identity_proof_url,
         payout.bank_name AS payout_bank_name,
         payout.account_name AS payout_account_name,
         payout.account_number_masked AS payout_account_number_masked,
         payout.payout_verified AS payout_verified
  FROM used_listings
  JOIN users ON users.id = used_listings.seller_id
  LEFT JOIN user_trust_profiles trust ON trust.user_id = used_listings.seller_id
  LEFT JOIN user_payout_accounts payout ON payout.user_id = used_listings.seller_id
`;

function toPrice(kobo) {
  return Math.round(Number(kobo || 0)) / 100;
}

function parseImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function computePlatformPrice(price) {
  const sellerPriceKobo = Math.round(Number(price || 0) * 100);
  const platformFeeKobo = Math.round((sellerPriceKobo * env.platformFeePercent) / 100);
  const buyerPriceKobo = sellerPriceKobo + platformFeeKobo;
  return { sellerPriceKobo, platformFeeKobo, buyerPriceKobo };
}

function serializeUsedListing(row, includePrivate = false) {
  const trustComplete = Boolean(row.trust_status && row.trust_identity_proof_url);
  const payoutComplete = Boolean(row.payout_bank_name && row.payout_account_name);

  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    sellerPhone: includePrivate ? row.seller_phone : "",
    name: row.name,
    category: row.category,
    description: row.description,
    condition: row.condition,
    sellerPriceKobo: row.seller_price_kobo > 0 ? row.seller_price_kobo : row.price_kobo,
    sellerPrice: toPrice(row.seller_price_kobo > 0 ? row.seller_price_kobo : row.price_kobo),
    platformFeeKobo: row.platform_fee_kobo || 0,
    platformFee: toPrice(row.platform_fee_kobo || 0),
    buyerPriceKobo: row.buyer_price_kobo > 0 ? row.buyer_price_kobo : row.price_kobo,
    buyerPrice: toPrice(row.buyer_price_kobo > 0 ? row.buyer_price_kobo : row.price_kobo),
    priceKobo: row.buyer_price_kobo > 0 ? row.buyer_price_kobo : row.price_kobo,
    price: toPrice(row.buyer_price_kobo > 0 ? row.buyer_price_kobo : row.price_kobo),
    campus: row.campus,
    pickupLocation: row.pickup_location,
    deliveryOption: row.delivery_option,
    imageUrls: parseImages(row.image_urls),
    status: row.status,
    verified: row.status === "active" && trustComplete && payoutComplete,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    serialNumber: includePrivate ? row.serial_number : row.serial_number ? "Provided" : "",
    ownershipProofUrl: includePrivate ? row.ownership_proof_url || null : null,
    receiptUrl: includePrivate ? row.receipt_url || null : null,
    reasonForSelling: row.reason_for_selling || "",
    defectsDisclosed: row.defects_disclosed || "",
    confirmationText: includePrivate ? row.confirmation_text || "" : "",
    reviewNote: includePrivate ? row.review_note || "" : "",
    sellerTrust: {
      profileCompleted: trustComplete,
      identityProofSubmitted: Boolean(row.trust_identity_proof_url),
      payoutAccountAdded: payoutComplete,
      payoutVerified: Boolean(row.payout_verified),
      accountName: row.payout_account_name || "",
      bankName: row.payout_bank_name || "",
      accountNumberMasked: includePrivate ? row.payout_account_number_masked || "" : "",
      reviewStatus: row.status === "pending" ? "pending_review" : row.status,
      buyerProtection: true,
    },
  };
}

export function listUsedListings({ query = "", category = "" }) {
  const cleanQuery = query.trim().slice(0, 100);
  const cleanCategory = category.trim().slice(0, 80);
  const pattern = `%${cleanQuery.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

  return db
    .prepare(`
      ${selectListing}
      WHERE used_listings.status = 'active'
        AND (? = '' OR used_listings.category = ?)
        AND (
          ? = ''
          OR used_listings.name LIKE ? ESCAPE '\\'
          OR used_listings.description LIKE ? ESCAPE '\\'
          OR used_listings.category LIKE ? ESCAPE '\\'
          OR used_listings.condition LIKE ? ESCAPE '\\'
          OR used_listings.campus LIKE ? ESCAPE '\\'
          OR users.name LIKE ? ESCAPE '\\'
        )
      ORDER BY used_listings.updated_at DESC
      LIMIT 100
    `)
    .all(
      cleanCategory,
      cleanCategory,
      cleanQuery,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
    )
    .map((row) => serializeUsedListing(row));
}

export function getUsedListing(listingId, viewerId) {
  const row = db
    .prepare(`
      ${selectListing}
      WHERE used_listings.id = ?
        AND (used_listings.status = 'active' OR used_listings.seller_id = ?)
    `)
    .get(listingId, viewerId || "");

  if (!row) throw new HttpError(404, "Used item was not found.");
  return serializeUsedListing(row, row.seller_id === viewerId);
}

export function listOwnUsedListings(userId) {
  return db
    .prepare(`
      ${selectListing}
      WHERE used_listings.seller_id = ?
      ORDER BY used_listings.created_at DESC
    `)
    .all(userId)
    .map((row) => serializeUsedListing(row, true));
}

export function createUsedListing(userId, input, files) {
  const trust = ensureUsedMarketTrust(userId);
  const trustProfile = getTrustProfile(userId);
  const payoutAccount = getPayoutAccount(userId);

  const now = new Date().toISOString();
  const id = createId("usd");
  const images = (files.images || []).map((file) => file.url).slice(0, MAX_USED_IMAGES);

  if (!images.length) {
    throw new HttpError(422, "Upload at least one clear product image.");
  }

  if (!files.ownershipProof?.url) {
    throw new HttpError(422, "Upload proof that you own this item.");
  }

  if (!clean(input.defectsDisclosed, 1200)) {
    throw new HttpError(422, "Disclose defects or write 'No defects'.");
  }

  if (!input.confirmOwnership) {
    throw new HttpError(422, "Confirm that the item belongs to you before submitting.");
  }

  const price = computePlatformPrice(input.price);
  const status = env.autoApproveUsedListings ? "active" : "pending";
  const reviewNote = status === "pending"
    ? "Your listing is in Gleank review. Buyers cannot see it until it is approved."
    : "Auto-approved for local development.";

  db.prepare(`
    INSERT INTO used_listings (
      id, seller_id, name, category, description, condition, price_kobo,
      seller_price_kobo, platform_fee_kobo, buyer_price_kobo, campus, pickup_location, delivery_option, serial_number, image_urls,
      ownership_proof_url, receipt_url, status, reason_for_selling,
      defects_disclosed, confirmation_text, review_note, trust_profile_id,
      payout_account_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    clean(input.name, 120),
    clean(input.category, 80),
    clean(input.description, 3000),
    clean(input.condition, 40),
    price.buyerPriceKobo,
    price.sellerPriceKobo,
    price.platformFeeKobo,
    price.buyerPriceKobo,
    clean(input.campus, 80),
    clean(input.pickupLocation, 160),
    clean(input.deliveryOption, 30),
    clean(input.serialNumber, 120),
    JSON.stringify(images),
    files.ownershipProof?.url || null,
    files.receipt?.url || null,
    status,
    clean(input.reasonForSelling, 800),
    clean(input.defectsDisclosed, 1200),
    clean(input.confirmOwnershipText || "Seller confirmed item ownership and truthful disclosure.", 300),
    reviewNote,
    trustProfile?.id || trust.trustProfile?.id || null,
    payoutAccount?.id || trust.payoutAccount?.id || null,
    now,
    now,
  );

  db.prepare(`
    INSERT INTO used_listing_reviews (id, listing_id, reviewer_id, status, note, created_at)
    VALUES (?, ?, NULL, ?, ?, ?)
  `).run(
    createId("ulr"),
    id,
    status === "active" ? "approved" : "pending",
    reviewNote,
    now,
  );

  return getUsedListing(id, userId);
}

export function updateOwnUsedListingStatus(userId, listingId, status) {
  const allowed = ["active", "sold"];
  if (!allowed.includes(status)) {
    throw new HttpError(422, "Status must be active or sold.");
  }

  const result = db
    .prepare(`
      UPDATE used_listings
      SET status = ?, updated_at = ?
      WHERE id = ? AND seller_id = ?
    `)
    .run(status, new Date().toISOString(), listingId, userId);

  if (!result.changes) throw new HttpError(404, "Used item was not found.");
  return getUsedListing(listingId, userId);
}

export function reportUsedListing(userId, listingId, input) {
  getUsedListing(listingId, userId);

  db.prepare(`
    INSERT INTO used_listing_reports (
      id, listing_id, reporter_id, reason, details, status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(
    createId("rep"),
    listingId,
    userId,
    clean(input.reason, 120),
    clean(input.details, 1200),
    new Date().toISOString(),
  );

  return { success: true };
}
