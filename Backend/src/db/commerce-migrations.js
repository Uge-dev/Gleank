import { db } from "./database.js";
// Additive migration: historical rider/market/order records are deliberately retained.
export function runCommerceMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS earning_offers (
      product_id TEXT PRIMARY KEY REFERENCES products(id), dropship_margin_kobo INTEGER NOT NULL DEFAULT 0,
      commission_bps INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS earning_links (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL REFERENCES products(id),
      mode TEXT NOT NULL, offer_version INTEGER NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(user_id,product_id,mode,offer_version)
    );
    CREATE TABLE IF NOT EXISTS earning_payouts (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), seller_id TEXT NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES products(id), link_id TEXT NOT NULL REFERENCES earning_links(id),
      mode TEXT NOT NULL, seller_amount_kobo INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'on_hold',
      hold_reason TEXT NOT NULL DEFAULT '', released_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(order_id,product_id,link_id)
    );
    CREATE TABLE IF NOT EXISTS earning_transfers (
      payout_id TEXT PRIMARY KEY REFERENCES earning_payouts(id), reference TEXT NOT NULL UNIQUE,
      recipient_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      provider_transfer_code TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      caption TEXT NOT NULL, video_url TEXT NOT NULL,
      product_id TEXT REFERENCES products(id), status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS social_posts_feed_idx ON social_posts(status,created_at,id);
    CREATE TABLE IF NOT EXISTS order_financial_terms (
      order_id TEXT PRIMARY KEY REFERENCES orders(id), platform_fee_kobo INTEGER NOT NULL,
      seller_amount_kobo INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id), username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
      interests TEXT NOT NULL DEFAULT '[]', activities TEXT NOT NULL DEFAULT '[]',
      completed_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seller_fulfillment_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id), coverage TEXT NOT NULL,
      delivery_fee_kobo INTEGER NOT NULL DEFAULT 0, delivery_days INTEGER NOT NULL,
      dispatch_address TEXT NOT NULL, phone TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_packages (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id),
      code_hash TEXT NOT NULL, code_cipher TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'prepared', method TEXT NOT NULL DEFAULT 'personal',
      transport_name TEXT NOT NULL DEFAULT '', tracking_reference TEXT NOT NULL DEFAULT '',
      receipt_path TEXT NOT NULL DEFAULT '', expected_arrival TEXT NOT NULL DEFAULT '',
      dispatched_at TEXT, confirmed_at TEXT, confirmed_by TEXT REFERENCES users(id),
      failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT, last_reminded_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS packages_order_idx ON order_packages(order_id);
    CREATE TABLE IF NOT EXISTS delivery_audit (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), package_id TEXT,
      actor_id TEXT NOT NULL REFERENCES users(id), event TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settlement_transfers (
      payout_id TEXT PRIMARY KEY REFERENCES payouts(id), reference TEXT NOT NULL UNIQUE,
      recipient_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      provider_transfer_code TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commerce_payout_recipients (
      user_id TEXT PRIMARY KEY REFERENCES users(id), recipient_code TEXT NOT NULL,
      account_name TEXT NOT NULL, bank_code TEXT NOT NULL, account_last4 TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
