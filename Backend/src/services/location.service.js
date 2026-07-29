import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireRole(auth, roles) {
  if (!auth) throw new HttpError(401, "Please log in to continue.");
  if (!roles.includes(auth.role)) throw new HttpError(403, "You do not have access to this location action.");
  return auth.user_id || auth.id;
}

function canUseGeoapify() {
  return env.mapProvider === "geoapify" && Boolean(env.geoapifyApiKey);
}

function fallbackLocation(input = {}) {
  return {
    provider: "manual",
    formattedAddress: clean(input.address || input.text || input.label || input.area, 500),
    address: clean(input.address || input.text || "", 500),
    area: clean(input.area || input.city || input.campus, 160),
    campus: clean(input.campus, 120),
    lat: numberOrNull(input.lat),
    lng: numberOrNull(input.lng || input.lon),
    confidence: 0,
    raw: null,
  };
}

function serializeLocation(row, type = "delivery") {
  if (!row) return null;
  return {
    id: row.id,
    type,
    label: row.label || "",
    address: row.address || "",
    area: row.area || "",
    campus: row.campus || "",
    landmark: row.landmark || "",
    marketId: row.market_id || null,
    marketName: row.market_name || "",
    shopNumber: row.shop_number || "",
    shopSection: row.shop_section || "",
    pickupInstruction: row.pickup_instruction || "",
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    source: row.source || "manual",
    isDefault: row.is_default !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePresence(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    role: row.role,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    accuracyMeters: row.accuracy_meters ?? null,
    permissionStatus: row.permission_status || "unknown",
    source: row.source || "browser_login",
    capturedAt: row.captured_at || null,
    updatedAt: row.updated_at,
  };
}

export function getAccountLocationPresence(userId) {
  return serializePresence(
    db.prepare("SELECT * FROM account_location_presence WHERE user_id = ?").get(userId),
  );
}

export function upsertAccountLocationPresence(auth, input = {}) {
  const userId = requireRole(auth, ["buyer", "seller", "rider"]);
  const role = auth.role;
  const permissionStatus = clean(input.permissionStatus || input.permission, 40).toLowerCase();
  if (!["prompt", "granted", "denied", "unavailable"].includes(permissionStatus)) {
    throw new HttpError(422, "Choose a valid browser location permission status.");
  }

  const location = input.currentLocation || input.location || input;
  const lat = numberOrNull(location.lat);
  const lng = numberOrNull(location.lng || location.lon);
  if (permissionStatus === "granted" && (lat === null || lng === null)) {
    throw new HttpError(422, "Latitude and longitude are required after location permission is granted.");
  }

  const now = nowIso();
  db.prepare(`
    INSERT INTO account_location_presence (
      user_id, role, lat, lng, accuracy_meters, permission_status,
      source, captured_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      role = excluded.role,
      lat = CASE WHEN excluded.permission_status = 'granted' THEN excluded.lat ELSE account_location_presence.lat END,
      lng = CASE WHEN excluded.permission_status = 'granted' THEN excluded.lng ELSE account_location_presence.lng END,
      accuracy_meters = CASE
        WHEN excluded.permission_status = 'granted' THEN excluded.accuracy_meters
        ELSE account_location_presence.accuracy_meters
      END,
      permission_status = excluded.permission_status,
      source = excluded.source,
      captured_at = CASE
        WHEN excluded.permission_status = 'granted' THEN excluded.captured_at
        ELSE account_location_presence.captured_at
      END,
      updated_at = excluded.updated_at
  `).run(
    userId,
    role,
    lat,
    lng,
    numberOrNull(location.accuracyMeters || location.accuracy),
    permissionStatus,
    clean(input.source || "browser_login", 40),
    permissionStatus === "granted" ? now : null,
    now,
  );

  if (role === "rider" && permissionStatus === "granted") {
    upsertRiderLocation(auth, {
      currentLocation: {
        lat,
        lng,
        accuracyMeters: numberOrNull(location.accuracyMeters || location.accuracy),
        source: "browser_login",
      },
    });
  }

  return {
    presence: getAccountLocationPresence(userId),
    routingReady: permissionStatus === "granted" && lat !== null && lng !== null,
  };
}

async function fetchGeoapify(path, params) {
  if (!canUseGeoapify()) return null;

  const url = new URL(`${env.geoapifyBaseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("apiKey", env.geoapifyApiKey);

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function geoFeatureToLocation(feature, input = {}) {
  const props = feature?.properties || {};
  return {
    provider: "geoapify",
    formattedAddress: props.formatted || props.address_line1 || fallbackLocation(input).formattedAddress,
    address: props.formatted || props.address_line1 || clean(input.text || input.address, 500),
    area: props.suburb || props.district || props.city || props.county || clean(input.area, 160),
    campus: clean(input.campus, 120),
    lat: numberOrNull(props.lat ?? feature?.geometry?.coordinates?.[1]),
    lng: numberOrNull(props.lon ?? feature?.geometry?.coordinates?.[0]),
    confidence: Number(props.rank?.confidence || 0),
    raw: feature,
  };
}

export async function geocodeLocation(input = {}) {
  const text = clean(input.text || input.address || input.query, 500);
  if (!text) throw new HttpError(422, "Enter an address or area to search.");

  const data = await fetchGeoapify("/geocode/search", {
    text,
    country: clean(input.country || "Nigeria", 80),
    limit: input.limit || 5,
    lang: "en",
  });

  const features = Array.isArray(data?.features) ? data.features : [];

  if (features.length === 0) {
    return {
      provider: canUseGeoapify() ? "geoapify" : "manual",
      fallback: true,
      results: [fallbackLocation({ ...input, text })],
    };
  }

  return {
    provider: "geoapify",
    fallback: false,
    results: features.map((feature) => geoFeatureToLocation(feature, input)),
  };
}

export async function reverseGeocodeLocation(input = {}) {
  const lat = numberOrNull(input.lat);
  const lng = numberOrNull(input.lng || input.lon);
  if (lat === null || lng === null) throw new HttpError(422, "Latitude and longitude are required.");

  const data = await fetchGeoapify("/geocode/reverse", {
    lat,
    lon: lng,
    limit: 1,
    lang: "en",
  });

  const feature = Array.isArray(data?.features) ? data.features[0] : null;

  return {
    provider: feature ? "geoapify" : "manual",
    fallback: !feature,
    location: feature
      ? geoFeatureToLocation(feature, input)
      : fallbackLocation({ ...input, lat, lng }),
  };
}

export function upsertSellerPickupLocation(auth, input = {}) {
  const sellerId = requireRole(auth, ["seller", "admin"]);
  const existingStore = db.prepare("SELECT * FROM stores WHERE owner_id = ?").get(sellerId);
  if (!existingStore) throw new HttpError(404, "Seller store was not found.");

  const now = nowIso();
  const existing = db
    .prepare("SELECT * FROM seller_pickup_locations WHERE seller_id = ? AND is_default = 1 LIMIT 1")
    .get(sellerId);
  const id = existing?.id || createId("spl");
  const lat = numberOrNull(input.lat || input.pickupLat);
  const lng = numberOrNull(input.lng || input.lon || input.pickupLng);

  if (existing) {
    db.prepare(`
      UPDATE seller_pickup_locations
      SET store_id = ?,
          label = ?,
          address = ?,
          area = ?,
          campus = ?,
          market_id = ?,
          market_name = ?,
          shop_number = ?,
          shop_section = ?,
          pickup_instruction = ?,
          lat = ?,
          lng = ?,
          source = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      existingStore.id,
      clean(input.label || "Default pickup", 120),
      clean(input.address || input.pickupLocation, 500),
      clean(input.area || input.locationArea, 180),
      clean(input.campus || existingStore.campus, 120),
      clean(input.marketId, 140) || null,
      clean(input.marketName, 180),
      clean(input.shopNumber || input.shopStallNumber, 80),
      clean(input.shopSection || input.marketSection, 120),
      clean(input.pickupInstruction || input.instructions, 500),
      lat,
      lng,
      clean(input.source || "manual", 40),
      now,
      id,
    );
  } else {
    db.prepare(`
      INSERT INTO seller_pickup_locations (
        id, seller_id, store_id, label, address, area, campus, market_id,
        market_name, shop_number, shop_section, pickup_instruction,
        lat, lng, source, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      sellerId,
      existingStore.id,
      clean(input.label || "Default pickup", 120),
      clean(input.address || input.pickupLocation, 500),
      clean(input.area || input.locationArea, 180),
      clean(input.campus || existingStore.campus, 120),
      clean(input.marketId, 140) || null,
      clean(input.marketName, 180),
      clean(input.shopNumber || input.shopStallNumber, 80),
      clean(input.shopSection || input.marketSection, 120),
      clean(input.pickupInstruction || input.instructions, 500),
      lat,
      lng,
      clean(input.source || "manual", 40),
      now,
      now,
    );
  }

  db.prepare(`
    UPDATE stores
    SET pickup_location = ?,
        pickup_address = ?,
        location_area = ?,
        campus = COALESCE(NULLIF(?, ''), campus),
        pickup_lat = ?,
        pickup_lng = ?,
        shop_number = ?,
        market_section = ?,
        pickup_instruction = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    clean(input.address || input.pickupLocation, 500),
    clean(input.address || input.pickupLocation, 500),
    clean(input.area || input.locationArea, 180),
    clean(input.campus, 120),
    lat,
    lng,
    clean(input.shopNumber || input.shopStallNumber, 80),
    clean(input.shopSection || input.marketSection, 120),
    clean(input.pickupInstruction || input.instructions, 500),
    now,
    existingStore.id,
  );

  return {
    location: serializeLocation(
      db.prepare("SELECT * FROM seller_pickup_locations WHERE id = ?").get(id),
      "seller_pickup",
    ),
  };
}

export function getSellerPickupLocation(auth) {
  const sellerId = requireRole(auth, ["seller", "admin"]);
  const row = db
    .prepare("SELECT * FROM seller_pickup_locations WHERE seller_id = ? AND is_default = 1 LIMIT 1")
    .get(sellerId);
  return { location: serializeLocation(row, "seller_pickup") };
}

export function createBuyerDeliveryLocation(auth, input = {}) {
  const buyerId = requireRole(auth, ["buyer", "seller", "rider", "admin"]);
  const now = nowIso();
  const id = createId("dlv_loc");
  const isDefault = input.isDefault === true || input.isDefault === "true" || input.is_default === 1;

  if (isDefault) {
    db.prepare("UPDATE delivery_locations SET is_default = 0 WHERE buyer_id = ?").run(buyerId);
  }

  db.prepare(`
    INSERT INTO delivery_locations (
      id, buyer_id, label, address, area, campus, landmark,
      lat, lng, source, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    buyerId,
    clean(input.label || "Delivery location", 120),
    clean(input.address, 500),
    clean(input.area, 180),
    clean(input.campus, 120),
    clean(input.landmark, 240),
    numberOrNull(input.lat),
    numberOrNull(input.lng || input.lon),
    clean(input.source || "manual", 40),
    isDefault ? 1 : 0,
    now,
    now,
  );

  return {
    location: serializeLocation(
      db.prepare("SELECT * FROM delivery_locations WHERE id = ?").get(id),
      "delivery",
    ),
  };
}

export function listBuyerDeliveryLocations(auth) {
  const buyerId = requireRole(auth, ["buyer", "seller", "rider", "admin"]);
  return {
    locations: db
      .prepare("SELECT * FROM delivery_locations WHERE buyer_id = ? ORDER BY is_default DESC, created_at DESC")
      .all(buyerId)
      .map((row) => serializeLocation(row, "delivery")),
  };
}

export function upsertRiderLocation(auth, input = {}) {
  const riderId = requireRole(auth, ["rider", "admin"]);
  const location = input.currentLocation || input.location || input;
  const lat = numberOrNull(location.lat);
  const lng = numberOrNull(location.lng || location.lon);
  if (lat === null || lng === null) throw new HttpError(422, "Latitude and longitude are required.");

  const now = nowIso();
  const id = createId("rdloc");

  db.prepare("UPDATE rider_locations SET is_current = 0 WHERE rider_id = ?").run(riderId);
  db.prepare(`
    INSERT INTO rider_locations (
      id, rider_id, lat, lng, accuracy_meters, address, area, zone,
      source, is_current, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    riderId,
    lat,
    lng,
    numberOrNull(location.accuracyMeters || location.accuracy),
    clean(location.address || input.address, 500),
    clean(location.area || input.area, 180),
    clean(location.zone || input.zone, 120),
    clean(location.source || input.source || "gps", 40),
    now,
  );

  db.prepare(`
    UPDATE rider_profiles
    SET current_lat = ?,
        current_lng = ?,
        current_accuracy_meters = ?,
        last_location_at = ?,
        gps_permission_status = 'gps_enabled',
        availability_mode = CASE
          WHEN availability = 'online' THEN 'online_gps_active'
          ELSE availability_mode
        END,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    lat,
    lng,
    numberOrNull(location.accuracyMeters || location.accuracy),
    now,
    now,
    riderId,
  );

  return getRiderLocationStatus(auth);
}

export function getRiderLocationStatus(auth) {
  const riderId = requireRole(auth, ["rider", "admin"]);
  const profile = db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(riderId);
  const row = db
    .prepare("SELECT * FROM rider_locations WHERE rider_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1")
    .get(riderId);

  return {
    online:
      profile?.availability === "online" &&
      Boolean(row?.lat || profile?.current_lat),
    availability: profile?.availability || "offline",
    availabilityMode: profile?.availability_mode || "offline",
    gpsPermissionStatus: profile?.gps_permission_status || "gps_disabled",
    location: row
      ? {
          id: row.id,
          lat: row.lat ?? null,
          lng: row.lng ?? null,
          accuracyMeters: row.accuracy_meters ?? null,
          address: row.address || "",
          area: row.area || "",
          zone: row.zone || "",
          source: row.source || "gps",
          createdAt: row.created_at,
        }
      : null,
    lastLocationAt: row?.created_at || profile?.last_location_at || null,
  };
}
