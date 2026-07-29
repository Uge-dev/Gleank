import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";

function nowIso() {
  return new Date().toISOString();
}

function riderIdFromAuth(auth) {
  if (!auth || auth.role !== "rider") return "";
  return auth.user_id || auth.id || "";
}

function authSessionId(auth) {
  return String(auth?.session_id || "");
}

function cleanPresenceSessionId(value) {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(candidate) ? candidate : "";
}

function sessionIdFromAuth(auth, presenceSessionId = "") {
  const sessionId = authSessionId(auth);
  const clientSessionId = cleanPresenceSessionId(presenceSessionId);
  return sessionId && clientSessionId
    ? `${sessionId}:${clientSessionId}`
    : sessionId;
}

function presenceCutoff(now = Date.now()) {
  const timeoutMs = Math.max(30000, Number(env.riderPresenceTimeoutMs || 75000));
  return new Date(now - timeoutMs).toISOString();
}

function activePresenceExists(
  riderId,
  cutoff = presenceCutoff(),
  timestamp = nowIso(),
) {
  if (!riderId) return false;
  return Boolean(
    db.prepare(`
      SELECT 1
      FROM rider_presence_instances AS presence
      JOIN sessions
        ON sessions.id = presence.auth_session_id
      WHERE presence.rider_id = ?
        AND presence.status = 'online'
        AND presence.last_heartbeat_at > ?
        AND sessions.user_id = presence.rider_id
        AND sessions.revoked_at IS NULL
        AND sessions.expires_at > ?
      LIMIT 1
    `).get(riderId, cutoff, timestamp),
  );
}

function syncRiderAvailability(riderId, now = nowIso()) {
  if (!riderId) return "offline";
  const online = activePresenceExists(riderId, presenceCutoff(), now);
  db.prepare(`
    UPDATE rider_profiles
    SET availability = ?,
        availability_mode = CASE
          WHEN ? = 'online' AND gps_permission_status = 'gps_enabled' THEN 'online_gps_active'
          WHEN ? = 'online' THEN 'online_zone_only'
          ELSE 'offline'
        END,
        updated_at = CASE
          WHEN availability != ? THEN ?
          ELSE updated_at
        END
    WHERE user_id = ?
  `).run(
    online ? "online" : "offline",
    online ? "online" : "offline",
    online ? "online" : "offline",
    online ? "online" : "offline",
    now,
    riderId,
  );
  return online ? "online" : "offline";
}

export function markRiderPresenceOnline(
  userId,
  authSessionId,
  presenceId = authSessionId,
) {
  if (!userId || !authSessionId || !presenceId) return "offline";
  const now = nowIso();
  const activeSession = db.prepare(`
    SELECT 1
    FROM sessions
    WHERE id = ?
      AND user_id = ?
      AND revoked_at IS NULL
      AND expires_at > ?
    LIMIT 1
  `).get(authSessionId, userId, now);
  if (!activeSession) return "offline";

  transaction(() => {
    db.prepare(`
      INSERT INTO rider_presence_instances (
        presence_id, auth_session_id, rider_id, status,
        last_heartbeat_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'online', ?, ?, ?)
      ON CONFLICT(presence_id) DO UPDATE SET
        auth_session_id = excluded.auth_session_id,
        rider_id = excluded.rider_id,
        status = 'online',
        last_heartbeat_at = excluded.last_heartbeat_at,
        updated_at = excluded.updated_at
    `).run(presenceId, authSessionId, userId, now, now, now);

    db.prepare(`
      UPDATE rider_profiles
      SET availability = 'online',
          availability_mode = CASE
            WHEN gps_permission_status = 'gps_enabled' THEN 'online_gps_active'
            ELSE 'online_zone_only'
          END,
          last_presence_at = ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(now, now, userId);
  });

  return "online";
}

export function heartbeatRiderPresence(auth, input = {}) {
  const riderId = riderIdFromAuth(auth);
  const baseSessionId = authSessionId(auth);
  const presenceId = sessionIdFromAuth(auth, input.presenceSessionId);
  if (!riderId || !baseSessionId || !presenceId) return "offline";
  const status = markRiderPresenceOnline(
    riderId,
    baseSessionId,
    presenceId,
  );

  // Login/session restore creates a short-lived base presence entry so the
  // rider becomes online immediately. Once a browser tab starts heartbeating,
  // retire that base entry and let each visible tab own its own presence.
  if (presenceId !== baseSessionId) {
    markRiderPresenceOffline(riderId, baseSessionId);
  }

  return status;
}

export function markRiderPresenceOffline(userId, sessionId) {
  if (!userId) return "offline";
  const now = nowIso();

  transaction(() => {
    if (sessionId) {
      db.prepare(`
        UPDATE rider_presence_instances
        SET status = 'offline', updated_at = ?
        WHERE presence_id = ? AND rider_id = ?
      `).run(now, sessionId, userId);
    } else {
      db.prepare(`
        UPDATE rider_presence_instances
        SET status = 'offline', updated_at = ?
        WHERE rider_id = ?
      `).run(now, userId);
    }

    syncRiderAvailability(userId, now);
  });

  return "offline";
}

export function markAuthenticatedRiderOffline(auth, input = {}) {
  const riderId = riderIdFromAuth(auth);
  if (!riderId) return "offline";
  if (input.allSessions) {
    return markRiderPresenceOffline(riderId, "");
  }
  return markRiderPresenceOffline(
    riderId,
    sessionIdFromAuth(auth, input.presenceSessionId),
  );
}

export function expireStaleRiderPresence(now = Date.now()) {
  const timestamp = new Date(now).toISOString();
  const cutoff = presenceCutoff(now);

  return transaction(() => {
    const expired = db.prepare(`
      UPDATE rider_presence_instances AS presence
      SET status = 'offline', updated_at = ?
      WHERE presence.status = 'online'
        AND (
          presence.last_heartbeat_at <= ?
          OR NOT EXISTS (
            SELECT 1
            FROM sessions
            WHERE sessions.id = presence.auth_session_id
              AND sessions.user_id = presence.rider_id
              AND sessions.revoked_at IS NULL
              AND sessions.expires_at > ?
          )
        )
    `).run(timestamp, cutoff, timestamp);

    const staleProfiles = db.prepare(`
      UPDATE rider_profiles
      SET availability = 'offline',
          availability_mode = 'offline',
          updated_at = ?
      WHERE availability != 'offline'
        AND NOT EXISTS (
          SELECT 1
          FROM rider_presence_instances AS presence
          JOIN sessions
            ON sessions.id = presence.auth_session_id
          WHERE presence.rider_id = rider_profiles.user_id
            AND presence.status = 'online'
            AND presence.last_heartbeat_at > ?
            AND sessions.user_id = presence.rider_id
            AND sessions.revoked_at IS NULL
            AND sessions.expires_at > ?
        )
    `).run(timestamp, cutoff, timestamp);

    return {
      expiredSessions: Number(expired.changes || 0),
      ridersMarkedOffline: Number(staleProfiles.changes || 0),
    };
  });
}

export function isRiderPresenceOnline(row, now = Date.now()) {
  const riderId =
    row?.rider_id ||
    row?.riderId ||
    row?.user_id ||
    row?.userId ||
    "";
  if (!riderId) return false;
  return activePresenceExists(
    riderId,
    presenceCutoff(now),
    new Date(now).toISOString(),
  );
}

export function normalizeRiderPresenceState(now = Date.now()) {
  const timestamp = new Date(now).toISOString();
  const legacy = db.prepare(`
    UPDATE rider_profiles
    SET availability = 'offline',
        availability_mode = 'offline',
        updated_at = ?
    WHERE availability IS NULL
       OR availability NOT IN ('online', 'offline')
       OR availability_mode = 'busy'
  `).run(timestamp);

  const expired = expireStaleRiderPresence(now);
  const activeRiders = db.prepare(`
    SELECT DISTINCT presence.rider_id
    FROM rider_presence_instances AS presence
    JOIN sessions
      ON sessions.id = presence.auth_session_id
    WHERE presence.status = 'online'
      AND presence.last_heartbeat_at > ?
      AND sessions.user_id = presence.rider_id
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
  `).all(presenceCutoff(now), timestamp);

  for (const row of activeRiders) {
    syncRiderAvailability(row.rider_id, timestamp);
  }

  return {
    legacyStatusesRemoved: Number(legacy.changes || 0),
    ...expired,
    activeRiders: activeRiders.length,
  };
}

export function startRiderPresenceMonitor() {
  normalizeRiderPresenceState();
  const interval = setInterval(
    () => expireStaleRiderPresence(),
    Math.max(10000, Number(env.riderPresenceSweepMs || 25000)),
  );
  interval.unref?.();
  return () => clearInterval(interval);
}
