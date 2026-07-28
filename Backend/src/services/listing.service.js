import { db } from "../db/database.js";
import { createId, slugify } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { env } from "../config/env.js";
import { deleteUploadedFiles } from "../middleware/upload.js";
import {
  serializeProduct,
  serializeService,
} from "../lib/serializers.js";
import { findStoreByOwnerId } from "../repositories/store.repository.js";
import { assertCategoryAllowedForStore } from "./market.service.js";
import {
  evaluateListingModeration,
  moderationSqlPatch,
  upsertModerationRecord,
} from "./moderation.service.js";
import { applyProductPackageProfile } from "./logistics.service.js";
const MAX_LISTING_IMAGES = 10;

function computePlatformPrice(price) {
  const sellerPriceKobo = Math.round(Number(price || 0) * 100);
  const platformFeeKobo = Math.round((sellerPriceKobo * env.platformFeePercent) / 100);
  const buyerPriceKobo = sellerPriceKobo + platformFeeKobo;
  return { sellerPriceKobo, platformFeeKobo, buyerPriceKobo };
}

function normalizeDeliveryReadiness(input = {}) {
  const type = ["immediate", "hours", "days", "scheduled_date"].includes(input.deliveryReadinessType)
    ? input.deliveryReadinessType
    : "immediate";
  const value = String(input.deliveryReadinessValue || "").trim().slice(0, 80);
  let readyAfterMinutes = Math.max(0, Math.round(Number(input.deliveryReadyAfterMinutes || 0)));
  let readyAt = String(input.deliveryReadyAt || "").trim().slice(0, 80) || null;

  if (type === "hours") {
    const hours = Math.max(1, Number(value || input.deliveryReadinessHours || 1));
    readyAfterMinutes = Math.round(hours * 60);
    readyAt = null;
  } else if (type === "days") {
    const days = Math.max(1, Number(value || input.deliveryReadinessDays || 1));
    readyAfterMinutes = Math.round(days * 1440);
    readyAt = null;
  } else if (type === "scheduled_date") {
    readyAfterMinutes = 0;
    if (!readyAt) {
      throw new HttpError(422, "Select the date/time this product will be ready for delivery.");
    }
  } else {
    readyAfterMinutes = 0;
    readyAt = null;
  }

  return {
    type,
    value,
    readyAfterMinutes,
    readyAt,
  };
}

function serviceAmountRange(input) {
  const basePrice = Number(input.price || 0);
  const minPrice = Number(input.minPrice || 0) > 0 ? Number(input.minPrice) : basePrice;
  const maxPrice = Number(input.maxPrice || 0) > 0 ? Math.max(Number(input.maxPrice), minPrice) : 0;

  return {
    minPriceKobo: Math.round(minPrice * 100),
    maxPriceKobo: Math.round(maxPrice * 100),
  };
}

function storeForUser(userId) {
  const store = findStoreByOwnerId(userId);

  if (!store) {
    throw new HttpError(404, "Seller store was not found.");
  }

  return store;
}

function uniqueListingSlug(table, storeId, name, ignoredId) {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  const query = ignoredId
    ? `SELECT id FROM ${table} WHERE store_id = ? AND slug = ? AND id != ?`
    : `SELECT id FROM ${table} WHERE store_id = ? AND slug = ?`;

  while (
    ignoredId
      ? db.prepare(query).get(storeId, candidate, ignoredId)
      : db.prepare(query).get(storeId, candidate)
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}



function retainedImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string").slice(0, MAX_LISTING_IMAGES)
      : [];
  } catch {
    return [];
  }
}

function storedImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function storedArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function assertListingImages(images, itemType) {
  if (!Array.isArray(images) || images.length < 1) {
    throw new HttpError(422, `Add at least one ${itemType} image before publishing.`);
  }
}

export function sellerWorkspace(userId) {
  const store = storeForUser(userId);
  const products = db
    .prepare("SELECT * FROM products WHERE store_id = ? ORDER BY created_at DESC")
    .all(store.id)
    .map(serializeProduct);
  const services = db
    .prepare("SELECT * FROM services WHERE store_id = ? ORDER BY created_at DESC")
    .all(store.id)
    .map(serializeService);

  return { store, products, services };
}

export function createProduct(userId, input, uploadedUrls, imageModeration = null) {
  const store = storeForUser(userId);
  assertCategoryAllowedForStore(store, input.category, { itemType: "product" });
  const now = new Date().toISOString();
  const id = createId("prd");
  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  assertListingImages(images, "product");
  const stock = Number(input.stock || 0);
  const moderation = evaluateListingModeration({
    store,
    input: { ...input, stock },
    images,
    itemType: "product",
    imageModeration,
  });
  const moderationPatch = moderationSqlPatch(moderation);
  const status = moderationPatch.publicStatus;
  const price = computePlatformPrice(input.price);
  const readiness = normalizeDeliveryReadiness(input);

  db.prepare(`
    INSERT INTO products (
      id, store_id, name, slug, category, description, price_kobo, seller_price_kobo, platform_fee_kobo, buyer_price_kobo,
      stock, status, moderation_status, moderation_note, moderation_reasons, risk_score, risk_level,
      availability_status, seller_confirmation_required, return_policy, delivery_readiness_type,
      delivery_readiness_value, delivery_ready_after_minutes, delivery_ready_at,
      ocr_review_status, requires_admin_review, is_featured, image_urls, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    store.id,
    input.name,
    uniqueListingSlug("products", store.id, input.name),
    input.category,
    input.description,
    price.buyerPriceKobo,
    price.sellerPriceKobo,
    price.platformFeeKobo,
    price.buyerPriceKobo,
    stock,
    status,
    moderationPatch.moderationStatus,
    moderationPatch.moderationNote,
    moderationPatch.moderationReasonsJson,
    moderationPatch.riskScore,
    moderationPatch.riskLevel,
    moderationPatch.availabilityStatus,
    moderationPatch.sellerConfirmationRequired,
    moderationPatch.returnPolicy,
    readiness.type,
    readiness.value,
    readiness.readyAfterMinutes,
    readiness.readyAt,
    moderationPatch.ocrReviewStatus,
    moderationPatch.requiresAdminReview,
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    now,
    now,
  );
  upsertModerationRecord({ itemId: id, itemType: "product", moderation });
  applyProductPackageProfile(id, input, { actorId: userId });

  return serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(id));
}

export function updateProduct(userId, productId, input, uploadedUrls, imageModeration = null) {
  const store = storeForUser(userId);
  assertCategoryAllowedForStore(store, input.category, { itemType: "product" });
  const existing = db
    .prepare("SELECT * FROM products WHERE id = ? AND store_id = ?")
    .get(productId, store.id);

  if (!existing) throw new HttpError(404, "Product was not found.");

  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  assertListingImages(images, "product");
  const priorModerationReasons = storedArray(existing.moderation_reasons);
  const effectiveImageModeration = imageModeration || {
    status: existing.ocr_review_status || "not_run",
    flagged: priorModerationReasons.some(
      (reason) => reason?.code === "image_contact_or_link",
    ),
    reasons: priorModerationReasons
      .filter((reason) => reason?.code === "image_contact_or_link")
      .map((reason) => reason.message),
  };
  const moderation = evaluateListingModeration({
    store,
    input: { ...input, stock: Number(input.stock || 0) },
    images,
    itemType: "product",
    imageModeration: effectiveImageModeration,
  });
  const moderationPatch = moderationSqlPatch(moderation);
  const status = moderationPatch.publicStatus;
  const price = computePlatformPrice(input.price);
  const readiness = normalizeDeliveryReadiness(input);

  db.prepare(`
    UPDATE products
    SET name = ?, slug = ?, category = ?, description = ?, price_kobo = ?,
        seller_price_kobo = ?, platform_fee_kobo = ?, buyer_price_kobo = ?,
        stock = ?, status = ?, moderation_status = ?, moderation_note = ?,
        moderation_reasons = ?, risk_score = ?, risk_level = ?,
        availability_status = ?, seller_confirmation_required = ?, return_policy = ?,
        delivery_readiness_type = ?, delivery_readiness_value = ?,
        delivery_ready_after_minutes = ?, delivery_ready_at = ?,
        ocr_review_status = ?, requires_admin_review = ?,
        reviewed_by = NULL, reviewed_at = NULL,
        is_featured = ?, image_urls = ?, updated_at = ?
    WHERE id = ? AND store_id = ?
  `).run(
    input.name,
    uniqueListingSlug("products", store.id, input.name, productId),
    input.category,
    input.description,
    price.buyerPriceKobo,
    price.sellerPriceKobo,
    price.platformFeeKobo,
    price.buyerPriceKobo,
    input.stock,
    status,
    moderationPatch.moderationStatus,
    moderationPatch.moderationNote,
    moderationPatch.moderationReasonsJson,
    moderationPatch.riskScore,
    moderationPatch.riskLevel,
    moderationPatch.availabilityStatus,
    moderationPatch.sellerConfirmationRequired,
    moderationPatch.returnPolicy,
    readiness.type,
    readiness.value,
    readiness.readyAfterMinutes,
    readiness.readyAt,
    moderationPatch.ocrReviewStatus,
    moderationPatch.requiresAdminReview,
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    new Date().toISOString(),
    productId,
    store.id,
  );
  upsertModerationRecord({ itemId: productId, itemType: "product", moderation });
  applyProductPackageProfile(productId, input, { actorId: userId });

  const oldImages = storedImages(existing.image_urls);
  deleteUploadedFiles(oldImages.filter((url) => !images.includes(url)));

  return serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(productId));
}

export function deleteProduct(userId, productId) {
  const store = storeForUser(userId);
  const existing = db
    .prepare("SELECT * FROM products WHERE id = ? AND store_id = ?")
    .get(productId, store.id);
  const result = db
    .prepare("DELETE FROM products WHERE id = ? AND store_id = ?")
    .run(productId, store.id);

  if (!result.changes) throw new HttpError(404, "Product was not found.");
  deleteUploadedFiles(storedImages(existing.image_urls));
}

export function createService(userId, input, uploadedUrls, imageModeration = null) {
  const store = storeForUser(userId);
  assertCategoryAllowedForStore(store, input.category, { itemType: "service" });
  const now = new Date().toISOString();
  const id = createId("svc");
  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  assertListingImages(images, "service");
  const price = computePlatformPrice(input.price);
  const range = serviceAmountRange(input);
  const moderation = evaluateListingModeration({
    store,
    input,
    images,
    itemType: "service",
    imageModeration,
  });
  const moderationPatch = moderationSqlPatch(moderation);
  const status =
    input.status === "active" && moderationPatch.publicStatus === "active"
      ? "active"
      : input.status === "paused"
        ? "paused"
        : "draft";

  db.prepare(`
    INSERT INTO services (
      id, store_id, name, slug, category, service_type, location, description,
      price_kobo, seller_price_kobo, platform_fee_kobo, buyer_price_kobo, min_price_kobo, max_price_kobo,
      duration_minutes, status, moderation_status, moderation_note, moderation_reasons, risk_score, risk_level,
      availability_status, seller_confirmation_required, return_policy, ocr_review_status,
      requires_admin_review, is_featured, image_urls, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    store.id,
    input.name,
    uniqueListingSlug("services", store.id, input.name),
    input.category,
    input.serviceType || input.category,
    input.location || store.campus || "",
    input.description,
    price.buyerPriceKobo,
    price.sellerPriceKobo,
    price.platformFeeKobo,
    price.buyerPriceKobo,
    range.minPriceKobo,
    range.maxPriceKobo,
    input.durationMinutes,
    status,
    moderationPatch.moderationStatus,
    moderationPatch.moderationNote,
    moderationPatch.moderationReasonsJson,
    moderationPatch.riskScore,
    moderationPatch.riskLevel,
    moderationPatch.availabilityStatus,
    moderationPatch.sellerConfirmationRequired,
    moderationPatch.returnPolicy,
    moderationPatch.ocrReviewStatus,
    moderationPatch.requiresAdminReview,
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    now,
    now,
  );
  upsertModerationRecord({ itemId: id, itemType: "service", moderation });

  return serializeService(db.prepare("SELECT * FROM services WHERE id = ?").get(id));
}

export function updateService(userId, serviceId, input, uploadedUrls, imageModeration = null) {
  const store = storeForUser(userId);
  assertCategoryAllowedForStore(store, input.category, { itemType: "service" });
  const existing = db
    .prepare("SELECT * FROM services WHERE id = ? AND store_id = ?")
    .get(serviceId, store.id);

  if (!existing) throw new HttpError(404, "Service was not found.");

  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  assertListingImages(images, "service");
  const priorModerationReasons = storedArray(existing.moderation_reasons);
  const effectiveImageModeration = imageModeration || {
    status: existing.ocr_review_status || "not_run",
    flagged: priorModerationReasons.some(
      (reason) => reason?.code === "image_contact_or_link",
    ),
    reasons: priorModerationReasons
      .filter((reason) => reason?.code === "image_contact_or_link")
      .map((reason) => reason.message),
  };
  const price = computePlatformPrice(input.price);
  const range = serviceAmountRange(input);
  const moderation = evaluateListingModeration({
    store,
    input,
    images,
    itemType: "service",
    imageModeration: effectiveImageModeration,
  });
  const moderationPatch = moderationSqlPatch(moderation);
  const status =
    input.status === "active" && moderationPatch.publicStatus === "active"
      ? "active"
      : input.status === "paused"
        ? "paused"
        : "draft";

  db.prepare(`
    UPDATE services
    SET name = ?, slug = ?, category = ?, service_type = ?, location = ?, description = ?, price_kobo = ?,
        seller_price_kobo = ?, platform_fee_kobo = ?, buyer_price_kobo = ?,
        min_price_kobo = ?, max_price_kobo = ?, duration_minutes = ?, status = ?,
        moderation_status = ?, moderation_note = ?, moderation_reasons = ?,
        risk_score = ?, risk_level = ?, availability_status = ?,
        seller_confirmation_required = ?, return_policy = ?,
        ocr_review_status = ?, requires_admin_review = ?,
        reviewed_by = NULL, reviewed_at = NULL,
        is_featured = ?, image_urls = ?, updated_at = ?
    WHERE id = ? AND store_id = ?
  `).run(
    input.name,
    uniqueListingSlug("services", store.id, input.name, serviceId),
    input.category,
    input.serviceType || input.category,
    input.location || store.campus || "",
    input.description,
    price.buyerPriceKobo,
    price.sellerPriceKobo,
    price.platformFeeKobo,
    price.buyerPriceKobo,
    range.minPriceKobo,
    range.maxPriceKobo,
    input.durationMinutes,
    status,
    moderationPatch.moderationStatus,
    moderationPatch.moderationNote,
    moderationPatch.moderationReasonsJson,
    moderationPatch.riskScore,
    moderationPatch.riskLevel,
    moderationPatch.availabilityStatus,
    moderationPatch.sellerConfirmationRequired,
    moderationPatch.returnPolicy,
    moderationPatch.ocrReviewStatus,
    moderationPatch.requiresAdminReview,
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    new Date().toISOString(),
    serviceId,
    store.id,
  );
  upsertModerationRecord({ itemId: serviceId, itemType: "service", moderation });

  const oldImages = storedImages(existing.image_urls);
  deleteUploadedFiles(oldImages.filter((url) => !images.includes(url)));

  return serializeService(db.prepare("SELECT * FROM services WHERE id = ?").get(serviceId));
}

export function deleteService(userId, serviceId) {
  const store = storeForUser(userId);
  const existing = db
    .prepare("SELECT * FROM services WHERE id = ? AND store_id = ?")
    .get(serviceId, store.id);
  const result = db
    .prepare("DELETE FROM services WHERE id = ? AND store_id = ?")
    .run(serviceId, store.id);

  if (!result.changes) throw new HttpError(404, "Service was not found.");
  deleteUploadedFiles(storedImages(existing.image_urls));
}
