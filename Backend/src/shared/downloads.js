import crypto from "node:crypto";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { hash, now, parse, page } from "./core.js";
export function library(userId, query = {}) {
  const p = page(query);
  return db
    .prepare(
      "SELECT e.*,l.snapshot_json FROM shared_entitlements e JOIN shared_order_lines l ON l.id=e.line_id WHERE e.buyer_id=? AND e.revoked_at IS NULL ORDER BY e.created_at DESC LIMIT ? OFFSET ?",
    )
    .all(userId, p.limit, p.offset)
    .map((r) => ({
      id: r.id,
      lineId: r.line_id,
      product: parse(r.snapshot_json).product,
      files: parse(r.file_ids_json, []).map((k) =>
        db
          .prepare(
            "SELECT id,name,mime_type,bytes FROM shared_media WHERE id=?",
          )
          .get(k),
      ),
      createdAt: r.created_at,
    }));
}
export function downloadToken(userId, entitlementId, mediaId) {
  const e = db
    .prepare(
      "SELECT * FROM shared_entitlements WHERE id=? AND buyer_id=? AND revoked_at IS NULL",
    )
    .get(entitlementId, userId);
  if (!e || !parse(e.file_ids_json, []).includes(mediaId))
    throw new HttpError(404, "Download not found.");
  const token = crypto.randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 120000).toISOString();
  db.prepare(
    "INSERT INTO shared_download_tokens(token_hash,user_id,entitlement_id,media_id,expires_at) VALUES(?,?,?,?,?)",
  ).run(hash(token), userId, e.id, mediaId, expiresAt);
  return { token, expiresAt, path: "/api/v2/library/download" };
}
export function consumeDownload(userId, token) {
  if (!/^[\w-]{43}$/.test(token || ""))
    throw new HttpError(404, "Download not found.");
  return transaction(() => {
    const row = db
      .prepare(
        "SELECT t.*,m.private_path,m.name,m.mime_type FROM shared_download_tokens t JOIN shared_entitlements e ON e.id=t.entitlement_id JOIN shared_media m ON m.id=t.media_id WHERE t.token_hash=? AND t.user_id=? AND e.buyer_id=? AND e.revoked_at IS NULL AND t.used_at IS NULL AND t.expires_at>? AND m.scan_status='clean'",
      )
      .get(hash(token), userId, userId, now());
    if (!row) throw new HttpError(404, "Download link expired or unavailable.");
    if (
      db
        .prepare(
          "UPDATE shared_download_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL",
        )
        .run(now(), row.token_hash).changes !== 1
    )
      throw new HttpError(404, "Download already used.");
    return row;
  });
}
