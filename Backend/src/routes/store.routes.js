import { Router } from "express";
import { db } from "../db/database.js";
import {
  serializeProduct,
  serializeService,
  serializeStore,
  serializeUsedListing,
} from "../lib/serializers.js";
import { HttpError } from "../lib/http-error.js";
import { requireAuth } from "../middleware/auth.js";
import { findStoreBySlug } from "../repositories/store.repository.js";
import {
  followStore,
  productInteraction,
  storeInteraction,
  unfollowStore,
} from "../services/interaction.service.js";

export const storeRouter = Router();

function serializeHighlight(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    category: row.category,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    count: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function firstImage(items, category) {
  return (
    items.find((item) => item.category === category && item.imageUrls?.[0])
      ?.imageUrls?.[0] || null
  );
}

function buildCategoryHighlights(products, services) {
  const categories = new Map();

  for (const product of products) {
    const current = categories.get(product.category);
    const productImage = product.imageUrls[0] || null;

    if (!current) {
      categories.set(product.category, {
        id: `highlight-${product.category.toLowerCase().replaceAll(" ", "-")}`,
        title: product.category,
        category: product.category,
        imageUrl: productImage,
        count: 1,
      });
    } else {
      current.count += 1;

      if (!current.imageUrl && productImage) {
        current.imageUrl = productImage;
      }
    }
  }

  for (const service of services) {
    const current = categories.get(service.category);
    const serviceImage = service.imageUrls[0] || null;

    if (!current) {
      categories.set(service.category, {
        id: `highlight-${service.category.toLowerCase().replaceAll(" ", "-")}`,
        title: service.category,
        category: service.category,
        imageUrl: serviceImage,
        count: 1,
      });
    } else {
      current.count += 1;

      if (!current.imageUrl && serviceImage) {
        current.imageUrl = serviceImage;
      }
    }
  }

  const highlights = Array.from(categories.values());
  const favoriteImage =
    products.find((item) => item.isFeatured && item.imageUrls[0])?.imageUrls[0] ||
    services.find((item) => item.isFeatured && item.imageUrls[0])?.imageUrls[0] ||
    null;

  const favoriteCount =
    products.filter((item) => item.isFeatured).length +
    services.filter((item) => item.isFeatured).length;

  if (favoriteCount > 0) {
    highlights.push({
      id: "highlight-favorites",
      title: "Favorites",
      category: "Favorites",
      imageUrl: favoriteImage,
      count: favoriteCount,
    });
  }

  return highlights;
}

function buildStoreHighlights(storeId, products, services) {
  const customHighlights = db
    .prepare(`
      SELECT * FROM store_highlights
      WHERE store_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `)
    .all(storeId)
    .map(serializeHighlight);

  if (!customHighlights.length) {
    return buildCategoryHighlights(products, services);
  }

  return customHighlights.map((highlight) => {
    const favoriteCount =
      highlight.category === "Favorites"
        ? products.filter((item) => item.isFeatured).length +
          services.filter((item) => item.isFeatured).length
        : products.filter((item) => item.category === highlight.category).length +
          services.filter((item) => item.category === highlight.category).length;

    return {
      ...highlight,
      count: favoriteCount,
      imageUrl:
        highlight.imageUrl ||
        (highlight.category === "Favorites"
          ? products.find((item) => item.isFeatured && item.imageUrls[0])
              ?.imageUrls[0] ||
            services.find((item) => item.isFeatured && item.imageUrls[0])
              ?.imageUrls[0] ||
            null
          : firstImage(products, highlight.category) ||
            firstImage(services, highlight.category)),
    };
  });
}

storeRouter.get("/", (req, res) => {
  const query = String(req.query.q || "").trim().slice(0, 100);
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

  const stores = db
    .prepare(`
      SELECT * FROM stores
      WHERE status = 'active'
        AND (
          ? = ''
          OR name LIKE ? ESCAPE '\\'
          OR description LIKE ? ESCAPE '\\'
          OR campus LIKE ? ESCAPE '\\'
          OR category LIKE ? ESCAPE '\\'
        )
      ORDER BY verified DESC, updated_at DESC
      LIMIT 50
    `)
    .all(query, pattern, pattern, pattern, pattern)
    .map((row) => ({
      ...serializeStore(row),
      interaction: storeInteraction(row.id, req.auth?.user_id),
    }));

  const products = db
    .prepare(`
      SELECT products.*, stores.name AS store_name, stores.slug AS store_slug
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE stores.status = 'active'
        AND products.status IN ('active', 'out_of_stock')
        AND (
          ? = ''
          OR products.name LIKE ? ESCAPE '\\'
          OR products.description LIKE ? ESCAPE '\\'
          OR products.category LIKE ? ESCAPE '\\'
          OR stores.name LIKE ? ESCAPE '\\'
        )
      ORDER BY products.updated_at DESC
      LIMIT 50
    `)
    .all(query, pattern, pattern, pattern, pattern)
    .map((row) => ({
      ...serializeProduct(row),
      storeName: row.store_name,
      storeSlug: row.store_slug,
      interaction: productInteraction(row.id, req.auth?.user_id),
    }));

  const services = db
    .prepare(`
      SELECT services.*, stores.name AS store_name, stores.slug AS store_slug
      FROM services
      JOIN stores ON stores.id = services.store_id
      WHERE stores.status = 'active'
        AND services.status = 'active'
        AND (
          ? = ''
          OR services.name LIKE ? ESCAPE '\\'
          OR services.description LIKE ? ESCAPE '\\'
          OR services.category LIKE ? ESCAPE '\\'
          OR stores.name LIKE ? ESCAPE '\\'
        )
      ORDER BY services.updated_at DESC
      LIMIT 50
    `)
    .all(query, pattern, pattern, pattern, pattern)
    .map((row) => ({
      ...serializeService(row),
      storeName: row.store_name,
      storeSlug: row.store_slug,
    }));

  const usedListings = db
    .prepare(`
      SELECT used_listings.*, users.name AS seller_name,
             users.phone AS seller_phone
      FROM used_listings
      JOIN users ON users.id = used_listings.seller_id
      WHERE used_listings.status = 'active'
        AND (
          ? = ''
          OR used_listings.name LIKE ? ESCAPE '\\'
          OR used_listings.description LIKE ? ESCAPE '\\'
          OR used_listings.category LIKE ? ESCAPE '\\'
          OR used_listings.condition LIKE ? ESCAPE '\\'
          OR used_listings.campus LIKE ? ESCAPE '\\'
          OR users.name LIKE ? ESCAPE '\\'
        )
      ORDER BY used_listings.updated_at DESC
      LIMIT 50
    `)
    .all(query, pattern, pattern, pattern, pattern, pattern, pattern)
    .map((row) => serializeUsedListing(row));

  res.json({ stores, products, services, usedListings });
});

storeRouter.post("/:slug/follow", requireAuth, (req, res) => {
  res.json({
    interaction: followStore(req.auth.user_id, req.params.slug),
  });
});

storeRouter.delete("/:slug/follow", requireAuth, (req, res) => {
  res.json({
    interaction: unfollowStore(req.auth.user_id, req.params.slug),
  });
});

storeRouter.get("/:slug", (req, res) => {
  const store = findStoreBySlug(req.params.slug);

  if (!store || store.status !== "active") {
    throw new HttpError(404, "Store was not found.");
  }

  const products = db
    .prepare(`
      SELECT * FROM products
      WHERE store_id = ? AND status IN ('active', 'out_of_stock')
      ORDER BY created_at DESC
    `)
    .all(store.id)
    .map((row) => ({
      ...serializeProduct(row),
      interaction: productInteraction(row.id, req.auth?.user_id),
    }));

  const services = db
    .prepare(`
      SELECT * FROM services
      WHERE store_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `)
    .all(store.id)
    .map(serializeService);

  const highlights = buildStoreHighlights(store.id, products, services);

  res.json({
    store: serializeStore(store),
    products,
    services,
    highlights,
    interaction: storeInteraction(store.id, req.auth?.user_id),
  });
});
