import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { serializeUser } from "../lib/serializers.js";
import { deleteSessionsForUser } from "../lib/session.js";
import {
  completeAccountProfile,
  getFulfillmentSettings,
} from "../services/account-profile.service.js";
import {
  id,
  now,
  json,
  parse,
  identifier,
  assertUser,
  lockUsers,
  TERMS_VERSION,
  audit,
} from "./core.js";
import { ownedMedia } from "./media.js";
const settingsSchema = z
  .object({
    theme: z.enum(["system", "light", "dark"]).default("system"),
    language: z.enum(["en"]).default("en"),
    messageNotifications: z.boolean().default(true),
    activityNotifications: z.boolean().default(true),
    orderNotifications: z.boolean().default(true),
    showOnline: z.boolean().default(true),
    allowMessages: z
      .enum(["everyone", "following", "nobody"])
      .default("everyone"),
  })
  .strict();
export function account(userId) {
  const u = assertUser(userId);
  return {
    user: serializeUser(u),
    selling: getFulfillmentSettings(userId),
    profile: parse(
      db
        .prepare("SELECT data_json FROM shared_profiles WHERE user_id=?")
        .get(userId)?.data_json,
    ),
    settings: settingsSchema.parse(
      parse(
        db
          .prepare("SELECT data_json FROM shared_settings WHERE user_id=?")
          .get(userId)?.data_json,
      ),
    ),
    termsVersion:
      db
        .prepare("SELECT terms_version FROM shared_profiles WHERE user_id=?")
        .get(userId)?.terms_version || "",
  };
}
export function acceptTerms(userId, version) {
  if (version !== TERMS_VERSION)
    throw new HttpError(422, "Accept the current terms version.");
  db.prepare(
    "INSERT INTO shared_profiles(user_id,terms_version,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET terms_version=excluded.terms_version,updated_at=excluded.updated_at",
  ).run(userId, version, now());
  audit(userId, "accept-terms", version);
  return { version };
}
export function editProfile(userId, raw) {
  const data = z
    .object({
      profile: z
        .object({
          name: z.string(),
          username: z.string(),
          displayName: z.string().optional(),
          bio: z.string().optional(),
          country: z.string(),
          state: z.string(),
          city: z.string(),
          activities: z.array(z.string()).optional(),
          interests: z.array(z.string()).optional(),
        })
        .strict()
        .optional(),
      avatarId: identifier.optional(),
      coverId: identifier.optional(),
      website: z.string().url().max(300).optional(),
    })
    .strict()
    .parse(raw);
  if (data.website && !/^https:\/\//i.test(data.website))
    throw new HttpError(422, "Use a secure website address.");
  return transaction(() => {
    lockUsers([userId]);
    if (data.profile) completeAccountProfile(userId, data.profile);
    const p = parse(
      db
        .prepare("SELECT data_json FROM shared_profiles WHERE user_id=?")
        .get(userId)?.data_json,
    );
    if (data.avatarId) {
      const media = ownedMedia(userId, [data.avatarId], ["avatar"])[0];
      db.prepare("UPDATE users SET avatar_url=?,updated_at=? WHERE id=?").run(
        media.public_url,
        now(),
        userId,
      );
      p.avatarId = data.avatarId;
    }
    if (data.coverId) {
      const media = ownedMedia(userId, [data.coverId], ["cover"])[0];
      p.coverId = data.coverId;
      p.coverUrl = media.public_url;
    }
    if (data.website !== undefined) p.website = data.website;
    db.prepare(
      "INSERT INTO shared_profiles(user_id,data_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at",
    ).run(userId, json(p), now());
    return account(userId);
  });
}
export function saveSettings(userId, body) {
  const data = settingsSchema.parse(body);
  db.prepare(
    "INSERT INTO shared_settings(user_id,data_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json",
  ).run(userId, json(data));
  return data;
}
const addressSchema = z
  .object({
    label: z.string().trim().max(60).default("Home"),
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    address: z.string().trim().min(5).max(500),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    country: z.string().trim().max(80).default("Nigeria"),
  })
  .strict();
export function addresses(userId) {
  return db
    .prepare(
      "SELECT * FROM shared_addresses WHERE user_id=? ORDER BY created_at DESC",
    )
    .all(userId)
    .map((r) => ({ id: r.id, ...parse(r.data_json) }));
}
export function saveAddress(userId, key, body) {
  const d = addressSchema.parse(body);
  if (
    key &&
    !db
      .prepare("SELECT id FROM shared_addresses WHERE id=? AND user_id=?")
      .get(key, userId)
  )
    throw new HttpError(404, "Address not found.");
  if (!key && addresses(userId).length >= 20)
    throw new HttpError(422, "You can save up to 20 addresses.");
  key = key || id("address");
  db.prepare(
    "INSERT INTO shared_addresses(id,user_id,data_json,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json",
  ).run(key, userId, json(d), now());
  return { id: key, ...d };
}
export function blockAccount(userId, targetId, blocked) {
  assertUser(targetId);
  if (userId === targetId)
    throw new HttpError(422, "You cannot block yourself.");
  return transaction(() => {
    lockUsers([userId, targetId]);
    if (blocked) {
      db.prepare(
        "INSERT INTO shared_blocks(user_id,target_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,target_id) DO NOTHING",
      ).run(userId, targetId, now());
      db.prepare(
        "DELETE FROM shared_follows WHERE (user_id=? AND target_id=?) OR (user_id=? AND target_id=?)",
      ).run(userId, targetId, targetId, userId);
    } else
      db.prepare(
        "DELETE FROM shared_blocks WHERE user_id=? AND target_id=?",
      ).run(userId, targetId);
    return { blocked };
  });
}
export async function requestDeletion(userId, body) {
  const d = z
      .object({
        password: z.string().max(72).optional(),
        confirm: z.literal("DELETE"),
      })
      .strict()
      .parse(body),
    u = assertUser(userId);
  if (!d.password || !(await bcrypt.compare(d.password, u.password_hash)))
    throw new HttpError(
      401,
      "Confirm your password first. For provider-only accounts, set a password through verified email recovery.",
    );
  return transaction(() => {
    lockUsers([userId]);
    assertDeletionReady(userId);
    const executeAfter = new Date(Date.now() + 30 * 86400000).toISOString();
    db.prepare(
      "INSERT INTO shared_deletion_requests(user_id,status,requested_at,execute_after) VALUES(?,'pending',?,?) ON CONFLICT(user_id) DO UPDATE SET status='pending',requested_at=excluded.requested_at,execute_after=excluded.execute_after,completed_at=NULL",
    ).run(userId, now(), executeAfter);
    db.prepare("UPDATE users SET is_active=0,updated_at=? WHERE id=?").run(
      now(),
      userId,
    );
    db.prepare("UPDATE shared_posts SET active=0 WHERE author_id=?").run(
      userId,
    );
    db.prepare("UPDATE stores SET status='paused' WHERE owner_id=?").run(
      userId,
    );
    deleteSessionsForUser(userId);
    audit(userId, "request-deletion", userId);
    return { status: "pending", executeAfter };
  });
}
// Financial records are retained for reconciliation. Deletion remains reviewable rather than silently removing liabilities.
export function deletionCandidates() {
  return db
    .prepare(
      "SELECT * FROM shared_deletion_requests WHERE status='pending' AND execute_after<=? LIMIT 100",
    )
    .all(now());
}

export function finalizeDeletion(adminId, userId) {
  if (
    db.prepare("SELECT role FROM users WHERE id=? AND is_active=1").get(adminId)
      ?.role !== "admin"
  )
    throw new HttpError(403, "Admin review is required.");
  return transaction(() => {
    lockUsers([userId]);
    assertDeletionReady(userId);
    const request = db
      .prepare(
        "SELECT * FROM shared_deletion_requests WHERE user_id=? AND status='pending' AND execute_after<=?",
      )
      .get(userId, now());
    if (!request)
      throw new HttpError(409, "This deletion is not ready for finalization.");
    const wallet = db
      .prepare(
        "SELECT available_kobo,held_kobo FROM shared_wallet_accounts WHERE user_id=?",
      )
      .get(userId);
    if (
      Number(wallet?.available_kobo) ||
      Number(wallet?.held_kobo) ||
      db
        .prepare(
          "SELECT id FROM shared_transfers WHERE user_id=? AND status='pending'",
        )
        .get(userId) ||
      db
        .prepare(
          "SELECT id FROM shared_checkouts WHERE buyer_id=? AND status IN ('ready','initializing','pending','refund_required')",
        )
        .get(userId) ||
      db
        .prepare(
          "SELECT id FROM shared_orders WHERE (buyer_id=? OR seller_id=?) AND status NOT IN ('completed','refunded')",
        )
        .get(userId, userId) ||
      db
        .prepare(
          "SELECT id FROM orders WHERE buyer_id=? AND payment_status='paid' AND status NOT IN ('delivered','completed','cancelled')",
        )
        .get(userId)
    )
      throw new HttpError(
        409,
        "Settle financial balances and outstanding orders before deleting personal data.",
      );
    db.prepare(
      "UPDATE users SET name='Deleted account',email=?,phone='',country='',state='',city='',address='',campus='',avatar_url=NULL,password_hash='',is_active=0,updated_at=? WHERE id=?",
    ).run(userId + "@deleted.invalid", now(), userId);
    db.prepare("DELETE FROM shared_identities WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM account_profiles WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_profiles WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_settings WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_addresses WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_verification WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_phone_checks WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_cart WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_push_devices WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM shared_follows WHERE user_id=? OR target_id=?").run(
      userId,
      userId,
    );
    db.prepare(
      "UPDATE stores SET name='Deleted store',description='',phone='',pickup_location='',status='paused' WHERE owner_id=?",
    ).run(userId);
    // Records needed for completed orders remain pseudonymous. Private licensed assets are retained for existing purchasers.
    db.prepare(
      "UPDATE shared_deletion_requests SET status='completed',completed_at=? WHERE user_id=?",
    ).run(now(), userId);
    audit(adminId, "finalize-deletion", userId);
    return {
      completed: true,
      retained: "Financial and fulfilment records; purchased digital licences",
    };
  });
}

function assertDeletionReady(userId) {
  const wallet = db
    .prepare("SELECT * FROM shared_wallet_accounts WHERE user_id=?")
    .get(userId);
  if (
    Number(wallet?.available_kobo) ||
    Number(wallet?.held_kobo) ||
    db
      .prepare(
        "SELECT id FROM shared_checkouts WHERE buyer_id=? AND status IN ('ready','initializing','pending','refund_required')",
      )
      .get(userId) ||
    db
      .prepare(
        "SELECT id FROM shared_orders WHERE (buyer_id=? OR seller_id=?) AND status NOT IN ('completed','refunded')",
      )
      .get(userId, userId) ||
    db
      .prepare(
        "SELECT id FROM shared_transfers WHERE user_id=? AND status='pending'",
      )
      .get(userId) ||
    db
      .prepare(
        "SELECT id FROM orders WHERE (buyer_id=? OR seller_id=?) AND payment_status='paid' AND status NOT IN ('delivered','completed','cancelled')",
      )
      .get(userId, userId) ||
    db
      .prepare(
        "SELECT id FROM payouts WHERE seller_id=? AND status NOT IN ('released','refunded')",
      )
      .get(userId)
  )
    throw new HttpError(
      409,
      "Complete orders, cancel unpaid checkouts and withdraw your available balance before closing your account.",
    );
}
