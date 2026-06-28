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
const MAX_LISTING_IMAGES = 10;

function computePlatformPrice(price) {
  const sellerPriceKobo = Math.round(Number(price || 0) * 100);
  const platformFeeKobo = Math.round((sellerPriceKobo * env.platformFeePercent) / 100);
  const buyerPriceKobo = sellerPriceKobo + platformFeeKobo;
  return { sellerPriceKobo, platformFeeKobo, buyerPriceKobo };
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

export function createProduct(userId, input, uploadedUrls) {
  const store = storeForUser(userId);
  const now = new Date().toISOString();
  const id = createId("prd");
  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  const stock = input.stock;
  const status = stock === 0 && input.status === "active" ? "out_of_stock" : input.status;
  const price = computePlatformPrice(input.price);

  db.prepare(`
    INSERT INTO products (
      id, store_id, name, slug, category, description, price_kobo, seller_price_kobo, platform_fee_kobo, buyer_price_kobo,
      stock, status, is_featured, image_urls, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    now,
    now,
  );

  return serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(id));
}

export function updateProduct(userId, productId, input, uploadedUrls) {
  const store = storeForUser(userId);
  const existing = db
    .prepare("SELECT * FROM products WHERE id = ? AND store_id = ?")
    .get(productId, store.id);

  if (!existing) throw new HttpError(404, "Product was not found.");

  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  const status =
    input.stock === 0 && input.status === "active" ? "out_of_stock" : input.status;
  const price = computePlatformPrice(input.price);

  db.prepare(`
    UPDATE products
    SET name = ?, slug = ?, category = ?, description = ?, price_kobo = ?,
        seller_price_kobo = ?, platform_fee_kobo = ?, buyer_price_kobo = ?,
        stock = ?, status = ?, is_featured = ?, image_urls = ?, updated_at = ?
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
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    new Date().toISOString(),
    productId,
    store.id,
  );

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

export function createService(userId, input, uploadedUrls) {
  const store = storeForUser(userId);
  const now = new Date().toISOString();
  const id = createId("svc");
  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  const price = computePlatformPrice(input.price);

  db.prepare(`
    INSERT INTO services (
      id, store_id, name, slug, category, description, price_kobo, seller_price_kobo, platform_fee_kobo, buyer_price_kobo,
      duration_minutes, status, is_featured, image_urls, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    store.id,
    input.name,
    uniqueListingSlug("services", store.id, input.name),
    input.category,
    input.description,
    price.buyerPriceKobo,
    price.sellerPriceKobo,
    price.platformFeeKobo,
    price.buyerPriceKobo,
    input.durationMinutes,
    input.status,
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    now,
    now,
  );

  return serializeService(db.prepare("SELECT * FROM services WHERE id = ?").get(id));
}

export function updateService(userId, serviceId, input, uploadedUrls) {
  const store = storeForUser(userId);
  const existing = db
    .prepare("SELECT * FROM services WHERE id = ? AND store_id = ?")
    .get(serviceId, store.id);

  if (!existing) throw new HttpError(404, "Service was not found.");

  const images = [...retainedImages(input.retainedImageUrls), ...uploadedUrls].slice(0, MAX_LISTING_IMAGES);
  const price = computePlatformPrice(input.price);

  db.prepare(`
    UPDATE services
    SET name = ?, slug = ?, category = ?, description = ?, price_kobo = ?,
        seller_price_kobo = ?, platform_fee_kobo = ?, buyer_price_kobo = ?,
        duration_minutes = ?, status = ?, is_featured = ?, image_urls = ?, updated_at = ?
    WHERE id = ? AND store_id = ?
  `).run(
    input.name,
    uniqueListingSlug("services", store.id, input.name, serviceId),
    input.category,
    input.description,
    price.buyerPriceKobo,
    price.sellerPriceKobo,
    price.platformFeeKobo,
    price.buyerPriceKobo,
    input.durationMinutes,
    input.status,
    input.isFeatured ? 1 : 0,
    JSON.stringify(images),
    new Date().toISOString(),
    serviceId,
    store.id,
  );

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
