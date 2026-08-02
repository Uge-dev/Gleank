function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
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
    sellerType: row.seller_type || "campus",
    operatingHours: row.operating_hours || "",
    whatsappPhone: row.whatsapp_phone || "",
    allowRiderWhatsAppContact: row.allow_rider_whatsapp_contact !== 0,
    locationArea: row.location_area || "",
    pickupLocation: row.pickup_location || "",
    nearestLandmark: row.nearest_landmark || "",
    marketId: row.market_id || null,
    marketName: row.market_name || "",
    shopStallNumber: row.shop_stall_number || "",
    shopSection: row.shop_section || "",
    marketSection: row.market_section || row.shop_section || "",
    shopNumber: row.shop_number || row.shop_stall_number || "",
    shopId: row.shop_id || "",
    governmentTaxId: row.government_tax_id || "",
    marketAssociationId: row.market_association_id || "",
    internalGleencShopCode: row.internal_gleenc_shop_code || "",
    pickupInstruction: row.pickup_instruction || "",
    country: row.country || "Nigeria",
    state: row.state || "",
    city: row.city || "",
    nearestCampus: row.nearest_campus || row.campus || "",
    nearestMarketplace: row.nearest_marketplace || "",
    street: row.street || row.pickup_location || "",
    pickupPlaceId: row.pickup_place_id || "",
    locationVerifiedAt: row.location_verified_at || null,
    kycProvider: row.kyc_provider || "manual",
    kycStatus: row.kyc_status || "not_started",
    kycLevel: Number(row.kyc_level || 0),
    kycVerifiedAt: row.kyc_verified_at || null,
    phoneVerificationStatus: row.phone_verification_status || "not_started",
    payoutAccountStatus: row.payout_account_status || "not_started",
    profileCompletionPercent: Number(row.profile_completion_percent || 0),
    pickupLat: row.pickup_lat === null || row.pickup_lat === undefined ? null : Number(row.pickup_lat),
    pickupLng: row.pickup_lng === null || row.pickup_lng === undefined ? null : Number(row.pickup_lng),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializePublicStore(row) {
  const store = row && Object.hasOwn(row, "ownerId")
    ? { ...row }
    : serializeStore(row);
  if (!store) return null;

  return {
    ...store,
    phone: "",
    whatsappPhone: "",
    pickupLocation: "",
    nearestLandmark: "",
    street: "",
    pickupPlaceId: "",
    pickupLat: null,
    pickupLng: null,
  };
}

export function serializeProduct(row) {
  if (!row) return null;

  const deliveryReadinessType = row.delivery_readiness_type || "immediate";
  const deliveryReadyAfterMinutes = numberOrFallback(row.delivery_ready_after_minutes, 0);
  const deliveryReadinessLabel =
    deliveryReadinessType === "hours"
      ? `Ready for delivery in ${Math.max(1, Math.round(deliveryReadyAfterMinutes / 60))} hour(s)`
      : deliveryReadinessType === "days"
        ? `Ready for delivery in ${Math.max(1, Math.round(deliveryReadyAfterMinutes / 1440))} day(s)`
        : deliveryReadinessType === "scheduled_date" && row.delivery_ready_at
          ? `Ready for delivery from ${row.delivery_ready_at}`
          : "Ready for delivery immediately";

  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description || "",
    ...pricePayload(row),
    stock: row.stock,
    availableSizes: safeJsonArray(row.available_sizes),
    status: row.status,
    moderationStatus: row.moderation_status || "draft",
    moderationNote: row.moderation_note || "",
    moderationReasons: safeJsonArray(row.moderation_reasons),
    riskScore: numberOrFallback(row.risk_score, 0),
    riskLevel: row.risk_level || "low",
    priceValidationStatus: row.price_validation_status || "not_checked",
    priceValidationNote: row.price_validation_note || "",
    ocrReviewStatus: row.ocr_review_status || "not_run",
    requiresAdminReview: Boolean(row.requires_admin_review),
    lastValidatedAt: row.last_validated_at || null,
    availabilityStatus: row.availability_status || "available_now",
    deliveryReadiness: {
      type: deliveryReadinessType,
      value: row.delivery_readiness_value || "",
      readyAfterMinutes: deliveryReadyAfterMinutes,
      readyAt: row.delivery_ready_at || null,
      label: deliveryReadinessLabel,
    },
    sellerConfirmationRequired: Boolean(row.seller_confirmation_required),
    returnPolicy: row.return_policy || "standard",
    packageProfile: {
      packageSize: row.package_size || "small",
      packageWeightClass: row.package_weight_class || "light",
      fragilityLevel: row.fragility_level || "not_fragile",
      handlingInstructions: safeJsonArray(row.handling_instructions),
      packageShape: row.package_shape || "box",
      stackability: row.stackability || "stackable",
      batchingEligibility: row.batching_eligibility || "can_batch",
      requiredVehicleType: row.required_vehicle_type || "motorcycle_or_above",
      specialDeliveryFlags: safeJsonArray(row.special_delivery_flags),
      estimatedPackageUnits: numberOrFallback(row.estimated_package_units, 1),
      requiresSeparateDelivery: Boolean(row.requires_separate_delivery),
      autoSuggested: Boolean(row.package_profile_auto_suggested),
      sellerEdited: Boolean(row.package_profile_seller_edited),
      adminVerified: Boolean(row.package_profile_admin_verified),
      riskFlag: row.package_profile_risk_flag || "",
    },
    stockStatus: row.stock_status || "in_stock",
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    isFeatured: Boolean(row.is_featured),
    imageUrls: safeJsonArray(row.image_urls),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeService(row) {
  if (!row) return null;

  const minPriceKobo = numberOrFallback(row.min_price_kobo, 0);
  const maxPriceKobo = numberOrFallback(row.max_price_kobo, 0);

  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    serviceType: row.service_type || row.category || "",
    location: row.location || "",
    description: row.description || "",
    ...pricePayload(row),
    minPriceKobo,
    minPrice: minPriceKobo / 100,
    maxPriceKobo,
    maxPrice: maxPriceKobo / 100,
    durationMinutes: row.duration_minutes,
    status: row.status,
    moderationStatus: row.moderation_status || "draft",
    moderationNote: row.moderation_note || "",
    moderationReasons: safeJsonArray(row.moderation_reasons),
    riskScore: numberOrFallback(row.risk_score, 0),
    riskLevel: row.risk_level || "low",
    availabilityStatus: row.availability_status || "available_now",
    sellerConfirmationRequired: Boolean(row.seller_confirmation_required),
    returnPolicy: row.return_policy || "standard",
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
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
    sellerRole: row.seller_role || "",
    sellerStoreSlug: row.seller_store_slug || "",
    sellerStoreName: row.seller_store_name || "",
    name: row.name,
    category: row.category,
    description: row.description || "",
    condition: row.condition,
    ...pricePayload(row),
    campus: row.campus || "",
    areaLocation: row.area_location || row.campus || "",
    pickupLocation: row.pickup_location || "",
    deliveryOption: row.delivery_option,
    quantity: Number(row.quantity || 1),
    reservedQuantity: Number(row.reserved_quantity || 0),
    availableQuantity: Math.max(
      0,
      Number(row.quantity || 1) - Number(row.reserved_quantity || 0),
    ),
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
    categoryMetadata: safeJsonObject(row.category_metadata),
    riskLevel: row.risk_level || "standard",
    reviewRequired: Boolean(row.review_required),
    sellerVerificationLevel: Number(row.seller_verification_level || 1),
  };
}
