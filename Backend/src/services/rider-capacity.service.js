import { db } from "../db/database.js";

export const MAX_INCOMPLETE_DISPATCHES = 14;

export const INCOMPLETE_DISPATCH_STATUSES = Object.freeze([
  "assigned",
  "accepted",
  "arrived_pickup",
  "picked_up",
  "out_for_delivery",
]);

export function lockRiderCapacity(riderId) {
  if (!riderId) return;
  // A no-op update acquires a rider-profile row lock in PostgreSQL and keeps
  // SQLite's immediate transaction behaviour, serializing capacity decisions.
  db.prepare("UPDATE rider_profiles SET updated_at = updated_at WHERE user_id = ?").run(riderId);
}

export function activeDispatchCount(riderId) {
  if (!riderId) return 0;

  const placeholders = INCOMPLETE_DISPATCH_STATUSES.map(() => "?").join(",");
  return Number(
    db.prepare(`
      SELECT COUNT(DISTINCT COALESCE(delivery_batch_id, id)) AS count
      FROM rider_assignments
      WHERE rider_id = ?
        AND status IN (${placeholders})
    `).get(riderId, ...INCOMPLETE_DISPATCH_STATUSES)?.count || 0,
  );
}

export function hasRiderCapacity(riderId, { allowAssignmentId = "" } = {}) {
  const activeCount = activeDispatchCount(riderId);
  if (activeCount < MAX_INCOMPLETE_DISPATCHES) return true;

  if (allowAssignmentId) {
    const assignment = db.prepare(`
      SELECT delivery_batch_id, status
      FROM rider_assignments
      WHERE id = ? AND rider_id = ?
    `).get(allowAssignmentId, riderId);

    if (
      assignment &&
      INCOMPLETE_DISPATCH_STATUSES.includes(assignment.status) &&
      activeCount === MAX_INCOMPLETE_DISPATCHES
    ) {
      return true;
    }
  }

  return false;
}
