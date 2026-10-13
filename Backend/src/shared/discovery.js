import { z } from "zod";
import { db } from "../db/database.js";
import { id, now, page, parse, assertUnblocked } from "./core.js";
import { productRow, publicProduct } from "./catalogue.js";
import { person } from "./social.js";
export function search(viewerId, query) {
  const p = page(query),
    term = z.string().trim().min(1).max(100).parse(query.q),
    pattern = "%" + term + "%";
  const products = db
    .prepare(
      "SELECT p.id FROM products p JOIN stores s ON s.id=p.store_id LEFT JOIN shared_products x ON x.product_id=p.id WHERE p.status IN ('active','out_of_stock') AND s.status='active' AND (x.state IS NULL OR x.state='published') AND (p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?) ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
    )
    .all(pattern, pattern, pattern, p.limit, p.offset)
    .map((r) => {
      try {
        return publicProduct(productRow(r.id, viewerId));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const people = db
    .prepare(
      "SELECT u.id FROM users u LEFT JOIN account_profiles a ON a.user_id=u.id WHERE u.is_active=1 AND u.role IN ('buyer','seller') AND (u.name LIKE ? OR a.username LIKE ?) LIMIT ? OFFSET ?",
    )
    .all(pattern, pattern, p.limit, p.offset)
    .map((r) => {
      try {
        if (viewerId) assertUnblocked(viewerId, r.id);
        return person(r.id);
      } catch {
        return null;
      }
    });
  return { products, people };
}
export function categories() {
  return db
    .prepare(
      "SELECT DISTINCT category FROM products WHERE status IN ('active','out_of_stock') ORDER BY category",
    )
    .all()
    .map((r) => r.category);
}
export function saved(userId, query = {}) {
  const p = page(query);
  return db
    .prepare(
      "SELECT product_id FROM shared_saved WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(userId, p.limit, p.offset)
    .map((r) => {
      try {
        return publicProduct(productRow(r.product_id, userId));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
export function saveItem(userId, productId, active) {
  productRow(productId, userId);
  if (active)
    db.prepare(
      "INSERT INTO shared_saved(user_id,product_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO NOTHING",
    ).run(userId, productId, now());
  else
    db.prepare("DELETE FROM shared_saved WHERE user_id=? AND product_id=?").run(
      userId,
      productId,
    );
  return { saved: active };
}
export function syncLegacyPosts() {
  // Add feed entries without migrating historic order/earning terms or exposing drafts.
  db.prepare(
    `INSERT INTO shared_posts(id,product_id,author_id,caption,active,created_at) SELECT 'legacy-product:' || p.id,p.id,s.owner_id,p.description,1,p.created_at FROM products p JOIN stores s ON s.id=p.store_id WHERE p.status IN ('active','out_of_stock') AND s.status='active' AND NOT EXISTS(SELECT 1 FROM shared_posts x WHERE x.product_id=p.id AND x.original_id IS NULL) ON CONFLICT(id) DO NOTHING`,
  ).run();
  db.prepare(
    `INSERT INTO shared_posts(id,product_id,author_id,caption,active,created_at) SELECT 'legacy-video:' || s.id,s.product_id,s.user_id,s.caption,1,s.created_at FROM social_posts s WHERE s.product_id IS NOT NULL AND s.status='active' ON CONFLICT(id) DO NOTHING`,
  ).run();
}
