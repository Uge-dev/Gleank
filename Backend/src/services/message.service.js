import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createNotification } from "./notification.service.js";
import { protectMessageContent } from "./payment-protection.service.js";

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

function serializeConversation(row, viewerUserId) {
  const viewerIsBuyer = row.buyer_id === viewerUserId;
  const otherUserId = viewerIsBuyer ? row.seller_id : row.buyer_id;
  const otherUserName = viewerIsBuyer ? row.seller_name : row.buyer_name;
  const otherUserRole = viewerIsBuyer ? row.seller_role : row.buyer_role;
  const otherUserAvatarUrl = viewerIsBuyer
    ? row.context_type === "support"
      ? row.support_admin_avatar_url || row.seller_avatar_url
      : row.seller_avatar_url
    : row.buyer_avatar_url;
  const storePrefix = viewerIsBuyer ? "seller" : "buyer";
  const storeName = row[`${storePrefix}_store_name`] || "";
  const storeSlug = row[`${storePrefix}_store_slug`] || "";
  const storeLogoUrl = row[`${storePrefix}_store_logo_url`] || null;
  const storeCampus = row[`${storePrefix}_store_campus`] || "";
  const storeCategory = row[`${storePrefix}_store_category`] || "";

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
    otherUserId,
    otherUserName:
      row.context_type === "support"
        ? otherUserName || "Gleenc Support"
        : otherUserName || "Gleenc user",
    otherUserRole: otherUserRole || "buyer",
    otherUserAvatarUrl: otherUserAvatarUrl || null,
    listingName: row.listing_name || "",
    listingImageUrl: parseImages(row.listing_image_urls)[0] || null,
    storeName,
    storeSlug,
    storeLogoUrl,
    storeCampus,
    storeCategory,
    unreadCount: Number(row.unread_count || 0),
    lastMessageBody: row.last_message_body || "",
    lastMessageAt: row.last_message_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function conversationSelect(extraWhere = "") {
  return `
    SELECT conversations.*,
           buyer.name AS buyer_name,
           buyer.role AS buyer_role,
           buyer.avatar_url AS buyer_avatar_url,
           seller.name AS seller_name,
           seller.role AS seller_role,
           seller.avatar_url AS seller_avatar_url,
           (
             SELECT avatar_url
             FROM users support_admin
             WHERE support_admin.role = 'admin'
               AND support_admin.avatar_url IS NOT NULL
               AND support_admin.avatar_url != ''
             ORDER BY support_admin.updated_at DESC
             LIMIT 1
           ) AS support_admin_avatar_url,
           used_listings.name AS listing_name,
           used_listings.image_urls AS listing_image_urls,
           (
             SELECT name FROM stores
             WHERE owner_id = conversations.buyer_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS buyer_store_name,
           (
             SELECT slug FROM stores
             WHERE owner_id = conversations.buyer_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS buyer_store_slug,
           (
             SELECT logo_url FROM stores
             WHERE owner_id = conversations.buyer_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS buyer_store_logo_url,
           (
             SELECT campus FROM stores
             WHERE owner_id = conversations.buyer_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS buyer_store_campus,
           (
             SELECT category FROM stores
             WHERE owner_id = conversations.buyer_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS buyer_store_category,
           (
             SELECT name FROM stores
             WHERE owner_id = conversations.seller_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS seller_store_name,
           (
             SELECT slug FROM stores
             WHERE owner_id = conversations.seller_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS seller_store_slug,
           (
             SELECT logo_url FROM stores
             WHERE owner_id = conversations.seller_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS seller_store_logo_url,
           (
             SELECT campus FROM stores
             WHERE owner_id = conversations.seller_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS seller_store_campus,
           (
             SELECT category FROM stores
             WHERE owner_id = conversations.seller_id AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1
           ) AS seller_store_category,
           (
             SELECT COUNT(*)
             FROM messages
             WHERE messages.conversation_id = conversations.id
               AND messages.sender_id <> ?
               AND messages.is_read = 0
           ) AS unread_count
    FROM conversations
    JOIN users buyer ON buyer.id = conversations.buyer_id
    JOIN users seller ON seller.id = conversations.seller_id
    LEFT JOIN used_listings ON used_listings.id = conversations.listing_id
    ${extraWhere}
  `;
}

function getSupportAdmin() {
  const existingAdmin = db
    .prepare(`
      SELECT * FROM users
      WHERE role = 'admin'
      ORDER BY CASE WHEN avatar_url IS NOT NULL AND avatar_url != '' THEN 0 ELSE 1 END,
               created_at ASC
      LIMIT 1
    `)
    .get();

  if (existingAdmin) return existingAdmin;

  const now = new Date().toISOString();
  const id = createId("adm");

  db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role, campus, phone,
      avatar_url, is_active, email_verified, email_verified_at,
      phone_verified, phone_verified_at, failed_login_count, locked_until,
      last_login_at, last_password_change_at, created_at, updated_at
    )
    VALUES (
      ?, 'Gleenc Support', 'support@gleank.local', 'support-account',
      'admin', 'Gleenc HQ', '', NULL, 1, 1, ?, 0, NULL, 0, NULL,
      NULL, ?, ?, ?
    )
  `).run(id, now, now, now, now);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function serializeMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name || "Gleenc user",
    senderRole: row.sender_role || "buyer",
    senderAvatarUrl: row.sender_avatar_url || null,
    body: row.body,
    attachmentUrl: row.attachment_url || null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function conversationRow(userId, conversationId) {
  return db
    .prepare(conversationSelect(`
      WHERE conversations.id = ?
        AND (conversations.buyer_id = ? OR conversations.seller_id = ?)
    `))
    .get(userId, conversationId, userId, userId);
}

function conversationSortValue(row) {
  return new Date(row.lastMessageAt || row.updatedAt || row.createdAt || 0).getTime();
}

function conversationDedupeKey(conversation) {
  if (conversation.contextType === "support") {
    return `support:${conversation.buyerId}:${conversation.sellerId}`;
  }

  return `direct:${[conversation.buyerId, conversation.sellerId].sort().join(":")}`;
}

function dedupeSerializedConversations(conversations) {
  const byKey = new Map();

  for (const conversation of conversations) {
    const key = conversationDedupeKey(conversation);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, conversation);
      continue;
    }

    const shouldReplace =
      (!existing.lastMessageBody && conversation.lastMessageBody) ||
      conversationSortValue(conversation) > conversationSortValue(existing);

    if (shouldReplace) byKey.set(key, conversation);
  }

  return [...byKey.values()].sort((a, b) => conversationSortValue(b) - conversationSortValue(a));
}

function normalizeDirectConversationDuplicates(firstUserId, secondUserId, preferredContext = {}) {
  const rows = db
    .prepare(`
      SELECT conversations.*,
             (
               SELECT COUNT(*)
               FROM messages
               WHERE messages.conversation_id = conversations.id
             ) AS message_count
      FROM conversations
      WHERE context_type != 'support'
        AND (
          (buyer_id = ? AND seller_id = ?)
          OR (buyer_id = ? AND seller_id = ?)
        )
      ORDER BY message_count DESC,
               COALESCE(last_message_at, updated_at, created_at) DESC
    `)
    .all(firstUserId, secondUserId, secondUserId, firstUserId);

  if (!rows.length) return null;

  const primary = rows[0];

  for (const duplicate of rows.slice(1)) {
    db.prepare("UPDATE messages SET conversation_id = ? WHERE conversation_id = ?").run(primary.id, duplicate.id);
    db.prepare("UPDATE used_market_orders SET conversation_id = ? WHERE conversation_id = ?").run(primary.id, duplicate.id);
    db.prepare("UPDATE admin_conversation_access_logs SET conversation_id = ? WHERE conversation_id = ?").run(primary.id, duplicate.id);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(duplicate.id);
  }

  const latestMessage = db
    .prepare(`
      SELECT body, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(primary.id);

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE conversations
    SET context_type = ?,
        context_id = ?,
        listing_id = COALESCE(listing_id, ?),
        order_id = COALESCE(order_id, ?),
        last_message_body = ?,
        last_message_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    clean(preferredContext.contextType || primary.context_type, 40),
    clean(preferredContext.contextId || primary.context_id, 180),
    preferredContext.listingId || null,
    preferredContext.orderId || null,
    latestMessage?.body || primary.last_message_body || "",
    latestMessage?.created_at || primary.last_message_at || null,
    now,
    primary.id,
  );

  return primary.id;
}

function normalizeAllDirectConversationDuplicates(userId) {
  const counterparts = db.prepare(`
    SELECT DISTINCT
      CASE WHEN buyer_id = ? THEN seller_id ELSE buyer_id END AS counterpart_id
    FROM conversations
    WHERE context_type != 'support'
      AND (buyer_id = ? OR seller_id = ?)
  `).all(userId, userId, userId);

  for (const row of counterparts) {
    if (row.counterpart_id) {
      normalizeDirectConversationDuplicates(userId, row.counterpart_id);
    }
  }
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

  const sellerStore = db
    .prepare("SELECT id, slug FROM stores WHERE owner_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1")
    .get(listing.seller_id);

  if (sellerStore) {
    return createStoreConversation(userId, sellerStore.slug || sellerStore.id);
  }

  const canonicalId = normalizeDirectConversationDuplicates(
    userId,
    listing.seller_id,
    { contextType: "used_listing", contextId: listingId, listingId },
  );
  if (canonicalId) return getConversation(userId, canonicalId);

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

  const canonicalId = normalizeDirectConversationDuplicates(
    order.buyer_id,
    order.seller_id,
    {
      contextType: "used_order",
      contextId: orderId,
      listingId: order.listing_id,
      orderId,
    },
  );
  if (canonicalId) {
    db.prepare("UPDATE used_market_orders SET conversation_id = ? WHERE id = ?").run(canonicalId, orderId);
    return getConversation(userId, canonicalId);
  }

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

export function createStoreConversation(userId, storeIdOrSlug) {
  const store = db
    .prepare(`
      SELECT stores.*, users.name AS owner_name
      FROM stores
      JOIN users ON users.id = stores.owner_id
      WHERE (stores.id = ? OR stores.slug = ?)
        AND stores.status = 'active'
    `)
    .get(storeIdOrSlug, storeIdOrSlug);

  if (!store) throw new HttpError(404, "Store was not found.");
  if (store.owner_id === userId) {
    throw new HttpError(422, "You cannot start a store conversation with yourself.");
  }

  const existingId = normalizeDirectConversationDuplicates(
    userId,
    store.owner_id,
    { contextType: "store", contextId: store.id },
  );
  if (existingId) return getConversation(userId, existingId);

  const now = new Date().toISOString();
  const id = createId("cnv");

  db.prepare(`
    INSERT INTO conversations (
      id, context_type, context_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, 'store', ?, ?, ?, '', NULL, ?, ?)
  `).run(id, store.id, userId, store.owner_id, now, now);

  return getConversation(userId, id);
}

export function createStoreOrderConversation(userId, orderId) {
  const order = db
    .prepare(`
      SELECT orders.*, stores.name AS store_name
      FROM orders
      JOIN stores ON stores.id = orders.store_id
      WHERE orders.id = ? AND (orders.buyer_id = ? OR orders.seller_id = ?)
    `)
    .get(orderId, userId, userId);

  if (!order) throw new HttpError(404, "Order was not found.");

  const contextId = `order:${order.id}`;
  const canonicalId = normalizeDirectConversationDuplicates(
    order.buyer_id,
    order.seller_id,
    { contextType: "store", contextId, orderId: order.id },
  );
  if (canonicalId) return getConversation(userId, canonicalId);

  const now = new Date().toISOString();
  const id = createId("cnv");

  db.prepare(`
    INSERT INTO conversations (
      id, context_type, context_id, order_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, 'store', ?, ?, ?, ?, '', NULL, ?, ?)
  `).run(id, contextId, order.id, order.buyer_id, order.seller_id, now, now);

  return getConversation(userId, id);
}

export function createDeliveryAssignmentConversation(userId, assignmentId) {
  const assignment = db
    .prepare(`
      SELECT rider_assignments.*, rider.name AS rider_name, seller.name AS seller_name, buyer.name AS buyer_name
      FROM rider_assignments
      JOIN users rider ON rider.id = rider_assignments.rider_id
      JOIN users seller ON seller.id = rider_assignments.seller_id
      JOIN users buyer ON buyer.id = rider_assignments.buyer_id
      WHERE rider_assignments.id = ?
    `)
    .get(assignmentId);

  if (!assignment) throw new HttpError(404, "Delivery assignment was not found.");

  const userRole = db.prepare("SELECT role FROM users WHERE id = ?").get(userId)?.role || "";
  const isSellerRiderChat = userId === assignment.seller_id || userId === assignment.rider_id || userRole === "admin";
  const isBuyerRiderChat = userId === assignment.buyer_id;

  if (!isSellerRiderChat && !isBuyerRiderChat) {
    throw new HttpError(403, "You cannot open this delivery conversation.");
  }

  const contextId = isBuyerRiderChat
    ? `delivery_buyer:${assignment.id}`
    : `delivery_assignment:${assignment.id}`;
  const buyerId = isBuyerRiderChat ? assignment.buyer_id : assignment.rider_id;
  const sellerId = isBuyerRiderChat ? assignment.rider_id : assignment.seller_id;

  const canonicalId = normalizeDirectConversationDuplicates(
    buyerId,
    sellerId,
    { contextType: "store", contextId, orderId: assignment.order_id || assignment.id },
  );
  if (canonicalId) {
    if (userRole === "admin") recordAdminConversationAccess(userId, canonicalId, "Delivery assignment review", assignment.delivery_batch_id);
    return getConversation(userRole === "admin" ? buyerId : userId, canonicalId);
  }

  const existing = db
    .prepare(`
      SELECT id FROM conversations
      WHERE context_type = 'store'
        AND context_id = ?
        AND buyer_id = ?
        AND seller_id = ?
    `)
    .get(contextId, buyerId, sellerId);

  if (existing) {
    if (userRole === "admin") recordAdminConversationAccess(userId, existing.id, "Delivery assignment review", assignment.delivery_batch_id);
    return getConversation(userRole === "admin" ? buyerId : userId, existing.id);
  }

  const now = new Date().toISOString();
  const id = createId("cnv");

  db.prepare(`
    INSERT INTO conversations (
      id, context_type, context_id, order_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, 'store', ?, ?, ?, ?, 'Delivery chat opened.', ?, ?, ?)
  `).run(id, contextId, assignment.order_id || assignment.id, buyerId, sellerId, now, now, now);

  if (userRole === "admin") recordAdminConversationAccess(userId, id, "Delivery assignment review", assignment.delivery_batch_id);

  return getConversation(userRole === "admin" ? buyerId : userId, id);
}

export function recordAdminConversationAccess(adminId, conversationId, reason = "", relatedDeliveryBatchId = null) {
  const admin = db.prepare("SELECT id, role FROM users WHERE id = ?").get(adminId);
  if (!admin || admin.role !== "admin") return null;
  const now = new Date().toISOString();
  const id = createId("acl");
  db.prepare(`
    INSERT INTO admin_conversation_access_logs (
      id, admin_id, conversation_id, reason, related_delivery_batch_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, adminId, conversationId, clean(reason, 300), relatedDeliveryBatchId || null, now);
  return { id, adminId, conversationId, relatedDeliveryBatchId, createdAt: now };
}

export function createSupportConversation(userId) {
  const support = getSupportAdmin();

  if (support.id === userId) {
    throw new HttpError(422, "Support conversations require a user account.");
  }

  const existing = db
    .prepare(`
      SELECT id FROM conversations
      WHERE context_type = 'support'
        AND context_id = 'admin'
        AND buyer_id = ?
        AND seller_id = ?
    `)
    .get(userId, support.id);

  if (existing) return getConversation(userId, existing.id);

  const now = new Date().toISOString();
  const id = createId("cnv");

  db.prepare(`
    INSERT INTO conversations (
      id, context_type, context_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, 'support', 'admin', ?, ?, 'Gleenc support is ready to help.', ?, ?, ?)
  `).run(id, userId, support.id, now, now, now);

  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, body, attachment_url, is_read, created_at)
    VALUES (?, ?, ?, ?, NULL, 0, ?)
  `).run(
    createId("msg"),
    id,
    support.id,
    "Hi, this is Gleenc Support. Send your message here and an admin can follow up.",
    now,
  );

  return getConversation(userId, id);
}

export function listConversations(userId) {
  // This also repairs legacy duplicates created from product, order, store and
  // delivery entry points before canonical account-pair conversations existed.
  normalizeAllDirectConversationDuplicates(userId);
  const conversations = db
    .prepare(conversationSelect(`
      WHERE conversations.buyer_id = ? OR conversations.seller_id = ?
      ORDER BY COALESCE(conversations.last_message_at, conversations.updated_at) DESC
      LIMIT 100
    `))
    .all(userId, userId, userId)
    .map((row) => serializeConversation(row, userId));

  return dedupeSerializedConversations(conversations);
}

export function getUnreadMessageCount(userId) {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM messages
      JOIN conversations ON conversations.id = messages.conversation_id
      WHERE (conversations.buyer_id = ? OR conversations.seller_id = ?)
        AND messages.sender_id <> ?
        AND messages.is_read = 0
    `)
    .get(userId, userId, userId);

  return Number(row?.count || 0);
}

export function getConversation(userId, conversationId) {
  const row = conversationRow(userId, conversationId);
  if (!row) throw new HttpError(404, "Conversation was not found.");
  return serializeConversation(row, userId);
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
      SELECT messages.*,
             users.name AS sender_name,
             users.role AS sender_role,
             users.avatar_url AS sender_avatar_url
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
  const conversation = getConversation(userId, conversationId);

  const body = clean(input?.body, 1600);
  const attachmentUrl = clean(input?.attachmentUrl, 2000);
  if (!body && !attachmentUrl) throw new HttpError(422, "Message cannot be empty.");

  const now = new Date().toISOString();
  const id = createId("msg");
  const recipientId =
    conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
  const protectedMessage = body
    ? protectMessageContent({
        senderId: userId,
        recipientId,
        conversationId,
        body,
      })
    : { body, flagged: false, warning: "" };
  const finalBody = clean(protectedMessage.body, 1600);
  const previewBody = finalBody || "Sent an image";

  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, body, attachment_url, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, conversationId, userId, finalBody, attachmentUrl || null, now);

  db.prepare(`
    UPDATE conversations
    SET last_message_body = ?, last_message_at = ?, updated_at = ?
    WHERE id = ?
  `).run(previewBody, now, now, conversationId);

  if (recipientId && recipientId !== userId) {
    const sender = db
      .prepare("SELECT name, avatar_url FROM users WHERE id = ?")
      .get(userId);
    createNotification({
      userId: recipientId,
      type: "message",
      title: `New message from ${sender?.name || "Gleenc user"}`,
      body: previewBody,
      actionLabel: "Open chat",
      actionPath: conversation.contextType === "used_order" || conversation.contextType === "used_listing"
        ? `/used-messages?conversation=${conversation.id}`
        : `/messages`,
      imageUrl: sender?.avatar_url || conversation.storeLogoUrl || conversation.listingImageUrl || "",
    });
  }

  return listMessages(userId, conversationId).at(-1);
}
