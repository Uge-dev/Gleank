import { db } from "./database.js";

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.length) return;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedDeliveryZone({ id, name, zoneType, parentAreaId = null, baseDeliveryFeeKobo = 70000, extraPickupFeeKobo = 15000, latitude = null, longitude = null }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO delivery_zones (
      id, name, parent_area_id, zone_type, latitude, longitude,
      base_delivery_fee_kobo, extra_pickup_fee_kobo, supported_delivery_types,
      is_active, availability_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '["instant","scheduled"]', 1, 'normal', ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    id,
    name,
    parentAreaId,
    zoneType,
    latitude,
    longitude,
    baseDeliveryFeeKobo,
    extraPickupFeeKobo,
    now,
    now,
  );
}

function seedPackageRule(rule) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO package_rules (
      id, category_key, category_name, package_size, package_weight_class,
      fragility_level, handling_instructions, package_shape, stackability,
      batching_eligibility, required_vehicle_type, special_delivery_flags,
      estimated_package_units, requires_separate_delivery, risk_level,
      admin_review_required, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(category_key) DO NOTHING
  `).run(
    rule.id,
    rule.categoryKey,
    rule.categoryName,
    rule.packageSize,
    rule.packageWeightClass,
    rule.fragilityLevel,
    JSON.stringify(rule.handlingInstructions || ["normal_handling"]),
    rule.packageShape,
    rule.stackability,
    rule.batchingEligibility,
    rule.requiredVehicleType,
    JSON.stringify(rule.specialDeliveryFlags || ["none"]),
    rule.estimatedPackageUnits || 1,
    rule.requiresSeparateDelivery ? 1 : 0,
    rule.riskLevel || "low",
    rule.adminReviewRequired ? 1 : 0,
    now,
    now,
  );
}

export function runLogisticsMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_area_id TEXT,
      zone_type TEXT NOT NULL DEFAULT 'general_area',
      market_id TEXT,
      campus_id TEXT,
      latitude REAL,
      longitude REAL,
      base_delivery_fee_kobo INTEGER NOT NULL DEFAULT 70000,
      extra_pickup_fee_kobo INTEGER NOT NULL DEFAULT 15000,
      supported_delivery_types TEXT NOT NULL DEFAULT '["instant","scheduled"]',
      is_active INTEGER NOT NULL DEFAULT 1,
      availability_status TEXT NOT NULL DEFAULT 'normal',
      availability_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS delivery_zones_parent_idx ON delivery_zones(parent_area_id);
    CREATE INDEX IF NOT EXISTS delivery_zones_type_idx ON delivery_zones(zone_type, is_active);
    CREATE INDEX IF NOT EXISTS delivery_zones_market_idx ON delivery_zones(market_id);

    CREATE TABLE IF NOT EXISTS package_rules (
      id TEXT PRIMARY KEY,
      category_key TEXT NOT NULL UNIQUE,
      category_name TEXT NOT NULL DEFAULT '',
      package_size TEXT NOT NULL DEFAULT 'small',
      package_weight_class TEXT NOT NULL DEFAULT 'light',
      fragility_level TEXT NOT NULL DEFAULT 'not_fragile',
      handling_instructions TEXT NOT NULL DEFAULT '["normal_handling"]',
      package_shape TEXT NOT NULL DEFAULT 'box',
      stackability TEXT NOT NULL DEFAULT 'stackable',
      batching_eligibility TEXT NOT NULL DEFAULT 'can_batch',
      required_vehicle_type TEXT NOT NULL DEFAULT 'motorcycle_or_above',
      special_delivery_flags TEXT NOT NULL DEFAULT '["none"]',
      estimated_package_units INTEGER NOT NULL DEFAULT 1,
      requires_separate_delivery INTEGER NOT NULL DEFAULT 0,
      risk_level TEXT NOT NULL DEFAULT 'low',
      admin_review_required INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS product_package_profiles (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL UNIQUE,
      package_size TEXT NOT NULL DEFAULT 'small',
      package_weight_class TEXT NOT NULL DEFAULT 'light',
      fragility_level TEXT NOT NULL DEFAULT 'not_fragile',
      handling_instructions TEXT NOT NULL DEFAULT '["normal_handling"]',
      package_shape TEXT NOT NULL DEFAULT 'box',
      stackability TEXT NOT NULL DEFAULT 'stackable',
      batching_eligibility TEXT NOT NULL DEFAULT 'can_batch',
      required_vehicle_type TEXT NOT NULL DEFAULT 'motorcycle_or_above',
      special_delivery_flags TEXT NOT NULL DEFAULT '["none"]',
      estimated_package_units INTEGER NOT NULL DEFAULT 1,
      requires_separate_delivery INTEGER NOT NULL DEFAULT 0,
      auto_suggested INTEGER NOT NULL DEFAULT 1,
      seller_edited INTEGER NOT NULL DEFAULT 0,
      admin_verified INTEGER NOT NULL DEFAULT 0,
      risk_flag TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS rider_capacity_profiles (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL UNIQUE,
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
      current_active_batch_count INTEGER NOT NULL DEFAULT 0,
      acceptance_rate REAL NOT NULL DEFAULT 1,
      rejection_rate REAL NOT NULL DEFAULT 0,
      response_speed_score REAL NOT NULL DEFAULT 1,
      reliability_score REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS rider_service_zones (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (zone_id) REFERENCES delivery_zones(id) ON DELETE CASCADE,
      UNIQUE(rider_id, zone_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS parent_orders (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      total_amount_kobo INTEGER NOT NULL DEFAULT 0,
      total_delivery_fee_kobo INTEGER NOT NULL DEFAULT 0,
      order_status TEXT NOT NULL DEFAULT 'order_created',
      delivery_area TEXT NOT NULL DEFAULT '',
      delivery_zone_id TEXT,
      delivery_landmark TEXT NOT NULL DEFAULT '',
      cancellation_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS parent_orders_buyer_idx ON parent_orders(buyer_id, created_at);

    CREATE TABLE IF NOT EXISTS delivery_batches (
      id TEXT PRIMARY KEY,
      parent_order_id TEXT NOT NULL,
      batch_type TEXT NOT NULL DEFAULT 'campus_market',
      source_area_id TEXT,
      source_zone_id TEXT,
      delivery_zone_id TEXT,
      market_id TEXT,
      campus_id TEXT,
      pickup_count INTEGER NOT NULL DEFAULT 0,
      total_item_count INTEGER NOT NULL DEFAULT 0,
      package_size_summary TEXT NOT NULL DEFAULT 'small',
      weight_class_summary TEXT NOT NULL DEFAULT 'light',
      fragility_summary TEXT NOT NULL DEFAULT 'not_fragile',
      required_vehicle_type TEXT NOT NULL DEFAULT 'motorcycle_or_above',
      requires_gps INTEGER NOT NULL DEFAULT 0,
      requires_photo_proof INTEGER NOT NULL DEFAULT 0,
      can_batch INTEGER NOT NULL DEFAULT 1,
      delivery_fee_kobo INTEGER NOT NULL DEFAULT 0,
      risk_level TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'batch_created',
      dispatch_status TEXT NOT NULL DEFAULT 'pending',
      assigned_rider_id TEXT,
      dispatch_attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_order_id) REFERENCES parent_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_rider_id) REFERENCES users(id) ON DELETE SET NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS delivery_batches_parent_idx ON delivery_batches(parent_order_id);
    CREATE INDEX IF NOT EXISTS delivery_batches_dispatch_idx ON delivery_batches(dispatch_status, status);

    CREATE TABLE IF NOT EXISTS pickup_tasks (
      id TEXT PRIMARY KEY,
      delivery_batch_id TEXT NOT NULL,
      order_id TEXT,
      used_order_id TEXT,
      seller_id TEXT NOT NULL,
      pickup_zone_id TEXT,
      pickup_landmark TEXT NOT NULL DEFAULT '',
      pickup_otp_hash TEXT NOT NULL DEFAULT '',
      pickup_sequence INTEGER NOT NULL DEFAULT 0,
      item_count INTEGER NOT NULL DEFAULT 0,
      package_profile_snapshot TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'seller_confirmation_pending',
      seller_confirmed_availability INTEGER NOT NULL DEFAULT 0,
      seller_marked_ready INTEGER NOT NULL DEFAULT 0,
      confirmation_deadline_at TEXT,
      seller_confirmed_at TEXT,
      seller_rejected_at TEXT,
      seller_rejection_note TEXT NOT NULL DEFAULT '',
      ready_at TEXT,
      picked_up_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (delivery_batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (used_order_id) REFERENCES used_market_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS pickup_tasks_batch_idx ON pickup_tasks(delivery_batch_id, pickup_sequence);
    CREATE INDEX IF NOT EXISTS pickup_tasks_seller_idx ON pickup_tasks(seller_id, status);

    CREATE TABLE IF NOT EXISTS delivery_tasks (
      id TEXT PRIMARY KEY,
      delivery_batch_id TEXT NOT NULL UNIQUE,
      buyer_id TEXT NOT NULL,
      delivery_zone_id TEXT,
      delivery_landmark TEXT NOT NULL DEFAULT '',
      delivery_otp_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending_pickups',
      delivered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (delivery_batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS dispatch_attempts (
      id TEXT PRIMARY KEY,
      delivery_batch_id TEXT NOT NULL,
      rider_id TEXT NOT NULL,
      dispatch_score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'offered',
      offered_at TEXT NOT NULL,
      expires_at TEXT,
      accepted_at TEXT,
      rejected_at TEXT,
      timed_out_at TEXT,
      rejection_reason TEXT NOT NULL DEFAULT '',
      attempt_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (delivery_batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS dispatch_attempts_batch_idx ON dispatch_attempts(delivery_batch_id, attempt_number);
    CREATE INDEX IF NOT EXISTS dispatch_attempts_rider_idx ON dispatch_attempts(rider_id, status);

    CREATE TABLE IF NOT EXISTS dispatch_events (
      id TEXT PRIMARY KEY,
      delivery_batch_id TEXT NOT NULL,
      dispatch_attempt_id TEXT,
      rider_id TEXT,
      event_type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (delivery_batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (dispatch_attempt_id) REFERENCES dispatch_attempts(id) ON DELETE SET NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE SET NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS batch_package_summaries (
      id TEXT PRIMARY KEY,
      delivery_batch_id TEXT NOT NULL UNIQUE,
      summary_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (delivery_batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS rider_location_events (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      zone_id TEXT,
      latitude REAL,
      longitude REAL,
      accuracy_meters REAL,
      gps_permission_status TEXT NOT NULL DEFAULT 'gps_disabled',
      source TEXT NOT NULL DEFAULT 'device_or_zone',
      created_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS seller_readiness_events (
      id TEXT PRIMARY KEY,
      pickup_task_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (pickup_task_id) REFERENCES pickup_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS delivery_proofs (
      id TEXT PRIMARY KEY,
      delivery_batch_id TEXT,
      pickup_task_id TEXT,
      delivery_task_id TEXT,
      rider_id TEXT NOT NULL,
      proof_type TEXT NOT NULL,
      proof_url TEXT,
      note TEXT NOT NULL DEFAULT '',
      latitude REAL,
      longitude REAL,
      accuracy_meters REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (delivery_batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (pickup_task_id) REFERENCES pickup_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (delivery_task_id) REFERENCES delivery_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS intervention_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      related_order_id TEXT,
      related_batch_id TEXT,
      related_user_id TEXT,
      related_seller_id TEXT,
      related_rider_id TEXT,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      assigned_admin_id TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS intervention_queue_status_idx ON intervention_queue(status, priority, created_at);

    CREATE TABLE IF NOT EXISTS reliability_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 1,
      confirmation_speed_score REAL NOT NULL DEFAULT 1,
      cancellation_score REAL NOT NULL DEFAULT 1,
      complaint_score REAL NOT NULL DEFAULT 1,
      acceptance_score REAL NOT NULL DEFAULT 1,
      delivery_score REAL NOT NULL DEFAULT 1,
      payment_score REAL NOT NULL DEFAULT 1,
      dispute_score REAL NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, role)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS availability_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      store_id TEXT,
      zone_id TEXT,
      old_status TEXT NOT NULL DEFAULT '',
      new_status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS stock_events (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      old_quantity INTEGER NOT NULL DEFAULT 0,
      new_quantity INTEGER NOT NULL DEFAULT 0,
      old_status TEXT NOT NULL DEFAULT '',
      new_status TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS substitution_options (
      id TEXT PRIMARY KEY,
      parent_order_id TEXT,
      unavailable_order_item_id TEXT,
      suggested_product_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'suggested',
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cancellation_events (
      id TEXT PRIMARY KEY,
      parent_order_id TEXT,
      order_id TEXT,
      used_order_id TEXT,
      actor_id TEXT,
      actor_role TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      status_before TEXT NOT NULL DEFAULT '',
      status_after TEXT NOT NULL DEFAULT 'cancelled',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS refund_decision_events (
      id TEXT PRIMARY KEY,
      parent_order_id TEXT,
      order_id TEXT,
      used_order_id TEXT,
      decision TEXT NOT NULL DEFAULT 'admin_review',
      reason TEXT NOT NULL DEFAULT '',
      amount_kobo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS payout_hold_events (
      id TEXT PRIMARY KEY,
      payout_id TEXT,
      parent_order_id TEXT,
      delivery_batch_id TEXT,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'on_hold',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS dispute_escalation_events (
      id TEXT PRIMARY KEY,
      dispute_id TEXT,
      parent_order_id TEXT,
      delivery_batch_id TEXT,
      level TEXT NOT NULL DEFAULT 'automated_review',
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS notification_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT NOT NULL DEFAULT '',
      event_key TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      related_order_id TEXT,
      related_batch_id TEXT,
      created_at TEXT NOT NULL
    ) STRICT;
  `);

  ensureColumn("products", "package_size", "TEXT NOT NULL DEFAULT 'small'");
  ensureColumn("products", "package_weight_class", "TEXT NOT NULL DEFAULT 'light'");
  ensureColumn("products", "fragility_level", "TEXT NOT NULL DEFAULT 'not_fragile'");
  ensureColumn("products", "handling_instructions", "TEXT NOT NULL DEFAULT '[\"normal_handling\"]'");
  ensureColumn("products", "package_shape", "TEXT NOT NULL DEFAULT 'box'");
  ensureColumn("products", "stackability", "TEXT NOT NULL DEFAULT 'stackable'");
  ensureColumn("products", "batching_eligibility", "TEXT NOT NULL DEFAULT 'can_batch'");
  ensureColumn("products", "required_vehicle_type", "TEXT NOT NULL DEFAULT 'motorcycle_or_above'");
  ensureColumn("products", "special_delivery_flags", "TEXT NOT NULL DEFAULT '[\"none\"]'");
  ensureColumn("products", "estimated_package_units", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("products", "requires_separate_delivery", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("products", "package_profile_auto_suggested", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("products", "package_profile_seller_edited", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("products", "package_profile_admin_verified", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("products", "package_profile_risk_flag", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("products", "stock_status", "TEXT NOT NULL DEFAULT 'in_stock'");
  ensureColumn("products", "delivery_readiness_type", "TEXT NOT NULL DEFAULT 'immediate'");
  ensureColumn("products", "delivery_readiness_value", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("products", "delivery_ready_after_minutes", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("products", "delivery_ready_at", "TEXT");

  ensureColumn("stores", "pickup_zone_id", "TEXT");
  ensureColumn("stores", "delivery_area", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("stores", "pickup_note", "TEXT NOT NULL DEFAULT ''");

  ensureColumn("orders", "parent_order_id", "TEXT");
  ensureColumn("orders", "delivery_batch_id", "TEXT");
  ensureColumn("orders", "pickup_task_id", "TEXT");
  ensureColumn("orders", "delivery_zone_id", "TEXT");
  ensureColumn("orders", "delivery_area", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("orders", "delivery_landmark", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("orders", "seller_confirmation_deadline_at", "TEXT");
  ensureColumn("orders", "package_ready_at", "TEXT");
  ensureColumn("orders", "auto_dispatch_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn("orders", "delivery_status", "TEXT NOT NULL DEFAULT 'order_created'");
  ensureColumn("orders", "dispatch_status", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn("orders", "seller_confirmation_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn("orders", "seller_ready_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn("orders", "seller_ready_at", "TEXT");
  ensureColumn("orders", "buyer_delivery_window_start", "TEXT");
  ensureColumn("orders", "buyer_delivery_window_end", "TEXT");
  ensureColumn("orders", "pickup_verified_at", "TEXT");
  ensureColumn("orders", "delivery_verified_at", "TEXT");
  ensureColumn("orders", "delivered_at", "TEXT");
  ensureColumn("orders", "cancelled_at", "TEXT");
  ensureColumn("orders", "seller_pickup_code_verified_at", "TEXT");
  ensureColumn("orders", "buyer_delivery_code_verified_at", "TEXT");
  ensureColumn("orders", "code_attempt_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("orders", "last_code_attempt_at", "TEXT");

  ensureColumn("delivery_batches", "manual_assignment_unlocked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("delivery_batches", "manual_assignment_unlocked_at", "TEXT");
  ensureColumn("delivery_batches", "auto_dispatch_started_at", "TEXT");
  ensureColumn("delivery_batches", "auto_dispatch_expires_at", "TEXT");
  ensureColumn("delivery_batches", "assigned_by_seller_id", "TEXT");
  ensureColumn("delivery_batches", "assigned_manually_at", "TEXT");
  ensureColumn("delivery_batches", "rider_accepted_at", "TEXT");
  ensureColumn("delivery_batches", "rider_declined_at", "TEXT");
  ensureColumn("delivery_batches", "pickup_task_id", "TEXT");
  ensureColumn("delivery_batches", "delivery_task_id", "TEXT");
  ensureColumn("pickup_tasks", "seller_pickup_code_verified_at", "TEXT");
  ensureColumn("delivery_tasks", "buyer_delivery_code_verified_at", "TEXT");
  ensureColumn("rider_assignments", "seller_pickup_code_verified_at", "TEXT");
  ensureColumn("rider_assignments", "buyer_delivery_code_verified_at", "TEXT");
  ensureColumn("rider_assignments", "code_attempt_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rider_assignments", "last_code_attempt_at", "TEXT");

  ensureColumn("used_market_orders", "parent_order_id", "TEXT");
  ensureColumn("used_market_orders", "delivery_batch_id", "TEXT");
  ensureColumn("used_market_orders", "pickup_task_id", "TEXT");
  ensureColumn("used_market_orders", "delivery_zone_id", "TEXT");
  ensureColumn("used_market_orders", "delivery_area", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("used_market_orders", "delivery_landmark", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("used_market_orders", "auto_dispatch_status", "TEXT NOT NULL DEFAULT 'not_started'");

  ensureColumn("rider_profiles", "transport_type", "TEXT NOT NULL DEFAULT 'motorcycle'");
  ensureColumn("rider_profiles", "max_package_size", "TEXT NOT NULL DEFAULT 'small_medium'");
  ensureColumn("rider_profiles", "max_weight_class", "TEXT NOT NULL DEFAULT 'up_to_medium'");
  ensureColumn("rider_profiles", "fragile_handling_ability", "TEXT NOT NULL DEFAULT 'can_handle_fragile'");
  ensureColumn("rider_profiles", "delivery_bag_type", "TEXT NOT NULL DEFAULT 'medium_delivery_bag'");
  ensureColumn("rider_profiles", "service_zone_ids", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("rider_profiles", "current_zone_id", "TEXT");
  ensureColumn("rider_profiles", "gps_permission_status", "TEXT NOT NULL DEFAULT 'gps_disabled'");
  ensureColumn("rider_profiles", "availability_mode", "TEXT NOT NULL DEFAULT 'offline'");
  ensureColumn("rider_profiles", "last_known_latitude", "REAL");
  ensureColumn("rider_profiles", "last_known_longitude", "REAL");
  ensureColumn("rider_profiles", "last_known_accuracy", "REAL");
  ensureColumn("rider_profiles", "last_known_at", "TEXT");
  ensureColumn("rider_profiles", "can_receive_auto_dispatch", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("rider_profiles", "capacity_locked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rider_profiles", "capacity_change_unlocked_until", "TEXT");
  ensureColumn("rider_profiles", "current_active_batch_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rider_profiles", "acceptance_rate", "REAL NOT NULL DEFAULT 1");
  ensureColumn("rider_profiles", "rejection_rate", "REAL NOT NULL DEFAULT 0");
  ensureColumn("rider_profiles", "response_speed_score", "REAL NOT NULL DEFAULT 1");
  ensureColumn("rider_profiles", "reliability_score", "REAL NOT NULL DEFAULT 1");
  ensureColumn("rider_capacity_profiles", "capacity_locked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rider_capacity_profiles", "capacity_change_unlocked_until", "TEXT");

  ensureColumn("rider_assignments", "delivery_batch_id", "TEXT");
  ensureColumn("rider_assignments", "pickup_task_id", "TEXT");

  const defaultZones = [
    { id: "zone_fupre", name: "FUPRE Campus", zoneType: "campus", baseDeliveryFeeKobo: 70000 },
    { id: "zone_fupre_main_gate", name: "Main Gate", parentAreaId: "zone_fupre", zoneType: "campus", baseDeliveryFeeKobo: 70000 },
    { id: "zone_fupre_hostel", name: "Hostel Area", parentAreaId: "zone_fupre", zoneType: "campus", baseDeliveryFeeKobo: 75000 },
    { id: "zone_fupre_engineering", name: "Engineering Area", parentAreaId: "zone_fupre", zoneType: "campus", baseDeliveryFeeKobo: 80000 },
    { id: "zone_igbudu_market", name: "Igbudu Market", zoneType: "local_market", baseDeliveryFeeKobo: 90000 },
    { id: "zone_igbudu_phone", name: "Phone Accessories Line", parentAreaId: "zone_igbudu_market", zoneType: "local_market", baseDeliveryFeeKobo: 90000 },
    { id: "zone_igbudu_beauty", name: "Beauty/Hair Section", parentAreaId: "zone_igbudu_market", zoneType: "local_market", baseDeliveryFeeKobo: 90000 },
    { id: "zone_igbudu_fashion", name: "Fashion Line", parentAreaId: "zone_igbudu_market", zoneType: "local_market", baseDeliveryFeeKobo: 90000 },
    { id: "zone_ugbomro", name: "Ugbomro", zoneType: "nearby_area", baseDeliveryFeeKobo: 85000 },
    { id: "zone_jakpa", name: "Jakpa", zoneType: "nearby_area", baseDeliveryFeeKobo: 100000 },
    { id: "zone_okha", name: "Okha", zoneType: "nearby_area", baseDeliveryFeeKobo: 95000 },
    { id: "zone_effurun", name: "Effurun", zoneType: "general_area", baseDeliveryFeeKobo: 110000 },
  ];

  defaultZones.forEach(seedDeliveryZone);

  [
    {
      id: "pkg_phone_accessories",
      categoryKey: "phone-accessories",
      categoryName: "Phone Accessories",
      packageSize: "small",
      packageWeightClass: "light",
      fragilityLevel: "not_fragile",
      packageShape: "envelope_or_small_pack",
      stackability: "stackable",
      batchingEligibility: "can_batch",
      requiredVehicleType: "any",
    },
    {
      id: "pkg_perfume",
      categoryKey: "perfume",
      categoryName: "Perfume",
      packageSize: "small",
      packageWeightClass: "light",
      fragilityLevel: "fragile",
      handlingInstructions: ["keep_upright", "handle_with_care"],
      packageShape: "bottle_or_container",
      stackability: "stack_only_with_light_items",
      batchingEligibility: "batch_only_with_light_items",
      requiredVehicleType: "motorcycle_or_above",
      specialDeliveryFlags: ["fragile"],
      riskLevel: "medium",
    },
    {
      id: "pkg_laptop",
      categoryKey: "laptop",
      categoryName: "Laptop",
      packageSize: "medium",
      packageWeightClass: "medium",
      fragilityLevel: "fragile",
      handlingInstructions: ["handle_with_care", "keep_dry"],
      packageShape: "box",
      stackability: "not_stackable",
      batchingEligibility: "separate_delivery_required",
      requiredVehicleType: "motorcycle_or_above",
      specialDeliveryFlags: ["high_value", "fragile"],
      requiresSeparateDelivery: true,
      riskLevel: "high",
      adminReviewRequired: true,
    },
    {
      id: "pkg_furniture",
      categoryKey: "furniture",
      categoryName: "Furniture",
      packageSize: "large",
      packageWeightClass: "heavy",
      fragilityLevel: "not_fragile",
      packageShape: "bulky_item",
      stackability: "not_stackable",
      batchingEligibility: "separate_delivery_required",
      requiredVehicleType: "tricycle_or_above",
      specialDeliveryFlags: ["bulky"],
      estimatedPackageUnits: 4,
      requiresSeparateDelivery: true,
      riskLevel: "medium",
    },
    {
      id: "pkg_mattress",
      categoryKey: "mattress",
      categoryName: "Mattress",
      packageSize: "extra_large",
      packageWeightClass: "heavy",
      fragilityLevel: "not_fragile",
      packageShape: "bulky_item",
      stackability: "not_stackable",
      batchingEligibility: "separate_delivery_required",
      requiredVehicleType: "car_or_van_required",
      specialDeliveryFlags: ["bulky"],
      estimatedPackageUnits: 5,
      requiresSeparateDelivery: true,
      riskLevel: "medium",
    },
    {
      id: "pkg_books",
      categoryKey: "books",
      categoryName: "Books",
      packageSize: "small",
      packageWeightClass: "light",
      fragilityLevel: "not_fragile",
      packageShape: "box",
      stackability: "stackable",
      batchingEligibility: "can_batch",
      requiredVehicleType: "any",
    },
    {
      id: "pkg_food",
      categoryKey: "food",
      categoryName: "Food",
      packageSize: "small",
      packageWeightClass: "light",
      fragilityLevel: "not_fragile",
      handlingInstructions: ["keep_upright"],
      packageShape: "bottle_or_container",
      stackability: "stack_only_with_light_items",
      batchingEligibility: "batch_only_with_light_items",
      requiredVehicleType: "motorcycle_or_above",
      specialDeliveryFlags: ["perishable", "requires_fast_delivery"],
      riskLevel: "medium",
    },
  ].forEach(seedPackageRule);
}

runLogisticsMigrations();
