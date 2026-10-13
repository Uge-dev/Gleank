import { db } from '../db/database.js';
import { HttpError } from '../lib/http-error.js';

// Call within the same transaction as the legacy mutation. Keep configured
// product metadata authoritative and protect shared purchase references.
export function assertLegacyProductMutation(productId, { deleting = false } = {}) {
  db.prepare('UPDATE products SET updated_at=updated_at WHERE id=?').run(productId);
  if (db.prepare('SELECT product_id FROM shared_products WHERE product_id=?').get(productId)) {
    throw new HttpError(409, 'Manage this configured product through /api/v2/products; archive it rather than deleting purchase history.');
  }
  if (db.prepare('SELECT checkout_id FROM shared_reservations WHERE product_id=? LIMIT 1').get(productId)) {
    throw new HttpError(409, 'Finish or cancel reserved checkouts before changing this product.');
  }
  if (deleting && (
    db.prepare('SELECT id FROM shared_posts WHERE product_id=? LIMIT 1').get(productId) ||
    db.prepare('SELECT id FROM shared_cart WHERE product_id=? LIMIT 1').get(productId) ||
    db.prepare('SELECT id FROM shared_offers WHERE product_id=? LIMIT 1').get(productId)
  )) throw new HttpError(409, 'Archive this product through /api/v2/products instead of deleting shared references.');
  const purchase = db.prepare(deleting
    ? 'SELECT id FROM shared_order_lines WHERE product_id=? LIMIT 1'
    : "SELECT id FROM shared_order_lines l WHERE product_id=? AND refund_state<>'refunded' AND NOT EXISTS(SELECT 1 FROM shared_ledger x WHERE x.event_key='release:' || l.id) LIMIT 1").get(productId);
  if (purchase) throw new HttpError(409, deleting
    ? 'Keep this product to preserve purchase history; hide it instead.'
    : 'Fulfil outstanding shared orders before changing this product.');
}
