import { env } from "../config/env.js";
import { db } from "./database.js";

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function tableSql(table) {
  if (env.databaseProvider === "postgres") return "";
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return row?.sql || "";
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

/**
 * Existing Gleank databases were created with users.role limited to buyer/seller/admin.
 * Rider auth requires role='rider', so this safely rebuilds the users table only when
 * the old CHECK constraint is still present.
 */
function ensureUserRoleSupportsRider() {
  if (env.databaseProvider === "postgres") {
    db.exec(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('buyer', 'seller', 'admin', 'rider'));
    `);
    return;
  }

  const sql = tableSql("users");
  if (!sql || sql.includes("'rider'")) return;

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec(`
      CREATE TABLE users_rider_migration (
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
        updated_at TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        email_verified_at TEXT,
        phone_verified INTEGER NOT NULL DEFAULT 0,
        phone_verified_at TEXT,
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_login_at TEXT,
        last_password_change_at TEXT
      ) STRICT;

      INSERT INTO users_rider_migration (
        id, name, email, password_hash, role, campus, phone, avatar_url,
        is_active, created_at, updated_at, email_verified, email_verified_at,
        phone_verified, phone_verified_at, failed_login_count, locked_until,
        last_login_at, last_password_change_at
      )
      SELECT
        id, name, email, password_hash, role, campus, phone, avatar_url,
        is_active, created_at, updated_at,
        COALESCE(email_verified, 0), email_verified_at,
        COALESCE(phone_verified, 0), phone_verified_at,
        COALESCE(failed_login_count, 0), locked_until,
        last_login_at, last_password_change_at
      FROM users;

      DROP TABLE users;
      ALTER TABLE users_rider_migration RENAME TO users;
      CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
      CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
    `);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function ensureNotificationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'admin',
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
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id, is_read);
  `);
}

function ensureExistingOrderLocationColumns() {
  ensureColumn("orders", "pickup_lat", "REAL");
  ensureColumn("orders", "pickup_lng", "REAL");
  ensureColumn("orders", "delivery_lat", "REAL");
  ensureColumn("orders", "delivery_lng", "REAL");
  ensureColumn("orders", "seller_pickup_code_hash", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("orders", "buyer_delivery_code_hash", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("orders", "package_tag_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("orders", "assigned_rider_id", "TEXT");
  ensureColumn("orders", "rider_assignment_id", "TEXT");

  ensureColumn("used_market_orders", "pickup_lat", "REAL");
  ensureColumn("used_market_orders", "pickup_lng", "REAL");
  ensureColumn("used_market_orders", "delivery_lat", "REAL");
  ensureColumn("used_market_orders", "delivery_lng", "REAL");
  ensureColumn("used_market_orders", "seller_pickup_code_hash", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("used_market_orders", "buyer_delivery_code_hash", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("used_market_orders", "package_tag_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("used_market_orders", "assigned_rider_id", "TEXT");
  ensureColumn("used_market_orders", "rider_assignment_id", "TEXT");
}

function ensureSellerWhatsAppColumns() {
  ensureColumn("stores", "whatsapp_phone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "allow_rider_whatsapp_contact", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("stores", "pickup_lat", "REAL");
  ensureColumn("stores", "pickup_lng", "REAL");
  ensureColumn("stores", "pickup_address", "TEXT NOT NULL DEFAULT ''");
}

export function runRiderMigrations() {
  ensureUserRoleSupportsRider();
  ensureNotificationsTable();
  ensureExistingOrderLocationColumns();
  ensureSellerWhatsAppColumns();

  db.exec(`
    CREATE TABLE IF NOT EXISTS rider_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp_phone TEXT NOT NULL DEFAULT '',
      vehicle_type TEXT NOT NULL DEFAULT '',
      vehicle_plate TEXT NOT NULL DEFAULT '',
      coverage_area TEXT NOT NULL DEFAULT '',
      home_address TEXT NOT NULL DEFAULT '',
      emergency_contact_name TEXT NOT NULL DEFAULT '',
      emergency_contact_phone TEXT NOT NULL DEFAULT '',
      guarantor_name TEXT NOT NULL DEFAULT '',
      guarantor_phone TEXT NOT NULL DEFAULT '',
      identity_document_url TEXT,
      selfie_url TEXT,
      nin_last4 TEXT NOT NULL DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (verification_status IN ('draft','pending_review','verified','rejected','suspended')),
      verification_note TEXT NOT NULL DEFAULT '',
      verification_level INTEGER NOT NULL DEFAULT 1 CHECK (verification_level >= 1 AND verification_level <= 5),
      max_package_value_kobo INTEGER NOT NULL DEFAULT 2000000 CHECK (max_package_value_kobo >= 0),
      availability TEXT NOT NULL DEFAULT 'offline' CHECK (availability IN ('offline','online','busy')),
      transport_type TEXT NOT NULL DEFAULT 'motorcycle',
      max_package_size TEXT NOT NULL DEFAULT 'small_medium',
      max_weight_class TEXT NOT NULL DEFAULT 'up_to_medium',
      fragile_handling_ability TEXT NOT NULL DEFAULT 'can_handle_fragile',
      delivery_bag_type TEXT NOT NULL DEFAULT 'medium_delivery_bag',
      service_zone_ids TEXT NOT NULL DEFAULT '[]',
      current_zone_id TEXT,
      gps_permission_status TEXT NOT NULL DEFAULT 'gps_disabled',
      availability_mode TEXT NOT NULL DEFAULT 'offline',
      can_receive_auto_dispatch INTEGER NOT NULL DEFAULT 1,
      capacity_locked INTEGER NOT NULL DEFAULT 0,
      capacity_change_unlocked_until TEXT,
      current_lat REAL,
      current_lng REAL,
      current_accuracy_meters REAL,
      last_location_at TEXT,
      live_face_verified INTEGER NOT NULL DEFAULT 0,
      safety_status TEXT NOT NULL DEFAULT 'normal' CHECK (safety_status IN ('normal','flagged','suspended')),
      rating_average REAL NOT NULL DEFAULT 0,
      completed_deliveries INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_profiles_user_id_idx ON rider_profiles(user_id);
    CREATE INDEX IF NOT EXISTS rider_profiles_availability_idx ON rider_profiles(availability, verification_status);

    CREATE TABLE IF NOT EXISTS rider_assignments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_type TEXT NOT NULL CHECK (order_type IN ('store_order','used_order')),
      rider_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      store_id TEXT,
      listing_id TEXT,
      market_source TEXT NOT NULL DEFAULT '',
      seller_type TEXT NOT NULL DEFAULT '',
      market_id TEXT,
      market_name TEXT NOT NULL DEFAULT '',
      campus_name TEXT NOT NULL DEFAULT '',
      pickup_landmark TEXT NOT NULL DEFAULT '',
      seller_allows_whatsapp INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','arrived_pickup','picked_up','out_for_delivery','delivered','failed','cancelled')),
      dispatch_timeout_seconds INTEGER NOT NULL DEFAULT 600 CHECK (dispatch_timeout_seconds >= 60),
      dispatch_expires_at TEXT,
      dispatch_timeout_policy TEXT NOT NULL DEFAULT 'campus',
      payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','unpaid','failed','refunded')),
      payment_confirmed_at TEXT,
      pickup_code_hash TEXT NOT NULL,
      delivery_code_hash TEXT NOT NULL,
      pickup_address TEXT NOT NULL DEFAULT '',
      pickup_lat REAL,
      pickup_lng REAL,
      delivery_address TEXT NOT NULL DEFAULT '',
      delivery_lat REAL,
      delivery_lng REAL,
      seller_name TEXT NOT NULL DEFAULT '',
      seller_phone TEXT NOT NULL DEFAULT '',
      seller_whatsapp TEXT NOT NULL DEFAULT '',
      buyer_name TEXT NOT NULL DEFAULT '',
      buyer_phone TEXT NOT NULL DEFAULT '',
      package_summary TEXT NOT NULL DEFAULT '',
      package_tag_code TEXT NOT NULL DEFAULT '',
      package_value_kobo INTEGER NOT NULL DEFAULT 0 CHECK (package_value_kobo >= 0),
      delivery_fee_kobo INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_kobo >= 0),
      pickup_proof_url TEXT,
      pickup_proof_note TEXT NOT NULL DEFAULT '',
      pickup_proof_lat REAL,
      pickup_proof_lng REAL,
      pickup_proof_accuracy_meters REAL,
      pickup_proof_created_at TEXT,
      delivery_proof_url TEXT,
      delivery_proof_note TEXT NOT NULL DEFAULT '',
      delivery_proof_lat REAL,
      delivery_proof_lng REAL,
      delivery_proof_accuracy_meters REAL,
      delivery_proof_created_at TEXT,
      accepted_at TEXT,
      picked_up_at TEXT,
      delivered_at TEXT,
      failed_at TEXT,
      fail_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(order_type, order_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_assignments_rider_id_idx ON rider_assignments(rider_id);
    CREATE INDEX IF NOT EXISTS rider_assignments_order_idx ON rider_assignments(order_type, order_id);
    CREATE INDEX IF NOT EXISTS rider_assignments_status_idx ON rider_assignments(status);

    CREATE TABLE IF NOT EXISTS rider_location_updates (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      assignment_id TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy_meters REAL,
      source TEXT NOT NULL DEFAULT 'device_gps',
      created_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES rider_assignments(id) ON DELETE SET NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_location_updates_rider_idx ON rider_location_updates(rider_id, created_at);

    CREATE TABLE IF NOT EXISTS rider_route_estimates (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      target TEXT NOT NULL CHECK (target IN ('pickup','delivery')),
      origin_lat REAL NOT NULL,
      origin_lng REAL NOT NULL,
      destination_lat REAL NOT NULL,
      destination_lng REAL NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      traffic_duration_minutes INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'google_routes_api',
      raw_response TEXT NOT NULL DEFAULT '{}',
      calculated_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES rider_assignments(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_route_estimates_assignment_idx ON rider_route_estimates(assignment_id, calculated_at);

    CREATE TABLE IF NOT EXISTS rider_safety_reports (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      assignment_id TEXT,
      order_id TEXT,
      report_type TEXT NOT NULL DEFAULT 'general',
      note TEXT NOT NULL DEFAULT '',
      lat REAL,
      lng REAL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES rider_assignments(id) ON DELETE SET NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_safety_reports_rider_idx ON rider_safety_reports(rider_id, created_at);

    CREATE TABLE IF NOT EXISTS rider_earnings (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL,
      order_type TEXT NOT NULL CHECK (order_type IN ('store_order','used_order')),
      amount_kobo INTEGER NOT NULL CHECK (amount_kobo >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','available','paid','withheld')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES rider_assignments(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_earnings_rider_idx ON rider_earnings(rider_id, status);

    CREATE TABLE IF NOT EXISTS rider_contact_audit_logs (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      contact_type TEXT NOT NULL CHECK (contact_type IN ('call','whatsapp')),
      contact_target TEXT NOT NULL CHECK (contact_target IN ('seller','buyer','support')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES rider_assignments(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rider_contact_audit_rider_idx ON rider_contact_audit_logs(rider_id, created_at);
  `);

  ensureColumn("rider_assignments", "market_source", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rider_assignments", "seller_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rider_assignments", "market_id", "TEXT");
  ensureColumn("rider_assignments", "market_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rider_assignments", "campus_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rider_assignments", "pickup_landmark", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rider_assignments", "seller_allows_whatsapp", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("rider_assignments", "dispatch_timeout_seconds", "INTEGER NOT NULL DEFAULT 600");
  ensureColumn("rider_assignments", "dispatch_expires_at", "TEXT");
  ensureColumn("rider_assignments", "dispatch_timeout_policy", "TEXT NOT NULL DEFAULT 'campus'");
  ensureColumn("rider_assignments", "package_tag_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rider_assignments", "delivery_batch_id", "TEXT");
  ensureColumn("rider_assignments", "pickup_task_id", "TEXT");
  ensureColumn("rider_assignments", "seller_pickup_code_verified_at", "TEXT");
  ensureColumn("rider_assignments", "buyer_delivery_code_verified_at", "TEXT");
  ensureColumn("rider_assignments", "code_attempt_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rider_assignments", "last_code_attempt_at", "TEXT");

  ensureColumn("rider_profiles", "transport_type", "TEXT NOT NULL DEFAULT 'motorcycle'");
  ensureColumn("rider_profiles", "max_package_size", "TEXT NOT NULL DEFAULT 'small_medium'");
  ensureColumn("rider_profiles", "max_weight_class", "TEXT NOT NULL DEFAULT 'up_to_medium'");
  ensureColumn("rider_profiles", "fragile_handling_ability", "TEXT NOT NULL DEFAULT 'can_handle_fragile'");
  ensureColumn("rider_profiles", "delivery_bag_type", "TEXT NOT NULL DEFAULT 'medium_delivery_bag'");
  ensureColumn("rider_profiles", "service_zone_ids", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("rider_profiles", "current_zone_id", "TEXT");
  ensureColumn("rider_profiles", "gps_permission_status", "TEXT NOT NULL DEFAULT 'gps_disabled'");
  ensureColumn("rider_profiles", "availability_mode", "TEXT NOT NULL DEFAULT 'offline'");
  ensureColumn("rider_profiles", "can_receive_auto_dispatch", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("rider_profiles", "capacity_locked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rider_profiles", "capacity_change_unlocked_until", "TEXT");
  ensureColumn("rider_profiles", "live_face_verified", "INTEGER NOT NULL DEFAULT 0");

  db.prepare(`
    UPDATE rider_profiles
    SET max_package_value_kobo = 2000000,
        availability = CASE WHEN availability = 'offline' THEN 'online' ELSE availability END,
        availability_mode = CASE
          WHEN availability_mode = 'offline' THEN 'online_zone_only'
          ELSE availability_mode
        END
    WHERE verification_status = 'verified'
      AND safety_status = 'normal'
      AND COALESCE(max_package_value_kobo, 0) <= 0
  `).run();

  db.prepare(`
    UPDATE rider_profiles
    SET availability = 'online',
        availability_mode = CASE
          WHEN gps_permission_status = 'gps_enabled' THEN 'online_gps_active'
          ELSE 'online_zone_only'
        END
    WHERE verification_status = 'verified'
      AND safety_status = 'normal'
      AND availability = 'offline'
  `).run();
}

runRiderMigrations();
