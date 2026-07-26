import { db, transaction } from "../db/database.js";
import { runStage3Migrations } from "../db/stage3-migrations.js";
import { deleteSessionsForUser } from "../lib/session.js";
import { logAdminAudit } from "../services/audit-log.service.js";
import { normalizeRole } from "../lib/roles.js";

runStage3Migrations();

const apply = process.argv.includes("--apply");
const now = new Date().toISOString();

function rows(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function duplicateEmails() {
  return rows(`
    SELECT LOWER(email) AS normalized_email, COUNT(*) AS count,
           GROUP_CONCAT(id, ',') AS user_ids,
           GROUP_CONCAT(role, ',') AS roles
    FROM users
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
    ORDER BY count DESC, normalized_email ASC
  `);
}

function roleProfileConflicts() {
  return rows(`
    SELECT users.id, users.email, users.role,
           CASE WHEN stores.id IS NULL THEN 0 ELSE 1 END AS has_seller_store,
           CASE WHEN rider_profiles.id IS NULL THEN 0 ELSE 1 END AS has_rider_profile
    FROM users
    LEFT JOIN stores ON stores.owner_id = users.id
    LEFT JOIN rider_profiles ON rider_profiles.user_id = users.id
    WHERE
      (stores.id IS NOT NULL AND users.role != 'seller')
      OR (rider_profiles.id IS NOT NULL AND users.role != 'rider')
      OR (stores.id IS NOT NULL AND rider_profiles.id IS NOT NULL)
    ORDER BY users.email ASC
  `);
}

function safeCorrectionFor(conflict) {
  const hasStore = Number(conflict.has_seller_store || 0) === 1;
  const hasRider = Number(conflict.has_rider_profile || 0) === 1;
  const role = normalizeRole(conflict.role);

  if (hasStore && hasRider) {
    return {
      safe: false,
      reason: "User has both seller and rider operational profiles; manual decision required.",
    };
  }

  if (hasRider && role !== "rider") {
    return { safe: true, nextRole: "rider", reason: "Rider profile exists and no seller store exists." };
  }

  if (hasStore && role !== "seller") {
    return { safe: true, nextRole: "seller", reason: "Seller store exists and no rider profile exists." };
  }

  return { safe: false, reason: "No safe automatic correction available." };
}

const duplicates = duplicateEmails();
const conflicts = roleProfileConflicts().map((conflict) => ({
  ...conflict,
  correction: safeCorrectionFor(conflict),
}));

const report = {
  mode: apply ? "apply" : "dry-run",
  generatedAt: now,
  duplicateEmails: duplicates,
  roleProfileConflicts: conflicts,
  safeAutomaticCorrections: conflicts.filter((item) => item.correction.safe),
  manualReviewRequired: [
    ...duplicates.map((item) => ({
      type: "duplicate_email",
      normalizedEmail: item.normalized_email,
      userIds: String(item.user_ids || "").split(",").filter(Boolean),
      roles: String(item.roles || "").split(",").filter(Boolean),
    })),
    ...conflicts
      .filter((item) => !item.correction.safe)
      .map((item) => ({
        type: "role_profile_conflict",
        userId: item.id,
        email: item.email,
        role: item.role,
        reason: item.correction.reason,
      })),
  ],
};

if (apply) {
  transaction(() => {
    for (const conflict of report.safeAutomaticCorrections) {
      db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(
        conflict.correction.nextRole,
        now,
        conflict.id,
      );
      deleteSessionsForUser(conflict.id);
      logAdminAudit({
        adminId: null,
        action: "account_role_reconciled",
        targetType: "user",
        targetId: conflict.id,
        summary: `Role corrected from ${conflict.role} to ${conflict.correction.nextRole}.`,
        metadata: {
          email: conflict.email,
          previousRole: conflict.role,
          nextRole: conflict.correction.nextRole,
          reason: conflict.correction.reason,
        },
        userAgent: "reconcile-accounts-cli",
      });
    }
  });
}

console.log(JSON.stringify(report, null, 2));

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to apply safe automatic corrections and revoke affected sessions.");
}
