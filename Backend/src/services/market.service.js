import { db } from "../db/database.js";
import { createId, slugify } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import {
  serializeProduct,
  serializeStore,
  serializeUsedListing,
} from "../lib/serializers.js";
import { productInteraction, storeInteraction } from "./interaction.service.js";
import { listUsedListings } from "./used-market.service.js";

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
  const store = serializeStore({
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
    created_at: row.store_created_at || row.created_at,
    updated_at: row.store_updated_at || row.updated_at,
  });

  return {
    ...store,
    ownerName: row.owner_name || "",
    ownerEmail: row.owner_email || "",
    ownerPhone: row.owner_phone || "",
    marketProfile: row.profile_id
      ? {
          id: row.profile_id,
          marketId: row.market_id,
          stallNumber: row.stall_number || "",
          addressNote: row.address_note || "",
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
}

function serializeMarketProduct(row, viewerId = "") {
  const product = {
    ...serializeProduct(row),
    storeName: row.store_name || "",
    storeSlug: row.store_slug || "",
    storeCampus: row.store_campus || "",
    store: serializeStore({
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
         stores.created_at AS store_created_at,
         stores.updated_at AS store_updated_at,
         (SELECT COUNT(*) FROM product_likes WHERE product_likes.product_id = products.id) AS like_count,
         (SELECT COUNT(*) FROM product_comments WHERE product_comments.product_id = products.id AND product_comments.is_deleted = 0) AS comment_count,
         (SELECT COUNT(*) FROM saved_items WHERE saved_items.item_type = 'product' AND saved_items.item_id = products.id) AS save_count,
         (SELECT COUNT(*) FROM product_shares WHERE product_shares.product_id = products.id) AS share_count,
         (SELECT COUNT(*) FROM product_views WHERE product_views.product_id = products.id AND product_views.user_id IS NOT NULL) AS view_count
  FROM products
  JOIN stores ON stores.id = products.store_id
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
      ? `
        (SELECT COUNT(*) FROM product_likes WHERE product_likes.product_id = products.id) DESC,
        (SELECT COUNT(*) FROM product_views WHERE product_views.product_id = products.id AND product_views.user_id IS NOT NULL) DESC,
        products.updated_at DESC
      `
      : `
        CASE WHEN ? != '' AND LOWER(stores.campus) = LOWER(?) THEN 0 ELSE 1 END,
        products.updated_at DESC
      `;

  const rows = db
    .prepare(`
      ${productSelectSql}
      WHERE stores.status = 'active'
        AND products.status IN ('active', 'out_of_stock')
        AND (
          ? = ''
          OR products.name LIKE ? ESCAPE '\\'
          OR products.description LIKE ? ESCAPE '\\'
          OR products.category LIKE ? ESCAPE '\\'
          OR stores.name LIKE ? ESCAPE '\\'
          OR stores.campus LIKE ? ESCAPE '\\'
        )
        AND (
          ? = ''
          OR LOWER(stores.campus) = LOWER(?)
          OR stores.campus LIKE ? ESCAPE '\\'
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
      cleanCampus,
      cleanCampus,
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
      ORDER BY products.updated_at DESC
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
        AND (
          ? = ''
          OR stores.name LIKE ? ESCAPE '\\'
          OR stores.description LIKE ? ESCAPE '\\'
          OR stores.campus LIKE ? ESCAPE '\\'
          OR stores.category LIKE ? ESCAPE '\\'
        )
        AND (
          ? = ''
          OR LOWER(stores.campus) = LOWER(?)
          OR stores.campus LIKE ? ESCAPE '\\'
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
      cleanCampus,
      cleanCampus,
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
      limit: 8,
      order: "engagement",
    }),
    trendingCampusProducts: listPublicProducts({
      campus: cleanCampus,
      viewerId,
      limit: 8,
      order: "engagement",
    }),
    freshUsedListings: listUsedListings({ query: "", category: "" }).slice(0, 8),
    nearbySellers: listActiveStores({
      campus: cleanCampus,
      viewerId,
      limit: 8,
    }),
    fastDeliveryProducts: listPublicProducts({
      campus: cleanCampus,
      viewerId,
      limit: 8,
      order: "fresh",
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
      order: "fresh",
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

  return {
    locationMode: cleanCampus ? "campus" : "platform",
    selectedCampus: cleanCampus,
    note: cleanCampus
      ? "Nearby ranking is currently campus-prioritized until map distance APIs are connected."
      : "Choose a campus/location later to make nearby ranking more exact.",
    sellers: listActiveStores({
      query,
      campus: cleanCampus,
      viewerId,
      limit: 50,
    }),
    products: listPublicProducts({
      query,
      campus: cleanCampus,
      viewerId,
      limit: 50,
      order: "fresh",
    }),
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
        order: "fresh",
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
    sellers: listLocalMarketStores(market.id, viewerId),
  };
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
