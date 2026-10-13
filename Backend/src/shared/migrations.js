import { db, transaction } from "../db/database.js";
// Additive only. Existing production data and web contracts remain intact.
export function migrateShared() {
  transaction(() =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS shared_saved (user_id TEXT NOT NULL REFERENCES users(id),product_id TEXT NOT NULL REFERENCES products(id),created_at TEXT NOT NULL,PRIMARY KEY(user_id,product_id));
    CREATE TABLE IF NOT EXISTS shared_push_devices (token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),platform TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_push_jobs (id TEXT PRIMARY KEY,notification_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,available_at TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_push_receipts (id TEXT PRIMARY KEY,token TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_presence (user_id TEXT PRIMARY KEY REFERENCES users(id),seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_message_keys (user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,conversation_id TEXT NOT NULL,message_id TEXT NOT NULL REFERENCES messages(id),PRIMARY KEY(user_id,request_key));
    CREATE TABLE IF NOT EXISTS shared_follows (user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,target_id));
    CREATE TABLE IF NOT EXISTS shared_topups (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount_kobo BIGINT NOT NULL,reference TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL,status TEXT NOT NULL,authorization_url TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,UNIQUE(user_id,idempotency_key));
    CREATE TABLE IF NOT EXISTS shared_wallet_holds (user_id TEXT PRIMARY KEY REFERENCES users(id),reason TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_settings (user_id TEXT PRIMARY KEY REFERENCES users(id),data_json TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS shared_schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), access_hash TEXT NOT NULL UNIQUE,
      refresh_hash TEXT NOT NULL UNIQUE, access_expires_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      revoked_at TEXT, device_name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shared_refresh_history (token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES shared_sessions(id));
    CREATE TABLE IF NOT EXISTS shared_identity_challenges (id TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, expires_at TEXT NOT NULL, user_id TEXT, used_at TEXT);
    CREATE TABLE IF NOT EXISTS shared_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(provider,subject));
    CREATE TABLE IF NOT EXISTS shared_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), data_json TEXT NOT NULL DEFAULT '{}', terms_version TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_addresses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), data_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_blocks (user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,target_id));
    CREATE TABLE IF NOT EXISTS shared_reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', resolution TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(user_id,kind,target_id));
    CREATE TABLE IF NOT EXISTS shared_audit (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_media (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, mime_type TEXT NOT NULL, name TEXT NOT NULL, bytes INTEGER NOT NULL, private_path TEXT NOT NULL, public_url TEXT NOT NULL, scan_status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_catalogue (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), data_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_products (product_id TEXT PRIMARY KEY REFERENCES products(id), data_json TEXT NOT NULL, catalogue_id TEXT REFERENCES shared_catalogue(id), version INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'draft', publish_at TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_posts (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), author_id TEXT NOT NULL REFERENCES users(id), original_id TEXT, markup_bps INTEGER NOT NULL DEFAULT 0 CHECK(markup_bps BETWEEN 0 AND 2000), caption TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS shared_feed_idx ON shared_posts(active,created_at,id);
    CREATE TABLE IF NOT EXISTS shared_post_events (post_id TEXT NOT NULL REFERENCES shared_posts(id), user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, day TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(post_id,user_id,kind,day));
    CREATE TABLE IF NOT EXISTS shared_cart (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL REFERENCES products(id), input_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS shared_cart_owner_idx ON shared_cart(user_id,updated_at);
    CREATE TABLE IF NOT EXISTS shared_offers (id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL REFERENCES users(id), seller_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL REFERENCES products(id), input_json TEXT NOT NULL, quoted_json TEXT NOT NULL, discount_bps INTEGER NOT NULL CHECK(discount_bps BETWEEN 0 AND 2000), product_version INTEGER NOT NULL, status TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_checkouts (id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL REFERENCES users(id), idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL, total_kobo BIGINT NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL UNIQUE, authorization_url TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(buyer_id,idempotency_key));
    CREATE TABLE IF NOT EXISTS shared_reservations (checkout_id TEXT NOT NULL REFERENCES shared_checkouts(id),product_id TEXT NOT NULL REFERENCES products(id),PRIMARY KEY(checkout_id,product_id));
    CREATE INDEX IF NOT EXISTS shared_reservations_product_idx ON shared_reservations(product_id);
    CREATE TABLE IF NOT EXISTS shared_payment_recoveries (id TEXT PRIMARY KEY,checkout_id TEXT NOT NULL UNIQUE REFERENCES shared_checkouts(id),reference TEXT NOT NULL,amount_kobo BIGINT NOT NULL,provider_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_orders (id TEXT PRIMARY KEY, checkout_id TEXT NOT NULL REFERENCES shared_checkouts(id), buyer_id TEXT NOT NULL REFERENCES users(id), seller_id TEXT NOT NULL REFERENCES users(id), total_kobo BIGINT NOT NULL, delivery_kobo BIGINT NOT NULL, status TEXT NOT NULL, address_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(checkout_id,seller_id));
    CREATE TABLE IF NOT EXISTS shared_order_lines (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES shared_orders(id), product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, snapshot_json TEXT NOT NULL, seller_kobo BIGINT NOT NULL, commission_kobo BIGINT NOT NULL, platform_kobo BIGINT NOT NULL, promoter_id TEXT REFERENCES users(id), refund_state TEXT NOT NULL DEFAULT '', eligible_at TEXT, fulfilled_at TEXT);
    CREATE TABLE IF NOT EXISTS shared_packages (id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES shared_order_lines(id), unit_index INTEGER NOT NULL, code_hash TEXT NOT NULL, code_cipher TEXT NOT NULL, status TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}', failures INTEGER NOT NULL DEFAULT 0, locked_until TEXT, confirmed_by TEXT REFERENCES users(id), confirmed_at TEXT, UNIQUE(line_id,unit_index));
    CREATE TABLE IF NOT EXISTS shared_wallet_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id), available_kobo BIGINT NOT NULL DEFAULT 0 CHECK(available_kobo>=0), held_kobo BIGINT NOT NULL DEFAULT 0 CHECK(held_kobo>=0));
    CREATE TABLE IF NOT EXISTS shared_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), event_key TEXT NOT NULL UNIQUE, bucket TEXT NOT NULL, amount_kobo BIGINT NOT NULL, order_line_id TEXT REFERENCES shared_order_lines(id), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_transfers (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), idempotency_key TEXT NOT NULL, amount_kobo BIGINT NOT NULL CHECK(amount_kobo>0), reference TEXT NOT NULL UNIQUE, recipient_code TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,idempotency_key));
    CREATE TABLE IF NOT EXISTS shared_issues (id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES shared_order_lines(id), buyer_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, reason TEXT NOT NULL, evidence_json TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_refunds (id TEXT PRIMARY KEY,issue_id TEXT NOT NULL UNIQUE REFERENCES shared_issues(id),line_id TEXT NOT NULL UNIQUE REFERENCES shared_order_lines(id),status TEXT NOT NULL,provider_id TEXT NOT NULL DEFAULT '',amount_kobo BIGINT NOT NULL DEFAULT 0,delivery_kobo BIGINT NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_entitlements (id TEXT PRIMARY KEY, line_id TEXT NOT NULL UNIQUE REFERENCES shared_order_lines(id), buyer_id TEXT NOT NULL REFERENCES users(id), file_ids_json TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_download_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), entitlement_id TEXT NOT NULL REFERENCES shared_entitlements(id), media_id TEXT NOT NULL REFERENCES shared_media(id), expires_at TEXT NOT NULL, used_at TEXT);
    CREATE TABLE IF NOT EXISTS shared_reviews (id TEXT PRIMARY KEY, line_id TEXT NOT NULL UNIQUE REFERENCES shared_order_lines(id), user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL REFERENCES products(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL, photos_json TEXT NOT NULL, reply TEXT NOT NULL DEFAULT '', deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_review_helpful (review_id TEXT NOT NULL REFERENCES shared_reviews(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(review_id,user_id));
    CREATE TABLE IF NOT EXISTS shared_chat_settings (conversation_id TEXT NOT NULL REFERENCES conversations(id), user_id TEXT NOT NULL REFERENCES users(id), muted INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, cleared_before TEXT NOT NULL DEFAULT '', PRIMARY KEY(conversation_id,user_id));
    CREATE TABLE IF NOT EXISTS shared_message_meta (message_id TEXT PRIMARY KEY REFERENCES messages(id), reply_id TEXT REFERENCES messages(id), attachment_id TEXT REFERENCES shared_media(id), edited_at TEXT, deleted_at TEXT, delivered_at TEXT);
    CREATE TABLE IF NOT EXISTS shared_message_hidden (message_id TEXT NOT NULL REFERENCES messages(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(message_id,user_id));
    CREATE TABLE IF NOT EXISTS shared_message_reactions (message_id TEXT NOT NULL REFERENCES messages(id), user_id TEXT NOT NULL REFERENCES users(id), emoji TEXT NOT NULL, PRIMARY KEY(message_id,user_id));
    CREATE TABLE IF NOT EXISTS shared_notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, target_id TEXT NOT NULL, actors_json TEXT NOT NULL, data_json TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,kind,target_id));
    CREATE TABLE IF NOT EXISTS shared_deletion_requests (user_id TEXT PRIMARY KEY REFERENCES users(id), status TEXT NOT NULL, requested_at TEXT NOT NULL, execute_after TEXT NOT NULL, completed_at TEXT);
    CREATE INDEX IF NOT EXISTS shared_sessions_user_idx ON shared_sessions(user_id,expires_at);
    CREATE INDEX IF NOT EXISTS shared_products_schedule_idx ON shared_products(state,publish_at);
    CREATE INDEX IF NOT EXISTS shared_offers_buyer_idx ON shared_offers(buyer_id,status);
    CREATE INDEX IF NOT EXISTS shared_offers_seller_idx ON shared_offers(seller_id,status);
    CREATE INDEX IF NOT EXISTS shared_orders_buyer_idx ON shared_orders(buyer_id,created_at);
    CREATE INDEX IF NOT EXISTS shared_orders_seller_idx ON shared_orders(seller_id,created_at);
    CREATE INDEX IF NOT EXISTS shared_lines_product_idx ON shared_order_lines(product_id);
    CREATE INDEX IF NOT EXISTS shared_lines_release_idx ON shared_order_lines(eligible_at,refund_state);
    CREATE INDEX IF NOT EXISTS shared_issues_line_idx ON shared_issues(line_id,status);
    CREATE INDEX IF NOT EXISTS shared_ledger_owner_idx ON shared_ledger(user_id,created_at);
    CREATE INDEX IF NOT EXISTS shared_notifications_owner_idx ON shared_notifications(user_id,updated_at);
    CREATE INDEX IF NOT EXISTS shared_checkouts_expiry_idx ON shared_checkouts(status,expires_at);
    CREATE INDEX IF NOT EXISTS shared_push_jobs_pending_idx ON shared_push_jobs(status,available_at);
    INSERT INTO shared_schema_versions(version,applied_at) VALUES(1,'${new Date().toISOString()}') ON CONFLICT(version) DO NOTHING;
  `),
  );
}
