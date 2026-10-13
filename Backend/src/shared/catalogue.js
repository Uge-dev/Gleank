import { z } from "zod";
import { env } from "../config/env.js";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import {
  evaluateListingModeration,
  upsertModerationRecord,
} from "../services/moderation.service.js";
import {
  id,
  now,
  json,
  parse,
  assertTerms,
  lockUsers,
  assertUser,
  assertUnblocked,
  page,
  assertAdmin,
  hash,
} from "./core.js";
import { productSchema, orderingSchema } from "./schemas.js";
import { ownedMedia } from "./media.js";
export function profileCatalogue(ownerId, query = {}) {
  const p = page(query);
  return db
    .prepare(
      "SELECT * FROM shared_catalogue WHERE owner_id=? AND active=1 ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(ownerId, p.limit, p.offset)
    .map((r) => ({ id: r.id, version: r.version, ...parse(r.data_json) }));
}
export function saveCatalogue(userId, catalogueId, input) {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      priceKobo: z.number().int().min(0).max(1000000000),
      ordering: orderingSchema,
    })
    .strict()
    .parse(input);
  return transaction(() => {
    lockUsers([userId]);
    const old = catalogueId
      ? db
          .prepare("SELECT * FROM shared_catalogue WHERE id=? AND owner_id=?")
          .get(catalogueId, userId)
      : null;
    if (catalogueId && !old)
      throw new HttpError(404, "Catalogue item not found.");
    const key = old?.id || id("catalogue");
    db.prepare(
      `INSERT INTO shared_catalogue(id,owner_id,data_json,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,version=shared_catalogue.version+1,updated_at=excluded.updated_at`,
    ).run(key, userId, json(data), now(), now());
    for (const linked of db
      .prepare("SELECT * FROM shared_products WHERE catalogue_id=?")
      .all(key)) {
      assertEditableInventory(linked.product_id);
      const metadata = {
        ...parse(linked.data_json),
        priceKobo: data.priceKobo,
        ordering: data.ordering,
      };
      db.prepare(
        "UPDATE shared_products SET data_json=?,version=version+1,updated_at=? WHERE product_id=?",
      ).run(json(metadata), now(), linked.product_id);
      const fee = Math.round(
        (data.priceKobo * Number(env.platformFeePercent)) / 100,
      );
      db.prepare(
        "UPDATE products SET price_kobo=?,seller_price_kobo=?,buyer_price_kobo=?,updated_at=? WHERE id=?",
      ).run(
        data.priceKobo + fee,
        data.priceKobo,
        data.priceKobo + fee,
        now(),
        linked.product_id,
      );
      db.prepare("UPDATE products SET platform_fee_kobo=? WHERE id=?").run(
        fee,
        linked.product_id,
      );
    }
    return { id: key, ...data };
  });
}
export function productRow(productId, viewerId = "", owner = false) {
  const row = db
    .prepare(
      `SELECT p.*,s.owner_id,s.status AS store_status,s.name AS store_name,s.slug AS store_slug,u.is_active AS owner_active,x.data_json,x.version,x.state,x.catalogue_id,x.publish_at FROM products p JOIN stores s ON s.id=p.store_id JOIN users u ON u.id=s.owner_id LEFT JOIN shared_products x ON x.product_id=p.id WHERE p.id=?`,
    )
    .get(productId);
  if (
    !row ||
    !row.owner_active ||
    (owner
      ? row.owner_id !== viewerId
      : row.store_status !== "active" ||
        (row.state
          ? row.state !== "published"
          : !["active", "out_of_stock"].includes(row.status)))
  )
    throw new HttpError(404, "Product not found.");
  if (viewerId) assertUnblocked(viewerId, row.owner_id);
  const fallback = {
    name: row.name,
    description: row.description,
    category: row.category,
    priceKobo:
      Number(row.seller_price_kobo) ||
      Math.max(0, Number(row.price_kobo) - Number(row.platform_fee_kobo || 0)),
    stock: row.stock,
    kind: "physical",
    presentation: "image",
    mediaIds: [],
    variants: parse(row.available_sizes, []).map((size) => ({
      id: "legacy-size-" + hash(String(size)).slice(0, 12),
      size: String(size),
      color: "",
      stock: row.stock,
      photoIds: [],
    })),
    ordering: orderingSchema.parse({}),
    offersEnabled: true,
    reshareEnabled: true,
    returnDays: 7,

    attributes: {},
  };
  return {
    ...row,
    details: row.data_json ? parse(row.data_json) : fallback,
    version: row.data_json
      ? Number(row.version)
      : Number.parseInt(hash(json([
          row.name, row.description, row.category, row.seller_price_kobo,
          row.buyer_price_kobo, row.platform_fee_kobo, row.available_sizes,
          row.image_urls,
        ])).slice(0, 7), 16),
  };
}
export function publicProduct(row) {
  const d = { ...row.details };
  delete d.fileIds;
  delete d.publication;
  delete d.publishAt;
  const poster = d.posterId
    ? db
        .prepare(
          "SELECT public_url FROM shared_media WHERE id=? AND owner_id=?",
        )
        .get(d.posterId, row.owner_id)?.public_url
    : null;
  const media = d.mediaIds?.length
    ? db
        .prepare("SELECT id,kind,public_url FROM shared_media WHERE owner_id=?")
        .all(row.owner_id)
        .filter((m) => d.mediaIds.includes(m.id))
        .map((m) => ({ id: m.id, kind: m.kind, url: m.public_url }))
    : parse(row.image_urls, []).map((url) => ({ kind: "image", url }));
  return {
    id: row.id,
    ownerId: row.owner_id,
    storeId: row.store_id,
    storeName: row.store_name,
    storeSlug: row.store_slug,
    ...d,
    stock: row.stock,
    version: row.version,
    media,
    posterUrl: poster,
  };
}
export function saveProduct(userId, productId, body) {
  assertTerms(userId);
  let data = productSchema.parse(body);
  if (data.publishAt) data.publishAt = new Date(data.publishAt).toISOString();
  const store = db
    .prepare("SELECT * FROM stores WHERE owner_id=? AND status='active'")
    .get(userId);
  if (!store) throw new HttpError(422, "Complete selling settings first.");
  if (data.catalogueId) {
    const template = db
      .prepare(
        "SELECT * FROM shared_catalogue WHERE id=? AND owner_id=? AND active=1",
      )
      .get(data.catalogueId, userId);
    if (!template)
      throw new HttpError(422, "Choose your own active catalogue item.");
    const t = parse(template.data_json);
    data = { ...data, priceKobo: t.priceKobo, ordering: t.ordering };
  }
  const media = ownedMedia(
    userId,
    data.mediaIds,
    data.presentation === "video" ? ["video"] : ["image"],
  );
  if (
    data.presentation === "video" &&
    data.publication !== "draft" &&
    !data.posterId
  )
    throw new HttpError(422, "Attach a poster image for the video.");
  if (data.posterId) ownedMedia(userId, [data.posterId], ["image"]);
  ownedMedia(userId, data.fileIds, ["digital"]);
  for (const c of data.ordering.components)
    if (c.photoId) ownedMedia(userId, [c.photoId], ["image"]);
  for (const v of data.variants) ownedMedia(userId, v.photoIds, ["image"]);
  if (data.presentation === "video" && data.mediaIds.length > 1)
    throw new HttpError(422, "Use one video per product post.");
  if (data.publication !== "draft" && !media.length)
    throw new HttpError(422, "Attach product media before publishing.");
  if (
    data.publication === "schedule" &&
    (Date.parse(data.publishAt) < Date.now() + 60000 ||
      Date.parse(data.publishAt) > Date.now() + 365 * 86400000)
  )
    throw new HttpError(422, "Schedule between one minute and one year ahead.");
  const moderation = evaluateListingModeration({
    store,
    input: {
      ...data,
      price: data.priceKobo / 100,
      status: data.publication === "draft" ? "draft" : "active",
    },
    images: media.map((m) => m.public_url),
  });
  if (
    data.publication !== "draft" &&
    moderation.moderationStatus === "rejected"
  )
    throw new HttpError(
      422,
      "This product requires moderation before publication.",
    );
  return transaction(() => {
    lockUsers([userId]);
    const old = productId ? productRow(productId, userId, true) : null;
    if (old?.state === "published" && old.details.kind !== data.kind)
      throw new HttpError(
        409,
        "Do not change the fulfillment type of a published product.",
      );
    if (old) assertEditableInventory(old.id);
    const key = old?.id || id("product"),
      state =
        moderation.moderationStatus === "pending_review"
          ? "pending_review"
          : data.publication === "publish"
            ? "published"
            : data.publication === "schedule"
              ? "scheduled"
              : "draft";
    const fee = Math.round(
      (data.priceKobo * Number(env.platformFeePercent)) / 100,
    );
    // Legacy catalog retains matching records, but configured purchases must use v2.
    if (!old)
      db.prepare(
        `INSERT INTO products(id,store_id,name,slug,category,description,price_kobo,seller_price_kobo,buyer_price_kobo,stock,status,image_urls,available_sizes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        key,
        store.id,
        data.name,
        key,
        data.category,
        data.description,
        data.priceKobo + fee,
        data.priceKobo,
        data.priceKobo + fee,
        data.stock,
        state === "published"
          ? data.stock
            ? "active"
            : "out_of_stock"
          : "draft",
        json(media.filter((m) => m.kind === "image").map((m) => m.public_url)),
        json([...new Set(data.variants.map((v) => v.size).filter(Boolean))]),
        now(),
        now(),
      );
    else
      db.prepare(
        "UPDATE products SET name=?,category=?,description=?,price_kobo=?,seller_price_kobo=?,buyer_price_kobo=?,stock=?,status=?,image_urls=?,available_sizes=?,updated_at=? WHERE id=?",
      ).run(
        data.name,
        data.category,
        data.description,
        data.priceKobo + fee,
        data.priceKobo,
        data.priceKobo + fee,
        data.stock,
        state === "published"
          ? data.stock
            ? "active"
            : "out_of_stock"
          : "draft",
        json(media.filter((m) => m.kind === "image").map((m) => m.public_url)),
        json([...new Set(data.variants.map((v) => v.size).filter(Boolean))]),
        now(),
        key,
      );
    db.prepare(
      `INSERT INTO shared_products(product_id,data_json,catalogue_id,state,publish_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET data_json=excluded.data_json,catalogue_id=excluded.catalogue_id,state=excluded.state,publish_at=excluded.publish_at,version=shared_products.version+1,updated_at=excluded.updated_at`,
    ).run(
      key,
      json(data),
      data.catalogueId || null,
      state,
      data.publishAt || null,
      now(),
    );
    db.prepare("UPDATE products SET platform_fee_kobo=? WHERE id=?").run(
      fee,
      key,
    );
    upsertModerationRecord({ itemId: key, moderation });
    db.prepare(
      "UPDATE products SET moderation_status=?,moderation_note=?,requires_admin_review=? WHERE id=?",
    ).run(
      moderation.moderationStatus,
      moderation.moderationNote || "",
      moderation.moderationStatus === "pending_review" ? 1 : 0,
      key,
    );
    const existing = db
      .prepare(
        "SELECT id FROM shared_posts WHERE product_id=? AND original_id IS NULL",
      )
      .get(key);
    if (!existing)
      db.prepare(
        "INSERT INTO shared_posts(id,product_id,author_id,caption,active,created_at) VALUES(?,?,?,?,?,?)",
      ).run(
        id("post"),
        key,
        userId,
        data.description,
        state === "published" ? 1 : 0,
        now(),
      );
    else
      db.prepare("UPDATE shared_posts SET caption=?,active=? WHERE id=?").run(
        data.description,
        state === "published" ? 1 : 0,
        existing.id,
      );
    return {
      ...publicProduct(productRow(key, userId, true)),
      state,
      publishAt: data.publishAt || null,
    };
  });
}
export function publishDue() {
  transaction(() => {
    const due = db
      .prepare(
        "SELECT product_id FROM shared_products WHERE state='scheduled' AND publish_at<=? ORDER BY publish_at LIMIT 100",
      )
      .all(now());
    for (const { product_id: productId } of due) {
      const p = db
        .prepare(
          "SELECT p.*,s.owner_id,s.status AS store_status,u.is_active FROM products p JOIN stores s ON s.id=p.store_id JOIN users u ON u.id=s.owner_id WHERE p.id=?",
        )
        .get(productId);
      if (
        !p?.is_active ||
        p.store_status !== "active" ||
        !["auto_approved", "approved"].includes(p.moderation_status)
      )
        continue;
      lockUsers([p.owner_id]);
      const updated = db
        .prepare(
          "UPDATE shared_products SET state='published',updated_at=? WHERE product_id=? AND state='scheduled' AND publish_at<=?",
        )
        .run(now(), productId, now());
      if (updated.changes) {
        db.prepare(
          "UPDATE products SET status=CASE WHEN stock>0 THEN 'active' ELSE 'out_of_stock' END,created_at=?,updated_at=? WHERE id=?",
        ).run(now(), now(), productId);
        db.prepare(
          "UPDATE shared_posts SET active=1,created_at=? WHERE product_id=? AND original_id IS NULL",
        ).run(now(), productId);
      }
    }
  });
}

export function assertEditableInventory(productId) {
  db.prepare("UPDATE products SET updated_at=updated_at WHERE id=?").run(
    productId,
  );
  // Prevent stock resets and removed menu/variant IDs while paid or reserved orders depend on them.
  if (
    db
      .prepare(
        "SELECT checkout_id FROM shared_reservations WHERE product_id=? LIMIT 1",
      )
      .get(productId)
  )
    throw new HttpError(
      409,
      "Finish or cancel reserved checkouts before changing this product.",
    );
  if (
    db
      .prepare(
        "SELECT id FROM shared_order_lines l WHERE product_id=? AND refund_state<>'refunded' AND NOT EXISTS(SELECT 1 FROM shared_ledger x WHERE x.event_key='release:' || l.id)",
      )
      .get(productId)
  )
    throw new HttpError(
      409,
      "Fulfil outstanding orders before changing product inventory.",
    );
}
export function setProductState(userId, productId, active) {
  return transaction(() => {
    lockUsers([userId]);
    const p = productRow(productId, userId, true);
    if (active && !p.data_json)
      throw new HttpError(409, "Manage this legacy product through the existing web product API.");
    if (active && (!['published', 'paused'].includes(p.state) || !['approved', 'auto_approved'].includes(p.moderation_status)))
      throw new HttpError(409, "Publish or obtain approval first.");
    db.prepare(
      "UPDATE shared_products SET state=?,updated_at=? WHERE product_id=?",
    ).run(active ? "published" : "paused", now(), p.id);
    db.prepare("UPDATE products SET status=? WHERE id=?").run(
      active ? (p.stock ? "active" : "out_of_stock") : "draft",
      p.id,
    );
    db.prepare(
      "UPDATE shared_posts SET active=? WHERE product_id=? AND original_id IS NULL",
    ).run(active ? 1 : 0, p.id);
    return { active };
  });
}
export function reviewSharedProduct(admin, productId, approved) {
  assertAdmin(admin.user_id || admin.id);
  return transaction(() => {
    const p = db
      .prepare("SELECT * FROM shared_products WHERE product_id=?")
      .get(productId);
    if (!p) throw new HttpError(404, "Product not found.");
    const d = parse(p.data_json),
      state = approved
        ? d.publication === "schedule"
          ? "scheduled"
          : "published"
        : "rejected";
    db.prepare(
      "UPDATE shared_products SET state=?,updated_at=? WHERE product_id=?",
    ).run(state, now(), productId);
    db.prepare(
      "UPDATE products SET status=?,moderation_status=?,requires_admin_review=0 WHERE id=?",
    ).run(
      state === "published" ? (Number(db.prepare('SELECT stock FROM products WHERE id=?').get(productId).stock) > 0 ? 'active' : 'out_of_stock') : "draft",
      approved ? "approved" : "rejected",
      productId,
    );
    db.prepare(
      "UPDATE shared_posts SET active=? WHERE product_id=? AND original_id IS NULL",
    ).run(state === "published" ? 1 : 0, productId);
    return { state };
  });
}

export function ownerProduct(userId, productId) {
  const row = productRow(productId, userId, true);
  return {
    ...publicProduct(row),
    fileIds: row.details.fileIds || [],
    publication: row.details.publication || "draft",
    state: row.state || row.status,
    publishAt: row.publish_at,
  };
}
