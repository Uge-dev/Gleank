import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { publishNotificationEvent } from "./realtime.service.js";

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

function notificationHasColumn(column) {
  try {
    return db
      .prepare("PRAGMA table_info(notifications)")
      .all()
      .some((item) => item.name === column);
  } catch {
    return false;
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
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
  const body = clean(input?.body ?? input?.message, 900);

  if (!userId || !title) return null;

  const now = new Date().toISOString();
  const id = createId("ntf");

  if (notificationHasColumn("metadata_json")) {
    db.prepare(`
      INSERT INTO notifications (
        id, user_id, type, title, body, action_label, action_path,
        image_url, is_read, read_at, role, message, action_url,
        metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      typeOrFallback(input?.type),
      title,
      body,
      clean(input?.actionLabel || "Open", 80),
      clean(input?.actionPath || input?.actionUrl || "/", 240),
      clean(input?.imageUrl || "", 500) || null,
      clean(input?.role, 60),
      body,
      clean(input?.actionUrl || input?.actionPath || "/", 240),
      safeJson(input?.metadata),
      now,
    );
  } else {
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
  }

  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
  publishNotificationEvent([userId], "notification", serializeNotification(row));
  publishNotificationEvent([userId], "unread-count", {
    unreadCount: getNotificationUnreadCount(userId),
  });
  return row;
}

export function createNotificationForUsers(userIds, input) {
  const uniqueIds = [...new Set((userIds || []).map((id) => clean(id, 140)).filter(Boolean))];
  return uniqueIds
    .map((userId) => createNotification({ ...input, userId }))
    .filter(Boolean)
    .map(serializeNotification);
}

export function listNotifications(userId, options = {}) {
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(options.limit, 10) || 40));
  const filter = options.filter === "unread" ? "unread" : options.filter === "read" ? "read" : "all";
  const filterSql = filter === "unread" ? " AND is_read = 0" : filter === "read" ? " AND is_read = 1" : "";
  const offset = (page - 1) * limit;
  const notifications = db
    .prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?${filterSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(userId, limit, offset)
    .map(serializeNotification);

  const total = Number(db.prepare(`
    SELECT COUNT(*) AS count FROM notifications
    WHERE user_id = ?${filterSql}
  `).get(userId).count || 0);

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
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
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
