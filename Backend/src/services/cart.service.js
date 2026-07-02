import { db, transaction } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";

function parseImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function serializeCartItem(row) {
  const images = parseImages(row.image_urls);
  const priceKobo = row.buyer_price_kobo > 0 ? row.buyer_price_kobo : row.price_kobo;

  return {
    id: row.product_id,
    productId: row.product_id,
    name: row.name,
    category: row.category || "Product",
    price: new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(priceKobo / 100),
    numericPrice: priceKobo / 100,
    image: images[0] || "",
    sellerName: row.store_name,
    sellerId: row.store_slug,
    campus: row.store_campus || "",
    quantity: row.quantity,
    stock: row.stock,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function activeProduct(productId) {
  const product = db
    .prepare(`
      SELECT products.*
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = ?
        AND products.status = 'active'
        AND products.stock > 0
        AND stores.status = 'active'
    `)
    .get(productId);

  if (!product) {
    throw new HttpError(404, "This product is no longer available for cart.");
  }

  return product;
}

export function listCart(userId) {
  return db
    .prepare(`
      SELECT cart_items.*, cart_items.product_id,
             products.name, products.price_kobo, products.buyer_price_kobo,
             products.category, products.image_urls, products.stock, products.status,
             stores.name AS store_name, stores.slug AS store_slug,
             stores.campus AS store_campus
      FROM cart_items
      JOIN products ON products.id = cart_items.product_id
      JOIN stores ON stores.id = products.store_id
      WHERE cart_items.user_id = ?
        AND products.status = 'active'
        AND stores.status = 'active'
      ORDER BY cart_items.updated_at DESC
    `)
    .all(userId)
    .map(serializeCartItem);
}

export function addCartItem(userId, input) {
  const productId = String(input?.productId || input?.id || "").trim();
  const quantity = Math.max(1, Math.min(99, Number(input?.quantity || 1)));

  if (!productId || !Number.isFinite(quantity)) {
    throw new HttpError(422, "A valid product and quantity are required.");
  }

  const product = activeProduct(productId);
  const safeQuantity = Math.min(quantity, product.stock);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO cart_items (id, user_id, product_id, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET
      quantity = MIN(cart_items.quantity + excluded.quantity, ?),
      updated_at = excluded.updated_at
  `).run(
    createId("crt"),
    userId,
    productId,
    safeQuantity,
    now,
    now,
    product.stock,
  );

  return listCart(userId);
}

export function setCartItemQuantity(userId, productId, quantity) {
  const product = activeProduct(productId);
  const nextQuantity = Math.max(1, Math.min(product.stock, Math.min(99, Number(quantity || 1))));

  db.prepare(`
    UPDATE cart_items
    SET quantity = ?, updated_at = ?
    WHERE user_id = ? AND product_id = ?
  `).run(nextQuantity, new Date().toISOString(), userId, productId);

  return listCart(userId);
}

export function removeCartItem(userId, productId) {
  db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(userId, productId);
  return listCart(userId);
}

export function clearCart(userId) {
  db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(userId);
  return [];
}

export function replaceCart(userId, items = []) {
  return transaction(() => {
    clearCart(userId);
    for (const item of Array.isArray(items) ? items : []) {
      addCartItem(userId, item);
    }
    return listCart(userId);
  });
}

export function mergeCart(userId, items = []) {
  return transaction(() => {
    for (const item of Array.isArray(items) ? items : []) {
      addCartItem(userId, item);
    }
    return listCart(userId);
  });
}
