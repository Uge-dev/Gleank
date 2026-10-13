import { assertListingTier } from './verification.js';
import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import {
  id,
  now,
  json,
  parse,
  hash,
  identifier,
  assertUser,
  assertTerms,
  assertUnblocked,
  lockUsers,
  notify,
  audit,
  page,
} from "./core.js";
import { productRow, publicProduct } from "./catalogue.js";
import { quoteSelection, publicQuote } from "./checkout.js";
import { directConversation, sendChat } from "./chat.js";
import { productInteraction } from "../services/interaction.service.js";
export function person(userId,viewerId="") {
  const u = assertUser(userId),
    a = db
      .prepare("SELECT * FROM account_profiles WHERE user_id=?")
      .get(userId),
    p = db
      .prepare("SELECT data_json FROM shared_profiles WHERE user_id=?")
      .get(userId);
  return {
    id: u.id,
    followed: !!(viewerId && db.prepare("SELECT 1 FROM shared_follows WHERE user_id=? AND target_id=?").get(viewerId,userId)),
    name: a?.display_name || u.name,
    username: a?.username || "",
    avatarUrl: u.avatar_url || null,
    bio: a?.bio || "",
    coverUrl: parse(p?.data_json).coverUrl || null,
    website: parse(p?.data_json).website || "",
  };
}
export function followPerson(userId, targetId, follow = true) {
  assertUser(targetId);
  assertUnblocked(userId, targetId);
  if (userId === targetId)
    throw new HttpError(422, "You cannot follow yourself.");
  if (follow) {
    const result = db
      .prepare(
        "INSERT INTO shared_follows(user_id,target_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,target_id) DO NOTHING",
      )
      .run(userId, targetId, now());
    if (result.changes) notify(targetId, "follow", userId, userId, {});
  } else
    db.prepare(
      "DELETE FROM shared_follows WHERE user_id=? AND target_id=?",
    ).run(userId, targetId);
  return { following: follow };
}
export function connections(viewerId, userId, query = {}) {
  assertUser(userId);
  if (viewerId) assertUnblocked(viewerId, userId);
  const p = page(query),
    mode = query.mode === "following" ? "following" : "followers";
  let ids =
    mode === "following"
      ? db
          .prepare(
            "SELECT target_id AS id FROM shared_follows WHERE user_id=? UNION SELECT s.owner_id AS id FROM store_follows f JOIN stores s ON s.id=f.store_id WHERE f.user_id=?",
          )
          .all(userId, userId)
      : db
          .prepare(
            "SELECT user_id AS id FROM shared_follows WHERE target_id=? UNION SELECT f.user_id AS id FROM store_follows f JOIN stores s ON s.id=f.store_id WHERE s.owner_id=?",
          )
          .all(userId, userId);
  const people = ids
    .map((r) => {
      try {
        if (viewerId) assertUnblocked(viewerId, r.id);
        return person(r.id);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(
      (u) =>
        !query.search ||
        [u.name, u.username]
          .join(" ")
          .toLowerCase()
          .includes(String(query.search).slice(0, 100).toLowerCase()),
    );
  return {
    total: people.length,
    people: people.slice(p.offset, p.offset + p.limit),
  };
}
export function feed(viewerId, query = {}) {
  const p=page(query),conditions=['p.active=1','u.is_active=1','seller.is_active=1',"s.status='active'","((x.state IS NOT NULL AND x.state='published') OR (x.state IS NULL AND pr.status IN ('active','out_of_stock')))"],values=[];
  if(query.userId){conditions.push('p.author_id=?');values.push(String(query.userId));}
  if(query.mode==='following'){
    if(!viewerId)return {posts:[],nextOffset:null};
    conditions.push('EXISTS(SELECT 1 FROM shared_follows f WHERE f.user_id=? AND f.target_id=p.author_id)');values.push(viewerId);
  }
  if(query.mode==='vendors')conditions.push('p.original_id IS NULL');
  if(viewerId){conditions.push('NOT EXISTS(SELECT 1 FROM shared_blocks b WHERE (b.user_id=? AND b.target_id IN (p.author_id,s.owner_id)) OR (b.target_id=? AND b.user_id IN (p.author_id,s.owner_id)))');values.push(viewerId,viewerId);}
  const ordering=query.mode==='vendors'?'u.created_at DESC,p.created_at DESC,p.id DESC':query.mode==='hot'?'((SELECT COUNT(*) FROM product_likes l WHERE l.product_id=p.product_id)+(SELECT COUNT(*) FROM product_comments c WHERE c.product_id=p.product_id)*2) DESC,p.created_at DESC,p.id DESC':'p.created_at DESC,p.id DESC';
  const rows=db.prepare(`SELECT p.* FROM shared_posts p JOIN users u ON u.id=p.author_id JOIN products pr ON pr.id=p.product_id JOIN stores s ON s.id=pr.store_id JOIN users seller ON seller.id=s.owner_id LEFT JOIN shared_products x ON x.product_id=pr.id WHERE ${conditions.join(' AND ')} ORDER BY ${ordering} LIMIT ? OFFSET ?`).all(...values,p.limit,p.offset);
  const posts = rows
    .map((row) => {
      try {
        if (viewerId) assertUnblocked(viewerId, row.author_id);
        const product = productRow(row.product_id, viewerId);
        const legacyVideo = row.id.startsWith("legacy-video:")
          ? db
              .prepare(
                "SELECT video_url FROM social_posts WHERE id=? AND status='active'",
              )
              .get(row.id.slice(13))
          : null;
        if (
          query.mode === "following" &&
          (!viewerId ||
            !db
              .prepare(
                "SELECT 1 FROM shared_follows WHERE user_id=? AND target_id=?",
              )
              .get(viewerId, row.author_id))
        )
          return null;
        if (query.userId && row.author_id !== query.userId) return null;
        return {
          id: row.id,
          author: person(row.author_id,viewerId),
          originalOwner: person(product.owner_id),
          product: {
            ...publicProduct(product),
            ...(legacyVideo
              ? {
                  presentation: "video",
                  media: [{ kind: "video", url: legacyVideo.video_url }],
                }
              : {}),
          },
          caption: row.caption,
          markupBps: Number(row.markup_bps),
          createdAt: row.created_at,
          counts: {
            ...productInteraction(product.id, viewerId),
            reshared:viewerId?!!db.prepare("SELECT 1 FROM shared_posts WHERE product_id=? AND author_id=? AND original_id IS NOT NULL AND active=1 LIMIT 1").get(product.id,viewerId):false,
            reshareCount: Number(
              db
                .prepare(
                  "SELECT COUNT(*) AS count FROM shared_posts WHERE product_id=? AND original_id IS NOT NULL AND active=1",
                )
                .get(product.id).count,
            ),
          },
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return {
    posts,
    nextOffset: rows.length === p.limit ? p.offset + p.limit : null,
  };
}
export function reshare(userId, postId, body) {
  assertTerms(userId);
  const data = z
    .object({
      markupPercent: z.number().min(0).max(20),
      caption: z.string().trim().max(2000).default(""),
    })
    .strict()
    .parse(body);
  return transaction(() => {
    lockUsers([userId]);
    const original = db
      .prepare("SELECT * FROM shared_posts WHERE id=? AND active=1")
      .get(postId);
    if (!original) throw new HttpError(404, "Post not found.");
    const p = productRow(original.product_id, userId);
    if (p.owner_id === userId || !p.details.reshareEnabled)
      throw new HttpError(
        422,
        "This product cannot be reshared for commission.",
      );
    assertListingTier(p.owner_id,Math.ceil(p.details.priceKobo*(1+data.markupPercent/100)));
    const originalId = original.original_id || original.id;
    const old = db
      .prepare(
        "SELECT id FROM shared_posts WHERE author_id=? AND original_id=? AND markup_bps=? AND active=1",
      )
      .get(userId, originalId, Math.round(data.markupPercent * 100));
    if (old) return { id: old.id };
    const key = id("post");
    db.prepare(
      "INSERT INTO shared_posts(id,product_id,author_id,original_id,markup_bps,caption,created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(
      key,
      p.id,
      userId,
      originalId,
      Math.round(data.markupPercent * 100),
      data.caption || p.name,
      now(),
    );
    notify(p.owner_id, "reshare", key, userId, { productId: p.id });
    return {
      id: key,
      productId: p.id,
      ownerId: p.owner_id,
      markupPercent: data.markupPercent,
      path: "/products/" + p.id + "?post=" + key,
    };
  });
}
export function trackPost(userId, postId, kind) {
  z.enum(["view", "open", "share"]).parse(kind);
  const post = db
    .prepare("SELECT * FROM shared_posts WHERE id=? AND active=1")
    .get(postId);
  if (!post) throw new HttpError(404, "Post not found.");
  assertUnblocked(userId, post.author_id);
  db.prepare(
    "INSERT INTO shared_post_events(post_id,user_id,kind,day,created_at) VALUES(?,?,?,?,?) ON CONFLICT(post_id,user_id,kind,day) DO NOTHING",
  ).run(postId, userId, kind, now().slice(0, 10), now());
  return { recorded: true };
}
export function makeOffer(userId, raw) {
  return transaction(() => {
    assertTerms(userId);
    const { discountPercent, ...selection } = z
      .object({ discountPercent: z.number().min(0).max(20) })
      .passthrough()
      .parse(raw);
    if (selection.offerId)
      throw new HttpError(
        422,
        "Request a new offer without an existing offer ID.",
      );
    const q = quoteSelection(userId, selection);
    if(discountPercent>100-(q.product.minimumOfferPercent||80))throw new HttpError(422,"This seller has a stricter offer limit.");
    if (!q.product.offersEnabled)
      throw new HttpError(422, "This seller is not accepting offers.");
    const key = id("offer");
    db.prepare(
      "INSERT INTO shared_offers(id,buyer_id,seller_id,product_id,input_json,quoted_json,discount_bps,product_version,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      key,
      userId,
      q.ownerId,
      q.productId,
      json(q.input),
      json(publicQuote(q)),
      Math.round(discountPercent * 100),
      q.productVersion,
      "pending",
      new Date(Date.now() + 24 * 3600000).toISOString(),
      now(),
    );
    notify(q.ownerId, "offer", key, userId, {
      productId: q.productId,
      discountPercent,
    });
    const conversation = directConversation(userId, q.ownerId);
    sendChat(userId, conversation.id, { offerId: key }, "offer-" + key);
    return {
      id: key,
      status: "pending",
      quote: publicQuote(q),
      discountPercent,
    };
  });
}
export function answerOffer(userId, key, raw) {
  const data = z
    .object({ decision: z.enum(["accept", "reject"]) })
    .strict()
    .parse(raw);
  return transaction(() => {
    lockUsers([userId]);
    const o = db
      .prepare("SELECT * FROM shared_offers WHERE id=? AND seller_id=?")
      .get(key, userId);
    if (!o) throw new HttpError(404, "Offer not found.");
    if (o.status !== "pending" || o.expires_at <= now())
      throw new HttpError(409, "This offer is no longer pending.");
    const current = productRow(o.product_id, userId, true);
    if (current.version !== o.product_version)
      throw new HttpError(409, "The product changed. Ask for a new offer.");
    assertUnblocked(userId, o.buyer_id);
    db.prepare("UPDATE shared_offers SET status=? WHERE id=? AND status=?").run(
      data.decision === "accept" ? "accepted" : "rejected",
      o.id,
      "pending",
    );
    notify(o.buyer_id, "offer-answer", o.id, userId, {
      accepted: data.decision === "accept",
      productId: o.product_id,
    });
    const conversation = directConversation(userId, o.buyer_id);
    sendChat(userId, conversation.id, { offerId: o.id }, "answer-" + o.id);
    return {
      id: o.id,
      status: data.decision === "accept" ? "accepted" : "rejected",
    };
  });
}
export function report(userId, body) {
  const data = z
    .object({
      kind: z.enum([
        "product",
        "post",
        "account",
        "comment",
        "review",
        "message",
      ]),
      targetId: identifier,
      reason: z.enum([
        "spam",
        "fraud",
        "harassment",
        "unsafe",
        "copyright",
        "other",
      ]),
      details: z.string().trim().max(2000).default(""),
    })
    .strict()
    .parse(body);
  let target;
  if (data.kind === "product") target = productRow(data.targetId, userId);
  else if (data.kind === "account") target = assertUser(data.targetId);
  else if (data.kind === "post")
    target = db
      .prepare("SELECT id FROM shared_posts WHERE id=?")
      .get(data.targetId);
  else if (data.kind === "comment")
    target = db
      .prepare("SELECT id FROM product_comments WHERE id=?")
      .get(data.targetId);
  else if (data.kind === "review")
    target = db
      .prepare("SELECT id FROM shared_reviews WHERE id=?")
      .get(data.targetId);
  else
    target = db
      .prepare(
        "SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND (c.buyer_id=? OR c.seller_id=?)",
      )
      .get(data.targetId, userId, userId);
  if (!target) throw new HttpError(404, "Content not found.");
  const old = db
    .prepare(
      "SELECT id FROM shared_reports WHERE user_id=? AND kind=? AND target_id=?",
    )
    .get(userId, data.kind, data.targetId);
  const key = old?.id || id("report");
  db.prepare(
    "INSERT INTO shared_reports(id,user_id,kind,target_id,reason,details,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,kind,target_id) DO NOTHING",
  ).run(
    key,
    userId,
    data.kind,
    data.targetId,
    data.reason,
    data.details,
    now(),
  );
  return { id: key, status: "pending" };
}
const legacyNotificationExclusion = `NOT EXISTS(SELECT 1 FROM shared_notifications s WHERE s.user_id=n.user_id AND n.action_path='/products/' || s.target_id AND ((n.type='like' AND s.kind='like') OR (n.type='product' AND s.kind='comment')))`;
export function notificationFeed(userId, query = {}) {
  const p = page(query),
    unread = query.filter === "unread";
  const rows = db
    .prepare(
      `SELECT * FROM (SELECT id,kind,target_id,actors_json,data_json,read_at,created_at,updated_at,'' AS title,'' AS body,'' AS action_path,'shared' AS source FROM shared_notifications WHERE user_id=? ${unread ? "AND read_at IS NULL" : ""} UNION ALL SELECT n.id,n.type AS kind,'' AS target_id,'[]' AS actors_json,n.metadata_json AS data_json,CASE WHEN n.is_read=1 THEN COALESCE(n.read_at,n.created_at) ELSE NULL END AS read_at,n.created_at,n.created_at AS updated_at,n.title,n.body,n.action_path,'legacy' AS source FROM notifications n WHERE n.user_id=? AND ${legacyNotificationExclusion} ${unread ? "AND n.is_read=0" : ""}) AS activity ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, userId, p.limit, p.offset);
  return {
    notifications: rows.map((r) => {
      let count = null,
        commentCount = null,
        actors = parse(r.actors_json, []);
      if (r.kind === "like" && r.target_id) {
        count = Number(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM product_likes WHERE product_id=?",
            )
            .get(r.target_id).count,
        );
        actors = actors.filter((a) =>
          db
            .prepare(
              "SELECT 1 FROM product_likes WHERE product_id=? AND user_id=?",
            )
            .get(r.target_id, a),
        );
      }
      if (r.kind === "comment") {
        const counts = db
          .prepare(
            "SELECT COUNT(*) AS count,COUNT(DISTINCT user_id) AS people FROM product_comments WHERE product_id=? AND is_deleted=0",
          )
          .get(r.target_id);
        count = Number(counts.people);
        commentCount = Number(counts.count);
      }
      const people = actors
        .map((a) => {
          try {
            return person(a);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return {
        id: r.id,
        kind: r.kind,
        targetId: r.target_id,
        source: r.source,
        actors: people,
        count,
        commentCount,
        othersCount: count === null ? null : Math.max(0, count - people.length),
        data: parse(r.data_json),
        ...(r.source === "legacy"
          ? { title: r.title, body: r.body, actionPath: r.action_path }
          : {}),
        unread: !r.read_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }),
    unreadCount: activityCounts(userId).notificationCount,
  };
}
export function activityCounts(userId) {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM shared_notifications WHERE user_id=? AND read_at IS NULL)+(SELECT COUNT(*) FROM notifications n WHERE n.user_id=? AND n.is_read=0 AND ${legacyNotificationExclusion}) AS notifications,(SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE (c.buyer_id=? OR c.seller_id=?) AND m.sender_id<>? AND m.is_read=0 AND NOT EXISTS(SELECT 1 FROM shared_message_hidden h WHERE h.message_id=m.id AND h.user_id=?)) AS messages`,
    )
    .get(userId, userId, userId, userId, userId, userId);
  return {
    notificationCount: Number(row.notifications),
    messageCount: Number(row.messages),
  };
}
export function reshareAnalytics(userId) {
  const posts = db
    .prepare(
      "SELECT * FROM shared_posts WHERE author_id=? AND original_id IS NOT NULL",
    )
    .all(userId);
  return {
    products: posts.map((p) => ({
      postId: p.id,
      productId: p.product_id,
      markupBps: p.markup_bps,
      events: db
        .prepare(
          "SELECT kind,COUNT(*) AS count FROM shared_post_events WHERE post_id=? GROUP BY kind",
        )
        .all(p.id),
      sales: db
        .prepare(
          "SELECT COUNT(*) AS count FROM shared_order_lines WHERE promoter_id=? AND product_id=?",
        )
        .get(userId, p.product_id).count,
    })),
    ledger: db
      .prepare(
        "SELECT * FROM shared_ledger WHERE user_id=? AND event_key LIKE 'commission:%' ORDER BY created_at DESC LIMIT 100",
      )
      .all(userId),
  };
}
