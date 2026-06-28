import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";

function clean(value, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

function parseImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function serializeConversation(row) {
  return {
    id: row.id,
    contextType: row.context_type,
    contextId: row.context_id,
    listingId: row.listing_id || null,
    orderId: row.order_id || null,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    buyerName: row.buyer_name || "",
    sellerName: row.seller_name || "",
    otherUserName: row.other_user_name || "",
    listingName: row.listing_name || "",
    listingImageUrl: parseImages(row.listing_image_urls)[0] || null,
    lastMessageBody: row.last_message_body || "",
    lastMessageAt: row.last_message_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name || "Gleank user",
    body: row.body,
    attachmentUrl: row.attachment_url || null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function conversationRow(userId, conversationId) {
  return db
    .prepare(`
      SELECT conversations.*,
             buyer.name AS buyer_name,
             seller.name AS seller_name,
             CASE
               WHEN conversations.buyer_id = ? THEN seller.name
               ELSE buyer.name
             END AS other_user_name,
             used_listings.name AS listing_name,
             used_listings.image_urls AS listing_image_urls
      FROM conversations
      JOIN users buyer ON buyer.id = conversations.buyer_id
      JOIN users seller ON seller.id = conversations.seller_id
      LEFT JOIN used_listings ON used_listings.id = conversations.listing_id
      WHERE conversations.id = ?
        AND (conversations.buyer_id = ? OR conversations.seller_id = ?)
    `)
    .get(userId, conversationId, userId, userId);
}

export function createUsedListingConversation(userId, listingId) {
  const listing = db
    .prepare(`
      SELECT used_listings.*, users.name AS seller_name
      FROM used_listings
      JOIN users ON users.id = used_listings.seller_id
      WHERE used_listings.id = ?
        AND used_listings.status IN ('active', 'sold')
    `)
    .get(listingId);

  if (!listing) throw new HttpError(404, "Used item was not found.");
  if (listing.seller_id === userId) {
    throw new HttpError(422, "You cannot start a buyer conversation with your own listing.");
  }

  const existing = db
    .prepare(`
      SELECT id FROM conversations
      WHERE context_type = 'used_listing'
        AND context_id = ?
        AND buyer_id = ?
        AND seller_id = ?
    `)
    .get(listingId, userId, listing.seller_id);

  if (existing) return getConversation(userId, existing.id);

  const now = new Date().toISOString();
  const id = createId("cnv");

  db.prepare(`
    INSERT INTO conversations (
      id, context_type, context_id, listing_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, 'used_listing', ?, ?, ?, ?, '', NULL, ?, ?)
  `).run(id, listingId, listingId, userId, listing.seller_id, now, now);

  return getConversation(userId, id);
}

export function createUsedOrderConversation(userId, orderId) {
  const order = db
    .prepare(`
      SELECT * FROM used_market_orders
      WHERE id = ? AND (buyer_id = ? OR seller_id = ?)
    `)
    .get(orderId, userId, userId);

  if (!order) throw new HttpError(404, "Used order was not found.");

  if (order.conversation_id) return getConversation(userId, order.conversation_id);

  const existing = db
    .prepare(`
      SELECT id FROM conversations
      WHERE context_type = 'used_order'
        AND context_id = ?
        AND buyer_id = ?
        AND seller_id = ?
    `)
    .get(orderId, order.buyer_id, order.seller_id);

  if (existing) {
    db.prepare("UPDATE used_market_orders SET conversation_id = ? WHERE id = ?").run(existing.id, orderId);
    return getConversation(userId, existing.id);
  }

  const now = new Date().toISOString();
  const id = createId("cnv");

  db.prepare(`
    INSERT INTO conversations (
      id, context_type, context_id, listing_id, order_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, 'used_order', ?, ?, ?, ?, ?, '', NULL, ?, ?)
  `).run(id, orderId, order.listing_id, orderId, order.buyer_id, order.seller_id, now, now);

  db.prepare("UPDATE used_market_orders SET conversation_id = ? WHERE id = ?").run(id, orderId);

  return getConversation(userId, id);
}

export function listConversations(userId) {
  return db
    .prepare(`
      SELECT conversations.*,
             buyer.name AS buyer_name,
             seller.name AS seller_name,
             CASE
               WHEN conversations.buyer_id = ? THEN seller.name
               ELSE buyer.name
             END AS other_user_name,
             used_listings.name AS listing_name,
             used_listings.image_urls AS listing_image_urls
      FROM conversations
      JOIN users buyer ON buyer.id = conversations.buyer_id
      JOIN users seller ON seller.id = conversations.seller_id
      LEFT JOIN used_listings ON used_listings.id = conversations.listing_id
      WHERE conversations.buyer_id = ? OR conversations.seller_id = ?
      ORDER BY COALESCE(conversations.last_message_at, conversations.updated_at) DESC
      LIMIT 100
    `)
    .all(userId, userId, userId)
    .map(serializeConversation);
}

export function getConversation(userId, conversationId) {
  const row = conversationRow(userId, conversationId);
  if (!row) throw new HttpError(404, "Conversation was not found.");
  return serializeConversation(row);
}

export function listMessages(userId, conversationId) {
  getConversation(userId, conversationId);

  db.prepare(`
    UPDATE messages
    SET is_read = 1
    WHERE conversation_id = ? AND sender_id <> ?
  `).run(conversationId, userId);

  return db
    .prepare(`
      SELECT messages.*, users.name AS sender_name
      FROM messages
      JOIN users ON users.id = messages.sender_id
      WHERE messages.conversation_id = ?
      ORDER BY messages.created_at ASC
      LIMIT 300
    `)
    .all(conversationId)
    .map(serializeMessage);
}

export function sendMessage(userId, conversationId, input) {
  getConversation(userId, conversationId);

  const body = clean(input?.body, 1600);
  if (!body) throw new HttpError(422, "Message cannot be empty.");

  const now = new Date().toISOString();
  const id = createId("msg");

  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, body, attachment_url, is_read, created_at)
    VALUES (?, ?, ?, ?, NULL, 0, ?)
  `).run(id, conversationId, userId, body, now);

  db.prepare(`
    UPDATE conversations
    SET last_message_body = ?, last_message_at = ?, updated_at = ?
    WHERE id = ?
  `).run(body, now, now, conversationId);

  return listMessages(userId, conversationId).at(-1);
}
