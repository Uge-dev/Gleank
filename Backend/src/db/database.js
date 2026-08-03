import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { PostgresSyncDatabase } from "./postgres-sync-adapter.js";

const usePostgres = env.databaseProvider === "postgres";

if (!usePostgres) {
  fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
}

export const db = usePostgres
  ? new PostgresSyncDatabase()
  : new Database(env.databasePath, {
      timeout: 5_000,
    });

if (!usePostgres) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'admin', 'rider')),
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

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL
      CHECK (type IN ('order', 'message', 'seller', 'product', 'like', 'admin', 'used_market')),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    action_label TEXT NOT NULL DEFAULT 'Open',
    action_path TEXT NOT NULL DEFAULT '/',
    image_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS notifications_user_id_idx
    ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS notifications_unread_idx
    ON notifications(user_id, is_read, created_at);

  CREATE TABLE IF NOT EXISTS payment_protection_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    target_user_id TEXT,
    context_type TEXT NOT NULL DEFAULT '',
    context_id TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT 'logged',
    severity INTEGER NOT NULL DEFAULT 0,
    reasons TEXT NOT NULL DEFAULT '[]',
    original_preview TEXT NOT NULL DEFAULT '',
    sanitized_preview TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS payment_protection_events_actor_idx
    ON payment_protection_events(actor_id, created_at);
  CREATE INDEX IF NOT EXISTS payment_protection_events_context_idx
    ON payment_protection_events(context_type, context_id, created_at);

  CREATE TABLE IF NOT EXISTS buyer_pay_at_delivery_scores (
    user_id TEXT PRIMARY KEY,
    score INTEGER NOT NULL DEFAULT 100,
    failure_count INTEGER NOT NULL DEFAULT 0,
    disabled_until TEXT,
    last_failure_reason TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE IF NOT EXISTS pay_at_delivery_failures (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    order_id TEXT,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS pay_at_delivery_failures_user_idx
    ON pay_at_delivery_failures(user_id, created_at);

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
    available_sizes TEXT NOT NULL DEFAULT '[]',
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
    service_type TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price_kobo INTEGER NOT NULL CHECK (price_kobo >= 0),
    min_price_kobo INTEGER NOT NULL DEFAULT 0,
    max_price_kobo INTEGER NOT NULL DEFAULT 0,
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
    return_days INTEGER NOT NULL DEFAULT 0,
    available_sizes TEXT NOT NULL DEFAULT '[]',
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
    parent_comment_id TEXT,
    body TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES product_comments(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_comments_product_id_idx
    ON product_comments(product_id);

  CREATE TABLE IF NOT EXISTS product_comment_likes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES product_comments(id) ON DELETE CASCADE,
    UNIQUE(user_id, comment_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_comment_likes_comment_id_idx
    ON product_comment_likes(comment_id);

  CREATE TABLE IF NOT EXISTS used_listing_likes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE CASCADE,
    UNIQUE(user_id, listing_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listing_likes_listing_id_idx
    ON used_listing_likes(listing_id);

  CREATE TABLE IF NOT EXISTS used_listing_comments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    parent_comment_id TEXT,
    body TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES used_listing_comments(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listing_comments_listing_id_idx
    ON used_listing_comments(listing_id);

  CREATE TABLE IF NOT EXISTS used_listing_comment_likes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES used_listing_comments(id) ON DELETE CASCADE,
    UNIQUE(user_id, comment_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listing_comment_likes_comment_id_idx
    ON used_listing_comment_likes(comment_id);

  CREATE TABLE IF NOT EXISTS used_listing_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listing_shares_listing_id_idx
    ON used_listing_shares(listing_id);

  CREATE TABLE IF NOT EXISTS used_listing_views (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES used_listings(id) ON DELETE CASCADE,
    UNIQUE(user_id, listing_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS used_listing_views_listing_id_idx
    ON used_listing_views(listing_id);

  CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    selected_size TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(user_id, product_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS cart_items_user_id_idx ON cart_items(user_id);

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
    pickup_point_id TEXT NOT NULL DEFAULT '',
    pickup_point_address TEXT NOT NULL DEFAULT '',
    pickup_point_area TEXT NOT NULL DEFAULT '',
    pickup_point_lat REAL,
    pickup_point_lng REAL,
    note TEXT NOT NULL DEFAULT '',
    verification_code TEXT NOT NULL DEFAULT '',
    package_tag_code TEXT NOT NULL DEFAULT '',
    stock_reserved INTEGER NOT NULL DEFAULT 0,
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
    selected_size TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS store_reviews (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    order_id TEXT NOT NULL UNIQUE,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS store_reviews_store_id_idx ON store_reviews(store_id, rating);


  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    conversation_key TEXT NOT NULL DEFAULT '',
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
    context_type TEXT NOT NULL DEFAULT '',
    context_id TEXT NOT NULL DEFAULT '',
    context_snapshot TEXT NOT NULL DEFAULT '{}',
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
    package_tag_code TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    return_days INTEGER NOT NULL DEFAULT 0,
    reservation_expires_at TEXT,
    fulfillment_method TEXT NOT NULL DEFAULT 'undecided',
    seller_delivery_confirmed_at TEXT,
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
  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    landmark TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    radius_km REAL NOT NULL DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'disabled')),
    allowed_categories TEXT NOT NULL DEFAULT '[]',
    cover_url TEXT,
    icon_url TEXT,
    delivery_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS markets_slug_idx ON markets(slug);
  CREATE INDEX IF NOT EXISTS markets_status_idx ON markets(status);
  CREATE INDEX IF NOT EXISTS markets_location_idx ON markets(state, city, area);

  CREATE TABLE IF NOT EXISTS market_categories (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    category_key TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE(market_id, category_key)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS market_categories_market_id_idx
    ON market_categories(market_id);

  CREATE TABLE IF NOT EXISTS seller_market_profiles (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    store_id TEXT NOT NULL UNIQUE,
    stall_number TEXT NOT NULL DEFAULT '',
    address_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'needs_more_info')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS seller_market_profiles_market_id_idx
    ON seller_market_profiles(market_id);
  CREATE INDEX IF NOT EXISTS seller_market_profiles_status_idx
    ON seller_market_profiles(status);

  CREATE TABLE IF NOT EXISTS market_requests (
    id TEXT PRIMARY KEY,
    seller_id TEXT,
    store_id TEXT,
    market_id TEXT,
    market_name TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    landmark TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    seller_note TEXT NOT NULL DEFAULT '',
    what_sells TEXT NOT NULL DEFAULT '',
    shop_details TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    photo_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected', 'merged', 'needs_more_info')),
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS market_requests_seller_id_idx
    ON market_requests(seller_id);
  CREATE INDEX IF NOT EXISTS market_requests_status_idx
    ON market_requests(status);

  CREATE TABLE IF NOT EXISTS seller_category_approvals (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    market_id TEXT,
    category_key TEXT NOT NULL,
    category_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'needs_more_info')),
    approved_by TEXT,
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(store_id, market_id, category_key)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS seller_category_approvals_seller_id_idx
    ON seller_category_approvals(seller_id);
  CREATE INDEX IF NOT EXISTS seller_category_approvals_store_id_idx
    ON seller_category_approvals(store_id);
  CREATE INDEX IF NOT EXISTS seller_category_approvals_status_idx
    ON seller_category_approvals(status);
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
    plan_name TEXT NOT NULL DEFAULT 'Seller Monthly',
    amount_kobo INTEGER NOT NULL DEFAULT 199900 CHECK (amount_kobo >= 0),
    status TEXT NOT NULL DEFAULT 'inactive'
      CHECK (status IN ('inactive', 'active', 'expired', 'past_due', 'cancelled')),
    starts_at TEXT,
    current_period_start TEXT,
    current_period_end TEXT,
    next_renewal_at TEXT,
    grace_period_ends_at TEXT,
    last_payment_at TEXT,
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

  CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'local',
    purpose TEXT NOT NULL
      CHECK (purpose IN ('store_order', 'used_order', 'seller_subscription')),
    order_id TEXT,
    used_order_id TEXT,
    subscription_id TEXT,
    user_id TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL CHECK (amount_kobo >= 0),
    currency TEXT NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'initialized'
      CHECK (status IN ('initialized', 'paid', 'failed', 'cancelled')),
    authorization_url TEXT NOT NULL DEFAULT '',
    provider_reference TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (used_order_id) REFERENCES used_market_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES seller_subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS payment_transactions_user_id_idx
    ON payment_transactions(user_id);
  CREATE INDEX IF NOT EXISTS payment_transactions_reference_idx
    ON payment_transactions(reference);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("products", "is_featured", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "available_sizes", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("cart_items", "selected_size", "TEXT NOT NULL DEFAULT ''");
ensureColumn("order_items", "selected_size", "TEXT NOT NULL DEFAULT ''");
ensureColumn("services", "is_featured", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "service_type", "TEXT NOT NULL DEFAULT ''");
ensureColumn("services", "location", "TEXT NOT NULL DEFAULT ''");
ensureColumn("services", "min_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "max_price_kobo", "INTEGER NOT NULL DEFAULT 0");

ensureColumn("conversations", "conversation_key", "TEXT NOT NULL DEFAULT ''");
ensureColumn("messages", "context_type", "TEXT NOT NULL DEFAULT ''");
ensureColumn("messages", "context_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("messages", "context_snapshot", "TEXT NOT NULL DEFAULT '{}'");

ensureColumn("used_listings", "reason_for_selling", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "defects_disclosed", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "confirmation_text", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "review_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "trust_profile_id", "TEXT");
ensureColumn("used_listings", "payout_account_id", "TEXT");
ensureColumn("used_listings", "area_location", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_listings", "category_metadata", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("used_listings", "risk_level", "TEXT NOT NULL DEFAULT 'standard'");
ensureColumn("used_listings", "review_required", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "seller_verification_level", "INTEGER NOT NULL DEFAULT 1");


ensureColumn("users", "email_verified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "email_verified_at", "TEXT");
ensureColumn("users", "phone_verified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "phone_verified_at", "TEXT");
ensureColumn("users", "failed_login_count", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "locked_until", "TEXT");
ensureColumn("users", "last_login_at", "TEXT");
ensureColumn("users", "last_password_change_at", "TEXT");
ensureColumn("password_reset_tokens", "attempt_count", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("password_reset_tokens", "last_attempt_at", "TEXT");

ensureColumn("seller_subscriptions", "grace_period_ends_at", "TEXT");
ensureColumn("seller_subscriptions", "last_payment_at", "TEXT");

ensureColumn("sessions", "user_agent", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sessions", "ip_address", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sessions", "last_used_at", "TEXT");
ensureColumn("sessions", "revoked_at", "TEXT");

ensureColumn("stores", "verification_status", "TEXT NOT NULL DEFAULT 'draft'");
ensureColumn("stores", "verification_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "verified_at", "TEXT");
ensureColumn("stores", "seller_type", "TEXT NOT NULL DEFAULT 'campus'");
ensureColumn("stores", "operating_hours", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "whatsapp_phone", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "allow_rider_whatsapp_contact", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("stores", "location_area", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "pickup_location", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "nearest_landmark", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "market_id", "TEXT");
ensureColumn("stores", "shop_stall_number", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "shop_section", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stores", "pickup_lat", "REAL");
ensureColumn("stores", "pickup_lng", "REAL");

ensureColumn("seller_market_profiles", "shop_section", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_market_profiles", "market_landmark", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_market_profiles", "pickup_point", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_market_profiles", "shop_photo_url", "TEXT");
ensureColumn("seller_market_profiles", "pickup_lat", "REAL");
ensureColumn("seller_market_profiles", "pickup_lng", "REAL");
ensureColumn("seller_market_profiles", "risk_level", "TEXT NOT NULL DEFAULT 'standard'");
ensureColumn("seller_market_profiles", "admin_note", "TEXT NOT NULL DEFAULT ''");

ensureColumn("market_requests", "area", "TEXT NOT NULL DEFAULT ''");
ensureColumn("market_requests", "market_id", "TEXT");
ensureColumn("market_requests", "photo_url", "TEXT");

ensureColumn("seller_category_approvals", "approved_by", "TEXT");
ensureColumn("seller_category_approvals", "admin_note", "TEXT NOT NULL DEFAULT ''");

function ensureSellerMarketProfileStatusValues() {
  if (usePostgres) {
    db.exec(`
      ALTER TABLE seller_market_profiles
        DROP CONSTRAINT IF EXISTS seller_market_profiles_status_check;
      ALTER TABLE seller_market_profiles
        ADD CONSTRAINT seller_market_profiles_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'needs_more_info'));
    `);
    return;
  }

  const table = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("seller_market_profiles");

  if (!table?.sql || table.sql.includes("needs_more_info")) return;

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN IMMEDIATE;");

  try {
    db.exec(`
      CREATE TABLE seller_market_profiles_stage3 (
        id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL,
        store_id TEXT NOT NULL UNIQUE,
        stall_number TEXT NOT NULL DEFAULT '',
        address_note TEXT NOT NULL DEFAULT '',
        shop_section TEXT NOT NULL DEFAULT '',
        market_landmark TEXT NOT NULL DEFAULT '',
        pickup_point TEXT NOT NULL DEFAULT '',
        shop_photo_url TEXT,
        pickup_lat REAL,
        pickup_lng REAL,
        risk_level TEXT NOT NULL DEFAULT 'standard',
        admin_note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'needs_more_info')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      ) STRICT;

      INSERT INTO seller_market_profiles_stage3 (
        id, market_id, store_id, stall_number, address_note, shop_section,
        market_landmark, pickup_point, shop_photo_url, pickup_lat, pickup_lng,
        risk_level, admin_note, status, created_at, updated_at
      )
      SELECT
        id, market_id, store_id, stall_number, address_note,
        COALESCE(shop_section, ''),
        COALESCE(market_landmark, ''),
        COALESCE(pickup_point, ''),
        shop_photo_url,
        pickup_lat,
        pickup_lng,
        COALESCE(risk_level, 'standard'),
        COALESCE(admin_note, ''),
        status,
        created_at,
        updated_at
      FROM seller_market_profiles;

      DROP TABLE seller_market_profiles;
      ALTER TABLE seller_market_profiles_stage3 RENAME TO seller_market_profiles;

      CREATE INDEX IF NOT EXISTS seller_market_profiles_market_id_idx
        ON seller_market_profiles(market_id);
      CREATE INDEX IF NOT EXISTS seller_market_profiles_status_idx
        ON seller_market_profiles(status);
    `);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

ensureSellerMarketProfileStatusValues();

ensureColumn("seller_verification_profiles", "seller_type", "TEXT NOT NULL DEFAULT 'campus'");
ensureColumn("seller_verification_profiles", "location_area", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "pickup_location", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "nearest_landmark", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "market_id", "TEXT");
ensureColumn("seller_verification_profiles", "market_request_json", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("seller_verification_profiles", "shop_stall_number", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "shop_section", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "whatsapp_phone", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "allow_rider_whatsapp_contact", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("seller_verification_profiles", "operating_hours", "TEXT NOT NULL DEFAULT ''");

ensureColumn("user_trust_profiles", "area_location", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_trust_profiles", "pickup_preference", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_trust_profiles", "seller_type", "TEXT NOT NULL DEFAULT 'used_market'");
ensureColumn("user_trust_profiles", "verification_level", "INTEGER NOT NULL DEFAULT 1");

ensureColumn("products", "seller_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "platform_fee_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "buyer_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "moderation_status", "TEXT NOT NULL DEFAULT 'draft'");
ensureColumn("products", "moderation_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "moderation_reasons", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("products", "risk_score", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "risk_level", "TEXT NOT NULL DEFAULT 'low'");
ensureColumn("products", "availability_status", "TEXT NOT NULL DEFAULT 'available_now'");
ensureColumn("products", "seller_confirmation_required", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "return_policy", "TEXT NOT NULL DEFAULT 'standard'");
ensureColumn("products", "reviewed_at", "TEXT");
ensureColumn("products", "reviewed_by", "TEXT");
ensureColumn("services", "seller_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "platform_fee_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "buyer_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "moderation_status", "TEXT NOT NULL DEFAULT 'draft'");
ensureColumn("services", "moderation_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("services", "moderation_reasons", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("services", "risk_score", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "risk_level", "TEXT NOT NULL DEFAULT 'low'");
ensureColumn("services", "availability_status", "TEXT NOT NULL DEFAULT 'available_now'");
ensureColumn("services", "seller_confirmation_required", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("services", "return_policy", "TEXT NOT NULL DEFAULT 'standard'");
ensureColumn("services", "reviewed_at", "TEXT");
ensureColumn("services", "reviewed_by", "TEXT");
ensureColumn("used_listings", "seller_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "platform_fee_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "buyer_price_kobo", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "quantity", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("used_listings", "reserved_quantity", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "return_days", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_listings", "available_sizes", "TEXT NOT NULL DEFAULT '[]'");

ensureColumn("orders", "payment_method", "TEXT NOT NULL DEFAULT 'pay_now'");
ensureColumn("orders", "stage4_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "stage4_payment_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "fulfillment_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "seller_confirmation_required", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("orders", "seller_confirmed_at", "TEXT");
ensureColumn("orders", "seller_rejected_at", "TEXT");
ensureColumn("orders", "seller_rejection_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "delivery_details", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "delivery_landmark", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "delivery_bus_stop", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "pickup_point_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "pickup_point_address", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "pickup_point_area", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "pickup_point_lat", "REAL");
ensureColumn("orders", "pickup_point_lng", "REAL");
ensureColumn("orders", "return_window_ends_at", "TEXT");
ensureColumn("orders", "buyer_confirmed_at", "TEXT");
ensureColumn("orders", "payout_status", "TEXT NOT NULL DEFAULT 'pending_payment'");
ensureColumn("orders", "stock_reserved", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("orders", "assigned_rider_id", "TEXT");
ensureColumn("orders", "rider_assignment_id", "TEXT");

ensureColumn("used_market_orders", "payment_method", "TEXT NOT NULL DEFAULT 'pay_now'");
ensureColumn("used_market_orders", "stage4_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_market_orders", "stage4_payment_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_market_orders", "fulfillment_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_market_orders", "seller_confirmation_required", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_market_orders", "seller_confirmed_at", "TEXT");
ensureColumn("used_market_orders", "seller_rejected_at", "TEXT");
ensureColumn("used_market_orders", "seller_rejection_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("used_market_orders", "return_window_ends_at", "TEXT");
ensureColumn("used_market_orders", "buyer_confirmed_at", "TEXT");
ensureColumn("used_market_orders", "payout_status", "TEXT NOT NULL DEFAULT 'pending_payment'");
ensureColumn("used_market_orders", "quantity", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("used_market_orders", "return_days", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("used_market_orders", "reservation_expires_at", "TEXT");
ensureColumn("used_market_orders", "fulfillment_method", "TEXT NOT NULL DEFAULT 'undecided'");
ensureColumn("used_market_orders", "seller_delivery_confirmed_at", "TEXT");

ensureColumn("seller_verification_profiles", "face_verified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("seller_verification_profiles", "face_provider", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "face_reference", "TEXT NOT NULL DEFAULT ''");
ensureColumn("seller_verification_profiles", "face_verified_at", "TEXT");
ensureColumn("user_trust_profiles", "face_verified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("user_trust_profiles", "face_provider", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_trust_profiles", "face_reference", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_trust_profiles", "face_verified_at", "TEXT");

ensureColumn("product_comments", "parent_comment_id", "TEXT");
ensureColumn("product_comments", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS product_moderation (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'product'
      CHECK (item_type IN ('product', 'service')),
    status TEXT NOT NULL DEFAULT 'pending_review'
      CHECK (status IN ('draft', 'auto_approved', 'approved', 'pending_review', 'flagged', 'rejected', 'hidden')),
    risk_score INTEGER NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL DEFAULT 'low',
    reasons TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE UNIQUE INDEX IF NOT EXISTS product_moderation_product_idx
    ON product_moderation(product_id, item_type);
  CREATE INDEX IF NOT EXISTS product_moderation_status_idx
    ON product_moderation(status, created_at);

  CREATE TABLE IF NOT EXISTS product_category_rules (
    id TEXT PRIMARY KEY,
    seller_type TEXT NOT NULL DEFAULT 'all',
    category_key TEXT NOT NULL,
    category_name TEXT NOT NULL DEFAULT '',
    rule_action TEXT NOT NULL DEFAULT 'review'
      CHECK (rule_action IN ('allow', 'review', 'reject')),
    reason TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(seller_type, category_key)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_category_rules_active_idx
    ON product_category_rules(is_active, seller_type, category_key);

  CREATE TABLE IF NOT EXISTS restricted_keywords (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL UNIQUE,
    action TEXT NOT NULL DEFAULT 'review'
      CHECK (action IN ('review', 'reject')),
    reason TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS product_risk_scores (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'product'
      CHECK (item_type IN ('product', 'service')),
    signal TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_risk_scores_product_idx
    ON product_risk_scores(product_id, item_type);

  CREATE TABLE IF NOT EXISTS payment_events (
    id TEXT PRIMARY KEY,
    payment_id TEXT,
    reference TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'paystack',
    provider_status TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payment_transactions(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS payment_events_reference_idx
    ON payment_events(reference, created_at);

  CREATE TABLE IF NOT EXISTS processed_webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    payload_hash TEXT NOT NULL DEFAULT '',
    processed_at TEXT NOT NULL,
    UNIQUE(provider, event_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS processed_webhook_events_reference_idx
    ON processed_webhook_events(provider, reference, processed_at);

  CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    used_order_id TEXT,
    seller_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'store_order'
      CHECK (source_type IN ('store_order', 'used_order')),
    gross_amount_kobo INTEGER NOT NULL DEFAULT 0,
    platform_fee_kobo INTEGER NOT NULL DEFAULT 0,
    delivery_fee_kobo INTEGER NOT NULL DEFAULT 0,
    seller_amount_kobo INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending_payment'
      CHECK (status IN ('pending_payment', 'on_hold', 'return_window', 'eligible', 'released', 'blocked', 'refunded')),
    hold_reason TEXT NOT NULL DEFAULT '',
    release_after TEXT,
    released_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (used_order_id) REFERENCES used_market_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(source_type, order_id),
    UNIQUE(source_type, used_order_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS payouts_seller_idx
    ON payouts(seller_id, status, created_at);
  CREATE INDEX IF NOT EXISTS payouts_status_idx
    ON payouts(status, release_after);

  CREATE TABLE IF NOT EXISTS payout_events (
    id TEXT PRIMARY KEY,
    payout_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (payout_id) REFERENCES payouts(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS payout_events_payout_idx
    ON payout_events(payout_id, created_at);

  CREATE TABLE IF NOT EXISTS return_requests (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    used_order_id TEXT,
    requester_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'store_order'
      CHECK (source_type IN ('store_order', 'used_order')),
    reason TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    evidence_urls TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'seller_review', 'admin_review', 'approved', 'rejected', 'cancelled', 'refunded')),
    seller_response TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (used_order_id) REFERENCES used_market_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS return_requests_order_idx
    ON return_requests(source_type, order_id, used_order_id);
  CREATE INDEX IF NOT EXISTS return_requests_status_idx
    ON return_requests(status, created_at);

  CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    used_order_id TEXT,
    return_request_id TEXT,
    opened_by TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'store_order'
      CHECK (source_type IN ('store_order', 'used_order')),
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'reviewing', 'awaiting_evidence', 'resolved_buyer', 'resolved_seller', 'refunded', 'dismissed')),
    admin_decision TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (used_order_id) REFERENCES used_market_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (return_request_id) REFERENCES return_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS disputes_status_idx
    ON disputes(status, created_at);
  CREATE INDEX IF NOT EXISTS disputes_order_idx
    ON disputes(source_type, order_id, used_order_id);

  CREATE TABLE IF NOT EXISTS dispute_evidence (
    id TEXT PRIMARY KEY,
    dispute_id TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    evidence_type TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL DEFAULT '',
    file_urls TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS dispute_evidence_dispute_idx
    ON dispute_evidence(dispute_id, created_at);

  CREATE TABLE IF NOT EXISTS order_status_history (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    used_order_id TEXT,
    source_type TEXT NOT NULL DEFAULT 'store_order'
      CHECK (source_type IN ('store_order', 'used_order')),
    status_layer TEXT NOT NULL DEFAULT 'order',
    old_status TEXT NOT NULL DEFAULT '',
    new_status TEXT NOT NULL,
    changed_by TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS order_status_history_order_idx
    ON order_status_history(source_type, order_id, used_order_id, created_at);

  CREATE TABLE IF NOT EXISTS product_availability_events (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    old_status TEXT NOT NULL DEFAULT '',
    new_status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    changed_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS product_availability_events_product_idx
    ON product_availability_events(product_id, created_at);
`);

const stage4SeededAt = new Date().toISOString();
const restrictedKeywordSeeds = [
  ["tramadol", "reject", "Medication and controlled drugs are not allowed."],
  ["codeine", "reject", "Medication and controlled drugs are not allowed."],
  ["prescription", "reject", "Medication and prescription drugs are not allowed."],
  ["antibiotic", "reject", "Medication and prescription drugs are not allowed."],
  ["injection", "reject", "Medical injections are not allowed."],
  ["syringe", "reject", "Medical injections and unsafe medical items are not allowed."],
  ["cocaine", "reject", "Illegal substances are not allowed."],
  ["heroin", "reject", "Illegal substances are not allowed."],
  ["meth", "reject", "Illegal substances are not allowed."],
  ["skunk", "reject", "Illegal substances are not allowed."],
  ["cannabis", "reject", "Illegal substances are not allowed."],
  ["marijuana", "reject", "Illegal substances are not allowed."],
  ["weed", "reject", "Illegal substances are not allowed."],
  ["gun", "reject", "Weapons are not allowed."],
  ["firearm", "reject", "Weapons are not allowed."],
  ["ammunition", "reject", "Weapons and ammunition are not allowed."],
  ["bullet", "reject", "Weapons and ammunition are not allowed."],
  ["pistol", "reject", "Weapons are not allowed."],
  ["rifle", "reject", "Weapons are not allowed."],
  ["explosive", "reject", "Explosives are not allowed."],
  ["bomb", "reject", "Explosives are not allowed."],
  ["knife", "review", "Potential weapon or restricted item."],
  ["medicine", "reject", "Medication requires manual compliance review and is blocked for campus selling."],
  ["pharmacy", "reject", "Medication requires manual compliance review and is blocked for campus selling."],
  ["fake", "review", "Potential counterfeit or misleading listing."],
  ["counterfeit", "review", "Potential counterfeit or misleading listing."],
  ["stolen", "reject", "Stolen goods are not allowed."],
  ["no receipt", "review", "High-risk listing without proof of ownership."],
];

for (const [keyword, action, reason] of restrictedKeywordSeeds) {
  db.prepare(`
    INSERT INTO restricted_keywords (id, keyword, action, reason, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(keyword) DO NOTHING
  `).run(
    `rkw_${keyword.replace(/[^a-z0-9]/gi, "_")}`,
    keyword,
    action,
    reason,
    stage4SeededAt,
    stage4SeededAt,
  );
}

const categoryRuleSeeds = [
  ["all", "medicine", "Medicine", "reject", "Medicine and medication are not allowed on Gleenc."],
  ["all", "medication", "Medication", "reject", "Medicine and medication are not allowed on Gleenc."],
  ["all", "drugs", "Drugs", "reject", "Controlled drugs are not allowed on Gleenc."],
  ["all", "weapons", "Weapons", "reject", "Weapons are not allowed on Gleenc."],
  ["all", "guns", "Guns", "reject", "Guns and firearms are not allowed on Gleenc."],
  ["all", "firearms", "Firearms", "reject", "Firearms are not allowed on Gleenc."],
  ["all", "ammunition", "Ammunition", "reject", "Ammunition is not allowed on Gleenc."],
  ["all", "explosives", "Explosives", "reject", "Explosives are not allowed on Gleenc."],
  ["local_market", "fresh_food", "Fresh Food", "review", "Fresh food requires admin market readiness review in early launch."],
  ["local_market", "meat_fish", "Meat/Fish", "review", "Perishable products require admin readiness review in early launch."],
  ["local_market", "fuel_gas", "Fuel/Gas", "review", "Fuel and gas require admin compliance review."],
  ["local_market", "electronics_high_value", "High-value Electronics", "review", "High-value electronics need extra verification."],
  ["local_market", "jewelry", "Jewelry", "review", "High-value jewelry needs extra verification."],
];

for (const [sellerType, categoryKey, categoryName, ruleAction, reason] of categoryRuleSeeds) {
  db.prepare(`
    INSERT INTO product_category_rules (
      id, seller_type, category_key, category_name, rule_action, reason, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(seller_type, category_key) DO NOTHING
  `).run(
    `pcr_${sellerType}_${categoryKey}`.replace(/[^a-z0-9_]/gi, "_"),
    sellerType,
    categoryKey,
    categoryName,
    ruleAction,
    reason,
    stage4SeededAt,
    stage4SeededAt,
  );
}

db.prepare(`
  UPDATE seller_subscriptions
  SET amount_kobo = ?
  WHERE amount_kobo = 300000
`).run(env.sellerMonthlyFeeKobo);




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

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'local',
    purpose TEXT NOT NULL CHECK (
      purpose IN ('store_order', 'used_order', 'seller_subscription')
    ),
    order_id TEXT,
    used_order_id TEXT,
    subscription_id TEXT,
    user_id TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'initialized' CHECK (
      status IN ('initialized', 'paid', 'failed', 'cancelled')
    ),
    authorization_url TEXT NOT NULL DEFAULT '',
    provider_reference TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (used_order_id) REFERENCES used_market_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_id) REFERENCES seller_subscriptions(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS payment_transactions_user_id_idx
    ON payment_transactions(user_id);

  CREATE INDEX IF NOT EXISTS payment_transactions_reference_idx
    ON payment_transactions(reference);

  CREATE INDEX IF NOT EXISTS payment_transactions_order_id_idx
    ON payment_transactions(order_id);

  CREATE INDEX IF NOT EXISTS payment_transactions_used_order_id_idx
    ON payment_transactions(used_order_id);

  CREATE INDEX IF NOT EXISTS payment_transactions_subscription_id_idx
    ON payment_transactions(subscription_id);

  CREATE INDEX IF NOT EXISTS payment_transactions_purpose_idx
    ON payment_transactions(purpose);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS verification_cases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('seller', 'rider')),
    seller_type TEXT NOT NULL DEFAULT '',
    current_verified_level INTEGER NOT NULL DEFAULT 0 CHECK (current_verified_level >= 0),
    requested_level INTEGER NOT NULL DEFAULT 1 CHECK (requested_level >= 1),
    overall_status TEXT NOT NULL DEFAULT 'not_started'
      CHECK (overall_status IN (
        'not_started',
        'in_progress',
        'under_review',
        'approved',
        'needs_information',
        'rejected',
        'expired',
        'suspended',
        'restricted'
      )),
    operational_status TEXT NOT NULL DEFAULT 'restricted'
      CHECK (operational_status IN ('active', 'restricted', 'suspended', 'deactivated')),
    operational_reason TEXT NOT NULL DEFAULT '',
    suspension_reason TEXT NOT NULL DEFAULT '',
    restriction_reason TEXT NOT NULL DEFAULT '',
    last_reviewed_by TEXT,
    last_reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (last_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(user_id, role)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS verification_cases_role_status_idx
    ON verification_cases(role, overall_status, operational_status);
  CREATE INDEX IF NOT EXISTS verification_cases_user_idx
    ON verification_cases(user_id, role);

  CREATE TABLE IF NOT EXISTS verification_requirements (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    code TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('seller', 'rider')),
    seller_type TEXT NOT NULL DEFAULT '',
    required_level INTEGER NOT NULL DEFAULT 1 CHECK (required_level >= 1),
    blocking INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    workflow_type TEXT NOT NULL DEFAULT 'form'
      CHECK (workflow_type IN ('form', 'document', 'provider', 'system')),
    status TEXT NOT NULL DEFAULT 'not_submitted'
      CHECK (status IN (
        'not_submitted',
        'submitted',
        'under_review',
        'approved',
        'needs_information',
        'rejected',
        'expired',
        'superseded'
      )),
    latest_submission_id TEXT,
    latest_review_id TEXT,
    review_result TEXT NOT NULL DEFAULT '',
    admin_feedback TEXT NOT NULL DEFAULT '',
    expires_at TEXT,
    definition_version INTEGER NOT NULL DEFAULT 1,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES verification_cases(id) ON DELETE CASCADE,
    UNIQUE(case_id, code)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS verification_requirements_case_idx
    ON verification_requirements(case_id, status, required_level);
  CREATE INDEX IF NOT EXISTS verification_requirements_code_idx
    ON verification_requirements(code, status);

  CREATE TABLE IF NOT EXISTS verification_submissions (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    submitted_by TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    document_urls TEXT NOT NULL DEFAULT '[]',
    provider TEXT NOT NULL DEFAULT 'manual',
    provider_reference TEXT NOT NULL DEFAULT '',
    provider_status TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted'
      CHECK (status IN (
        'not_submitted',
        'submitted',
        'under_review',
        'approved',
        'needs_information',
        'rejected',
        'expired',
        'superseded'
      )),
    is_current INTEGER NOT NULL DEFAULT 1,
    submitted_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (requirement_id) REFERENCES verification_requirements(id) ON DELETE CASCADE,
    FOREIGN KEY (case_id) REFERENCES verification_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(requirement_id, version)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS verification_submissions_requirement_idx
    ON verification_submissions(requirement_id, version);
  CREATE INDEX IF NOT EXISTS verification_submissions_case_idx
    ON verification_submissions(case_id, submitted_at);

  CREATE TABLE IF NOT EXISTS verification_reviews (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL,
    submission_id TEXT,
    case_id TEXT NOT NULL,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL
      CHECK (action IN (
        'mark_under_review',
        'approve',
        'needs_information',
        'reject',
        'expire',
        'supersede',
        'restore'
      )),
    previous_status TEXT NOT NULL DEFAULT '',
    new_status TEXT NOT NULL,
    feedback TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (requirement_id) REFERENCES verification_requirements(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES verification_submissions(id) ON DELETE SET NULL,
    FOREIGN KEY (case_id) REFERENCES verification_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS verification_reviews_requirement_idx
    ON verification_reviews(requirement_id, created_at);
  CREATE INDEX IF NOT EXISTS verification_reviews_admin_idx
    ON verification_reviews(admin_id, created_at);

  CREATE TABLE IF NOT EXISTS verification_level_requests (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('seller', 'rider')),
    requested_level INTEGER NOT NULL DEFAULT 1 CHECK (requested_level >= 1),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'kept_existing')),
    reason TEXT NOT NULL DEFAULT '',
    admin_feedback TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES verification_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS verification_level_requests_case_idx
    ON verification_level_requests(case_id, status, created_at);
  CREATE INDEX IF NOT EXISTS verification_level_requests_role_idx
    ON verification_level_requests(role, status, created_at);

  CREATE TABLE IF NOT EXISTS verification_resubmission_requests (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
    admin_feedback TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (requirement_id) REFERENCES verification_requirements(id) ON DELETE CASCADE,
    FOREIGN KEY (case_id) REFERENCES verification_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS verification_resubmission_requirement_idx
    ON verification_resubmission_requests(requirement_id, status, created_at);
  CREATE INDEX IF NOT EXISTS verification_resubmission_case_idx
    ON verification_resubmission_requests(case_id, status, created_at);

  CREATE TABLE IF NOT EXISTS verification_audit_events (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    actor_id TEXT,
    actor_role TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    requirement_code TEXT NOT NULL DEFAULT '',
    previous_status TEXT NOT NULL DEFAULT '',
    new_status TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES verification_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS verification_audit_events_case_idx
    ON verification_audit_events(case_id, created_at);
  CREATE INDEX IF NOT EXISTS verification_audit_events_actor_idx
    ON verification_audit_events(actor_id, created_at);

  CREATE TABLE IF NOT EXISTS account_location_presence (
    user_id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'rider')),
    lat REAL,
    lng REAL,
    accuracy_meters REAL,
    permission_status TEXT NOT NULL DEFAULT 'unknown'
      CHECK (permission_status IN ('unknown', 'prompt', 'granted', 'denied', 'unavailable')),
    source TEXT NOT NULL DEFAULT 'browser_login',
    captured_at TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS account_location_presence_role_idx
    ON account_location_presence(role, permission_status, updated_at);
`);

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
