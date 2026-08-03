import "./rider-migrations.js";
import { db } from "./database.js";

function tableColumns(table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all();
  } catch {
    return [];
  }
}

function tableExists(table) {
  return tableColumns(table).length > 0;
}

function columnExists(table, column) {
  return tableColumns(table).some((item) => item.name === column);
}

function ensureColumn(table, column, definition) {
  if (!tableExists(table)) return;
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function safeExec(sql) {
  try {
    db.exec(sql);
  } catch (error) {
    console.warn(`Stage 3 migration skipped one statement: ${error.message}`);
  }
}

function ensureKycColumns(table) {
  ensureColumn(table, "kyc_provider", "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(table, "kyc_reference_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(table, "kyc_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn(table, "kyc_level", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(table, "kyc_started_at", "TEXT");
  ensureColumn(table, "kyc_verified_at", "TEXT");
  ensureColumn(table, "kyc_failed_at", "TEXT");
  ensureColumn(table, "kyc_failure_reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(table, "kyc_requires_admin_review", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(table, "kyc_admin_review_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn(table, "profile_completion_percent", "INTEGER NOT NULL DEFAULT 0");
}

function directConversationKey(firstUserId, secondUserId) {
  return `direct:${[String(firstUserId || ""), String(secondUserId || "")].sort().join(":")}`;
}

function supportConversationKey(buyerId, sellerId) {
  return `support:${String(buyerId || "")}:${String(sellerId || "")}`;
}

function migrateCanonicalConversations() {
  if (!tableExists("conversations")) return;

  ensureColumn("conversations", "conversation_key", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("messages", "context_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("messages", "context_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("messages", "context_snapshot", "TEXT NOT NULL DEFAULT '{}'");

  const rows = db.prepare(`
    SELECT conversations.*,
           (SELECT COUNT(*) FROM messages WHERE messages.conversation_id = conversations.id) AS message_count
    FROM conversations
    ORDER BY message_count DESC,
             COALESCE(last_message_at, updated_at, created_at) DESC
  `).all();
  const canonicalByKey = new Map();

  for (const row of rows) {
    const key = row.context_type === "support"
      ? supportConversationKey(row.buyer_id, row.seller_id)
      : directConversationKey(row.buyer_id, row.seller_id);
    const canonical = canonicalByKey.get(key);

    if (!canonical) {
      canonicalByKey.set(key, row);
      db.prepare("UPDATE conversations SET conversation_key = ? WHERE id = ?").run(key, row.id);
      continue;
    }

    db.prepare("UPDATE messages SET conversation_id = ? WHERE conversation_id = ?")
      .run(canonical.id, row.id);
    if (tableExists("used_market_orders")) {
      db.prepare("UPDATE used_market_orders SET conversation_id = ? WHERE conversation_id = ?")
        .run(canonical.id, row.id);
    }
    if (tableExists("admin_conversation_access_logs")) {
      db.prepare("UPDATE admin_conversation_access_logs SET conversation_id = ? WHERE conversation_id = ?")
        .run(canonical.id, row.id);
    }
    db.prepare("DELETE FROM conversations WHERE id = ?").run(row.id);
  }

  for (const canonical of canonicalByKey.values()) {
    const latest = db.prepare(`
      SELECT body, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(canonical.id);
    if (latest) {
      db.prepare(`
        UPDATE conversations
        SET last_message_body = ?, last_message_at = ?, updated_at = ?
        WHERE id = ?
      `).run(latest.body || "Sent a product", latest.created_at, latest.created_at, canonical.id);
    }
  }

  // A normal conversation is created by the first real message.  Older
  // releases created empty rows when a profile or order page was opened. Keep
  // support threads, but safely remove only direct rows that have no message
  // history and are not referenced by a used-market order.
  safeExec(`
    DELETE FROM conversations
    WHERE context_type != 'support'
      AND NOT EXISTS (
        SELECT 1 FROM messages WHERE messages.conversation_id = conversations.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM used_market_orders
        WHERE used_market_orders.conversation_id = conversations.id
      )
  `);

  safeExec(`
    CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_unique_idx
    ON conversations(conversation_key)
    WHERE conversation_key != ''
  `);
}

export function runStage3Migrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kyc_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'seller'
        CHECK (role IN ('seller', 'rider')),
      provider TEXT NOT NULL DEFAULT 'manual'
        CHECK (provider IN ('mock', 'manual', 'dojah')),
      provider_reference_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('not_started', 'started', 'pending_review', 'verified', 'failed', 'rejected', 'resubmission_requested')),
      kyc_level INTEGER NOT NULL DEFAULT 0,
      requires_admin_review INTEGER NOT NULL DEFAULT 1,
      admin_review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (admin_review_status IN ('not_started', 'pending', 'approved', 'rejected', 'resubmission_requested')),
      failure_reason TEXT NOT NULL DEFAULT '',
      submitted_payload TEXT NOT NULL DEFAULT '{}',
      document_urls TEXT NOT NULL DEFAULT '[]',
      selfie_url TEXT,
      liveness_reference TEXT NOT NULL DEFAULT '',
      raw_provider_payload TEXT NOT NULL DEFAULT '{}',
      reviewed_by TEXT,
      reviewed_at TEXT,
      started_at TEXT,
      verified_at TEXT,
      failed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS kyc_verifications_user_idx
      ON kyc_verifications(user_id, role, created_at);
    CREATE INDEX IF NOT EXISTS kyc_verifications_status_idx
      ON kyc_verifications(status, admin_review_status, created_at);

    CREATE TABLE IF NOT EXISTS rider_locations (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      lat REAL,
      lng REAL,
      accuracy_meters REAL,
      address TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      zone TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      is_current INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_locations_rider_idx
      ON rider_locations(rider_id, created_at);

    CREATE TABLE IF NOT EXISTS seller_pickup_locations (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      store_id TEXT,
      label TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      campus TEXT NOT NULL DEFAULT '',
      market_id TEXT,
      market_name TEXT NOT NULL DEFAULT '',
      shop_number TEXT NOT NULL DEFAULT '',
      shop_section TEXT NOT NULL DEFAULT '',
      pickup_instruction TEXT NOT NULL DEFAULT '',
      lat REAL,
      lng REAL,
      source TEXT NOT NULL DEFAULT 'manual',
      is_default INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS seller_pickup_locations_seller_idx
      ON seller_pickup_locations(seller_id, is_default);
    CREATE INDEX IF NOT EXISTS seller_pickup_locations_store_idx
      ON seller_pickup_locations(store_id);

    CREATE TABLE IF NOT EXISTS delivery_locations (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      campus TEXT NOT NULL DEFAULT '',
      landmark TEXT NOT NULL DEFAULT '',
      lat REAL,
      lng REAL,
      source TEXT NOT NULL DEFAULT 'manual',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS delivery_locations_buyer_idx
      ON delivery_locations(buyer_id, is_default);

    CREATE TABLE IF NOT EXISTS product_moderation_reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'product'
        CHECK (item_type IN ('product', 'service', 'used_listing')),
      status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('draft', 'auto_approved', 'approved', 'pending_review', 'flagged', 'rejected', 'hidden', 'changes_requested')),
      risk_score INTEGER NOT NULL DEFAULT 0,
      risk_level TEXT NOT NULL DEFAULT 'low',
      reasons TEXT NOT NULL DEFAULT '[]',
      ocr_status TEXT NOT NULL DEFAULT 'not_run',
      ocr_result_id TEXT,
      note TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS product_moderation_reviews_product_idx
      ON product_moderation_reviews(product_id, item_type);
    CREATE INDEX IF NOT EXISTS product_moderation_reviews_status_idx
      ON product_moderation_reviews(status, created_at);

    CREATE TABLE IF NOT EXISTS product_price_ranges (
      id TEXT PRIMARY KEY,
      market_scope TEXT NOT NULL DEFAULT 'all',
      campus TEXT NOT NULL DEFAULT '',
      seller_type TEXT NOT NULL DEFAULT 'all',
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      condition TEXT NOT NULL DEFAULT '',
      min_price_kobo INTEGER NOT NULL DEFAULT 0,
      max_price_kobo INTEGER NOT NULL DEFAULT 0,
      action TEXT NOT NULL DEFAULT 'review'
        CHECK (action IN ('allow', 'warn', 'review', 'block')),
      note TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS product_price_ranges_lookup_idx
      ON product_price_ranges(is_active, seller_type, market_scope, campus, category);

    CREATE TABLE IF NOT EXISTS ocr_results (
      id TEXT PRIMARY KEY,
      asset_url TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'skipped'
        CHECK (status IN ('skipped', 'pending', 'completed', 'failed', 'review_required')),
      extracted_text TEXT NOT NULL DEFAULT '',
      risk_reasons TEXT NOT NULL DEFAULT '[]',
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ocr_results_asset_idx
      ON ocr_results(asset_url);

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx
      ON admin_audit_logs(action, created_at);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx
      ON admin_audit_logs(target_type, target_id, created_at);
  `);

  ensureKycColumns("stores");
  ensureKycColumns("rider_profiles");

  ensureColumn("stores", "market_section", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "shop_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "shop_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "government_tax_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "market_association_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "internal_gleenc_shop_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "pickup_instruction", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "phone_verification_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn("stores", "payout_account_status", "TEXT NOT NULL DEFAULT 'not_started'");

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
  ensureColumn("seller_verification_profiles", "face_verified", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("seller_verification_profiles", "face_provider", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("seller_verification_profiles", "face_reference", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("seller_verification_profiles", "face_verified_at", "TEXT");
  ensureColumn("seller_verification_profiles", "current_step", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("seller_verification_profiles", "completed_steps_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("seller_verification_profiles", "locked_steps_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("seller_verification_profiles", "submitted_for_review_at", "TEXT");
  ensureColumn("seller_verification_profiles", "resubmission_requested_at", "TEXT");
  ensureColumn("seller_verification_profiles", "admin_review_status", "TEXT NOT NULL DEFAULT 'not_started'");

  for (const table of ["stores", "seller_verification_profiles"]) {
    ensureColumn(table, "country", "TEXT NOT NULL DEFAULT 'Nigeria'");
    ensureColumn(table, "state", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "city", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "nearest_campus", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "nearest_marketplace", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "street", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "pickup_place_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "location_verified_at", "TEXT");
  }

  for (const table of ["seller_pickup_locations", "delivery_locations"]) {
    ensureColumn(table, "country", "TEXT NOT NULL DEFAULT 'Nigeria'");
    ensureColumn(table, "state", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "city", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "nearest_campus", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "nearest_marketplace", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "street", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "place_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(table, "verified_at", "TEXT");
  }

  ensureColumn("rider_profiles", "phone_verification_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn("rider_profiles", "documents_review_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn("rider_profiles", "liveness_review_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn("rider_profiles", "admin_profile_review_status", "TEXT NOT NULL DEFAULT 'not_started'");

  ensureColumn("notifications", "role", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("notifications", "message", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("notifications", "action_url", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("notifications", "metadata_json", "TEXT NOT NULL DEFAULT '{}'");

  ensureColumn("products", "price_validation_status", "TEXT NOT NULL DEFAULT 'not_checked'");
  ensureColumn("products", "price_validation_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("products", "ocr_review_status", "TEXT NOT NULL DEFAULT 'not_run'");
  ensureColumn("products", "last_validated_at", "TEXT");
  ensureColumn("products", "requires_admin_review", "INTEGER NOT NULL DEFAULT 0");

  ensureColumn("services", "price_validation_status", "TEXT NOT NULL DEFAULT 'not_checked'");
  ensureColumn("services", "price_validation_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("services", "ocr_review_status", "TEXT NOT NULL DEFAULT 'not_run'");
  ensureColumn("services", "last_validated_at", "TEXT");
  ensureColumn("services", "requires_admin_review", "INTEGER NOT NULL DEFAULT 0");

  safeExec("CREATE INDEX IF NOT EXISTS users_email_stage3_idx ON users(email)");
  safeExec("CREATE INDEX IF NOT EXISTS users_role_stage3_idx ON users(role)");
  safeExec("CREATE INDEX IF NOT EXISTS stores_campus_stage3_idx ON stores(campus)");
  safeExec("CREATE INDEX IF NOT EXISTS stores_seller_type_stage3_idx ON stores(seller_type)");
  safeExec("CREATE INDEX IF NOT EXISTS products_category_stage3_idx ON products(category, status)");
  safeExec("CREATE INDEX IF NOT EXISTS products_moderation_stage3_idx ON products(moderation_status, created_at)");
  safeExec("CREATE INDEX IF NOT EXISTS orders_buyer_stage3_idx ON orders(buyer_id, created_at)");
  safeExec("CREATE INDEX IF NOT EXISTS orders_seller_stage3_idx ON orders(seller_id, created_at)");
  safeExec("CREATE INDEX IF NOT EXISTS orders_rider_stage3_idx ON orders(assigned_rider_id, created_at)");

  // "Nearby" is a discovery mode, not a seller account type. Preserve old
  // accounts by migrating the legacy value to the general campus workflow.
  safeExec("UPDATE stores SET seller_type = 'campus' WHERE seller_type = 'nearby'");
  safeExec("UPDATE seller_verification_profiles SET seller_type = 'campus' WHERE seller_type = 'nearby'");
  safeExec("CREATE INDEX IF NOT EXISTS stores_structured_location_idx ON stores(state, city, nearest_campus, nearest_marketplace)");
  migrateCanonicalConversations();
}
