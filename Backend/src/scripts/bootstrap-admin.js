import bcrypt from "bcryptjs";
import { db, transaction } from "../db/database.js";
import { runStage3Migrations } from "../db/stage3-migrations.js";
import { createId } from "../lib/ids.js";
import { validatePasswordStrength } from "../lib/password-policy.js";
import { deleteSessionsForUser } from "../lib/session.js";
import { logAdminAudit } from "../services/audit-log.service.js";

runStage3Migrations();

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

const email = normalizeEmail(argValue("--email") || process.env.ADMIN_BOOTSTRAP_EMAIL);
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
const rotateExistingPassword = hasFlag("--rotate-existing-password");

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: ADMIN_BOOTSTRAP_PASSWORD='strong-password' npm run admin:bootstrap -- --email admin@example.com");
  console.error("Provide a valid --email value. The password must come from ADMIN_BOOTSTRAP_PASSWORD.");
  process.exit(1);
}

const passwordPolicy = validatePasswordStrength(password);
if (!passwordPolicy.valid) {
  console.error("ADMIN_BOOTSTRAP_PASSWORD is not strong enough:");
  for (const issue of passwordPolicy.issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

const now = new Date().toISOString();
const existing = db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(email);

if (existing && existing.role !== "admin") {
  console.error("This email already belongs to a non-admin account. Gleenc requires one email per primary role.");
  process.exit(1);
}

if (existing && !rotateExistingPassword) {
  console.log("Admin account already exists. No changes made.");
  console.log("To rotate its password, run again with --rotate-existing-password.");
  process.exit(0);
}

const passwordHash = await bcrypt.hash(password, 12);

transaction(() => {
  if (existing) {
    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          is_active = 1,
          email_verified = 1,
          email_verified_at = COALESCE(email_verified_at, ?),
          last_password_change_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(passwordHash, now, now, now, existing.id);

    deleteSessionsForUser(existing.id);

    logAdminAudit({
      adminId: existing.id,
      action: "admin_bootstrap_password_rotated",
      targetType: "user",
      targetId: existing.id,
      summary: "Admin password rotated through bootstrap CLI.",
      metadata: { email },
      userAgent: "bootstrap-admin-cli",
    });
    return;
  }

  const adminId = createId("usr");
  db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role, campus, phone,
      avatar_url, is_active, email_verified, email_verified_at,
      phone_verified, phone_verified_at, failed_login_count, locked_until,
      last_login_at, last_password_change_at, created_at, updated_at
    ) VALUES (?, 'Gleenc Admin', ?, ?, 'admin', '', '', NULL, 1, 1, ?, 0, NULL, 0, NULL, NULL, ?, ?, ?)
  `).run(adminId, email, passwordHash, now, now, now, now);

  logAdminAudit({
    adminId,
    action: "admin_bootstrap_created",
    targetType: "user",
    targetId: adminId,
    summary: "Admin account created through one-time bootstrap CLI.",
    metadata: { email },
    userAgent: "bootstrap-admin-cli",
  });
});

console.log(existing ? "Admin password rotated." : "Admin account created.");
console.log("Password was not printed. Store it securely and remove ADMIN_BOOTSTRAP_PASSWORD from your shell history/environment.");
