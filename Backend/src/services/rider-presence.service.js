import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";

function nowIso() {
  return new Date().toISOString();
}

function riderIdFromAuth(auth) {
  if (!auth || auth.role !== "rider") return "";
  return auth.user_id || auth.id || "";
}

function sessionIdFromAuth(auth) {
  return String(auth?.session_id || "");
}

function presenceCutoff(now = Date.now()) {
  const timeoutMs = Math.max(30000, Number(env.riderPresenceTimeoutMs || 75000));
  return new Date(now - timeoutMs).toISOString();
}

function activePresenceExists(riderId, cutoff = presenceCutoff()) {
  if (!riderId) return false;
  return Boolean(
    db.prepare(`
      SELECT 1
      FROM rider_presence_sessions
      WHERE rider_id = ?
        AND status = 'online'
        AND last_heartbeat_at > ?
      LIMIT 1
    `).get(riderId, cutoff),
  );
}

function syncRiderAvailability(riderId, now = nowIso()) {
  if (!riderId) return "offline";
  const online = activePresenceExists(riderId);
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

export function markRiderPresenceOnline(userId, sessionId) {
  if (!userId || !sessionId) return "offline";
  const now = nowIso();

  transaction(() => {
    db.prepare(`
      INSERT INTO rider_presence_sessions (
        session_id, rider_id, status, last_heartbeat_at, created_at, updated_at
      ) VALUES (?, ?, 'online', ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        rider_id = excluded.rider_id,
        status = 'online',
        last_heartbeat_at = excluded.last_heartbeat_at,
        updated_at = excluded.updated_at
    `).run(sessionId, userId, now, now, now);

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

export function heartbeatRiderPresence(auth) {
  const riderId = riderIdFromAuth(auth);
  const sessionId = sessionIdFromAuth(auth);
  if (!riderId || !sessionId) return "offline";
  return markRiderPresenceOnline(riderId, sessionId);
}

export function markRiderPresenceOffline(userId, sessionId) {
  if (!userId) return "offline";
  const now = nowIso();

  transaction(() => {
    if (sessionId) {
      db.prepare(`
        UPDATE rider_presence_sessions
        SET status = 'offline', updated_at = ?
        WHERE session_id = ? AND rider_id = ?
      `).run(now, sessionId, userId);
    } else {
      db.prepare(`
        UPDATE rider_presence_sessions
        SET status = 'offline', updated_at = ?
        WHERE rider_id = ?
      `).run(now, userId);
    }

    syncRiderAvailability(userId, now);
  });

  return "offline";
}

export function markAuthenticatedRiderOffline(auth) {
  const riderId = riderIdFromAuth(auth);
  if (!riderId) return "offline";
  return markRiderPresenceOffline(riderId, sessionIdFromAuth(auth));
}

export function expireStaleRiderPresence(now = Date.now()) {
  const timestamp = new Date(now).toISOString();
  const cutoff = presenceCutoff(now);

  return transaction(() => {
    const expired = db.prepare(`
      UPDATE rider_presence_sessions
      SET status = 'offline', updated_at = ?
      WHERE status = 'online'
        AND last_heartbeat_at <= ?
    `).run(timestamp, cutoff);

    const staleProfiles = db.prepare(`
      UPDATE rider_profiles
      SET availability = 'offline',
          availability_mode = 'offline',
          updated_at = ?
      WHERE availability != 'offline'
        AND NOT EXISTS (
          SELECT 1
          FROM rider_presence_sessions
          WHERE rider_presence_sessions.rider_id = rider_profiles.user_id
            AND rider_presence_sessions.status = 'online'
            AND rider_presence_sessions.last_heartbeat_at > ?
        )
    `).run(timestamp, cutoff);

    return {
      expiredSessions: Number(expired.changes || 0),
      ridersMarkedOffline: Number(staleProfiles.changes || 0),
    };
  });
}

export function isRiderPresenceOnline(row, now = Date.now()) {
  if (!row || row.availability !== "online") return false;
  const lastPresenceAt = row.last_presence_at || row.lastPresenceAt;
  if (!lastPresenceAt) return false;
  const lastPresenceMs = new Date(lastPresenceAt).getTime();
  const timeoutMs = Math.max(30000, Number(env.riderPresenceTimeoutMs || 75000));
  return Number.isFinite(lastPresenceMs) &&
    now - lastPresenceMs <= timeoutMs;
}

export function startRiderPresenceMonitor() {
  expireStaleRiderPresence();
  const interval = setInterval(
    () => expireStaleRiderPresence(),
    Math.max(10000, Number(env.riderPresenceSweepMs || 25000)),
  );
  interval.unref?.();
  return () => clearInterval(interval);
}
