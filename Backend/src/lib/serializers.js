function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function numberOrFallback(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pricePayload(row) {
  const rawPriceKobo = numberOrFallback(row.price_kobo, 0);
  const storedSellerPrice = numberOrFallback(row.seller_price_kobo, 0);
  const storedBuyerPrice = numberOrFallback(row.buyer_price_kobo, 0);
  const sellerPriceKobo = storedSellerPrice > 0 ? storedSellerPrice : rawPriceKobo;
  const platformFeeKobo = numberOrFallback(row.platform_fee_kobo, 0);
  const buyerPriceKobo = storedBuyerPrice > 0 ? storedBuyerPrice : rawPriceKobo || sellerPriceKobo + platformFeeKobo;

  return {
    sellerPriceKobo,
    sellerPrice: sellerPriceKobo / 100,
    platformFeeKobo,
    platformFee: platformFeeKobo / 100,
    buyerPriceKobo,
    buyerPrice: buyerPriceKobo / 100,
    priceKobo: buyerPriceKobo,
    price: buyerPriceKobo / 100,
  };
}

export function serializeUser(row) {
  if (!row) return null;

  return {
    id: row.user_id || row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    campus: row.campus || "",
    phone: row.phone || "",
    avatarUrl: row.avatar_url || null,
    emailVerified: Boolean(row.email_verified),
    emailVerifiedAt: row.email_verified_at || null,
    phoneVerified: Boolean(row.phone_verified),
    phoneVerifiedAt: row.phone_verified_at || null,
    lastLoginAt: row.last_login_at || null,
  };
}

export function serializeStore(row) {
  if (!row) return null;

  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    name: row.name,
    description: row.description || "",
    campus: row.campus || "",
    category: row.category || "General",
    phone: row.phone || "",
    logoUrl: row.logo_url || null,
    coverUrl: row.cover_url || null,
    status: row.status,
    verified: Boolean(row.verified),
    verificationStatus: row.verification_status || (row.verified ? "verified" : "draft"),
    verificationNote: row.verification_note || "",
    verifiedAt: row.verified_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeProduct(row) {
  if (!row) return null;

  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description || "",
    ...pricePayload(row),
    stock: row.stock,
    status: row.status,
    isFeatured: Boolean(row.is_featured),
    imageUrls: safeJsonArray(row.image_urls),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeService(row) {
  if (!row) return null;

  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description || "",
    ...pricePayload(row),
    durationMinutes: row.duration_minutes,
    status: row.status,
    isFeatured: Boolean(row.is_featured),
    imageUrls: safeJsonArray(row.image_urls),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeUsedListing(row, includePrivate = false) {
  if (!row) return null;

  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller_name || "",
    sellerPhone: includePrivate ? row.seller_phone || "" : "",
    name: row.name,
    category: row.category,
    description: row.description || "",
    condition: row.condition,
    ...pricePayload(row),
    campus: row.campus || "",
    pickupLocation: row.pickup_location || "",
    deliveryOption: row.delivery_option,
    imageUrls: safeJsonArray(row.image_urls),
    status: row.status,
    verified: row.status === "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    serialNumber: includePrivate ? row.serial_number || "" : row.serial_number ? "Provided" : "",
    ownershipProofUrl: includePrivate ? row.ownership_proof_url || null : null,
    receiptUrl: includePrivate ? row.receipt_url || null : null,
    reasonForSelling: row.reason_for_selling || "",
    defectsDisclosed: row.defects_disclosed || "",
    confirmationText: includePrivate ? row.confirmation_text || "" : "",
    reviewNote: includePrivate ? row.review_note || "" : "",
  };
}
