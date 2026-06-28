import { db } from "../db/database.js";

export function findStoreByOwnerId(ownerId) {
  return db.prepare("SELECT * FROM stores WHERE owner_id = ?").get(ownerId);
}

export function findStoreBySlug(slug) {
  return db.prepare("SELECT * FROM stores WHERE slug = ?").get(slug);
}

export function createStore(store) {
  db.prepare(`
    INSERT INTO stores (
      id, owner_id, slug, name, description, campus, category, phone,
      status, verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    store.id,
    store.ownerId,
    store.slug,
    store.name,
    store.description,
    store.campus,
    store.category,
    store.phone,
    store.status,
    store.verified ? 1 : 0,
    store.createdAt,
    store.updatedAt,
  );

  return findStoreByOwnerId(store.ownerId);
}

export function updateStore(ownerId, updates) {
  db.prepare(`
    UPDATE stores
    SET name = ?, description = ?, campus = ?, category = ?, phone = ?,
        status = ?, logo_url = COALESCE(?, logo_url),
        cover_url = COALESCE(?, cover_url), updated_at = ?
    WHERE owner_id = ?
  `).run(
    updates.name,
    updates.description,
    updates.campus,
    updates.category,
    updates.phone,
    updates.status,
    updates.logoUrl,
    updates.coverUrl,
    updates.updatedAt,
    ownerId,
  );

  return findStoreByOwnerId(ownerId);
}
