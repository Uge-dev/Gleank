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

function parseObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function directConversationKey(firstUserId, secondUserId) {
  return `direct:${[String(firstUserId || ""), String(secondUserId || "")].sort().join(":")}`;
}

function supportConversationKey(buyerId, sellerId) {
  return `support:${String(buyerId || "")}:${String(sellerId || "")}`;
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
           COALESCE(
             NULLIF(buyer.avatar_url, ''),
             (SELECT NULLIF(selfie_url, '') FROM rider_profiles WHERE user_id = buyer.id LIMIT 1)
           ) AS buyer_avatar_url,
           seller.name AS seller_name,
           seller.role AS seller_role,
           COALESCE(
             NULLIF(seller.avatar_url, ''),
             (SELECT NULLIF(selfie_url, '') FROM rider_profiles WHERE user_id = seller.id LIMIT 1)
           ) AS seller_avatar_url,
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
    context:
      row.context_type && row.context_id
        ? {
            type: row.context_type,
            id: row.context_id,
            ...parseObject(row.context_snapshot),
          }
        : null,
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
  const conversationKey = directConversationKey(firstUserId, secondUserId);
  db.prepare(`
    UPDATE conversations
    SET context_type = ?,
        context_id = ?,
        conversation_key = ?,
        listing_id = COALESCE(listing_id, ?),
        order_id = COALESCE(order_id, ?),
        last_message_body = ?,
        last_message_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    clean(preferredContext.contextType || primary.context_type, 40),
    clean(preferredContext.contextId || primary.context_id, 180),
    conversationKey,
    preferredContext.listingId || null,
    preferredContext.orderId || null,
    latestMessage?.body || primary.last_message_body || "",
    latestMessage?.created_at || primary.last_message_at || null,
    now,
    primary.id,
  );

  return primary.id;
}

function resolveMessageContext(conversation, contextType, contextId) {
  const type = clean(contextType, 40);
  const id = clean(contextId, 180);
  if (!type && !id) return null;
  if (!id || !["product", "used_listing"].includes(type)) {
    throw new HttpError(422, "This message context is not supported.");
  }

  const participants = new Set([conversation.buyerId, conversation.sellerId]);

  if (type === "product") {
    const product = db.prepare(`
      SELECT products.id, products.name, products.price_kobo, products.image_urls,
             stores.owner_id, stores.slug
      FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = ?
        AND products.status IN ('active', 'out_of_stock')
        AND stores.status = 'active'
    `).get(id);
    if (!product || !participants.has(product.owner_id)) {
      throw new HttpError(404, "The product for this conversation was not found.");
    }

    return {
      type,
      id: product.id,
      name: clean(product.name, 180),
      imageUrl: parseImages(product.image_urls)[0] || null,
      priceKobo: Number(product.price_kobo || 0),
      href: `/products/${product.id}`,
    };
  }

  const listing = db.prepare(`
    SELECT id, seller_id, name, price_kobo, image_urls
    FROM used_listings
    WHERE id = ? AND status IN ('active', 'sold')
  `).get(id);
  if (!listing || !participants.has(listing.seller_id)) {
    throw new HttpError(404, "The used item for this conversation was not found.");
  }

  return {
    type,
    id: listing.id,
    name: clean(listing.name, 180),
    imageUrl: parseImages(listing.image_urls)[0] || null,
    priceKobo: Number(listing.price_kobo || 0),
    href: `/used-market/${listing.id}`,
  };
}

export function getConversationDraftContext(userId, conversationId, contextType, contextId) {
  const conversation = getConversation(userId, conversationId);
  return resolveMessageContext(conversation, contextType, contextId);
}

export function createProductConversation(userId, productId) {
  const product = db.prepare(`
    SELECT products.id, stores.id AS store_id, stores.slug
    FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE products.id = ?
      AND products.status IN ('active', 'out_of_stock')
      AND stores.status = 'active'
  `).get(productId);
  if (!product) throw new HttpError(404, "Product was not found.");

  const conversation = createStoreConversation(userId, product.store_id || product.slug);
  return {
    conversation,
    draftContext: getConversationDraftContext(userId, conversation.id, "product", product.id),
  };
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
      id, conversation_key, context_type, context_id, listing_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, ?, 'used_listing', ?, ?, ?, ?, '', NULL, ?, ?)
  `).run(id, directConversationKey(userId, listing.seller_id), listingId, listingId, userId, listing.seller_id, now, now);

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
      id, conversation_key, context_type, context_id, listing_id, order_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, ?, 'used_order', ?, ?, ?, ?, ?, '', NULL, ?, ?)
  `).run(id, directConversationKey(order.buyer_id, order.seller_id), orderId, order.listing_id, orderId, order.buyer_id, order.seller_id, now, now);

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
      id, conversation_key, context_type, context_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, ?, 'store', ?, ?, ?, '', NULL, ?, ?)
  `).run(id, directConversationKey(userId, store.owner_id), store.id, userId, store.owner_id, now, now);

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
      id, conversation_key, context_type, context_id, order_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, ?, 'store', ?, ?, ?, ?, '', NULL, ?, ?)
  `).run(id, directConversationKey(order.buyer_id, order.seller_id), contextId, order.id, order.buyer_id, order.seller_id, now, now);

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
      id, conversation_key, context_type, context_id, order_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, ?, 'store', ?, ?, ?, ?, 'Delivery chat opened.', ?, ?, ?)
  `).run(id, directConversationKey(buyerId, sellerId), contextId, assignment.order_id || assignment.id, buyerId, sellerId, now, now, now);

  if (userRole === "admin") recordAdminConversationAccess(userId, id, "Delivery assignment review", assignment.delivery_batch_id);

  return getConversation(userRole === "admin" ? buyerId : userId, id);
}

export function createDeliveryOfferConversation(userId, dispatchAttemptId) {
  const offer = db.prepare(`
    SELECT dispatch_attempts.id,
           dispatch_attempts.rider_id,
           pickup_tasks.seller_id,
           pickup_tasks.order_id
    FROM dispatch_attempts
    JOIN pickup_tasks
      ON pickup_tasks.delivery_batch_id = dispatch_attempts.delivery_batch_id
     AND pickup_tasks.status != 'seller_rejected'
    WHERE dispatch_attempts.id = ?
    ORDER BY pickup_tasks.pickup_sequence ASC
    LIMIT 1
  `).get(dispatchAttemptId);

  if (!offer) throw new HttpError(404, "Delivery offer was not found.");

  const userRole = db.prepare("SELECT role FROM users WHERE id = ?").get(userId)?.role || "";
  if (userId !== offer.seller_id && userId !== offer.rider_id && userRole !== "admin") {
    throw new HttpError(403, "You cannot open this delivery offer conversation.");
  }

  const buyerId = offer.rider_id;
  const sellerId = offer.seller_id;
  const contextId = `dispatch_offer:${offer.id}`;
  const canonicalId = normalizeDirectConversationDuplicates(
    buyerId,
    sellerId,
    { contextType: "store", contextId, orderId: offer.order_id || offer.id },
  );
  if (canonicalId) {
    if (userRole === "admin") recordAdminConversationAccess(userId, canonicalId, "Dispatch offer review", null);
    return getConversation(userRole === "admin" ? buyerId : userId, canonicalId);
  }

  const existing = db.prepare(`
    SELECT id
    FROM conversations
    WHERE context_type = 'store'
      AND context_id = ?
      AND buyer_id = ?
      AND seller_id = ?
    LIMIT 1
  `).get(contextId, buyerId, sellerId);
  if (existing) return getConversation(userRole === "admin" ? buyerId : userId, existing.id);

  const now = new Date().toISOString();
  const id = createId("cnv");
  db.prepare(`
    INSERT INTO conversations (
      id, conversation_key, context_type, context_id, order_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, ?, 'store', ?, ?, ?, ?, '', NULL, ?, ?)
  `).run(
    id,
    directConversationKey(buyerId, sellerId),
    contextId,
    offer.order_id || offer.id,
    buyerId,
    sellerId,
    now,
    now,
  );

  if (userRole === "admin") recordAdminConversationAccess(userId, id, "Dispatch offer review", null);
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

  if (existing) {
    db.prepare("UPDATE conversations SET conversation_key = ? WHERE id = ?")
      .run(supportConversationKey(userId, support.id), existing.id);
    return getConversation(userId, existing.id);
  }

  const now = new Date().toISOString();
  const id = createId("cnv");

  db.prepare(`
    INSERT INTO conversations (
      id, conversation_key, context_type, context_id, buyer_id, seller_id,
      last_message_body, last_message_at, created_at, updated_at
    ) VALUES (?, ?, 'support', 'admin', ?, ?, 'Gleenc support is ready to help.', ?, ?, ?)
  `).run(id, supportConversationKey(userId, support.id), userId, support.id, now, now, now);

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
             COALESCE(
               NULLIF(users.avatar_url, ''),
               (SELECT NULLIF(selfie_url, '') FROM rider_profiles WHERE user_id = users.id LIMIT 1)
             ) AS sender_avatar_url
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
  const messageContext = resolveMessageContext(
    conversation,
    input?.contextType,
    input?.contextId,
  );
  if (!body && !attachmentUrl && !messageContext) {
    throw new HttpError(422, "Message cannot be empty.");
  }

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
  const senderAccount = db.prepare(`
    SELECT users.role,
           (
             SELECT seller_type
             FROM stores
             WHERE owner_id = users.id AND status = 'active'
             ORDER BY updated_at DESC
             LIMIT 1
           ) AS seller_type
    FROM users
    WHERE users.id = ?
  `).get(userId);
  if (
    protectedMessage.flagged &&
    senderAccount?.role === "seller" &&
    senderAccount?.seller_type !== "used_market" &&
    !["used_listing", "used_order"].includes(conversation.contextType)
  ) {
    throw new HttpError(
      422,
      "This message is not allowed on Gleenc or may be spam. Keep contact and payment inside Gleenc for user protection. Review the Privacy and Policy page.",
      {
        code: "CHAT_POLICY_BLOCKED",
        policyPath: "/help",
        reasons: protectedMessage.reasons || [],
      },
    );
  }
  const finalBody = clean(protectedMessage.body, 1600);
  const previewBody = finalBody || (messageContext ? `Shared ${messageContext.name}` : "Sent an image");
  const contextSnapshot = messageContext
    ? JSON.stringify({
        name: messageContext.name,
        imageUrl: messageContext.imageUrl,
        priceKobo: messageContext.priceKobo,
        href: messageContext.href,
      })
    : "{}";

  db.prepare(`
    INSERT INTO messages (
      id, conversation_id, sender_id, body, attachment_url,
      context_type, context_id, context_snapshot, is_read, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    conversationId,
    userId,
    finalBody,
    attachmentUrl || null,
    messageContext?.type || "",
    messageContext?.id || "",
    contextSnapshot,
    now,
  );

  db.prepare(`
    UPDATE conversations
    SET last_message_body = ?, last_message_at = ?, updated_at = ?
    WHERE id = ?
  `).run(previewBody, now, now, conversationId);

  if (recipientId && recipientId !== userId) {
    const sender = db
      .prepare(`
        SELECT users.name, users.role,
               COALESCE(
                 NULLIF(users.avatar_url, ''),
                 (SELECT NULLIF(selfie_url, '') FROM rider_profiles WHERE user_id = users.id LIMIT 1)
               ) AS avatar_url
        FROM users
        WHERE users.id = ?
      `)
      .get(userId);
    const recipientRole = db.prepare("SELECT role FROM users WHERE id = ?").get(recipientId)?.role;
    const actionBase = recipientRole === "rider" ? "/rider/messages" : "/messages";
    createNotification({
      userId: recipientId,
      type: "message",
      title: `New message from ${sender?.name || "Gleenc user"}`,
      body: previewBody,
      actionLabel: "Open chat",
      actionPath: `${actionBase}?conversation=${conversation.id}`,
      imageUrl: sender?.avatar_url || conversation.storeLogoUrl || conversation.listingImageUrl || "",
    });
  }

  return listMessages(userId, conversationId).at(-1);
}
