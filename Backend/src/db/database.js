import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

export const db = new Database(env.databasePath, {
  timeout: 5_000,
});

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
    campus TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
    ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx
    ON password_reset_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    campus TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    phone TEXT NOT NULL DEFAULT '',
    logo_url TEXT,
    cover_url TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'paused')),
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS stores_slug_idx ON stores(slug);

  CREATE TABLE IF NOT EXISTS store_highlights (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS store_highlights_store_id_idx
    ON store_highlights(store_id);

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_kobo INTEGER NOT NULL CHECK (price_kobo >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'active', 'out_of_stock')),
    image_urls TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    UNIQUE(store_id, slug)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS products_store_id_idx ON products(store_id);
  CREATE INDEX IF NOT EXISTS products_status_idx ON products(status);

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_kobo INTEGER NOT NULL CHECK (price_kobo >= 0),
    duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'active', 'paused')),
    image_urls TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    UNIQUE(store_id, slug)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS services_store_id_idx ON services(store_id);
  CREATE INDEX IF NOT EXISTS services_status_idx ON services(status);

  CREATE TABLE IF NOT EXISTS used_listings (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    condition TEXT NOT NULL
      CHECK (condition IN ('Like New', 'Very Good', 'Good', 'Fair', 'Needs Repair')),
    price_kobo INTEGER NOT NULL CHECK (price_kobo >= 0),
    campus TEXT NOT NULL DEFAULT '',
    pickup_location TEXT NOT NULL DEFAULT '',
    delivery_option TEXT NOT NULL DEFAULT 'Pickup'
      CHECK (delivery_option IN ('Pickup', 'Delivery', 'Pickup & Delivery')),
    serial_number TEXT NOT NULL DEFAULT '',
    image_urls TEXT NOT NULL DEFAULT '[]',
    ownership_proof_url TEXT,
    receipt_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'sold', 'rejected')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listings_seller_id_idx
    ON used_listings(seller_id);
  CREATE INDEX IF NOT EXISTS used_listings_status_idx
    ON used_listings(status);
  CREATE INDEX IF NOT EXISTS used_listings_category_idx
    ON used_listings(category);



  CREATE TABLE IF NOT EXISTS user_trust_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    campus TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',
    student_id TEXT NOT NULL DEFAULT '',
    identity_proof_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'verified', 'rejected')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS user_trust_profiles_user_id_idx
    ON user_trust_profiles(user_id);

  CREATE TABLE IF NOT EXISTS user_payout_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    bank_name TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    account_number_masked TEXT NOT NULL DEFAULT '',
    account_last4 TEXT NOT NULL DEFAULT '',
    payout_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS user_payout_accounts_user_id_idx
    ON user_payout_accounts(user_id);

  CREATE TABLE IF NOT EXISTS used_listing_reviews (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    reviewer_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listing_reviews_listing_id_idx
    ON used_listing_reviews(listing_id);

  CREATE TABLE IF NOT EXISTS used_listing_reports (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listing_reports_listing_id_idx
    ON used_listing_reports(listing_id);

  CREATE TABLE IF NOT EXISTS saved_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_type TEXT NOT NULL
      CHECK (item_type IN ('product', 'store', 'service', 'used_listing')),
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, item_type, item_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS saved_items_user_id_idx
    ON saved_items(user_id);

  CREATE TABLE IF NOT EXISTS store_follows (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    UNIQUE(user_id, store_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS store_follows_store_id_idx
    ON store_follows(store_id);

  CREATE TABLE IF NOT EXISTS product_likes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(user_id, product_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_likes_product_id_idx
    ON product_likes(product_id);

  CREATE TABLE IF NOT EXISTS product_comments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_comments_product_id_idx
    ON product_comments(product_id);

  CREATE TABLE IF NOT EXISTS product_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    anon_key TEXT NOT NULL DEFAULT '',
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_shares_product_id_idx
    ON product_shares(product_id);

  CREATE TABLE IF NOT EXISTS product_views (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    anon_key TEXT NOT NULL DEFAULT '',
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(product_id, user_id, anon_key)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_views_product_id_idx
    ON product_views(product_id);

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_code TEXT NOT NULL UNIQUE,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment'
      CHECK (status IN (
        'pending_payment',
        'paid',
        'seller_confirmed',
        'processing',
        'ready_for_delivery',
        'out_for_delivery',
        'delivered',
        'completed',
        'cancelled',
        'disputed'
      )),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
    subtotal_kobo INTEGER NOT NULL CHECK (subtotal_kobo >= 0),
    delivery_fee_kobo INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_kobo >= 0),
    total_kobo INTEGER NOT NULL CHECK (total_kobo >= 0),
    buyer_name TEXT NOT NULL DEFAULT '',
    buyer_phone TEXT NOT NULL DEFAULT '',
    campus TEXT NOT NULL DEFAULT '',
    delivery_option TEXT NOT NULL DEFAULT 'Pickup'
      CHECK (delivery_option IN ('Pickup', 'Delivery')),
    delivery_address TEXT NOT NULL DEFAULT '',
    pickup_location TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    verification_code TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS orders_buyer_id_idx ON orders(buyer_id);
  CREATE INDEX IF NOT EXISTS orders_seller_id_idx ON orders(seller_id);
  CREATE INDEX IF NOT EXISTS orders_store_id_idx ON orders(store_id);
  CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
  CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_image_url TEXT,
    unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_kobo INTEGER NOT NULL CHECK (total_kobo >= 0),
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items(product_id);

  CREATE TABLE IF NOT EXISTS order_events (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    label TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events(order_id);


  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    context_type TEXT NOT NULL CHECK (context_type IN ('used_listing', 'used_order', 'store', 'support')),
    context_id TEXT NOT NULL DEFAULT '',
    listing_id TEXT,
    order_id TEXT,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    last_message_body TEXT NOT NULL DEFAULT '',
    last_message_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS conversations_buyer_id_idx ON conversations(buyer_id);
  CREATE INDEX IF NOT EXISTS conversations_seller_id_idx ON conversations(seller_id);
  CREATE INDEX IF NOT EXISTS conversations_context_idx ON conversations(context_type, context_id);

  CREATE UNIQUE INDEX IF NOT EXISTS conversations_used_listing_unique_idx
    ON conversations(context_type, context_id, buyer_id, seller_id)
    WHERE context_type = 'used_listing';

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    attachment_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);

  CREATE TABLE IF NOT EXISTS used_market_orders (
    id TEXT PRIMARY KEY,
    order_code TEXT NOT NULL UNIQUE,
    listing_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    conversation_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending_payment'
      CHECK (status IN (
        'pending_payment',
        'paid',
        'seller_confirmed',
        'meetup_or_delivery',
        'delivered',
        'completed',
        'cancelled',
        'disputed'
      )),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
    item_price_kobo INTEGER NOT NULL CHECK (item_price_kobo >= 0),
    protection_fee_kobo INTEGER NOT NULL DEFAULT 0 CHECK (protection_fee_kobo >= 0),
    delivery_fee_kobo INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_kobo >= 0),
    total_kobo INTEGER NOT NULL CHECK (total_kobo >= 0),
    buyer_name TEXT NOT NULL DEFAULT '',
    buyer_phone TEXT NOT NULL DEFAULT '',
    campus TEXT NOT NULL DEFAULT '',
    delivery_option TEXT NOT NULL DEFAULT 'Pickup'
      CHECK (delivery_option IN ('Pickup', 'Delivery', 'Pickup & Delivery')),
    delivery_address TEXT NOT NULL DEFAULT '',
    pickup_location TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    verification_code TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_market_orders_listing_id_idx ON used_market_orders(listing_id);
  CREATE INDEX IF NOT EXISTS used_market_orders_buyer_id_idx ON used_market_orders(buyer_id);
  CREATE INDEX IF NOT EXISTS used_market_orders_seller_id_idx ON used_market_orders(seller_id);
  CREATE INDEX IF NOT EXISTS used_market_orders_status_idx ON used_market_orders(status);

  CREATE TABLE IF NOT EXISTS used_market_order_events (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    label TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES used_market_orders(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_market_order_events_order_id_idx
    ON used_market_order_events(order_id);

  CREATE TABLE IF NOT EXISTS used_market_delivery_proofs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    proof_image_url TEXT,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted'
      CHECK (status IN ('submitted', 'accepted', 'rejected')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES used_market_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_market_delivery_proofs_order_id_idx
    ON used_market_delivery_proofs(order_id);
`);



db.exec(`
  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx
    ON email_verification_tokens(user_id);
  CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_at_idx
    ON email_verification_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    success INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts(email);
  CREATE INDEX IF NOT EXISTS login_attempts_created_at_idx ON login_attempts(created_at);

  CREATE TABLE IF NOT EXISTS user_security_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS user_security_events_user_id_idx
    ON user_security_events(user_id);

  CREATE TABLE IF NOT EXISTS seller_verification_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    store_id TEXT,
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    campus TEXT NOT NULL DEFAULT '',
    student_id TEXT NOT NULL DEFAULT '',
    identity_proof_url TEXT,
    business_description TEXT NOT NULL DEFAULT '',
    agreement_accepted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'pending_verification', 'verified', 'rejected', 'suspended')),
    note TEXT NOT NULL DEFAULT '',
    submitted_at TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS seller_verification_profiles_user_id_idx
    ON seller_verification_profiles(user_id);

  CREATE TABLE IF NOT EXISTS seller_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    store_id TEXT,
    plan_name TEXT NOT NULL DEFAULT 'Campus Seller Monthly',
    amount_kobo INTEGER NOT NULL DEFAULT 300000 CHECK (amount_kobo >= 0),
    status TEXT NOT NULL DEFAULT 'inactive'
      CHECK (status IN ('inactive', 'active', 'expired', 'past_due', 'cancelled')),
    starts_at TEXT,
    current_period_start TEXT,
    current_period_end TEXT,
    next_renewal_at TEXT,
    last_payment_reference TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS seller_subscriptions_user_id_idx
    ON seller_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS seller_subscriptions_status_idx
    ON seller_subscriptions(status);

  CREATE TABLE IF NOT EXISTS seller_subscription_events (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (subscription_id) REFERENCES seller_subscriptions(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS seller_subscription_events_subscription_id_idx
    ON seller_subscription_events(subscription_id);

  CREATE TABLE IF NOT EXISTS platform_fee_rules (
    id TEXT PRIMARY KEY,
    rule_key TEXT NOT NULL UNIQUE,
    percentage INTEGER NOT NULL DEFAULT 5 CHECK (percentage >= 0 AND percentage <= 100),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("products", "is_featured", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "is_featured", "INTEGER NOT NULL DEFAULT 0");

ensureColumn("used_listings", "reason_for_selling", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "defects_disclosed", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "confirmation_text", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "review_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "trust_profile_id", "TEXT");
ensureColumn("used_listings", "payout_account_id", "TEXT");


ensureColumn("users", "email_verified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "email_verified_at", "TEXT");
ensureColumn("users", "phone_verified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "phone_verified_at", "TEXT");
ensureColumn("users", "failed_login_count", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "locked_until", "TEXT");
ensureColumn("users", "last_login_at", "TEXT");
ensureColumn("users", "last_password_change_at", "TEXT");

ensureColumn("sessions", "user_agent", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sessions", "ip_address", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sessions", "last_used_at", "TEXT");
ensureColumn("sessions", "revoked_at", "TEXT");

ensureColumn("stores", "verification_status", "TEXT NOT NULL DEFAULT 'draft'");
ensureColumn("stores", "verification_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "verified_at", "TEXT");

ensureColumn("products", "seller_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "platform_fee_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "buyer_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "seller_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "platform_fee_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "buyer_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "seller_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "platform_fee_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "buyer_price_kobo", "INTEGER NOT NULL DEFAULT 0");




const nowForFeeRule = new Date().toISOString();
db.prepare(`
  INSERT INTO platform_fee_rules (id, rule_key, percentage, is_active, created_at, updated_at)
  VALUES ('fee_default', 'default_platform_fee', 5, 1, ?, ?)
  ON CONFLICT(rule_key) DO NOTHING
`).run(nowForFeeRule, nowForFeeRule);

for (const table of ["products", "services", "used_listings"]) {
  db.prepare(`
    UPDATE ${table}
    SET seller_price_kobo = CASE WHEN seller_price_kobo <= 0 THEN price_kobo ELSE seller_price_kobo END,
        buyer_price_kobo = CASE WHEN buyer_price_kobo <= 0 THEN price_kobo ELSE buyer_price_kobo END
    WHERE price_kobo > 0
  `).run();
}

export function transaction(callback) {
  db.exec("BEGIN IMMEDIATE");

  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cleanExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").run(
    new Date().toISOString(),
  );
  db.prepare(`
    DELETE FROM password_reset_tokens
    WHERE expires_at <= ? OR used_at IS NOT NULL
  `).run(new Date().toISOString());
  db.prepare(`
    DELETE FROM email_verification_tokens
    WHERE expires_at <= ? OR used_at IS NOT NULL
  `).run(new Date().toISOString());
}
