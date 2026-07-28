import { db, transaction } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { serializeProduct, serializeService } from "../lib/serializers.js";
import { createNotification } from "./notification.service.js";
import { validateAndStoreProductPrice } from "./price-validation.service.js";
import {
  logPaymentProtectionEvent,
  scanListingContent,
} from "./payment-protection.service.js";

const PUBLIC_APPROVED = new Set(["auto_approved", "approved"]);
const ACTIVE_REVIEW_STATUSES = new Set(["pending_review", "flagged"]);
const VALID_AVAILABILITY = new Set([
  "available_now",
  "confirm_before_payment",
  "out_of_stock",
  "price_updated",
  "substitute_available",
]);

const CATEGORY_PRICE_RANGES_KOBO = [
  { pattern: /food|meal|shawarma|snack|drink|restaurant/i, min: 100_00, max: 50_000_00 },
  { pattern: /book|textbook|stationer/i, min: 200_00, max: 80_000_00 },
  { pattern: /fashion|cloth|shoe|bag|accessor/i, min: 500_00, max: 500_000_00 },
  { pattern: /phone|laptop|electronic|gadget/i, min: 2_000_00, max: 5_000_000_00 },
  { pattern: /beauty|hair|makeup|skin/i, min: 500_00, max: 300_000_00 },
  { pattern: /home|household|furniture|appliance/i, min: 500_00, max: 2_000_000_00 },
  { pattern: /service|repair|cleaning|delivery|design|skill/i, min: 500_00, max: 1_500_000_00 },
];

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeCategoryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textBlob(input) {
  return [input?.name, input?.category, input?.description, input?.serviceType, input?.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function riskLevel(score) {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function priceKoboFromInput(input) {
  return Math.round(Number(input?.price || 0) * 100);
}

function categoryPriceRange(input) {
  const source = `${input?.category || ""} ${input?.name || ""} ${input?.serviceType || ""}`;
  return CATEGORY_PRICE_RANGES_KOBO.find((rule) => rule.pattern.test(source)) || null;
}

function availabilityFromInput(input, stock = 1) {
  const candidate = clean(input?.availabilityStatus, 60);
  if (candidate && VALID_AVAILABILITY.has(candidate)) return candidate;
  if (Number(stock || 0) <= 0) return "out_of_stock";
  return "available_now";
}

function returnPolicyFromInput(input) {
  const candidate = clean(input?.returnPolicy, 40);
  if (["standard", "limited", "final_sale"].includes(candidate)) return candidate;
  return "standard";
}

function matchingCategoryRules(store, categoryKey) {
  return db
    .prepare(`
      SELECT *
      FROM product_category_rules
      WHERE is_active = 1
        AND category_key = ?
        AND seller_type IN ('all', ?)
      ORDER BY CASE seller_type WHEN ? THEN 0 ELSE 1 END
    `)
    .all(categoryKey, store.seller_type || "campus", store.seller_type || "campus");
}

function matchingKeywords(blob) {
  const keywords = db
    .prepare("SELECT * FROM restricted_keywords WHERE is_active = 1 ORDER BY keyword ASC")
    .all();

  return keywords.filter((row) => {
    const keyword = String(row.keyword || "").trim().toLowerCase();
    return keyword && blob.includes(keyword);
  });
}

function addReason(reasons, code, message, score = 0, action = "review") {
  reasons.push({ code, message, score, action });
}

export function evaluateListingModeration({
  store,
  input,
  images = [],
  itemType = "product",
  imageModeration = null,
}) {
  const requestedStatus = clean(input?.status || "draft", 40);
  const stock = Number(input?.stock ?? 1);
  const availabilityStatus = availabilityFromInput(input, stock);
  const categoryKey = normalizeCategoryKey(input?.category);
  const blob = textBlob(input);
  const reasons = [];
  let rejected = false;
  let reviewRequired = false;
  let score = 0;

  if (requestedStatus === "draft") {
    return {
      moderationStatus: "draft",
      moderationNote: "Saved as draft. Publish it when it is ready for review.",
      moderationReasons: [],
      riskScore: 0,
      riskLevel: "low",
      availabilityStatus,
      sellerConfirmationRequired: availabilityStatus === "confirm_before_payment",
      returnPolicy: returnPolicyFromInput(input),
      publicStatus: "draft",
    };
  }

  for (const rule of matchingCategoryRules(store, categoryKey)) {
    const action = rule.rule_action || "review";
    const message = rule.reason || `${rule.category_name || input?.category} requires review.`;
    const ruleScore = action === "reject" ? 90 : 35;
    addReason(reasons, `category_${action}`, message, ruleScore, action);
    score += ruleScore;
    if (action === "reject") rejected = true;
    if (action === "review") reviewRequired = true;
  }

  for (const keyword of matchingKeywords(blob)) {
    const action = keyword.action || "review";
    const keywordScore = action === "reject" ? 85 : 30;
    addReason(
      reasons,
      `keyword_${action}`,
      keyword.reason || `Restricted keyword detected: ${keyword.keyword}`,
      keywordScore,
      action,
    );
    score += keywordScore;
    if (action === "reject") rejected = true;
    if (action === "review") reviewRequired = true;
  }

  const contactScan = scanListingContent(input);
  if (contactScan.flagged) {
    addReason(
      reasons,
      "off_platform_contact",
      "Direct contact or off-platform payment instructions were detected. Remove them before the listing can go public.",
      Math.max(45, contactScan.severity),
      "review",
    );
    score += Math.max(45, contactScan.severity);
    reviewRequired = true;

    logPaymentProtectionEvent({
      actorId: store.owner_id,
      contextType: itemType,
      contextId: "",
      source: "listing_moderation",
      action: contactScan.action,
      severity: contactScan.severity,
      reasons: contactScan.reasons,
      originalText: [
        input?.name,
        input?.category,
        input?.serviceType,
        input?.location,
        input?.description,
      ]
        .filter(Boolean)
        .join(" "),
      sanitizedText: contactScan.sanitizedText,
    });
  }

  if (imageModeration?.flagged) {
    addReason(
      reasons,
      "image_contact_or_link",
      "A phone number, social handle, payment instruction, or external link was detected in a listing image.",
      55,
      "review",
    );
    score += 55;
    reviewRequired = true;

    logPaymentProtectionEvent({
      actorId: store.owner_id,
      contextType: itemType,
      contextId: "",
      source: "listing_image_ocr",
      action: "review",
      severity: 55,
      reasons: imageModeration.reasons || [],
      originalText: imageModeration.extractedText || "",
      sanitizedText: "",
    });
  }

  if (imageModeration?.reviewRequired && !imageModeration.flagged) {
    addReason(
      reasons,
      "image_scan_incomplete",
      "Image safety scanning did not complete, so this listing needs admin review before publishing.",
      30,
      "review",
    );
    score += 30;
    reviewRequired = true;
  }

  if (images.length === 0) {
    addReason(reasons, "missing_images", "Add clear product images to increase buyer trust.", 10, "info");
    score += 10;
  }

  const priceKobo = priceKoboFromInput(input);

  if (priceKobo > 500_000_00) {
    addReason(reasons, "high_value", "High-value listings need admin review before going public.", 35, "review");
    score += 35;
    reviewRequired = true;
  }

  const level = riskLevel(score);
  const moderationStatus = rejected
    ? "rejected"
    : reviewRequired || level === "high" || level === "critical"
      ? "pending_review"
      : "auto_approved";
  const publicStatus =
    PUBLIC_APPROVED.has(moderationStatus) && requestedStatus === "active"
      ? Number(stock || 0) <= 0 || availabilityStatus === "out_of_stock"
        ? "out_of_stock"
        : "active"
      : "draft";

  return {
    moderationStatus,
    moderationNote:
      reasons[0]?.message ||
      (moderationStatus === "auto_approved"
        ? "Auto-approved by Gleenc safety checks."
        : "Saved for admin review."),
    moderationReasons: reasons,
    riskScore: Math.min(score, 100),
    riskLevel: level,
    availabilityStatus,
    sellerConfirmationRequired: availabilityStatus === "confirm_before_payment",
    returnPolicy: returnPolicyFromInput(input),
    ocrReviewStatus: imageModeration?.status || "not_run",
    requiresAdminReview: reviewRequired || rejected,
    publicStatus,
  };
}

export function upsertModerationRecord({ itemId, itemType = "product", moderation, reviewerId = null }) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO product_moderation (
      id, product_id, item_type, status, risk_score, risk_level, reasons, note,
      reviewed_by, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id, item_type) DO UPDATE SET
      status = excluded.status,
      risk_score = excluded.risk_score,
      risk_level = excluded.risk_level,
      reasons = excluded.reasons,
      note = excluded.note,
      reviewed_by = COALESCE(excluded.reviewed_by, product_moderation.reviewed_by),
      reviewed_at = COALESCE(excluded.reviewed_at, product_moderation.reviewed_at),
      updated_at = excluded.updated_at
  `).run(
    createId("mod"),
    itemId,
    itemType,
    moderation.moderationStatus,
    moderation.riskScore,
    moderation.riskLevel,
    JSON.stringify(moderation.moderationReasons || []),
    moderation.moderationNote || "",
    reviewerId,
    reviewerId ? now : null,
    now,
    now,
  );
}

export function moderationSqlPatch(moderation) {
  return {
    moderationStatus: moderation.moderationStatus,
    moderationNote: moderation.moderationNote || "",
    moderationReasonsJson: JSON.stringify(moderation.moderationReasons || []),
    riskScore: moderation.riskScore || 0,
    riskLevel: moderation.riskLevel || "low",
    availabilityStatus: moderation.availabilityStatus || "available_now",
    sellerConfirmationRequired: moderation.sellerConfirmationRequired ? 1 : 0,
    returnPolicy: moderation.returnPolicy || "standard",
    ocrReviewStatus: moderation.ocrReviewStatus || "not_run",
    requiresAdminReview: moderation.requiresAdminReview ? 1 : 0,
    publicStatus: moderation.publicStatus || "draft",
  };
}

export function listProductModeration({ status = "", query = "" } = {}) {
  const params = [];
  let where = "WHERE 1 = 1";

  if (status) {
    where += " AND products.moderation_status = ?";
    params.push(status);
  }

  if (!status) {
    where += " AND products.moderation_status IN ('pending_review', 'flagged', 'rejected')";
  }

  if (query) {
    where += " AND (products.name LIKE ? OR products.category LIKE ? OR stores.name LIKE ?)";
    const like = `%${query}%`;
    params.push(like, like, like);
  }

  return db
    .prepare(`
      SELECT products.*, stores.name AS store_name, stores.slug AS store_slug,
             stores.owner_id AS seller_id, users.name AS seller_name
      FROM products
      JOIN stores ON stores.id = products.store_id
      JOIN users ON users.id = stores.owner_id
      ${where}
      ORDER BY
        CASE products.moderation_status
          WHEN 'pending_review' THEN 1
          WHEN 'flagged' THEN 2
          WHEN 'rejected' THEN 3
          ELSE 9
        END,
        products.updated_at DESC
      LIMIT 250
    `)
    .all(...params)
    .map((row) => ({
      ...serializeProduct(row),
      storeName: row.store_name,
      storeSlug: row.store_slug,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
    }));
}

function ownerNotificationForProduct(productId, title, body) {
  const row = db
    .prepare(`
      SELECT products.id, products.name, stores.owner_id
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = ?
    `)
    .get(productId);

  if (!row) return;

  createNotification({
    userId: row.owner_id,
    type: "product",
    title,
    body: body || `${row.name} moderation status has changed.`,
    actionLabel: "Open dashboard",
    actionPath: "/dashboard",
  });
}

function productWithOwner(productId) {
  return db
    .prepare(`
      SELECT products.*, stores.owner_id, stores.seller_type, stores.campus
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = ?
    `)
    .get(productId);
}

function assertProductOwner(auth, product) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  if (auth.role === "admin") return;
  if (product.owner_id !== (auth.user_id || auth.id)) {
    throw new HttpError(403, "Only the seller or admin can publish this product.");
  }
}

function productPriceInput(product) {
  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    priceKobo: product.buyer_price_kobo || product.price_kobo,
    sellerType: product.seller_type || "campus",
    campus: product.campus || "",
  };
}

function upsertStage3ModerationReview(product, result) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO product_moderation_reviews (
      id, product_id, item_type, status, risk_score, risk_level, reasons,
      ocr_status, ocr_result_id, note, reviewed_by, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, 'product', ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)
    ON CONFLICT(product_id, item_type) DO UPDATE SET
      status = excluded.status,
      risk_score = excluded.risk_score,
      risk_level = excluded.risk_level,
      reasons = excluded.reasons,
      ocr_status = excluded.ocr_status,
      note = excluded.note,
      updated_at = excluded.updated_at
  `).run(
    createId("pmr"),
    product.id,
    result.status,
    Number(product.risk_score || 0),
    product.risk_level || "low",
    JSON.stringify(result.reasons || []),
    result.ocrStatus || "not_run",
    result.note || "",
    now,
    now,
  );
}

export function validateProductForPublication(auth, productId) {
  const product = productWithOwner(productId);
  if (!product) throw new HttpError(404, "Product was not found.");
  assertProductOwner(auth, product);

  const imageUrls = safeJsonArray(product.image_urls);
  const moderation = getProductModerationStatus(productId);
  const price = validateAndStoreProductPrice(
    productId,
    "product",
    productPriceInput(product),
  );

  const reasons = [];
  if (imageUrls.length === 0) {
    reasons.push({
      code: "missing_images",
      message: "Upload at least one clear image before publishing.",
      action: "block",
    });
  }
  if (["rejected", "hidden"].includes(moderation.moderationStatus)) {
    reasons.push({
      code: "moderation_blocked",
      message: moderation.moderationNote || "This product needs changes before it can be published.",
      action: "block",
    });
  }
  if (price.status === "block" && Number(price.priceKobo || 0) <= 0) {
    reasons.push({
      code: "price_blocked",
      message: price.reason,
      action: "block",
    });
  }
  if (
    Number(price.priceKobo || 0) > 500_000_00 ||
    ["pending_review", "flagged"].includes(moderation.moderationStatus)
  ) {
    reasons.push({
      code: "admin_review",
      message: price.reason || moderation.moderationNote || "This product needs admin review before it goes public.",
      action: "review",
    });
  }

  const blocked = reasons.some((reason) => reason.action === "block");
  const requiresReview = !blocked && reasons.some((reason) => reason.action === "review");
  const status = blocked ? "rejected" : requiresReview ? "pending_review" : "approved";

  upsertStage3ModerationReview(product, {
    status,
    reasons,
    note: reasons[0]?.message || "Product is ready to publish.",
  });

  return {
    product: serializeProduct(product),
    ready: !blocked && !requiresReview,
    blocked,
    requiresReview,
    status,
    reasons,
    moderation,
    price,
  };
}

export function publishProductAfterValidation(auth, productId) {
  const product = productWithOwner(productId);
  if (!product) throw new HttpError(404, "Product was not found.");
  assertProductOwner(auth, product);

  const validation = validateProductForPublication(auth, productId);

  if (validation.blocked) {
    throw new HttpError(422, validation.reasons[0]?.message || "This product cannot be published yet.");
  }

  const now = nowIso();
  const nextStatus =
    validation.requiresReview
      ? "draft"
      : Number(product.stock || 0) <= 0
        ? "out_of_stock"
        : "active";
  const moderationStatus = validation.requiresReview
    ? "pending_review"
    : product.moderation_status === "approved"
      ? "approved"
      : "auto_approved";

  db.prepare(`
    UPDATE products
    SET status = ?,
        moderation_status = ?,
        requires_admin_review = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextStatus,
    moderationStatus,
    validation.requiresReview ? 1 : 0,
    now,
    productId,
  );

  const updated = serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(productId));
  return {
    product: updated,
    validation: {
      ...validation,
      product: updated,
    },
  };
}

export function adminReviewProduct(auth, productId, input = {}) {
  if (!auth || auth.role !== "admin") throw new HttpError(403, "Only admins can review products.");

  const action = clean(input.action || input.status, 40);
  const note = clean(input.note || input.moderationNote || "", 1000);
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);

  if (!product) throw new HttpError(404, "Product was not found.");

  const now = nowIso();
  let moderationStatus = product.moderation_status || "pending_review";
  let status = product.status || "draft";
  let title = "Product moderation updated";

  if (action === "approve" || action === "approved" || action === "active") {
    moderationStatus = "approved";
    status = Number(product.stock || 0) <= 0 ? "out_of_stock" : "active";
    title = "Product approved";
  } else if (action === "reject" || action === "rejected") {
    moderationStatus = "rejected";
    status = "draft";
    title = "Product rejected";
  } else if (action === "hide" || action === "hidden") {
    moderationStatus = "hidden";
    status = "draft";
    title = "Product hidden";
  } else if (action === "flag" || action === "flagged" || action === "review") {
    moderationStatus = "flagged";
    status = "draft";
    title = "Product flagged for review";
  } else {
    throw new HttpError(422, "Choose approve, reject, hide, or flag.");
  }

  transaction(() => {
    db.prepare(`
      UPDATE products
      SET status = ?,
          moderation_status = ?,
          moderation_note = ?,
          reviewed_by = ?,
          reviewed_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(status, moderationStatus, note, auth.user_id || auth.id || null, now, now, productId);

    upsertModerationRecord({
      itemId: productId,
      itemType: "product",
      reviewerId: auth.user_id || auth.id || null,
      moderation: {
        moderationStatus,
        moderationNote: note || title,
        moderationReasons: safeJsonArray(product.moderation_reasons),
        riskScore: Number(product.risk_score || 0),
        riskLevel: product.risk_level || "low",
      },
    });

    ownerNotificationForProduct(productId, title, note);
  });

  return serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(productId));
}

export function updateProductAvailability(auth, productId, input = {}) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  const product = db
    .prepare(`
      SELECT products.*, stores.owner_id
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = ?
    `)
    .get(productId);

  if (!product) throw new HttpError(404, "Product was not found.");
  if (auth.role !== "admin" && product.owner_id !== (auth.user_id || auth.id)) {
    throw new HttpError(403, "Only the seller or admin can update availability.");
  }

  const availabilityStatus = availabilityFromInput(input, product.stock);
  const note = clean(input.note || "", 500);
  const now = nowIso();
  const nextStatus =
    availabilityStatus === "out_of_stock"
      ? "out_of_stock"
      : PUBLIC_APPROVED.has(product.moderation_status)
        ? "active"
        : product.status;

  transaction(() => {
    db.prepare(`
      UPDATE products
      SET availability_status = ?,
          seller_confirmation_required = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      availabilityStatus,
      availabilityStatus === "confirm_before_payment" ? 1 : 0,
      nextStatus,
      now,
      productId,
    );

    db.prepare(`
      INSERT INTO product_availability_events (
        id, product_id, store_id, old_status, new_status, note, changed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      createId("pav"),
      productId,
      product.store_id,
      product.availability_status || "",
      availabilityStatus,
      note,
      auth.user_id || auth.id || null,
      now,
    );
  });

  return serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(productId));
}

export function getProductModerationStatus(productId) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) throw new HttpError(404, "Product was not found.");
  return {
    productId,
    moderationStatus: product.moderation_status || "draft",
    moderationNote: product.moderation_note || "",
    moderationReasons: safeJsonArray(product.moderation_reasons),
    riskScore: Number(product.risk_score || 0),
    riskLevel: product.risk_level || "low",
    availabilityStatus: product.availability_status || "available_now",
    sellerConfirmationRequired: Boolean(product.seller_confirmation_required),
    publicStatus: product.status,
  };
}

export function shouldTreatAsPublic(row) {
  return PUBLIC_APPROVED.has(row?.moderation_status || "auto_approved");
}

export function isInReview(row) {
  return ACTIVE_REVIEW_STATUSES.has(row?.moderation_status || "");
}
