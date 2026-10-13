import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import {
  id,
  now,
  json,
  parse,
  assertTerms,
  assertUnblocked,
  page,
  lockUsers,
} from "./core.js";
import { ownedMedia } from "./media.js";
import { person } from "./social.js";
export function reviewsFor(viewerId, productId, query = {}) {
  const p = page(query);
  return db
    .prepare(
      `SELECT r.*,l.fulfilled_at,l.refund_state,o.seller_id FROM shared_reviews r JOIN shared_order_lines l ON l.id=r.line_id JOIN shared_orders o ON o.id=l.order_id WHERE r.product_id=? AND r.deleted_at IS NULL AND l.fulfilled_at IS NOT NULL AND l.refund_state='' AND NOT EXISTS(SELECT 1 FROM shared_issues i WHERE i.line_id=l.id AND i.status IN ('open','refund_pending')) ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(productId, p.limit, p.offset)
    .map((r) => {
      try {
        if (viewerId) assertUnblocked(viewerId, r.user_id);
        return {
          id: r.id,
          user: person(r.user_id),
          rating: r.rating,
          body: r.body,
          photos: parse(r.photos_json, []).map((mediaId) => ({
            id: mediaId,
            url: db
              .prepare("SELECT public_url FROM shared_media WHERE id=?")
              .get(mediaId)?.public_url,
          })),
          reply: r.reply,
          verifiedPurchase: true,
          helpful: Number(
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM shared_review_helpful WHERE review_id=?",
              )
              .get(r.id).count,
          ),
          createdAt: r.created_at,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
export function saveReview(userId, lineId, body) {
  assertTerms(userId);
  const data = z
    .object({
      rating: z.number().int().min(1).max(5),
      body: z.string().trim().min(1).max(2000),
      photoIds: z.array(z.string().max(140)).max(4).default([]),
    })
    .strict()
    .parse(body);
  ownedMedia(userId, data.photoIds, ["review"]);
  return transaction(() => {
    const line = db
      .prepare(
        "SELECT l.*,o.buyer_id,o.seller_id FROM shared_order_lines l JOIN shared_orders o ON o.id=l.order_id WHERE l.id=? AND o.buyer_id=?",
      )
      .get(lineId, userId);
    if (!line) throw new HttpError(404, "Purchased item not found.");
    lockUsers([line.buyer_id, line.seller_id]);
    if (
      !line.fulfilled_at ||
      line.refund_state ||
      db
        .prepare(
          "SELECT id FROM shared_issues WHERE line_id=? AND status IN ('open','refund_pending')",
        )
        .get(line.id)
    )
      throw new HttpError(409, "A completed, undisputed purchase is required.");
    const old = db
      .prepare("SELECT id FROM shared_reviews WHERE line_id=?")
      .get(lineId);
    const key = old?.id || id("review");
    db.prepare(
      `INSERT INTO shared_reviews(id,line_id,user_id,product_id,rating,body,photos_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(line_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,photos_json=excluded.photos_json,deleted_at=NULL,updated_at=excluded.updated_at`,
    ).run(
      key,
      lineId,
      userId,
      line.product_id,
      data.rating,
      data.body,
      json(data.photoIds),
      now(),
      now(),
    );
    return { id: key, verifiedPurchase: true };
  });
}
export function reviewAction(userId, reviewId, body) {
  const data = z
    .object({
      action: z.enum(["delete", "helpful", "reply"]),
      reply: z.string().trim().max(2000).optional(),
    })
    .strict()
    .parse(body);
  const r = db
    .prepare(
      "SELECT r.*,o.seller_id FROM shared_reviews r JOIN shared_order_lines l ON l.id=r.line_id JOIN shared_orders o ON o.id=l.order_id WHERE r.id=?",
    )
    .get(reviewId);
  if (!r || r.deleted_at) throw new HttpError(404, "Review not found.");
  if (data.action === "delete") {
    if (r.user_id !== userId)
      throw new HttpError(403, "You cannot delete this review.");
    db.prepare("UPDATE shared_reviews SET deleted_at=? WHERE id=?").run(
      now(),
      r.id,
    );
  } else if (data.action === "reply") {
    if (r.seller_id !== userId)
      throw new HttpError(403, "Only the original seller may reply.");
    db.prepare("UPDATE shared_reviews SET reply=?,updated_at=? WHERE id=?").run(
      data.reply || "",
      now(),
      r.id,
    );
  } else {
    assertUnblocked(userId, r.user_id);
    db.prepare(
      "INSERT INTO shared_review_helpful(review_id,user_id) VALUES(?,?) ON CONFLICT(review_id,user_id) DO NOTHING",
    ).run(r.id, userId);
  }
  return { updated: true };
}
