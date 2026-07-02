import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";

const NOTIFICATION_TYPES = new Set([
  "order",
  "message",
  "seller",
  "product",
  "like",
  "admin",
  "used_market",
]);

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function typeOrFallback(value) {
  return NOTIFICATION_TYPES.has(value) ? value : "admin";
}

function serializeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.body || "",
    actionLabel: row.action_label || "Open",
    actionPath: row.action_path || "/",
    imageUrl: row.image_url || null,
    unread: !row.is_read,
    readAt: row.read_at || null,
    createdAt: row.created_at,
  };
}

export function createNotification(input) {
  const userId = clean(input?.userId, 140);
  const title = clean(input?.title, 160);
  const body = clean(input?.body, 900);

  if (!userId || !title) return null;

  const now = new Date().toISOString();
  const id = createId("ntf");

  db.prepare(`
    INSERT INTO notifications (
      id, user_id, type, title, body, action_label, action_path,
      image_url, is_read, read_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `).run(
    id,
    userId,
    typeOrFallback(input?.type),
    title,
    body,
    clean(input?.actionLabel || "Open", 80),
    clean(input?.actionPath || "/", 240),
    clean(input?.imageUrl || "", 500) || null,
    now,
  );

  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
}

export function createNotificationForUsers(userIds, input) {
  const uniqueIds = [...new Set((userIds || []).map((id) => clean(id, 140)).filter(Boolean))];
  return uniqueIds
    .map((userId) => createNotification({ ...input, userId }))
    .filter(Boolean)
    .map(serializeNotification);
}

export function listNotifications(userId) {
  const notifications = db
    .prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 120
    `)
    .all(userId)
    .map(serializeNotification);

  const unreadCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
    `)
    .get(userId).count;

  return {
    notifications,
    unreadCount: Number(unreadCount || 0),
  };
}

export function getNotificationUnreadCount(userId) {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
    `)
    .get(userId);

  return Number(row?.count || 0);
}

export function markNotificationRead(userId, notificationId) {
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      UPDATE notifications
      SET is_read = 1, read_at = COALESCE(read_at, ?)
      WHERE id = ? AND user_id = ?
    `)
    .run(now, notificationId, userId);

  if (!result.changes) throw new HttpError(404, "Notification was not found.");
  return listNotifications(userId);
}

export function markAllNotificationsRead(userId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE notifications
    SET is_read = 1, read_at = COALESCE(read_at, ?)
    WHERE user_id = ? AND is_read = 0
  `).run(now, userId);

  return listNotifications(userId);
}

export function clearNotifications(userId) {
  db.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
  return listNotifications(userId);
}
