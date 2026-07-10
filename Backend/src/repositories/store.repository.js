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
      seller_type, operating_hours, whatsapp_phone, allow_rider_whatsapp_contact,
      location_area, pickup_location, nearest_landmark, market_id,
      shop_stall_number, shop_section, pickup_lat, pickup_lng,
      status, verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    store.id,
    store.ownerId,
    store.slug,
    store.name,
    store.description,
    store.campus,
    store.category,
    store.phone,
    store.sellerType || "campus",
    store.operatingHours || "",
    store.whatsappPhone || store.phone || "",
    store.allowRiderWhatsAppContact === false ? 0 : 1,
    store.locationArea || "",
    store.pickupLocation || "",
    store.nearestLandmark || "",
    store.marketId || null,
    store.shopStallNumber || "",
    store.shopSection || "",
    store.pickupLat ?? null,
    store.pickupLng ?? null,
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
        seller_type = ?, operating_hours = ?, whatsapp_phone = ?,
        allow_rider_whatsapp_contact = ?, location_area = ?,
        pickup_location = ?, nearest_landmark = ?, market_id = ?,
        shop_stall_number = ?, shop_section = ?, pickup_lat = ?, pickup_lng = ?,
        status = ?, logo_url = COALESCE(?, logo_url),
        cover_url = COALESCE(?, cover_url), updated_at = ?
    WHERE owner_id = ?
  `).run(
    updates.name,
    updates.description,
    updates.campus,
    updates.category,
    updates.phone,
    updates.sellerType || "campus",
    updates.operatingHours || "",
    updates.whatsappPhone || updates.phone || "",
    updates.allowRiderWhatsAppContact === false ? 0 : 1,
    updates.locationArea || "",
    updates.pickupLocation || "",
    updates.nearestLandmark || "",
    updates.marketId || null,
    updates.shopStallNumber || "",
    updates.shopSection || "",
    updates.pickupLat ?? null,
    updates.pickupLng ?? null,
    updates.status,
    updates.logoUrl,
    updates.coverUrl,
    updates.updatedAt,
    ownerId,
  );

  return findStoreByOwnerId(ownerId);
}
