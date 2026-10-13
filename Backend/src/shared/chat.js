import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { protectMessageContent } from "../services/payment-protection.service.js";
import {
  id,
  now,
  json,
  parse,
  hash,
  identifier,
  page,
  lockUsers,
  assertUser,
  assertUnblocked,
  assertTerms,
  notify,
} from "./core.js";
import { ownedMedia } from "./media.js";
import { person } from "./social.js";
import { productRow, publicProduct } from "./catalogue.js";
export function ownedConversation(userId, key) {
  const c = db
    .prepare(
      "SELECT * FROM conversations WHERE id=? AND (buyer_id=? OR seller_id=?)",
    )
    .get(key, userId, userId);
  if (!c) throw new HttpError(404, "Conversation not found.");
  return c;
}
const chatPerson = (userId) => {
  try {
    return person(userId);
  } catch (error) {
    if (error.status === 404)
      return {
        id: userId,
        name: "Deleted account",
        username: "",
        avatarUrl: null,
      };
    throw error;
  }
};
const other = (c, u) => (c.buyer_id === u ? c.seller_id : c.buyer_id);
function permissions(userId, targetId) {
  assertUser(targetId);
  assertUnblocked(userId, targetId);
  const preferences = parse(
    db
      .prepare("SELECT data_json FROM shared_settings WHERE user_id=?")
      .get(targetId)?.data_json,
  );
  if (
    preferences.allowMessages === "nobody" ||
    (preferences.allowMessages === "following" &&
      !db
        .prepare("SELECT 1 FROM shared_follows WHERE user_id=? AND target_id=?")
        .get(targetId, userId))
  )
    throw new HttpError(
      403,
      "This account does not accept new messages from you.",
    );
}
export function directConversation(userId, targetId) {
  if (userId === targetId) throw new HttpError(422, "Choose another account.");
  permissions(userId, targetId);
  return transaction(() => {
    lockUsers([userId, targetId]);
    const key = "direct:" + [userId, targetId].sort().join(":"),
      old = db
        .prepare("SELECT id FROM conversations WHERE conversation_key=?")
        .get(key);
    if (old) return { id: old.id };
    const keyId = id("conversation");
    db.prepare(
      "INSERT INTO conversations(id,conversation_key,context_type,context_id,buyer_id,seller_id,created_at,updated_at) VALUES(?,?,'store','',?,?,?,?)",
    ).run(keyId, key, userId, targetId, now(), now());
    return { id: keyId };
  });
}
export function messageView(userId, row) {
  const meta = db
      .prepare("SELECT * FROM shared_message_meta WHERE message_id=?")
      .get(row.id),
    deleted = !!meta?.deleted_at;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: chatPerson(row.sender_id),
    body: deleted ? "" : row.body,
    deleted,
    editedAt: meta?.edited_at || null,
    createdAt: row.created_at,
    status: row.is_read ? "read" : meta?.delivered_at ? "delivered" : "sent",
    replyId: meta?.reply_id || null,
    attachment: deleted
      ? null
      : meta?.attachment_id
        ? db
            .prepare(
              "SELECT id,kind,mime_type,bytes,name FROM shared_media WHERE id=?",
            )
            .get(meta.attachment_id)
        : row.attachment_url
          ? { legacyUrl: row.attachment_url }
          : null,
    context: deleted ? null : parse(row.context_snapshot),
    reactions: deleted
      ? []
      : db
          .prepare(
            "SELECT user_id,emoji FROM shared_message_reactions WHERE message_id=?",
          )
          .all(row.id),
  };
}
export function conversationMessages(userId, key, query = {}) {
  ownedConversation(userId, key);
  const p = page(query),
    settings = db
      .prepare(
        "SELECT cleared_before FROM shared_chat_settings WHERE conversation_id=? AND user_id=?",
      )
      .get(key, userId);
  const rows = db
    .prepare(
      `SELECT m.* FROM messages m WHERE m.conversation_id=? AND m.created_at>? AND NOT EXISTS(SELECT 1 FROM shared_message_hidden h WHERE h.message_id=m.id AND h.user_id=?) ${query.search ? "AND m.body LIKE ?" : ""} ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`,
    )
    .all(
      key,
      settings?.cleared_before || "",
      userId,
      ...(query.search
        ? ["%" + z.string().max(100).parse(query.search) + "%"]
        : []),
      p.limit,
      p.offset,
    );
  return {
    messages: rows.reverse().map((r) => messageView(userId, r)),
    nextOffset: rows.length === p.limit ? p.offset + p.limit : null,
  };
}
export function conversations(userId, query = {}) {
  const p = page(query);
  const rows = db
    .prepare(
      "SELECT * FROM conversations WHERE buyer_id=? OR seller_id=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
    )
    .all(userId, userId, p.limit, p.offset);
  return rows
    .map((c) => {
      const settings = db
        .prepare(
          "SELECT * FROM shared_chat_settings WHERE conversation_id=? AND user_id=?",
        )
        .get(c.id, userId);
      const last = db
        .prepare(
          "SELECT m.* FROM messages m WHERE conversation_id=? AND created_at>? AND NOT EXISTS (SELECT 1 FROM shared_message_hidden h WHERE h.message_id=m.id AND h.user_id=?) ORDER BY created_at DESC,id DESC LIMIT 1",
        )
        .get(c.id, settings?.cleared_before || "", userId);
      const targetId = other(c, userId),
        presence = db
          .prepare("SELECT seen_at FROM shared_presence WHERE user_id=?")
          .get(targetId),
        prefs = parse(
          db
            .prepare("SELECT data_json FROM shared_settings WHERE user_id=?")
            .get(targetId)?.data_json,
        );
      return {
        id: c.id,
        participant: chatPerson(targetId),
        lastMessage: last ? messageView(userId, last) : null,
        unreadCount: Number(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM messages m WHERE conversation_id=? AND sender_id<>? AND is_read=0 AND created_at>? AND NOT EXISTS(SELECT 1 FROM shared_message_hidden h WHERE h.message_id=m.id AND h.user_id=?)",
            )
            .get(c.id, userId, settings?.cleared_before || "", userId).count,
        ),
        online:
          prefs.showOnline !== false &&
          !!presence &&
          Date.parse(presence.seen_at) > Date.now() - 90000,
        muted: !!settings?.muted,
        archived: !!settings?.archived,
        pinned: !!settings?.pinned,
      };
    })
    .filter((c) => (query.archived === "true" ? c.archived : !c.archived))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
}
export function sendChat(userId, key, raw, idempotencyKey) {
  assertTerms(userId);
  const data = z
    .object({
      body: z.string().trim().max(1600).default(""),
      attachmentId: identifier.optional(),
      replyId: identifier.optional(),
      productId: identifier.optional(),
      postId: identifier.optional(),
      offerId: identifier.optional(),
    })
    .strict()
    .parse(raw);
  z.string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .parse(idempotencyKey);
  return transaction(() => {
    const c = ownedConversation(userId, key),
      targetId = other(c, userId);
    lockUsers([userId, targetId]);
    permissions(userId, targetId);
    const digest = hash(json(data)),
      old = db
        .prepare(
          "SELECT * FROM shared_message_keys WHERE user_id=? AND request_key=?",
        )
        .get(userId, idempotencyKey);
    if (old) {
      if (old.request_hash !== digest || old.conversation_id !== key)
        throw new HttpError(409, "This message key was already used.");
      return messageView(
        userId,
        db.prepare("SELECT * FROM messages WHERE id=?").get(old.message_id),
      );
    }
    if (data.attachmentId)
      ownedMedia(
        userId,
        [data.attachmentId],
        ["chat_image", "document", "voice"],
      );
    if (
      data.replyId &&
      !db
        .prepare("SELECT id FROM messages WHERE id=? AND conversation_id=?")
        .get(data.replyId, key)
    )
      throw new HttpError(422, "Reply to a message in this conversation.");
    let context = {};
    if (data.productId) {
      const product = publicProduct(productRow(data.productId, userId));
      let postId = null;
      if (data.postId) {
        const post = db
          .prepare(
            "SELECT id FROM shared_posts WHERE id=? AND product_id=? AND active=1",
          )
          .get(data.postId, product.id);
        if (!post)
          throw new HttpError(422, "Post does not match this product.");
        postId = post.id;
      }
      context = {
        kind: "product",
        productId: product.id,
        postId,
        name: product.name,
        priceKobo: product.priceKobo,
        imageUrl: product.media?.[0]?.url || null,
      };
    }
    if (data.offerId) {
      const offer = db
        .prepare(
          "SELECT * FROM shared_offers WHERE id=? AND ((buyer_id=? AND seller_id=?) OR (seller_id=? AND buyer_id=?))",
        )
        .get(data.offerId, userId, targetId, userId, targetId);
      if (!offer) throw new HttpError(404, "Offer not found.");
      context = {
        kind: "offer",
        offerId: offer.id,
        productId: offer.product_id,
        status: offer.status,
        discountBps: offer.discount_bps,
      };
    }
    if (!data.body && !data.attachmentId && !context.kind)
      throw new HttpError(422, "Message cannot be empty.");
    const protectedText = protectMessageContent({
      senderId: userId,
      recipientId: targetId,
      conversationId: key,
      body: data.body,
    });
    if (protectedText.flagged)
      throw new HttpError(422, "Keep payments and contact inside Gleenc.");
    const messageId = id("message");
    db.prepare(
      "INSERT INTO messages(id,conversation_id,sender_id,body,context_type,context_id,context_snapshot,is_read,created_at) VALUES(?,?,?,?,?,?,?,0,?)",
    ).run(
      messageId,
      key,
      userId,
      protectedText.body || "",
      context.kind || "",
      context.productId || context.offerId || "",
      json(context),
      now(),
    );
    db.prepare(
      "INSERT INTO shared_message_meta(message_id,reply_id,attachment_id) VALUES(?,?,?)",
    ).run(messageId, data.replyId || null, data.attachmentId || null);
    db.prepare(
      "INSERT INTO shared_message_keys(user_id,request_key,request_hash,conversation_id,message_id) VALUES(?,?,?,?,?)",
    ).run(userId, idempotencyKey, digest, key, messageId);
    db.prepare(
      "UPDATE conversations SET last_message_body=?,last_message_at=?,updated_at=? WHERE id=?",
    ).run(
      data.body || "Shared " + (context.kind || "attachment"),
      now(),
      now(),
      key,
    );
    notify(targetId, "message", key, userId, {
      conversationId: key,
      messageId,
    });
    return messageView(
      userId,
      db.prepare("SELECT * FROM messages WHERE id=?").get(messageId),
    );
  });
}
export function acknowledge(userId, key, raw) {
  const d = z
    .object({
      messageIds: z.array(identifier).min(1).max(100),
      status: z.enum(["delivered", "read"]),
    })
    .strict()
    .parse(raw);
  ownedConversation(userId, key);
  return transaction(() => {
    for (const messageId of d.messageIds) {
      const m = db
        .prepare(
          "SELECT id,sender_id FROM messages WHERE id=? AND conversation_id=?",
        )
        .get(messageId, key);
      if (!m || m.sender_id === userId) continue;
      db.prepare(
        "INSERT INTO shared_message_meta(message_id,delivered_at) VALUES(?,?) ON CONFLICT(message_id) DO UPDATE SET delivered_at=COALESCE(shared_message_meta.delivered_at,excluded.delivered_at)",
      ).run(m.id, now());
      if (d.status === "read")
        db.prepare("UPDATE messages SET is_read=1 WHERE id=?").run(m.id);
    }
    return { updated: true };
  });
}
export function changeMessage(userId, key, messageId, raw) {
  const d = z
      .object({
        action: z.enum(["edit", "delete", "hide", "react"]),
        body: z.string().trim().min(1).max(1600).optional(),
        emoji: z.enum(["❤️", "👍", "😂", "😮", "😢", "🙏"]).optional(),
      })
      .strict()
      .parse(raw),
    c = ownedConversation(userId, key),
    m = db
      .prepare("SELECT * FROM messages WHERE id=? AND conversation_id=?")
      .get(messageId, key);
  if (!m) throw new HttpError(404, "Message not found.");
  return transaction(() => {
    if (["edit", "delete"].includes(d.action)) {
      if (m.sender_id !== userId)
        throw new HttpError(403, "Only the sender can change this message.");
      if (Date.now() - Date.parse(m.created_at) > 15 * 60000)
        throw new HttpError(409, "The 15 minute edit/delete window ended.");
      if (d.action === "edit") {
        if (!d.body) throw new HttpError(422, "Enter a message.");
        const protectedText = protectMessageContent({
          senderId: userId,
          recipientId: other(c, userId),
          conversationId: key,
          body: d.body,
        });
        if (protectedText.flagged)
          throw new HttpError(422, "Keep payments inside Gleenc.");
        db.prepare("UPDATE messages SET body=? WHERE id=?").run(
          protectedText.body,
          m.id,
        );
      }
      if (d.action === "delete")
        db.prepare(
          "UPDATE messages SET body='',attachment_url=NULL,context_type='',context_id='',context_snapshot='{}' WHERE id=?",
        ).run(m.id);
      db.prepare(
        `INSERT INTO shared_message_meta(message_id,${d.action === "edit" ? "edited_at" : "deleted_at"}) VALUES(?,?) ON CONFLICT(message_id) DO UPDATE SET ${d.action === "edit" ? "edited_at" : "deleted_at"}=excluded.${d.action === "edit" ? "edited_at" : "deleted_at"}`,
      ).run(m.id, now());
    } else if (d.action === "hide")
      db.prepare(
        "INSERT INTO shared_message_hidden(message_id,user_id) VALUES(?,?) ON CONFLICT(message_id,user_id) DO NOTHING",
      ).run(m.id, userId);
    else {
      if (!d.emoji) throw new HttpError(422, "Choose a reaction.");
      db.prepare(
        "INSERT INTO shared_message_reactions(message_id,user_id,emoji) VALUES(?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji",
      ).run(m.id, userId, d.emoji);
    }
    return { updated: true };
  });
}
export function chatSettings(userId, key, raw) {
  const d = z
    .object({
      muted: z.boolean().optional(),
      archived: z.boolean().optional(),
      pinned: z.boolean().optional(),
      clear: z.boolean().default(false),
    })
    .strict()
    .parse(raw);
  ownedConversation(userId, key);
  const existing=db.prepare("SELECT muted,archived,pinned FROM shared_chat_settings WHERE conversation_id=? AND user_id=?").get(key,userId);
  d.muted=d.muted??!!existing?.muted;d.archived=d.archived??!!existing?.archived;d.pinned=d.pinned??!!existing?.pinned;
  db.prepare(
    "INSERT INTO shared_chat_settings(conversation_id,user_id,muted,archived,pinned,cleared_before) VALUES(?,?,?,?,?,?) ON CONFLICT(conversation_id,user_id) DO UPDATE SET muted=excluded.muted,archived=excluded.archived,pinned=excluded.pinned,cleared_before=CASE WHEN excluded.cleared_before<>'' THEN excluded.cleared_before ELSE shared_chat_settings.cleared_before END",
  ).run(
    key,
    userId,
    d.muted ? 1 : 0,
    d.archived ? 1 : 0,
    d.pinned ? 1 : 0,
    d.clear ? now() : "",
  );
  return d;
}
