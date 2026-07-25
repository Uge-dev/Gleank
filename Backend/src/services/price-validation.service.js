import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { logAdminAudit } from "./audit-log.service.js";

const FALLBACK_RANGES = [
  { pattern: /food|meal|shawarma|snack|drink|restaurant/i, min: 100_00, max: 50_000_00, action: "review" },
  { pattern: /book|textbook|stationer/i, min: 200_00, max: 80_000_00, action: "review" },
  { pattern: /fashion|cloth|shoe|bag|accessor/i, min: 500_00, max: 500_000_00, action: "review" },
  { pattern: /phone|laptop|electronic|gadget/i, min: 2_000_00, max: 5_000_000_00, action: "review" },
  { pattern: /beauty|hair|makeup|skin/i, min: 500_00, max: 300_000_00, action: "review" },
  { pattern: /home|household|furniture|appliance/i, min: 500_00, max: 2_000_000_00, action: "review" },
  { pattern: /service|repair|cleaning|delivery|design|skill/i, min: 500_00, max: 1_500_000_00, action: "review" },
];

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function priceKoboFromInput(input = {}) {
  if (input.priceKobo !== undefined || input.price_kobo !== undefined) {
    const parsed = Number(input.priceKobo ?? input.price_kobo);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }
  const parsed = Number(input.price || input.amount || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function numberKobo(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function serializeRange(row) {
  return {
    id: row.id,
    marketScope: row.market_scope || "all",
    campus: row.campus || "",
    sellerType: row.seller_type || "all",
    category: row.category,
    subcategory: row.subcategory || "",
    condition: row.condition || "",
    minPriceKobo: Number(row.min_price_kobo || 0),
    maxPriceKobo: Number(row.max_price_kobo || 0),
    minPrice: Number(row.min_price_kobo || 0) / 100,
    maxPrice: Number(row.max_price_kobo || 0) / 100,
    action: row.action || "review",
    note: row.note || "",
    isActive: row.is_active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function matchingAdminRange(input = {}) {
  const category = clean(input.category, 120).toLowerCase();
  const subcategory = clean(input.subcategory || input.serviceType, 120).toLowerCase();
  const condition = clean(input.condition, 120).toLowerCase();
  const sellerType = clean(input.sellerType || input.seller_type || "all", 60).toLowerCase();
  const marketScope = clean(input.marketScope || input.market || "all", 80).toLowerCase();
  const campus = clean(input.campus, 120).toLowerCase();

  const rows = db.prepare(`
    SELECT *
    FROM product_price_ranges
    WHERE is_active = 1
      AND LOWER(category) = LOWER(?)
      AND (seller_type = 'all' OR LOWER(seller_type) = LOWER(?))
      AND (market_scope = 'all' OR LOWER(market_scope) = LOWER(?))
      AND (campus = '' OR LOWER(campus) = LOWER(?))
      AND (subcategory = '' OR LOWER(subcategory) = LOWER(?))
      AND (condition = '' OR LOWER(condition) = LOWER(?))
    ORDER BY
      CASE WHEN LOWER(seller_type) = LOWER(?) THEN 0 ELSE 1 END,
      CASE WHEN LOWER(market_scope) = LOWER(?) THEN 0 ELSE 1 END,
      CASE WHEN LOWER(campus) = LOWER(?) THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  `).get(
    category,
    sellerType,
    marketScope,
    campus,
    subcategory,
    condition,
    sellerType,
    marketScope,
    campus,
  );

  return rows || null;
}

function matchingFallbackRange(input = {}) {
  const blob = `${input.category || ""} ${input.name || ""} ${input.serviceType || ""} ${input.description || ""}`;
  const fallback = FALLBACK_RANGES.find((range) => range.pattern.test(blob));
  if (!fallback) return null;

  return {
    id: "fallback",
    market_scope: "all",
    seller_type: "all",
    category: clean(input.category || "General", 120),
    subcategory: "",
    condition: "",
    min_price_kobo: fallback.min,
    max_price_kobo: fallback.max,
    action: fallback.action,
    note: "Default Gleenc range. Admin can override this in price controls.",
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function validateProductPrice(input = {}) {
  const priceKobo = priceKoboFromInput(input);
  if (priceKobo <= 0) {
    return {
      status: "block",
      ok: false,
      requiresReview: false,
      reason: "Enter a valid price before publishing.",
      priceKobo,
      range: null,
    };
  }

  const row = matchingAdminRange(input) || matchingFallbackRange(input);
  if (!row) {
    return {
      status: "ok",
      ok: true,
      requiresReview: false,
      reason: "",
      priceKobo,
      range: null,
    };
  }

  const min = Number(row.min_price_kobo || 0);
  const max = Number(row.max_price_kobo || 0);
  const outOfRange =
    (min > 0 && priceKobo < min) ||
    (max > 0 && priceKobo > max);

  if (!outOfRange) {
    return {
      status: "ok",
      ok: true,
      requiresReview: false,
      reason: "",
      priceKobo,
      range: serializeRange(row),
    };
  }

  const action = row.action || "review";
  const status = action === "block" ? "block" : action === "warn" ? "warning" : "review";

  return {
    status,
    ok: status !== "block",
    requiresReview: status === "review",
    reason:
      row.note ||
      "This price is outside the normal range for this category and needs review.",
    priceKobo,
    range: serializeRange(row),
  };
}

export function validateAndStoreProductPrice(productId, itemType = "product", input = {}) {
  const validation = validateProductPrice(input);
  const table = itemType === "service" ? "services" : "products";
  const status = validation.status === "ok" ? "ok" : validation.status;
  const now = nowIso();

  db.prepare(`
    UPDATE ${table}
    SET price_validation_status = ?,
        price_validation_note = ?,
        requires_admin_review = CASE WHEN ? THEN 1 ELSE requires_admin_review END,
        last_validated_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    status,
    validation.reason || "",
    validation.requiresReview ? 1 : 0,
    now,
    now,
    productId,
  );

  return validation;
}

export function adminListPriceRanges(filters = {}) {
  const params = [];
  const where = [];

  if (filters.category) {
    where.push("LOWER(category) = LOWER(?)");
    params.push(clean(filters.category, 120));
  }

  if (filters.sellerType) {
    where.push("(seller_type = 'all' OR LOWER(seller_type) = LOWER(?))");
    params.push(clean(filters.sellerType, 80));
  }

  return db
    .prepare(`
      SELECT *
      FROM product_price_ranges
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY is_active DESC, category ASC, updated_at DESC
      LIMIT 250
    `)
    .all(...params)
    .map(serializeRange);
}

export function adminCreatePriceRange(adminAuth, input = {}, requestMeta = {}) {
  const category = clean(input.category, 120);
  if (!category) throw new HttpError(422, "Category is required.");

  const now = nowIso();
  const id = createId("prc");
  const minPriceKobo = input.minPriceKobo !== undefined
    ? numberKobo(input.minPriceKobo)
    : Math.round(Number(input.minPrice || 0) * 100);
  const maxPriceKobo = input.maxPriceKobo !== undefined
    ? numberKobo(input.maxPriceKobo)
    : Math.round(Number(input.maxPrice || 0) * 100);

  if (maxPriceKobo > 0 && maxPriceKobo < minPriceKobo) {
    throw new HttpError(422, "Maximum price cannot be lower than minimum price.");
  }

  db.prepare(`
    INSERT INTO product_price_ranges (
      id, market_scope, campus, seller_type, category, subcategory, condition,
      min_price_kobo, max_price_kobo, action, note, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clean(input.marketScope || "all", 80),
    clean(input.campus, 120),
    clean(input.sellerType || "all", 80),
    category,
    clean(input.subcategory, 120),
    clean(input.condition, 120),
    minPriceKobo,
    maxPriceKobo,
    ["allow", "warn", "review", "block"].includes(input.action) ? input.action : "review",
    clean(input.note, 500),
    input.isActive === false ? 0 : 1,
    now,
    now,
  );

  logAdminAudit({
    adminId: adminAuth?.user_id || adminAuth?.id || null,
    action: "price_range_created",
    targetType: "price_range",
    targetId: id,
    summary: `Created ${category} price range`,
    metadata: { category, minPriceKobo, maxPriceKobo },
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return serializeRange(db.prepare("SELECT * FROM product_price_ranges WHERE id = ?").get(id));
}

export function adminUpdatePriceRange(adminAuth, rangeId, input = {}, requestMeta = {}) {
  const existing = db.prepare("SELECT * FROM product_price_ranges WHERE id = ?").get(rangeId);
  if (!existing) throw new HttpError(404, "Price range was not found.");

  const minPriceKobo = input.minPriceKobo !== undefined
    ? numberKobo(input.minPriceKobo)
    : input.minPrice !== undefined
      ? Math.round(Number(input.minPrice || 0) * 100)
      : existing.min_price_kobo;
  const maxPriceKobo = input.maxPriceKobo !== undefined
    ? numberKobo(input.maxPriceKobo)
    : input.maxPrice !== undefined
      ? Math.round(Number(input.maxPrice || 0) * 100)
      : existing.max_price_kobo;

  if (maxPriceKobo > 0 && maxPriceKobo < minPriceKobo) {
    throw new HttpError(422, "Maximum price cannot be lower than minimum price.");
  }

  const now = nowIso();
  db.prepare(`
    UPDATE product_price_ranges
    SET market_scope = ?,
        campus = ?,
        seller_type = ?,
        category = ?,
        subcategory = ?,
        condition = ?,
        min_price_kobo = ?,
        max_price_kobo = ?,
        action = ?,
        note = ?,
        is_active = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    clean(input.marketScope ?? existing.market_scope, 80),
    clean(input.campus ?? existing.campus, 120),
    clean(input.sellerType ?? existing.seller_type, 80),
    clean(input.category ?? existing.category, 120),
    clean(input.subcategory ?? existing.subcategory, 120),
    clean(input.condition ?? existing.condition, 120),
    minPriceKobo,
    maxPriceKobo,
    ["allow", "warn", "review", "block"].includes(input.action) ? input.action : existing.action,
    clean(input.note ?? existing.note, 500),
    input.isActive === undefined ? existing.is_active : input.isActive ? 1 : 0,
    now,
    rangeId,
  );

  logAdminAudit({
    adminId: adminAuth?.user_id || adminAuth?.id || null,
    action: "price_range_updated",
    targetType: "price_range",
    targetId: rangeId,
    summary: "Updated price validation range",
    metadata: { input },
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return serializeRange(db.prepare("SELECT * FROM product_price_ranges WHERE id = ?").get(rangeId));
}

export function adminDeletePriceRange(adminAuth, rangeId, requestMeta = {}) {
  const existing = db.prepare("SELECT * FROM product_price_ranges WHERE id = ?").get(rangeId);
  if (!existing) throw new HttpError(404, "Price range was not found.");

  db.prepare("DELETE FROM product_price_ranges WHERE id = ?").run(rangeId);
  logAdminAudit({
    adminId: adminAuth?.user_id || adminAuth?.id || null,
    action: "price_range_deleted",
    targetType: "price_range",
    targetId: rangeId,
    summary: "Deleted price validation range",
    metadata: { category: existing.category },
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
  });

  return { success: true };
}
