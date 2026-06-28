import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import {
  serializeProduct,
  serializeService,
  serializeStore,
  serializeUsedListing,
} from "../lib/serializers.js";

function targetFor(type, itemId) {
  if (type === "product") {
    const row = db.prepare(`
      SELECT products.*, stores.name AS store_name, stores.slug AS store_slug
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = ? AND stores.status = 'active'
        AND products.status IN ('active', 'out_of_stock')
    `).get(itemId);
    return row
      ? {
          ...serializeProduct(row),
          storeName: row.store_name,
          storeSlug: row.store_slug,
        }
      : null;
  }

  if (type === "store") {
    const row = db
      .prepare("SELECT * FROM stores WHERE id = ? AND status = 'active'")
      .get(itemId);
    return serializeStore(row);
  }

  if (type === "service") {
    const row = db.prepare(`
      SELECT services.*, stores.name AS store_name, stores.slug AS store_slug
      FROM services
      JOIN stores ON stores.id = services.store_id
      WHERE services.id = ? AND stores.status = 'active'
        AND services.status = 'active'
    `).get(itemId);
    return row
      ? {
          ...serializeService(row),
          storeName: row.store_name,
          storeSlug: row.store_slug,
        }
      : null;
  }

  const row = db.prepare(`
    SELECT used_listings.*, users.name AS seller_name,
           users.phone AS seller_phone
    FROM used_listings
    JOIN users ON users.id = used_listings.seller_id
    WHERE used_listings.id = ? AND used_listings.status = 'active'
  `).get(itemId);
  return serializeUsedListing(row);
}

function savedItemView(row) {
  const item = targetFor(row.item_type, row.item_id);
  if (!item) return null;

  return {
    id: row.id,
    itemType: row.item_type,
    itemId: row.item_id,
    savedAt: row.created_at,
    item,
  };
}

export function listSavedItems(userId) {
  return db
    .prepare(`
      SELECT * FROM saved_items
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId)
    .map(savedItemView)
    .filter(Boolean);
}

export function saveItem(userId, input) {
  if (!targetFor(input.itemType, input.itemId)) {
    throw new HttpError(404, "The item you tried to save was not found.");
  }

  db.prepare(`
    INSERT INTO saved_items (id, user_id, item_type, item_id, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_type, item_id) DO NOTHING
  `).run(
    createId("sav"),
    userId,
    input.itemType,
    input.itemId,
    new Date().toISOString(),
  );

  const row = db
    .prepare(`
      SELECT * FROM saved_items
      WHERE user_id = ? AND item_type = ? AND item_id = ?
    `)
    .get(userId, input.itemType, input.itemId);

  return savedItemView(row);
}

export function removeSavedItem(userId, itemType, itemId) {
  db.prepare(`
    DELETE FROM saved_items
    WHERE user_id = ? AND item_type = ? AND item_id = ?
  `).run(userId, itemType, itemId);
}
