import { db } from "../db/database.js";
import { createId, slugify } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import {
  serializeProduct,
  serializePublicStore,
  serializeStore,
  serializeUsedListing,
} from "../lib/serializers.js";
import { productInteraction, storeInteraction } from "./interaction.service.js";
import { listUsedListings } from "./used-market.service.js";
import { createNotification } from "./notification.service.js";

const DEFAULT_MARKET_CATEGORIES = [
  "Foodstuff",
  "Fashion",
  "Phones & Gadgets",
  "Beauty & Personal Care",
  "Home Essentials",
  "Books & Stationery",
  "Services",
  "Used Items",
];

const DEFAULT_CAMPUS_CATEGORIES = [
  "Cooked Food",
  "Snacks & Drinks",
  "Groceries",
  "Fashion",
  "Phones & Gadgets",
  "Accessories",
  "Beauty & Personal Care",
  "Books & Stationery",
  "Hostel Essentials",
  "Services",
  "Used Items",
  "Other Legal Items",
];

const PROHIBITED_CATEGORY_PATTERNS = [
  /\bdrug(s)?\b/i,
  /\bmedicine(s)?\b/i,
  /\bmedication(s)?\b/i,
  /\bpharmac(y|eutical|euticals)\b/i,
  /\bprescription\b/i,
  /\bguns?\b/i,
  /\bweapons?\b/i,
  /\bfirearms?\b/i,
  /\bammunition\b/i,
  /\bexplosives?\b/i,
];

const SELLER_TYPE_OPTIONS = [
  {
    value: "campus",
    label: "Campus Seller",
    description: "Sell to students and buyers around your campus.",
  },
  {
    value: "local_market",
    label: "Local Market Seller",
    description: "Sell from a real physical market like Igbudu, Ugbomro, Jakpa, Okha, or any approved local market.",
  },
  {
    value: "used_market",
    label: "Used Market Seller",
    description: "Sell fairly-used or pre-owned products safely.",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeLike(value) {
  return String(value || "").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function normalizeCategoryList(value) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? safeJsonArray(value)
      : typeof value === "string" && value.trim()
        ? value.split(",")
        : [];

  const unique = new Map();

  for (const item of rawItems) {
    const label =
      typeof item === "string"
        ? clean(item, 80)
        : clean(item?.name || item?.label || item?.category || "", 80);

    if (!label) continue;
    unique.set(slugify(label), label);
  }

  return Array.from(unique.values());
}

function categoryKey(value) {
  return slugify(clean(value, 100));
}

function assertAllowedStatus(status, allowed, label) {
  if (!allowed.includes(status)) {
    throw new HttpError(422, `${label} must be ${allowed.join(", ")}.`);
  }
}

function isProhibitedCategory(category) {
  const text = clean(category, 120);
  return PROHIBITED_CATEGORY_PATTERNS.some((pattern) => pattern.test(text));
}

function storeRowForOwner(userId) {
  return db.prepare("SELECT * FROM stores WHERE owner_id = ?").get(userId);
}

function storeRowById(storeId) {
  return db.prepare("SELECT * FROM stores WHERE id = ?").get(storeId);
}

function marketRowForId(idOrSlug, publicOnly = false) {
  return getMarketRow(idOrSlug, publicOnly);
}

function serializeCategoryApproval(row) {
  if (!row) return null;

  return {
    id: row.id,
    sellerId: row.seller_id,
    storeId: row.store_id,
    marketId: row.market_id || null,
    marketName: row.market_name || "",
    storeName: row.store_name || "",
    sellerName: row.seller_name || "",
    sellerEmail: row.seller_email || "",
    categoryKey: row.category_key,
    categoryName: row.category_name,
    status: row.status,
    approvedBy: row.approved_by || null,
    adminNote: row.admin_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function categoryApprovalSelectSql(where = "") {
  return `
    SELECT seller_category_approvals.*,
           markets.name AS market_name,
           stores.name AS store_name,
           users.name AS seller_name,
           users.email AS seller_email
    FROM seller_category_approvals
    JOIN stores ON stores.id = seller_category_approvals.store_id
    JOIN users ON users.id = seller_category_approvals.seller_id
    LEFT JOIN markets ON markets.id = seller_category_approvals.market_id
    ${where}
  `;
}

function serializeMarketRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    sellerId: row.seller_id || null,
    storeId: row.store_id || null,
    storeName: row.store_name || "",
    sellerName: row.seller_name || "",
    sellerEmail: row.seller_email || "",
    marketId: row.market_id || null,
    marketName: row.market_name || "",
    state: row.state || "",
    city: row.city || "",
    area: row.area || "",
    address: row.address || "",
    landmark: row.landmark || "",
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    sellerNote: row.seller_note || "",
    whatSells: row.what_sells || "",
    shopDetails: row.shop_details || "",
    contactPhone: row.contact_phone || "",
    photoUrl: row.photo_url || null,
    status: row.status || "pending",
    adminNote: row.admin_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function marketRequestSelectSql(where = "") {
  return `
    SELECT market_requests.*,
           stores.name AS store_name,
           users.name AS seller_name,
           users.email AS seller_email
    FROM market_requests
    LEFT JOIN stores ON stores.id = market_requests.store_id
    LEFT JOIN users ON users.id = market_requests.seller_id
    ${where}
  `;
}

function marketSlugExists(slug, excludeId = "") {
  const row = db
    .prepare("SELECT id FROM markets WHERE slug = ? AND id != ? LIMIT 1")
    .get(slug, excludeId);

  return Boolean(row);
}

function uniqueMarketSlug(source, excludeId = "") {
  const base = slugify(source || "market");
  let candidate = base;
  let attempt = 2;

  while (marketSlugExists(candidate, excludeId)) {
    candidate = `${base}-${attempt}`;
    attempt += 1;
  }

  return candidate;
}

function marketSelectSql(whereClause = "") {
  return `
    SELECT markets.*,
      (
        SELECT COUNT(*)
        FROM seller_market_profiles profile
        JOIN stores ON stores.id = profile.store_id
        WHERE profile.market_id = markets.id
          AND profile.status = 'approved'
          AND stores.status = 'active'
      ) AS seller_count,
      (
        SELECT COUNT(*)
        FROM products
        JOIN stores ON stores.id = products.store_id
        JOIN seller_market_profiles profile ON profile.store_id = stores.id
        WHERE profile.market_id = markets.id
          AND profile.status = 'approved'
          AND stores.status = 'active'
          AND products.status IN ('active', 'out_of_stock')
      ) AS product_count,
      (
        SELECT COUNT(*)
        FROM services
        JOIN stores ON stores.id = services.store_id
        JOIN seller_market_profiles profile ON profile.store_id = stores.id
        WHERE profile.market_id = markets.id
          AND profile.status = 'approved'
          AND stores.status = 'active'
          AND services.status = 'active'
      ) AS service_count
    FROM markets
    ${whereClause}
  `;
}

export function serializeMarket(row) {
  if (!row) return null;

  const allowedCategories = normalizeCategoryList(row.allowed_categories);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    state: row.state || "",
    city: row.city || "",
    area: row.area || "",
    address: row.address || "",
    landmark: row.landmark || "",
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    radiusKm: numberOrFallback(row.radius_km, 3),
    status: row.status || "pending",
    allowedCategories,
    coverUrl: row.cover_url || null,
    iconUrl: row.icon_url || null,
    deliveryNote: row.delivery_note || "",
    counts: {
      sellers: Number(row.seller_count || 0),
      products: Number(row.product_count || 0),
      services: Number(row.service_count || 0),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMarketStore(row, viewerId = "") {
  const privateStore = serializeStore({
    id: row.store_ref_id || row.id,
    owner_id: row.store_owner_id || row.owner_id,
    slug: row.store_slug || row.slug,
    name: row.store_name || row.name,
    description: row.store_description || row.description,
    campus: row.store_campus || row.campus,
    category: row.store_category || row.category,
    phone: row.store_phone || row.phone,
    logo_url: row.store_logo_url || row.logo_url,
    cover_url: row.store_cover_url || row.cover_url,
    status: row.store_status || row.status,
    verified: row.store_verified ?? row.verified,
    verification_status: row.store_verification_status || row.verification_status,
    verification_note: row.store_verification_note || row.verification_note,
    verified_at: row.store_verified_at || row.verified_at,
    seller_type: row.store_seller_type || row.seller_type,
    operating_hours: row.store_operating_hours || row.operating_hours,
    whatsapp_phone: row.store_whatsapp_phone || row.whatsapp_phone,
    allow_rider_whatsapp_contact: row.store_allow_rider_whatsapp_contact ?? row.allow_rider_whatsapp_contact,
    location_area: row.store_location_area || row.location_area,
    pickup_location: row.store_pickup_location || row.pickup_location,
    nearest_landmark: row.store_nearest_landmark || row.nearest_landmark,
    market_id: row.store_market_id || row.market_id,
    shop_stall_number: row.store_shop_stall_number || row.shop_stall_number,
    shop_section: row.store_shop_section || row.shop_section,
    pickup_lat: row.store_pickup_lat ?? row.pickup_lat,
    pickup_lng: row.store_pickup_lng ?? row.pickup_lng,
    country: row.store_country || row.country,
    state: row.store_state || row.state,
    city: row.store_city || row.city,
    nearest_campus: row.store_nearest_campus || row.nearest_campus,
    nearest_marketplace: row.store_nearest_marketplace || row.nearest_marketplace,
    street: row.store_street || row.street,
    pickup_place_id: row.store_pickup_place_id || row.pickup_place_id,
    location_verified_at: row.store_location_verified_at || row.location_verified_at,
    created_at: row.store_created_at || row.created_at,
    updated_at: row.store_updated_at || row.updated_at,
  });

  const store = serializePublicStore(privateStore);
  const output = {
    ...store,
    ownerName: row.owner_name || "",
    ownerEmail: "",
    ownerPhone: "",
    marketProfile: row.profile_id
      ? {
          id: row.profile_id,
          marketId: row.market_id,
          stallNumber: row.stall_number || "",
          addressNote: row.address_note || "",
          shopSection: row.shop_section || "",
          marketLandmark: row.market_landmark || "",
          pickupPoint: row.pickup_point || "",
          status: row.profile_status || "pending",
          createdAt: row.profile_created_at,
          updatedAt: row.profile_updated_at,
        }
      : null,
    counts: {
      products: Number(row.product_count || 0),
      services: Number(row.service_count || 0),
    },
    interaction: storeInteraction(store.id, viewerId),
  };
  Object.defineProperty(output, "_pickupCoordinates", {
    value: { lat: privateStore.pickupLat, lng: privateStore.pickupLng },
    enumerable: false,
  });
  return output;
}

function serializeMarketProduct(row, viewerId = "") {
  const product = {
    ...serializeProduct(row),
    storeName: row.store_name || "",
    storeSlug: row.store_slug || "",
    storeCampus: row.store_campus || "",
    store: serializePublicStore({
      id: row.store_ref_id || row.store_id,
      owner_id: row.store_owner_id,
      slug: row.store_slug,
      name: row.store_name,
      description: row.store_description,
      campus: row.store_campus,
      category: row.store_category,
      phone: row.store_phone,
      logo_url: row.store_logo_url,
      cover_url: row.store_cover_url,
      status: row.store_status,
      verified: row.store_verified,
      verification_status: row.store_verification_status,
      verification_note: row.store_verification_note,
      verified_at: row.store_verified_at,
      seller_type: row.store_seller_type,
      operating_hours: row.store_operating_hours,
      whatsapp_phone: row.store_whatsapp_phone,
      allow_rider_whatsapp_contact: row.store_allow_rider_whatsapp_contact,
      location_area: row.store_location_area,
      pickup_location: row.store_pickup_location,
      nearest_landmark: row.store_nearest_landmark,
      market_id: row.store_market_id,
      shop_stall_number: row.store_shop_stall_number,
      shop_section: row.store_shop_section,
      pickup_lat: row.store_pickup_lat,
      pickup_lng: row.store_pickup_lng,
      country: row.store_country,
      state: row.store_state,
      city: row.store_city,
      nearest_campus: row.store_nearest_campus,
      nearest_marketplace: row.store_nearest_marketplace,
      street: row.store_street,
      pickup_place_id: row.store_pickup_place_id,
      location_verified_at: row.store_location_verified_at,
      created_at: row.store_created_at,
      updated_at: row.store_updated_at,
    }),
    interaction: productInteraction(row.id, viewerId),
    metrics: {
      likes: Number(row.like_count || 0),
      comments: Number(row.comment_count || 0),
      saves: Number(row.save_count || 0),
      shares: Number(row.share_count || 0),
      views: Number(row.view_count || 0),
      storeFollowers: Number(row.store_follower_count || 0),
      successfulDeliveries: Number(row.successful_delivery_count || 0),
      positiveReviews: Number(row.positive_review_count || 0),
    },
  };

  return product;
}

const productSelectSql = `
  SELECT products.*,
         stores.id AS store_ref_id,
         stores.owner_id AS store_owner_id,
         stores.slug AS store_slug,
         stores.name AS store_name,
         stores.description AS store_description,
         stores.campus AS store_campus,
         stores.category AS store_category,
         stores.phone AS store_phone,
         stores.logo_url AS store_logo_url,
         stores.cover_url AS store_cover_url,
         stores.status AS store_status,
         stores.verified AS store_verified,
         stores.verification_status AS store_verification_status,
         stores.verification_note AS store_verification_note,
         stores.verified_at AS store_verified_at,
         stores.seller_type AS store_seller_type,
         stores.operating_hours AS store_operating_hours,
         stores.whatsapp_phone AS store_whatsapp_phone,
         stores.allow_rider_whatsapp_contact AS store_allow_rider_whatsapp_contact,
         stores.location_area AS store_location_area,
         stores.pickup_location AS store_pickup_location,
         stores.nearest_landmark AS store_nearest_landmark,
         stores.market_id AS store_market_id,
         stores.shop_stall_number AS store_shop_stall_number,
         stores.shop_section AS store_shop_section,
         stores.pickup_lat AS store_pickup_lat,
         stores.pickup_lng AS store_pickup_lng,
         stores.country AS store_country,
         stores.state AS store_state,
         stores.city AS store_city,
         stores.nearest_campus AS store_nearest_campus,
         stores.nearest_marketplace AS store_nearest_marketplace,
         stores.street AS store_street,
         stores.pickup_place_id AS store_pickup_place_id,
         stores.location_verified_at AS store_location_verified_at,
         stores.created_at AS store_created_at,
         stores.updated_at AS store_updated_at,
         (SELECT COUNT(*) FROM product_likes WHERE product_likes.product_id = products.id) AS like_count,
         (SELECT COUNT(*) FROM product_comments WHERE product_comments.product_id = products.id AND product_comments.is_deleted = 0) AS comment_count,
         (SELECT COUNT(*) FROM saved_items WHERE saved_items.item_type = 'product' AND saved_items.item_id = products.id) AS save_count,
         (SELECT COUNT(*) FROM product_shares WHERE product_shares.product_id = products.id) AS share_count,
         (SELECT COUNT(*) FROM product_views WHERE product_views.product_id = products.id AND product_views.user_id IS NOT NULL) AS view_count,
         (SELECT COUNT(*) FROM store_follows WHERE store_follows.store_id = stores.id) AS store_follower_count,
         (SELECT COUNT(*) FROM orders WHERE orders.store_id = stores.id AND orders.status IN ('delivered', 'completed') AND orders.payment_status = 'paid') AS successful_delivery_count,
         (SELECT COUNT(*) FROM store_reviews WHERE store_reviews.store_id = stores.id AND store_reviews.rating >= 4) AS positive_review_count
  FROM products
  JOIN stores ON stores.id = products.store_id
`;

const productEngagementOrderSql = `
  (
    CASE WHEN products.is_featured = 1 THEN 30 ELSE 0 END
    + ((SELECT COUNT(*) FROM product_shares WHERE product_shares.product_id = products.id) * 14)
    + ((SELECT COUNT(*) FROM product_comments WHERE product_comments.product_id = products.id AND product_comments.is_deleted = 0) * 10)
    + ((SELECT COUNT(*) FROM product_likes WHERE product_likes.product_id = products.id) * 6)
    + ((SELECT COUNT(*) FROM saved_items WHERE saved_items.item_type = 'product' AND saved_items.item_id = products.id) * 5)
    + ((SELECT COUNT(*) FROM product_views WHERE product_views.product_id = products.id AND product_views.user_id IS NOT NULL) * 1)
    + ((SELECT COUNT(*) FROM store_follows WHERE store_follows.store_id = stores.id) * 8)
    + ((SELECT COUNT(*) FROM orders WHERE orders.store_id = stores.id AND orders.status IN ('delivered', 'completed') AND orders.payment_status = 'paid') * 12)
    + ((SELECT COUNT(*) FROM store_reviews WHERE store_reviews.store_id = stores.id AND store_reviews.rating >= 4) * 15)
  ) DESC,
  products.created_at DESC,
  products.updated_at DESC
`;

const publicSellerVisibilitySql = `
  (
    COALESCE(stores.seller_type, 'campus') IN ('campus', 'used_market')
    OR (
      stores.seller_type = 'local_market'
      AND EXISTS (
        SELECT 1
        FROM seller_market_profiles public_profile
        WHERE public_profile.store_id = stores.id
          AND public_profile.status = 'approved'
      )
    )
  )
`;

function listPublicProducts({
  query = "",
  campus = "",
  limit = 24,
  viewerId = "",
  order = "fresh",
} = {}) {
  const cleanQuery = clean(query, 100);
  const cleanCampus = clean(campus, 120);
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const pattern = `%${escapeLike(cleanQuery)}%`;
  const campusPattern = `%${escapeLike(cleanCampus)}%`;
  const orderSql =
    order === "engagement"
      ? productEngagementOrderSql
      : `
        CASE WHEN ? != '' AND LOWER(stores.campus) = LOWER(?) THEN 0 ELSE 1 END,
        products.updated_at DESC
      `;

  const rows = db
    .prepare(`
      ${productSelectSql}
      WHERE stores.status = 'active'
        AND ${publicSellerVisibilitySql}
        AND products.status IN ('active', 'out_of_stock')
        AND (
          ? = ''
          OR products.name LIKE ? ESCAPE '\\'
          OR products.description LIKE ? ESCAPE '\\'
          OR products.category LIKE ? ESCAPE '\\'
          OR stores.name LIKE ? ESCAPE '\\'
          OR stores.campus LIKE ? ESCAPE '\\'
          OR stores.nearest_campus LIKE ? ESCAPE '\\'
          OR stores.nearest_marketplace LIKE ? ESCAPE '\\'
          OR stores.state LIKE ? ESCAPE '\\'
          OR stores.city LIKE ? ESCAPE '\\'
        )
        AND (
          ? = ''
          OR LOWER(stores.campus) = LOWER(?)
          OR LOWER(stores.nearest_campus) = LOWER(?)
          OR stores.campus LIKE ? ESCAPE '\\'
          OR stores.nearest_campus LIKE ? ESCAPE '\\'
        )
      ORDER BY ${orderSql}
      LIMIT ?
    `)
    .all(
      cleanQuery,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      cleanCampus,
      cleanCampus,
      cleanCampus,
      campusPattern,
      campusPattern,
      ...(order === "engagement" ? [] : [cleanCampus, cleanCampus]),
      safeLimit,
    );

  return rows.map((row) => serializeMarketProduct(row, viewerId));
}

function listLocalMarketProducts(marketId, viewerId = "", limit = 100) {
  const rows = db
    .prepare(`
      ${productSelectSql}
      JOIN seller_market_profiles profile ON profile.store_id = stores.id
      WHERE profile.market_id = ?
        AND profile.status = 'approved'
        AND stores.status = 'active'
        AND products.status IN ('active', 'out_of_stock')
      ORDER BY ${productEngagementOrderSql}
      LIMIT ?
    `)
    .all(marketId, Math.min(Math.max(Number(limit) || 100, 1), 100));

  return rows.map((row) => serializeMarketProduct(row, viewerId));
}

function listActiveStores({ query = "", campus = "", viewerId = "", limit = 24 } = {}) {
  const cleanQuery = clean(query, 100);
  const cleanCampus = clean(campus, 120);
  const pattern = `%${escapeLike(cleanQuery)}%`;
  const campusPattern = `%${escapeLike(cleanCampus)}%`;

  const rows = db
    .prepare(`
      SELECT stores.id AS store_ref_id,
             stores.owner_id AS store_owner_id,
             stores.slug AS store_slug,
             stores.name AS store_name,
             stores.description AS store_description,
             stores.campus AS store_campus,
             stores.category AS store_category,
             stores.phone AS store_phone,
             stores.logo_url AS store_logo_url,
             stores.cover_url AS store_cover_url,
             stores.status AS store_status,
             stores.verified AS store_verified,
             stores.verification_status AS store_verification_status,
             stores.verification_note AS store_verification_note,
             stores.verified_at AS store_verified_at,
             stores.seller_type AS store_seller_type,
             stores.operating_hours AS store_operating_hours,
             stores.whatsapp_phone AS store_whatsapp_phone,
             stores.allow_rider_whatsapp_contact AS store_allow_rider_whatsapp_contact,
             stores.location_area AS store_location_area,
             stores.pickup_location AS store_pickup_location,
             stores.nearest_landmark AS store_nearest_landmark,
             stores.market_id AS store_market_id,
             stores.shop_stall_number AS store_shop_stall_number,
             stores.shop_section AS store_shop_section,
             stores.pickup_lat AS store_pickup_lat,
             stores.pickup_lng AS store_pickup_lng,
             stores.country AS store_country,
             stores.state AS store_state,
             stores.city AS store_city,
             stores.nearest_campus AS store_nearest_campus,
             stores.nearest_marketplace AS store_nearest_marketplace,
             stores.street AS store_street,
             stores.pickup_place_id AS store_pickup_place_id,
             stores.location_verified_at AS store_location_verified_at,
             stores.created_at AS store_created_at,
             stores.updated_at AS store_updated_at,
             users.name AS owner_name,
             users.email AS owner_email,
             users.phone AS owner_phone,
             (SELECT COUNT(*) FROM products WHERE products.store_id = stores.id AND products.status IN ('active', 'out_of_stock')) AS product_count,
             (SELECT COUNT(*) FROM services WHERE services.store_id = stores.id AND services.status = 'active') AS service_count
      FROM stores
      JOIN users ON users.id = stores.owner_id
      WHERE stores.status = 'active'
        AND ${publicSellerVisibilitySql}
        AND (
          ? = ''
          OR stores.name LIKE ? ESCAPE '\\'
          OR stores.description LIKE ? ESCAPE '\\'
          OR stores.campus LIKE ? ESCAPE '\\'
          OR stores.category LIKE ? ESCAPE '\\'
          OR stores.nearest_campus LIKE ? ESCAPE '\\'
          OR stores.nearest_marketplace LIKE ? ESCAPE '\\'
          OR stores.state LIKE ? ESCAPE '\\'
          OR stores.city LIKE ? ESCAPE '\\'
        )
        AND (
          ? = ''
          OR LOWER(stores.campus) = LOWER(?)
          OR LOWER(stores.nearest_campus) = LOWER(?)
          OR stores.campus LIKE ? ESCAPE '\\'
          OR stores.nearest_campus LIKE ? ESCAPE '\\'
        )
      ORDER BY
        CASE WHEN ? != '' AND LOWER(stores.campus) = LOWER(?) THEN 0 ELSE 1 END,
        stores.verified DESC,
        stores.updated_at DESC
      LIMIT ?
    `)
    .all(
      cleanQuery,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      cleanCampus,
      cleanCampus,
      cleanCampus,
      campusPattern,
      campusPattern,
      cleanCampus,
      cleanCampus,
      Math.min(Math.max(Number(limit) || 24, 1), 100),
    );

  return rows.map((row) => serializeMarketStore(row, viewerId));
}

function listLocalMarketStores(marketId, viewerId = "") {
  const rows = db
    .prepare(`
      SELECT profile.id AS profile_id,
             profile.market_id,
             profile.stall_number,
             profile.address_note,
             profile.status AS profile_status,
             profile.created_at AS profile_created_at,
             profile.updated_at AS profile_updated_at,
             stores.id AS store_ref_id,
             stores.owner_id AS store_owner_id,
             stores.slug AS store_slug,
             stores.name AS store_name,
             stores.description AS store_description,
             stores.campus AS store_campus,
             stores.category AS store_category,
             stores.phone AS store_phone,
             stores.logo_url AS store_logo_url,
             stores.cover_url AS store_cover_url,
             stores.status AS store_status,
             stores.verified AS store_verified,
             stores.verification_status AS store_verification_status,
             stores.verification_note AS store_verification_note,
             stores.verified_at AS store_verified_at,
             stores.seller_type AS store_seller_type,
             stores.operating_hours AS store_operating_hours,
             stores.whatsapp_phone AS store_whatsapp_phone,
             stores.allow_rider_whatsapp_contact AS store_allow_rider_whatsapp_contact,
             stores.location_area AS store_location_area,
             stores.pickup_location AS store_pickup_location,
             stores.nearest_landmark AS store_nearest_landmark,
             stores.market_id AS store_market_id,
             stores.shop_stall_number AS store_shop_stall_number,
             stores.shop_section AS store_shop_section,
             stores.pickup_lat AS store_pickup_lat,
             stores.pickup_lng AS store_pickup_lng,
             stores.created_at AS store_created_at,
             stores.updated_at AS store_updated_at,
             users.name AS owner_name,
             users.email AS owner_email,
             users.phone AS owner_phone,
             (SELECT COUNT(*) FROM products WHERE products.store_id = stores.id AND products.status IN ('active', 'out_of_stock')) AS product_count,
             (SELECT COUNT(*) FROM services WHERE services.store_id = stores.id AND services.status = 'active') AS service_count
      FROM seller_market_profiles profile
      JOIN stores ON stores.id = profile.store_id
      JOIN users ON users.id = stores.owner_id
      WHERE profile.market_id = ?
        AND profile.status = 'approved'
        AND stores.status = 'active'
      ORDER BY stores.verified DESC, stores.updated_at DESC
    `)
    .all(marketId);

  return rows.map((row) => serializeMarketStore(row, viewerId));
}

function listMarketStoresForAdmin(marketId, viewerId = "") {
  const rows = db
    .prepare(`
      SELECT profile.id AS profile_id,
             profile.market_id,
             profile.stall_number,
             profile.address_note,
             profile.shop_section,
             profile.market_landmark,
             profile.pickup_point,
             profile.status AS profile_status,
             profile.created_at AS profile_created_at,
             profile.updated_at AS profile_updated_at,
             stores.id AS store_ref_id,
             stores.owner_id AS store_owner_id,
             stores.slug AS store_slug,
             stores.name AS store_name,
             stores.description AS store_description,
             stores.campus AS store_campus,
             stores.category AS store_category,
             stores.phone AS store_phone,
             stores.logo_url AS store_logo_url,
             stores.cover_url AS store_cover_url,
             stores.status AS store_status,
             stores.verified AS store_verified,
             stores.verification_status AS store_verification_status,
             stores.verification_note AS store_verification_note,
             stores.verified_at AS store_verified_at,
             stores.seller_type AS store_seller_type,
             stores.operating_hours AS store_operating_hours,
             stores.whatsapp_phone AS store_whatsapp_phone,
             stores.allow_rider_whatsapp_contact AS store_allow_rider_whatsapp_contact,
             stores.location_area AS store_location_area,
             stores.pickup_location AS store_pickup_location,
             stores.nearest_landmark AS store_nearest_landmark,
             stores.market_id AS store_market_id,
             stores.shop_stall_number AS store_shop_stall_number,
             stores.shop_section AS store_shop_section,
             stores.pickup_lat AS store_pickup_lat,
             stores.pickup_lng AS store_pickup_lng,
             stores.created_at AS store_created_at,
             stores.updated_at AS store_updated_at,
             users.name AS owner_name,
             users.email AS owner_email,
             users.phone AS owner_phone,
             (SELECT COUNT(*) FROM products WHERE products.store_id = stores.id AND products.status IN ('active', 'out_of_stock')) AS product_count,
             (SELECT COUNT(*) FROM services WHERE services.store_id = stores.id AND services.status = 'active') AS service_count
      FROM seller_market_profiles profile
      JOIN stores ON stores.id = profile.store_id
      JOIN users ON users.id = stores.owner_id
      WHERE profile.market_id = ?
      ORDER BY
        CASE profile.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        profile.updated_at DESC
    `)
    .all(marketId);

  return rows.map((row) => serializeMarketStore(row, viewerId));
}

function getMarketRow(idOrSlug, publicOnly = true) {
  const cleanId = clean(idOrSlug, 120);
  const where = publicOnly
    ? "WHERE (markets.id = ? OR markets.slug = ?) AND markets.status = 'active'"
    : "WHERE markets.id = ? OR markets.slug = ?";

  return db
    .prepare(`${marketSelectSql(where)} LIMIT 1`)
    .get(cleanId, cleanId);
}

export function getMarketCategories() {
  const marketCategories = db
    .prepare(`
      SELECT market_categories.category_key AS key,
             market_categories.name AS name,
             COUNT(*) AS market_count
      FROM market_categories
      JOIN markets ON markets.id = market_categories.market_id
      WHERE markets.status = 'active'
      GROUP BY market_categories.category_key, market_categories.name
      ORDER BY MIN(market_categories.sort_order) ASC, market_categories.name ASC
    `)
    .all()
    .map((row) => ({
      key: row.key,
      name: row.name,
      marketCount: Number(row.market_count || 0),
      source: "local_market",
    }));

  const productCategories = db
    .prepare(`
      SELECT products.category AS name, COUNT(*) AS product_count
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.status IN ('active', 'out_of_stock')
        AND stores.status = 'active'
      GROUP BY products.category
      ORDER BY product_count DESC, products.category ASC
      LIMIT 30
    `)
    .all()
    .map((row) => ({
      key: slugify(row.name),
      name: row.name,
      productCount: Number(row.product_count || 0),
      source: "campus_market",
    }));

  const usedCategories = db
    .prepare(`
      SELECT category AS name, COUNT(*) AS listing_count
      FROM used_listings
      WHERE status = 'active'
      GROUP BY category
      ORDER BY listing_count DESC, category ASC
      LIMIT 30
    `)
    .all()
    .map((row) => ({
      key: slugify(row.name),
      name: row.name,
      listingCount: Number(row.listing_count || 0),
      source: "used_market",
    }));

  const merged = new Map();

  for (const item of [
    ...DEFAULT_MARKET_CATEGORIES.map((name) => ({
      key: slugify(name),
      name,
      source: "default",
    })),
    ...marketCategories,
    ...productCategories,
    ...usedCategories,
  ]) {
    const existing = merged.get(item.key) || {
      key: item.key,
      name: item.name,
      marketCount: 0,
      productCount: 0,
      listingCount: 0,
      sources: [],
    };

    merged.set(item.key, {
      ...existing,
      marketCount: existing.marketCount + Number(item.marketCount || 0),
      productCount: existing.productCount + Number(item.productCount || 0),
      listingCount: existing.listingCount + Number(item.listingCount || 0),
      sources: Array.from(new Set([...existing.sources, item.source])),
    });
  }

  return Array.from(merged.values());
}

export function getMarketHub({ viewerId = "", campus = "" } = {}) {
  const cleanCampus = clean(campus, 120);
  const activeMarketCount = db
    .prepare("SELECT COUNT(*) AS count FROM markets WHERE status = 'active'")
    .get().count;
  const activeSellerCount = db
    .prepare("SELECT COUNT(*) AS count FROM stores WHERE status = 'active'")
    .get().count;
  const activeProductCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.status IN ('active', 'out_of_stock')
        AND stores.status = 'active'
    `)
    .get().count;
  const activeUsedCount = db
    .prepare("SELECT COUNT(*) AS count FROM used_listings WHERE status = 'active'")
    .get().count;

  return {
    stats: {
      products: Number(activeProductCount || 0),
      stores: Number(activeSellerCount || 0),
      usedListings: Number(activeUsedCount || 0),
      localMarkets: Number(activeMarketCount || 0),
    },
    localMarkets: listLocalMarkets({ limit: 6 }),
    categories: getMarketCategories().slice(0, 12),
    popularNearYou: listPublicProducts({
      campus: cleanCampus,
      viewerId,
      limit: 32,
      order: "engagement",
    }),
    trendingCampusProducts: listPublicProducts({
      campus: cleanCampus,
      viewerId,
      limit: 32,
      order: "engagement",
    }),
    freshUsedListings: listUsedListings({ query: "", category: "" }).slice(0, 32),
    nearbySellers: listActiveStores({
      campus: cleanCampus,
      viewerId,
      limit: 12,
    }),
    fastDeliveryProducts: listPublicProducts({
      campus: cleanCampus,
      viewerId,
      limit: 32,
      order: "engagement",
    }),
  };
}

export function getUsedMarket({ query = "", category = "" } = {}) {
  return {
    listings: listUsedListings({
      query: clean(query, 100),
      category: clean(category, 80),
    }),
    categories: getMarketCategories().filter((categoryItem) =>
      categoryItem.sources.includes("used_market") || categoryItem.sources.includes("default"),
    ),
  };
}

export function getCampusMarket({ query = "", campus = "", viewerId = "" } = {}) {
  const cleanCampus = clean(campus, 120);

  return {
    campus: cleanCampus,
    stores: listActiveStores({
      query,
      campus: cleanCampus,
      viewerId,
      limit: 40,
    }),
    products: listPublicProducts({
      query,
      campus: cleanCampus,
      viewerId,
      limit: 60,
      order: "engagement",
    }),
    categories: getMarketCategories().filter((categoryItem) =>
      categoryItem.sources.includes("campus_market") || categoryItem.sources.includes("default"),
    ),
  };
}

export function listLocalMarkets({ includeInactive = false, query = "", limit = 50 } = {}) {
  const cleanQuery = clean(query, 100);
  const pattern = `%${escapeLike(cleanQuery)}%`;
  const where = includeInactive
    ? `WHERE (
        ? = ''
        OR markets.name LIKE ? ESCAPE '\\'
        OR markets.description LIKE ? ESCAPE '\\'
        OR markets.state LIKE ? ESCAPE '\\'
        OR markets.city LIKE ? ESCAPE '\\'
        OR markets.area LIKE ? ESCAPE '\\'
      )`
    : `WHERE markets.status = 'active'
        AND (
          ? = ''
          OR markets.name LIKE ? ESCAPE '\\'
          OR markets.description LIKE ? ESCAPE '\\'
          OR markets.state LIKE ? ESCAPE '\\'
          OR markets.city LIKE ? ESCAPE '\\'
          OR markets.area LIKE ? ESCAPE '\\'
        )`;

  return db
    .prepare(`
      ${marketSelectSql(where)}
      ORDER BY
        CASE markets.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        markets.updated_at DESC
      LIMIT ?
    `)
    .all(cleanQuery, pattern, pattern, pattern, pattern, pattern, Math.min(Math.max(Number(limit) || 50, 1), 100))
    .map(serializeMarket);
}

export function getLocalMarketById(marketId, { viewerId = "", publicOnly = true } = {}) {
  const row = getMarketRow(marketId, publicOnly);

  if (!row) {
    throw new HttpError(404, "Local market was not found.");
  }

  const market = serializeMarket(row);
  const sellers = listLocalMarketStores(row.id, viewerId);
  const products = listLocalMarketProducts(row.id, viewerId);

  return {
    market,
    sellers,
    products,
    categories: getMarketCategories().filter((categoryItem) =>
      market.allowedCategories.length
        ? market.allowedCategories.some((allowed) => slugify(allowed) === categoryItem.key)
        : true,
    ),
  };
}

export function getNearbySellers({ query = "", campus = "", viewerId = "" } = {}) {
  const cleanCampus = clean(campus, 120);
  const presence = viewerId
    ? db.prepare(`
        SELECT lat, lng, captured_at
        FROM account_location_presence
        WHERE user_id = ? AND permission_status = 'granted'
      `).get(viewerId)
    : null;
  const hasCoordinates =
    Number.isFinite(Number(presence?.lat)) && Number.isFinite(Number(presence?.lng));
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const distanceKm = (lat, lng) => {
    const earthRadiusKm = 6371;
    const latDelta = toRadians(Number(lat) - Number(presence.lat));
    const lngDelta = toRadians(Number(lng) - Number(presence.lng));
    const a =
      Math.sin(latDelta / 2) ** 2 +
      Math.cos(toRadians(presence.lat)) *
        Math.cos(toRadians(lat)) *
        Math.sin(lngDelta / 2) ** 2;
    return Number((2 * earthRadiusKm * Math.asin(Math.sqrt(a))).toFixed(2));
  };

  const sellers = listActiveStores({
    query,
    campus: hasCoordinates ? "" : cleanCampus,
    viewerId,
    limit: 100,
  }).map((store) => ({
    ...store,
    distanceKm:
      hasCoordinates &&
        store._pickupCoordinates?.lat !== null &&
        store._pickupCoordinates?.lng !== null
        ? distanceKm(store._pickupCoordinates.lat, store._pickupCoordinates.lng)
        : null,
  })).sort((first, second) => {
    if (first.distanceKm === null) return 1;
    if (second.distanceKm === null) return -1;
    return first.distanceKm - second.distanceKm;
  }).slice(0, 50);
  const storeDistances = new Map(sellers.map((store) => [store.id, store.distanceKm]));
  const products = listPublicProducts({
    query,
    campus: hasCoordinates ? "" : cleanCampus,
    viewerId,
    limit: 100,
    order: "engagement",
  }).filter((product) => storeDistances.has(product.store?.id || product.storeId))
    .map((product) => ({
      ...product,
      distanceKm: storeDistances.get(product.store?.id || product.storeId) ?? null,
    }))
    .sort((first, second) => Number(first.distanceKm ?? Number.MAX_VALUE) - Number(second.distanceKm ?? Number.MAX_VALUE))
    .slice(0, 50);

  return {
    locationMode: hasCoordinates ? "distance" : cleanCampus ? "campus" : "platform",
    selectedCampus: cleanCampus,
    note: hasCoordinates
      ? "Ranked by saved straight-line distance. No map-routing token is used for this list."
      : cleanCampus
        ? "Ranked around your saved campus until browser location is available."
        : "Enable browser location once to rank sellers by distance.",
    originCapturedAt: presence?.captured_at || null,
    sellers,
    products,
  };
}

export function searchMarket({ query = "", type = "all", campus = "", viewerId = "" } = {}) {
  const cleanQuery = clean(query, 100);
  const cleanType = clean(type || "all", 40);
  const include = (value) => cleanType === "all" || cleanType === value;

  const products = include("products")
    ? listPublicProducts({
        query: cleanQuery,
        campus,
        viewerId,
        limit: 60,
        order: "engagement",
      })
    : [];
  const stores = include("stores")
    ? listActiveStores({
        query: cleanQuery,
        campus,
        viewerId,
        limit: 60,
      })
    : [];
  const usedListings = include("used")
    ? listUsedListings({
        query: cleanQuery,
        category: "",
      }).slice(0, 60)
    : [];
  const localMarkets = include("markets")
    ? listLocalMarkets({
        query: cleanQuery,
        limit: 40,
      })
    : [];

  return {
    query: cleanQuery,
    type: cleanType,
    products,
    stores,
    usedListings,
    localMarkets,
    counts: {
      products: products.length,
      stores: stores.length,
      usedListings: usedListings.length,
      localMarkets: localMarkets.length,
    },
  };
}

export function listApprovedMarketsForSeller({ query = "" } = {}) {
  return listLocalMarkets({ query, limit: 100 });
}

export function listSellerCategoryApprovals(userId) {
  const rows = db
    .prepare(`
      ${categoryApprovalSelectSql("WHERE seller_category_approvals.seller_id = ?")}
      ORDER BY
        CASE seller_category_approvals.status
          WHEN 'needs_more_info' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          ELSE 3
        END,
        seller_category_approvals.updated_at DESC
    `)
    .all(userId);

  return rows.map(serializeCategoryApproval);
}

export function listSellerMarketRequests(userId) {
  const rows = db
    .prepare(`
      ${marketRequestSelectSql("WHERE market_requests.seller_id = ?")}
      ORDER BY market_requests.updated_at DESC
      LIMIT 50
    `)
    .all(userId);

  return rows.map(serializeMarketRequest);
}

export function getSellerMarketStatus(userId) {
  const store = storeRowForOwner(userId);
  const verification = db
    .prepare("SELECT * FROM seller_verification_profiles WHERE user_id = ?")
    .get(userId);
  const marketProfile = store
    ? db
        .prepare(`
          SELECT seller_market_profiles.*, markets.name AS market_name, markets.slug AS market_slug
          FROM seller_market_profiles
          LEFT JOIN markets ON markets.id = seller_market_profiles.market_id
          WHERE seller_market_profiles.store_id = ?
        `)
        .get(store.id)
    : null;

  return {
    store: store ? serializeStore(store) : null,
    sellerType: verification?.seller_type || store?.seller_type || "campus",
    verificationStatus: verification?.status || store?.verification_status || "draft",
    marketProfile: marketProfile
      ? {
          id: marketProfile.id,
          marketId: marketProfile.market_id,
          marketName: marketProfile.market_name || "",
          marketSlug: marketProfile.market_slug || "",
          stallNumber: marketProfile.stall_number || "",
          shopSection: marketProfile.shop_section || "",
          pickupPoint: marketProfile.pickup_point || "",
          landmark: marketProfile.market_landmark || "",
          status: marketProfile.status,
          riskLevel: marketProfile.risk_level || "standard",
          adminNote: marketProfile.admin_note || "",
          createdAt: marketProfile.created_at,
          updatedAt: marketProfile.updated_at,
        }
      : null,
    categoryApprovals: listSellerCategoryApprovals(userId),
    marketRequests: listSellerMarketRequests(userId),
  };
}

export function getSellerOnboardingOptions(userId = "") {
  const campuses = db
    .prepare(`
      SELECT campus AS name, COUNT(*) AS count
      FROM users
      WHERE campus != ''
      GROUP BY campus
      ORDER BY count DESC, campus ASC
      LIMIT 50
    `)
    .all()
    .map((row) => ({ name: row.name, count: Number(row.count || 0) }));

  const marketCategories = getMarketCategories();

  return {
    sellerTypes: SELLER_TYPE_OPTIONS,
    campuses,
    prohibitedCategories: [
      "Drugs",
      "Medicine",
      "Medication",
      "Guns",
      "Weapons",
      "Ammunition",
      "Explosives",
    ],
    campusCategories: DEFAULT_CAMPUS_CATEGORIES,
    platformCategories: marketCategories,
    availableMarkets: listApprovedMarketsForSeller(),
    status: userId ? getSellerMarketStatus(userId) : null,
  };
}

export function ensureSellerCategoryRequest({
  sellerId,
  storeId,
  marketId = null,
  categoryName,
  status = "pending",
  adminNote = "",
  approvedBy = null,
} = {}) {
  const store = storeId ? storeRowById(storeId) : storeRowForOwner(sellerId);
  if (!store) return null;

  const cleanCategory = clean(categoryName || store.category || "General", 80);
  if (!cleanCategory) return null;

  const key = categoryKey(cleanCategory);
  const now = nowIso();
  const existing = db
    .prepare(`
      SELECT *
      FROM seller_category_approvals
      WHERE store_id = ?
        AND COALESCE(market_id, '') = COALESCE(?, '')
        AND category_key = ?
      LIMIT 1
    `)
    .get(store.id, marketId || null, key);

  if (existing) {
    db.prepare(`
      UPDATE seller_category_approvals
      SET category_name = ?,
          status = CASE WHEN status = 'approved' THEN 'approved' ELSE ? END,
          admin_note = COALESCE(NULLIF(?, ''), admin_note),
          approved_by = CASE WHEN ? = 'approved' THEN COALESCE(?, approved_by) ELSE approved_by END,
          updated_at = ?
      WHERE id = ?
    `).run(
      cleanCategory,
      status,
      adminNote,
      status,
      approvedBy,
      now,
      existing.id,
    );

    return serializeCategoryApproval(
      db
        .prepare(`${categoryApprovalSelectSql("WHERE seller_category_approvals.id = ?")} LIMIT 1`)
        .get(existing.id),
    );
  }

  const id = createId("sca");
  db.prepare(`
    INSERT INTO seller_category_approvals (
      id, seller_id, store_id, market_id, category_key, category_name,
      status, approved_by, admin_note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sellerId || store.owner_id,
    store.id,
    marketId || null,
    key,
    cleanCategory,
    status,
    approvedBy,
    adminNote,
    now,
    now,
  );

  return serializeCategoryApproval(
    db
      .prepare(`${categoryApprovalSelectSql("WHERE seller_category_approvals.id = ?")} LIMIT 1`)
      .get(id),
  );
}

function ensureCategoryAllowedByMarket(market, category) {
  const allowed = normalizeCategoryList(market?.allowed_categories || []);
  if (!allowed.length) return;

  const key = categoryKey(category);
  const allowedKeys = allowed.map((item) => categoryKey(item));
  if (!allowedKeys.includes(key)) {
    throw new HttpError(
      403,
      `${category} is not allowed in ${market.name}. Choose one of: ${allowed.join(", ")}.`,
    );
  }
}

function hasApprovedSellerCategory(store, category) {
  const key = categoryKey(category);
  const approval = db
    .prepare(`
      SELECT *
      FROM seller_category_approvals
      WHERE store_id = ?
        AND category_key = ?
        AND status = 'approved'
      LIMIT 1
    `)
    .get(store.id, key);

  return Boolean(approval);
}

export function assertCategoryAllowedForStore(storeInput, category, { itemType = "product" } = {}) {
  const store = storeInput?.id ? storeInput : storeRowById(storeInput);
  const cleanCategory = clean(category, 80);

  if (!store) {
    throw new HttpError(404, "Seller store was not found.");
  }

  if (!cleanCategory) {
    throw new HttpError(422, "Choose a valid category.");
  }

  if (isProhibitedCategory(cleanCategory)) {
    throw new HttpError(
      403,
      "This category is prohibited on Gleenc. Drugs, medicine, medication, guns, weapons, ammunition, and explosives cannot be listed.",
    );
  }

  const sellerType = store.seller_type || "campus";

  if (sellerType === "campus") {
    return true;
  }

  if (sellerType === "used_market" && itemType !== "used_listing") {
    throw new HttpError(
      403,
      "Used Market sellers should publish pre-owned items through the Used Market listing flow, not the normal product/service uploader.",
    );
  }

  if (sellerType === "local_market") {
    const marketId = store.market_id;
    const market = marketId ? marketRowForId(marketId, false) : null;
    if (!market || market.status !== "active") {
      throw new HttpError(403, "Local Market sellers must belong to an active approved market before uploading.");
    }

    const membership = db
      .prepare("SELECT * FROM seller_market_profiles WHERE store_id = ? AND market_id = ?")
      .get(store.id, market.id);

    if (!membership || membership.status !== "approved") {
      throw new HttpError(403, "Admin must approve your Local Market seller profile before product uploads are visible.");
    }

    ensureCategoryAllowedByMarket(market, cleanCategory);
  }

  if (!hasApprovedSellerCategory(store, cleanCategory)) {
    ensureSellerCategoryRequest({
      sellerId: store.owner_id,
      storeId: store.id,
      marketId: sellerType === "local_market" ? store.market_id : null,
      categoryName: cleanCategory,
    });
    throw new HttpError(
      403,
      `Admin must approve your ${cleanCategory} category before this ${itemType} can be published.`,
    );
  }

  return true;
}

export function createMarketRequestForSeller(userId, input = {}) {
  const store = storeRowForOwner(userId);
  const marketName = clean(input.marketName || input.name || input.marketRequestName || input.requestedMarketName, 120);

  if (!marketName) {
    throw new HttpError(422, "Market name is required.");
  }

  const now = nowIso();
  const existing = db
    .prepare(`
      SELECT id
      FROM market_requests
      WHERE seller_id = ?
        AND LOWER(market_name) = LOWER(?)
        AND status IN ('pending', 'needs_more_info')
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get(userId || null, marketName);

  if (existing) {
    db.prepare(`
      UPDATE market_requests
      SET store_id = COALESCE(?, store_id),
          state = COALESCE(NULLIF(?, ''), state),
          city = COALESCE(NULLIF(?, ''), city),
          area = COALESCE(NULLIF(?, ''), area),
          address = COALESCE(NULLIF(?, ''), address),
          landmark = COALESCE(NULLIF(?, ''), landmark),
          latitude = COALESCE(?, latitude),
          longitude = COALESCE(?, longitude),
          seller_note = COALESCE(NULLIF(?, ''), seller_note),
          what_sells = COALESCE(NULLIF(?, ''), what_sells),
          shop_details = COALESCE(NULLIF(?, ''), shop_details),
          contact_phone = COALESCE(NULLIF(?, ''), contact_phone),
          photo_url = COALESCE(?, photo_url),
          status = 'pending',
          updated_at = ?
      WHERE id = ?
    `).run(
      store?.id || null,
      clean(input.state || input.marketRequestState, 80),
      clean(input.city || input.cityArea || input.marketRequestCityArea, 80),
      clean(input.area || input.cityArea || input.marketRequestCityArea, 120),
      clean(input.address || input.addressLandmark || input.marketRequestAddressLandmark, 240),
      clean(input.landmark || input.addressLandmark || input.marketRequestAddressLandmark, 160),
      numberOrNull(input.latitude || input.lat),
      numberOrNull(input.longitude || input.lng),
      clean(input.sellerNote || input.approximateLocation || input.marketRequestApproximateLocation, 1000),
      clean(input.whatSells || input.sells || input.marketRequestSells, 240),
      clean(input.shopDetails || input.marketRequestShopDetails, 240),
      clean(input.contactPhone || input.marketRequestContactPhone || store?.phone, 40),
      clean(input.photoUrl, 1000) || null,
      now,
      existing.id,
    );

    return serializeMarketRequest(
      db.prepare(`${marketRequestSelectSql("WHERE market_requests.id = ?")} LIMIT 1`).get(existing.id),
    );
  }

  const id = createId("mreq");

  db.prepare(`
    INSERT INTO market_requests (
      id, seller_id, store_id, market_name, state, city, area, address,
      landmark, latitude, longitude, seller_note, what_sells, shop_details,
      contact_phone, photo_url, status, admin_note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)
  `).run(
    id,
    userId || null,
    store?.id || null,
    marketName,
    clean(input.state || input.marketRequestState, 80),
    clean(input.city || input.cityArea || input.marketRequestCityArea, 80),
    clean(input.area || input.cityArea || input.marketRequestCityArea, 120),
    clean(input.address || input.addressLandmark || input.marketRequestAddressLandmark, 240),
    clean(input.landmark || input.addressLandmark || input.marketRequestAddressLandmark, 160),
    numberOrNull(input.latitude || input.lat),
    numberOrNull(input.longitude || input.lng),
    clean(input.sellerNote || input.approximateLocation || input.marketRequestApproximateLocation, 1000),
    clean(input.whatSells || input.sells || input.marketRequestSells, 240),
    clean(input.shopDetails || input.marketRequestShopDetails, 240),
    clean(input.contactPhone || input.marketRequestContactPhone || store?.phone, 40),
    clean(input.photoUrl, 1000) || null,
    now,
    now,
  );

  if (store) {
    db.prepare(`
      UPDATE stores
      SET seller_type = 'local_market',
          verification_status = 'pending_verification',
          verification_note = 'Market approval request submitted to admin.',
          updated_at = ?
      WHERE id = ?
    `).run(now, store.id);
  }

  return serializeMarketRequest(
    db.prepare(`${marketRequestSelectSql("WHERE market_requests.id = ?")} LIMIT 1`).get(id),
  );
}

export function applySellerToLocalMarket(userId, input = {}) {
  const store = storeRowForOwner(userId);
  if (!store) throw new HttpError(404, "Complete store setup before joining a Local Market.");

  const market = marketRowForId(input.marketId || input.marketSlug, true);
  if (!market) throw new HttpError(404, "Choose an active approved Local Market.");

  const now = nowIso();
  const id = createId("smp");

  db.prepare(`
    INSERT INTO seller_market_profiles (
      id, market_id, store_id, stall_number, address_note, shop_section,
      market_landmark, pickup_point, pickup_lat, pickup_lng, risk_level,
      admin_note, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'standard', '', 'pending', ?, ?)
    ON CONFLICT(store_id) DO UPDATE SET
      market_id = excluded.market_id,
      stall_number = excluded.stall_number,
      address_note = excluded.address_note,
      shop_section = excluded.shop_section,
      market_landmark = excluded.market_landmark,
      pickup_point = excluded.pickup_point,
      pickup_lat = excluded.pickup_lat,
      pickup_lng = excluded.pickup_lng,
      status = CASE
        WHEN seller_market_profiles.status = 'approved' THEN 'approved'
        ELSE 'pending'
      END,
      updated_at = excluded.updated_at
  `).run(
    id,
    market.id,
    store.id,
    clean(input.shopStallNumber || input.stallNumber || store.shop_stall_number, 80),
    clean(input.addressNote || input.locationArea || store.location_area, 240),
    clean(input.shopSection || store.shop_section, 120),
    clean(input.nearestLandmark || input.landmark || store.nearest_landmark, 160),
    clean(input.pickupLocation || store.pickup_location, 180),
    numberOrNull(input.pickupLat || store.pickup_lat),
    numberOrNull(input.pickupLng || store.pickup_lng),
    now,
    now,
  );

  db.prepare(`
    UPDATE stores
    SET seller_type = 'local_market',
        market_id = ?,
        shop_stall_number = ?,
        shop_section = ?,
        pickup_location = ?,
        nearest_landmark = ?,
        location_area = ?,
        verification_status = CASE
          WHEN verification_status = 'verified' THEN 'verified'
          ELSE 'pending_verification'
        END,
        verification_note = 'Local Market seller profile is waiting for admin approval.',
        updated_at = ?
    WHERE id = ?
  `).run(
    market.id,
    clean(input.shopStallNumber || input.stallNumber || store.shop_stall_number, 80),
    clean(input.shopSection || store.shop_section, 120),
    clean(input.pickupLocation || store.pickup_location, 180),
    clean(input.nearestLandmark || input.landmark || store.nearest_landmark, 160),
    clean(input.locationArea || market.area || market.city || store.location_area, 160),
    now,
    store.id,
  );

  ensureSellerCategoryRequest({
    sellerId: userId,
    storeId: store.id,
    marketId: market.id,
    categoryName: input.categoryName || input.storeCategory || store.category,
  });

  return getSellerMarketStatus(userId);
}

export function adminListMarketRequests({ query = "", status = "" } = {}) {
  const cleanQuery = clean(query, 100);
  const cleanStatus = clean(status, 40);
  const pattern = `%${escapeLike(cleanQuery)}%`;
  const params = [];
  let where = "WHERE 1 = 1";

  if (cleanStatus) {
    where += " AND market_requests.status = ?";
    params.push(cleanStatus);
  }

  where += `
    AND (
      ? = ''
      OR market_requests.market_name LIKE ? ESCAPE '\\'
      OR market_requests.state LIKE ? ESCAPE '\\'
      OR market_requests.city LIKE ? ESCAPE '\\'
      OR market_requests.area LIKE ? ESCAPE '\\'
      OR stores.name LIKE ? ESCAPE '\\'
      OR users.name LIKE ? ESCAPE '\\'
    )
  `;
  params.push(cleanQuery, pattern, pattern, pattern, pattern, pattern, pattern);

  const rows = db
    .prepare(`
      ${marketRequestSelectSql(where)}
      ORDER BY
        CASE market_requests.status
          WHEN 'pending' THEN 0
          WHEN 'needs_more_info' THEN 1
          ELSE 2
        END,
        market_requests.updated_at DESC
      LIMIT 200
    `)
    .all(...params);

  return rows.map(serializeMarketRequest);
}

export function adminUpdateMarketRequestStatus(requestId, status, input = {}) {
  const cleanStatus = clean(status || input.status, 40);
  assertAllowedStatus(cleanStatus, ["pending", "approved", "rejected", "merged", "needs_more_info"], "Market request status");

  const request = db
    .prepare(`${marketRequestSelectSql("WHERE market_requests.id = ?")} LIMIT 1`)
    .get(requestId);
  if (!request) throw new HttpError(404, "Market request was not found.");

  const now = nowIso();
  let marketId = clean(input.marketId, 140) || request.market_id || null;

  if (cleanStatus === "approved" && !marketId) {
    const market = adminCreateMarket({
      name: request.market_name,
      state: request.state,
      city: request.city,
      area: request.area,
      address: request.address,
      landmark: request.landmark,
      latitude: request.latitude,
      longitude: request.longitude,
      allowedCategories: DEFAULT_MARKET_CATEGORIES,
      status: "active",
      description: request.seller_note || `Approved from seller request for ${request.market_name}.`,
    });
    marketId = market.id;
  }

  db.prepare(`
    UPDATE market_requests
    SET status = ?, market_id = COALESCE(?, market_id), admin_note = ?, updated_at = ?
    WHERE id = ?
  `).run(
    cleanStatus,
    marketId,
    clean(input.adminNote || input.note, 1000),
    now,
    requestId,
  );

  if (request.seller_id && request.store_id && marketId && ["approved", "merged"].includes(cleanStatus)) {
    applySellerToLocalMarket(request.seller_id, {
      marketId,
      shopStallNumber: request.shop_details,
      locationArea: request.area,
      nearestLandmark: request.landmark,
      pickupLocation: request.address || request.landmark,
      storeCategory: request.what_sells || "",
    });
  }

  if (request.seller_id) {
    createNotification({
      userId: request.seller_id,
      type: "seller",
      title: "Market request updated",
      body: `${request.market_name} request is now ${cleanStatus}.${input.adminNote ? ` ${input.adminNote}` : ""}`,
      actionLabel: "Open seller setup",
      actionPath: "/seller/onboarding",
    });
  }

  return serializeMarketRequest(
    db.prepare(`${marketRequestSelectSql("WHERE market_requests.id = ?")} LIMIT 1`).get(requestId),
  );
}

export function adminListSellerCategoryApprovals({ query = "", status = "" } = {}) {
  const cleanQuery = clean(query, 100);
  const cleanStatus = clean(status, 40);
  const pattern = `%${escapeLike(cleanQuery)}%`;
  const params = [];
  let where = "WHERE 1 = 1";

  if (cleanStatus) {
    where += " AND seller_category_approvals.status = ?";
    params.push(cleanStatus);
  }

  where += `
    AND (
      ? = ''
      OR seller_category_approvals.category_name LIKE ? ESCAPE '\\'
      OR stores.name LIKE ? ESCAPE '\\'
      OR users.name LIKE ? ESCAPE '\\'
      OR markets.name LIKE ? ESCAPE '\\'
    )
  `;
  params.push(cleanQuery, pattern, pattern, pattern, pattern);

  return db
    .prepare(`
      ${categoryApprovalSelectSql(where)}
      ORDER BY
        CASE seller_category_approvals.status
          WHEN 'pending' THEN 0
          WHEN 'needs_more_info' THEN 1
          WHEN 'approved' THEN 2
          ELSE 3
        END,
        seller_category_approvals.updated_at DESC
      LIMIT 300
    `)
    .all(...params)
    .map(serializeCategoryApproval);
}

export function adminUpdateSellerCategoryApproval(identifier, input = {}, adminUserId = null) {
  const cleanStatus = clean(input.status || "approved", 40);
  assertAllowedStatus(cleanStatus, ["pending", "approved", "rejected", "suspended", "needs_more_info"], "Category approval status");

  let approval = db
    .prepare(`${categoryApprovalSelectSql("WHERE seller_category_approvals.id = ?")} LIMIT 1`)
    .get(identifier);

  if (!approval) {
    const store = storeRowForOwner(identifier) || storeRowById(input.storeId);
    if (!store) throw new HttpError(404, "Seller category approval record was not found.");
    approval = ensureSellerCategoryRequest({
      sellerId: store.owner_id,
      storeId: store.id,
      marketId: input.marketId || store.market_id || null,
      categoryName: input.categoryName || input.category || store.category,
    });
    approval = db
      .prepare(`${categoryApprovalSelectSql("WHERE seller_category_approvals.id = ?")} LIMIT 1`)
      .get(approval.id);
  }

  const now = nowIso();
  db.prepare(`
    UPDATE seller_category_approvals
    SET status = ?, approved_by = ?, admin_note = ?, updated_at = ?
    WHERE id = ?
  `).run(
    cleanStatus,
    cleanStatus === "approved" ? adminUserId : approval.approved_by || null,
    clean(input.adminNote || input.note, 1000),
    now,
    approval.id,
  );

  createNotification({
    userId: approval.seller_id,
    type: "seller",
    title: "Seller category review updated",
    body: `${approval.category_name} category is now ${cleanStatus}.`,
    actionLabel: "Open seller setup",
    actionPath: "/seller/onboarding",
  });

  return serializeCategoryApproval(
    db.prepare(`${categoryApprovalSelectSql("WHERE seller_category_approvals.id = ?")} LIMIT 1`).get(approval.id),
  );
}

export function adminListMarkets({ query = "" } = {}) {
  return listLocalMarkets({
    includeInactive: true,
    query,
    limit: 100,
  });
}

function marketPayloadFromInput(input = {}, existing = null) {
  const name = clean(input.name ?? existing?.name, 120);

  if (!name) {
    throw new HttpError(422, "Market name is required.");
  }

  const rawCategories =
    input.allowedCategories ??
    input.allowed_categories ??
    existing?.allowed_categories ??
    DEFAULT_MARKET_CATEGORIES;
  const allowedCategories = normalizeCategoryList(rawCategories);
  const slugSource = clean(input.slug ?? (existing ? existing.slug : name), 100);

  return {
    name,
    slug: uniqueMarketSlug(slugSource || name, existing?.id || ""),
    description: clean(input.description ?? existing?.description, 1000),
    state: clean(input.state ?? existing?.state, 80),
    city: clean(input.city ?? existing?.city, 80),
    area: clean(input.area ?? existing?.area, 80),
    address: clean(input.address ?? existing?.address, 240),
    landmark: clean(input.landmark ?? existing?.landmark, 160),
    latitude: numberOrNull(input.latitude ?? input.lat ?? existing?.latitude),
    longitude: numberOrNull(input.longitude ?? input.lng ?? existing?.longitude),
    radiusKm: numberOrFallback(input.radiusKm ?? input.radius_km ?? existing?.radius_km, 3),
    status: clean(input.status ?? existing?.status ?? "pending", 40),
    allowedCategories,
    coverUrl: clean(input.coverUrl ?? input.cover_url ?? existing?.cover_url, 1000) || null,
    iconUrl: clean(input.iconUrl ?? input.icon_url ?? existing?.icon_url, 1000) || null,
    deliveryNote: clean(input.deliveryNote ?? input.delivery_note ?? existing?.delivery_note, 1000),
  };
}

function ensureValidMarketStatus(status) {
  if (!["pending", "active", "disabled"].includes(status)) {
    throw new HttpError(422, "Market status must be pending, active, or disabled.");
  }
}

function replaceMarketCategories(marketId, categories) {
  const now = nowIso();
  db.prepare("DELETE FROM market_categories WHERE market_id = ?").run(marketId);

  categories.forEach((name, index) => {
    db.prepare(`
      INSERT INTO market_categories (
        id, market_id, category_key, name, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      createId("mcat"),
      marketId,
      slugify(name),
      name,
      index,
      now,
      now,
    );
  });
}

export function adminCreateMarket(input = {}) {
  const payload = marketPayloadFromInput(input);
  ensureValidMarketStatus(payload.status);
  if (!payload.state || !payload.city || !payload.address) {
    throw new HttpError(422, "State, city, and a real market address are required.");
  }
  if (payload.latitude == null || payload.longitude == null) {
    throw new HttpError(422, "Add the mapped latitude and longitude before creating this market.");
  }
  if (payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) {
    throw new HttpError(422, "Market coordinates are outside the valid map range.");
  }

  const now = nowIso();
  const id = createId("mkt");

  db.prepare(`
    INSERT INTO markets (
      id, name, slug, description, state, city, area, address, landmark,
      latitude, longitude, radius_km, status, allowed_categories,
      cover_url, icon_url, delivery_note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.name,
    payload.slug,
    payload.description,
    payload.state,
    payload.city,
    payload.area,
    payload.address,
    payload.landmark,
    payload.latitude,
    payload.longitude,
    payload.radiusKm,
    payload.status,
    JSON.stringify(payload.allowedCategories),
    payload.coverUrl,
    payload.iconUrl,
    payload.deliveryNote,
    now,
    now,
  );

  replaceMarketCategories(id, payload.allowedCategories);

  return serializeMarket(getMarketRow(id, false));
}

export function adminUpdateMarket(marketId, input = {}) {
  const existing = getMarketRow(marketId, false);

  if (!existing) {
    throw new HttpError(404, "Market was not found.");
  }

  const payload = marketPayloadFromInput(input, existing);
  ensureValidMarketStatus(payload.status);

  const updatedAt = nowIso();

  db.prepare(`
    UPDATE markets
    SET name = ?,
        slug = ?,
        description = ?,
        state = ?,
        city = ?,
        area = ?,
        address = ?,
        landmark = ?,
        latitude = ?,
        longitude = ?,
        radius_km = ?,
        status = ?,
        allowed_categories = ?,
        cover_url = ?,
        icon_url = ?,
        delivery_note = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    payload.name,
    payload.slug,
    payload.description,
    payload.state,
    payload.city,
    payload.area,
    payload.address,
    payload.landmark,
    payload.latitude,
    payload.longitude,
    payload.radiusKm,
    payload.status,
    JSON.stringify(payload.allowedCategories),
    payload.coverUrl,
    payload.iconUrl,
    payload.deliveryNote,
    updatedAt,
    existing.id,
  );

  replaceMarketCategories(existing.id, payload.allowedCategories);

  return serializeMarket(getMarketRow(existing.id, false));
}

export function adminUpdateMarketStatus(marketId, status) {
  const existing = getMarketRow(marketId, false);

  if (!existing) {
    throw new HttpError(404, "Market was not found.");
  }

  const cleanStatus = clean(status, 40);
  ensureValidMarketStatus(cleanStatus);

  db.prepare("UPDATE markets SET status = ?, updated_at = ? WHERE id = ?").run(
    cleanStatus,
    nowIso(),
    existing.id,
  );

  return serializeMarket(getMarketRow(existing.id, false));
}

export function adminListMarketSellers(marketId, { viewerId = "" } = {}) {
  const market = getMarketRow(marketId, false);

  if (!market) {
    throw new HttpError(404, "Market was not found.");
  }

  return {
    market: serializeMarket(market),
    sellers: listMarketStoresForAdmin(market.id, viewerId),
  };
}

export function adminUpdateMarketSellerStatus(marketId, profileId, status, input = {}) {
  const cleanStatus = clean(status, 40);

  assertAllowedStatus(
    cleanStatus,
    ["pending", "approved", "rejected", "suspended", "needs_more_info"],
    "Market seller status",
  );

  const profile = db
    .prepare(`
      SELECT seller_market_profiles.*, stores.owner_id
      FROM seller_market_profiles
      JOIN stores ON stores.id = seller_market_profiles.store_id
      WHERE seller_market_profiles.id = ? AND seller_market_profiles.market_id = ?
    `)
    .get(profileId, marketId);

  if (!profile) {
    throw new HttpError(404, "Market seller profile was not found.");
  }

  const now = nowIso();

  db.prepare(`
    UPDATE seller_market_profiles
    SET status = ?, admin_note = COALESCE(NULLIF(?, ''), admin_note), updated_at = ?
    WHERE id = ? AND market_id = ?
  `).run(cleanStatus, clean(input.adminNote || input.note, 1000), now, profileId, marketId);

  if (cleanStatus === "approved") {
    db.prepare(`
      UPDATE stores
      SET verification_status = 'verified', verified = 1, verified_at = COALESCE(verified_at, ?),
          verification_note = 'Local Market seller approved by admin.',
          updated_at = ?
      WHERE id = ?
    `).run(now, now, profile.store_id);

    db.prepare(`
      UPDATE seller_verification_profiles
      SET status = 'verified', verified_at = COALESCE(verified_at, ?),
          note = 'Local Market seller approved by admin.', updated_at = ?
      WHERE store_id = ?
    `).run(now, now, profile.store_id);
  }

  if (["rejected", "suspended", "needs_more_info", "pending"].includes(cleanStatus)) {
    const verificationStatus =
      cleanStatus === "suspended"
        ? "suspended"
        : cleanStatus === "rejected"
          ? "rejected"
          : "pending_verification";
    const note =
      input.adminNote ||
      input.note ||
      (cleanStatus === "needs_more_info"
        ? "Admin needs more details before approving this Local Market seller."
        : `Local Market seller status is ${cleanStatus}.`);

    db.prepare(`
      UPDATE stores
      SET verification_status = ?,
          verification_note = ?,
          updated_at = ?
      WHERE id = ?
    `).run(verificationStatus, note, now, profile.store_id);

    db.prepare(`
      UPDATE seller_verification_profiles
      SET status = ?, note = ?, updated_at = ?
      WHERE store_id = ?
    `).run(verificationStatus, note, now, profile.store_id);
  }

  createNotification({
    userId: profile.owner_id,
    type: "seller",
    title: "Local Market seller review updated",
    body: `Your Local Market seller profile is now ${cleanStatus}.`,
    actionLabel: "Open seller setup",
    actionPath: "/seller/onboarding",
  });

  return adminListMarketSellers(marketId);
}

export function adminUpdateSellerMarketApproval(sellerIdOrProfileId, input = {}) {
  const profile = db
    .prepare(`
      SELECT seller_market_profiles.id, seller_market_profiles.market_id
      FROM seller_market_profiles
      JOIN stores ON stores.id = seller_market_profiles.store_id
      WHERE seller_market_profiles.id = ?
         OR stores.id = ?
         OR stores.owner_id = ?
      ORDER BY seller_market_profiles.updated_at DESC
      LIMIT 1
    `)
    .get(sellerIdOrProfileId, sellerIdOrProfileId, sellerIdOrProfileId);

  if (!profile) {
    throw new HttpError(404, "Seller market approval profile was not found.");
  }

  return adminUpdateMarketSellerStatus(
    input.marketId || profile.market_id,
    input.profileId || profile.id,
    input.status,
    input,
  );
}

export function adminUpdateMarketCategories(marketId, categoriesInput) {
  const existing = getMarketRow(marketId, false);

  if (!existing) {
    throw new HttpError(404, "Market was not found.");
  }

  const categories = normalizeCategoryList(categoriesInput).length
    ? normalizeCategoryList(categoriesInput)
    : DEFAULT_MARKET_CATEGORIES;

  db.prepare("UPDATE markets SET allowed_categories = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(categories),
    nowIso(),
    existing.id,
  );

  replaceMarketCategories(existing.id, categories);

  return serializeMarket(getMarketRow(existing.id, false));
}
