import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

export function logAdminAudit(input = {}) {
  const id = createId("aud");
  const now = nowIso();

  db.prepare(`
    INSERT INTO admin_audit_logs (
      id, admin_id, action, target_type, target_id, summary,
      metadata, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clean(input.adminId, 140) || null,
    clean(input.action, 120) || "admin_action",
    clean(input.targetType, 80),
    clean(input.targetId, 140),
    clean(input.summary, 900),
    safeJson(input.metadata),
    clean(input.ipAddress, 80),
    clean(input.userAgent, 240),
    now,
  );

  return db.prepare("SELECT * FROM admin_audit_logs WHERE id = ?").get(id);
}

export function listAdminAuditLogs(filters = {}) {
  const params = [];
  const where = [];

  if (filters.action) {
    where.push("action = ?");
    params.push(clean(filters.action, 120));
  }

  if (filters.targetType) {
    where.push("target_type = ?");
    params.push(clean(filters.targetType, 80));
  }

  if (filters.targetId) {
    where.push("target_id = ?");
    params.push(clean(filters.targetId, 140));
  }

  const sql = `
    SELECT admin_audit_logs.*, users.name AS admin_name, users.email AS admin_email
    FROM admin_audit_logs
    LEFT JOIN users ON users.id = admin_audit_logs.admin_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY admin_audit_logs.created_at DESC
    LIMIT 250
  `;

  return db.prepare(sql).all(...params).map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminName: row.admin_name || "Admin",
    adminEmail: row.admin_email || "",
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    metadata: (() => {
      try {
        return JSON.parse(row.metadata || "{}");
      } catch {
        return {};
      }
    })(),
    ipAddress: row.ip_address || "",
    userAgent: row.user_agent || "",
    createdAt: row.created_at,
  }));
}
