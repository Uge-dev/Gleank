import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createUsedOrderConversation } from "./message.service.js";
import { createNotification, createNotificationForUsers } from "./notification.service.js";
import { markPayoutDeliveryVerified } from "./payout.service.js";
import {
  createDispute,
  createReturnRequest,
  listOrderReturns,
  respondToReturnRequest,
} from "./return-dispute.service.js";

const USED_ORDER_STATUSES = new Set([
  "pending_payment",
  "paid",
  "seller_confirmed",
  "meetup_or_delivery",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
]);

function clean(value, max = 500) {
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

function toNaira(kobo) {
  return Math.round(Number(kobo || 0)) / 100;
}

function generateOrderCode() {
  return `GUM-${Date.now().toString().slice(-8)}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function statusLabel(status) {
  const labels = {
    pending_payment: "Pending payment",
    paid: "Paid safely to Gleenc",
    seller_confirmed: "Seller confirmed",
    meetup_or_delivery: "Pickup or delivery in progress",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    disputed: "Disputed",
  };
  return labels[status] || status;
}

function eventLabel(status) {
  const labels = {
    pending_payment: "Protected order created",
    paid: "Payment recorded",
    seller_confirmed: "Seller confirmed availability",
    meetup_or_delivery: "Delivery or pickup started",
    delivered: "Seller marked item delivered",
    completed: "Buyer confirmed item received",
    cancelled: "Order cancelled",
    disputed: "Issue reported",
  };
  return labels[status] || statusLabel(status);
}

function serializeEvent(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    label: row.label,
    note: row.note || "",
    createdAt: row.created_at,
  };
}

function serializeOrder(row, events = []) {
  const imageUrls = parseImages(row.listing_image_urls);

  return {
    id: row.id,
    orderCode: row.order_code,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    conversationId: row.conversation_id || null,
    listingName: row.listing_name || "",
    listingCategory: row.listing_category || "",
    listingCondition: row.listing_condition || "",
    listingImageUrl: imageUrls[0] || null,
    sellerName: row.seller_name || "",
    sellerPhone: row.seller_phone || "",
    buyerName: row.buyer_name || "",
    buyerPhone: row.buyer_phone || "",
    campus: row.campus || "",
    status: row.status,
    statusLabel: statusLabel(row.status),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method || "pay_now",
    stage4Status: row.stage4_status || "",
    stage4PaymentStatus: row.stage4_payment_status || "",
    fulfillmentStatus: row.fulfillment_status || "",
    sellerConfirmationRequired: Boolean(row.seller_confirmation_required),
    returnWindowEndsAt: row.return_window_ends_at || null,
    buyerConfirmedAt: row.buyer_confirmed_at || null,
    payoutStatus: row.payout_status || "pending_payment",
    itemPriceKobo: row.item_price_kobo,
    itemPrice: toNaira(row.item_price_kobo),
    protectionFeeKobo: row.protection_fee_kobo,
    protectionFee: toNaira(row.protection_fee_kobo),
    deliveryFeeKobo: row.delivery_fee_kobo,
    deliveryFee: toNaira(row.delivery_fee_kobo),
    totalKobo: row.total_kobo,
    total: toNaira(row.total_kobo),
    deliveryOption: row.delivery_option,
    deliveryAddress: row.delivery_address || "",
    pickupLocation: row.pickup_location || "",
    note: row.note || "",
    verificationCode: row.verification_code || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events,
  };
}

function selectOrderBase() {
  return `
    SELECT used_market_orders.*,
           used_listings.name AS listing_name,
           used_listings.category AS listing_category,
           used_listings.condition AS listing_condition,
           used_listings.image_urls AS listing_image_urls,
           seller.name AS seller_name,
           seller.phone AS seller_phone
    FROM used_market_orders
    JOIN used_listings ON used_listings.id = used_market_orders.listing_id
    JOIN users seller ON seller.id = used_market_orders.seller_id
  `;
}

function hydrateOrder(row) {
  const events = db
    .prepare(`
      SELECT * FROM used_market_order_events
      WHERE order_id = ?
      ORDER BY created_at ASC
    `)
    .all(row.id)
    .map(serializeEvent);

  return serializeOrder(row, events);
}

function getOrderRowForUser(userId, idOrCode) {
  const byCode = String(idOrCode || "").startsWith("GUM-");
  return db
    .prepare(`
      ${selectOrderBase()}
      WHERE ${byCode ? "used_market_orders.order_code" : "used_market_orders.id"} = ?
        AND (used_market_orders.buyer_id = ? OR used_market_orders.seller_id = ?)
    `)
    .get(idOrCode, userId, userId);
}

function insertEvent(orderId, status, note = "") {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO used_market_order_events (id, order_id, status, label, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("uev"), orderId, status, eventLabel(status), clean(note, 600), now);
}

function openOrderForListing(listingId) {
  return db
    .prepare(`
      SELECT id FROM used_market_orders
      WHERE listing_id = ?
        AND status NOT IN ('completed', 'cancelled', 'disputed')
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(listingId);
}

function listingQuantity(row) {
  const parsed = Number(row?.quantity || 1);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
}

function listingReservedQuantity(row) {
  const parsed = Number(row?.reserved_quantity || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function refreshUsedListingAvailability(listingId) {
  const row = db.prepare("SELECT * FROM used_listings WHERE id = ?").get(listingId);
  if (!row) return;

  const quantity = listingQuantity(row);
  const reservedQuantity = listingReservedQuantity(row);
  const now = new Date().toISOString();

  if (reservedQuantity >= quantity && row.status === "active") {
    db.prepare("UPDATE used_listings SET status = 'sold', updated_at = ? WHERE id = ?").run(now, listingId);
    return;
  }

  if (reservedQuantity < quantity && row.status === "sold") {
    db.prepare("UPDATE used_listings SET status = 'active', updated_at = ? WHERE id = ?").run(now, listingId);
  }
}

function reserveUsedListingUnit(listingId) {
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      UPDATE used_listings
      SET reserved_quantity = reserved_quantity + 1,
          status = CASE
            WHEN reserved_quantity + 1 >= quantity THEN 'sold'
            ELSE status
          END,
          updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND reserved_quantity < quantity
    `)
    .run(now, listingId);

  if (!result.changes) {
    throw new HttpError(409, "This used item is no longer available. Please choose another item or message the seller.");
  }
}

function releaseUsedListingUnit(listingId) {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE used_listings
    SET reserved_quantity = CASE
          WHEN reserved_quantity > 0 THEN reserved_quantity - 1
          ELSE 0
        END,
        updated_at = ?
    WHERE id = ?
  `).run(now, listingId);

  refreshUsedListingAvailability(listingId);
}

export function listUsedOrders(userId) {
  return db
    .prepare(`
      ${selectOrderBase()}
      WHERE used_market_orders.buyer_id = ? OR used_market_orders.seller_id = ?
      ORDER BY used_market_orders.created_at DESC
      LIMIT 100
    `)
    .all(userId, userId)
    .map(hydrateOrder);
}

export function getUsedOrder(userId, idOrCode) {
  const row = getOrderRowForUser(userId, idOrCode);
  if (!row) throw new HttpError(404, "Used Market order was not found.");
  return hydrateOrder(row);
}

export function createUsedOrder(userId, input) {
  const listingId = clean(input?.listingId, 120);
  if (!listingId) throw new HttpError(422, "Used listing is required.");

  const listing = db
    .prepare(`
      SELECT used_listings.*, users.name AS seller_name
      FROM used_listings
      JOIN users ON users.id = used_listings.seller_id
      WHERE used_listings.id = ? AND used_listings.status = 'active'
    `)
    .get(listingId);

  if (!listing) throw new HttpError(404, "This used item is not available for protected purchase.");
  if (listing.seller_id === userId) throw new HttpError(422, "You cannot buy your own used item.");

  if (listingReservedQuantity(listing) >= listingQuantity(listing)) {
    throw new HttpError(409, "This used item is no longer available. Please choose another item or message the seller.");
  }

  const buyerName = clean(input?.buyerName, 120);
  const buyerPhone = clean(input?.buyerPhone, 40);
  const campus = clean(input?.campus, 120);
  const deliveryOption = ["Pickup", "Delivery", "Pickup & Delivery"].includes(input?.deliveryOption)
    ? input.deliveryOption
    : listing.delivery_option;
  const deliveryAddress = clean(input?.deliveryAddress, 240);
  const pickupLocation = clean(input?.pickupLocation || listing.pickup_location, 240);
  const note = clean(input?.note, 1000);

  if (!buyerName || !buyerPhone || !campus) {
    throw new HttpError(422, "Enter your full name, phone number, and campus.");
  }
  if (deliveryOption === "Delivery" && !deliveryAddress) {
    throw new HttpError(422, "Enter your delivery address.");
  }
  if (deliveryOption !== "Delivery" && !pickupLocation) {
    throw new HttpError(422, "Enter pickup or meetup location.");
  }

  const order = transaction(() => {
    const now = new Date().toISOString();
    const id = createId("uor");
    const sellerPriceKobo = Number(listing.seller_price_kobo || 0) || Number(listing.price_kobo || 0);
    const protectionFeeKobo = Math.round((sellerPriceKobo * env.platformFeePercent) / 100);
    const deliveryFeeKobo = 0;
    const totalKobo = sellerPriceKobo + protectionFeeKobo + deliveryFeeKobo;

    db.prepare(`
      INSERT INTO used_market_orders (
        id, order_code, listing_id, buyer_id, seller_id, status, payment_status,
        payment_method, stage4_status, stage4_payment_status, fulfillment_status,
        seller_confirmation_required, payout_status,
        item_price_kobo, protection_fee_kobo, delivery_fee_kobo, total_kobo,
        buyer_name, buyer_phone, campus, delivery_option, delivery_address,
        pickup_location, note, verification_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending_payment', 'unpaid', 'pay_now', 'awaiting_payment', 'awaiting_payment', 'pending', 0, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      generateOrderCode(),
      listing.id,
      userId,
      listing.seller_id,
      sellerPriceKobo,
      protectionFeeKobo,
      deliveryFeeKobo,
      totalKobo,
      buyerName,
      buyerPhone,
      campus,
      deliveryOption,
      deliveryAddress,
      pickupLocation,
      note,
      generateVerificationCode(),
      now,
      now,
    );

    reserveUsedListingUnit(listing.id);

    insertEvent(id, "pending_payment", "Protected order created. Buyer should complete payment to reserve this item.");

    const conversation = createUsedOrderConversation(userId, id);
    db.prepare("UPDATE used_market_orders SET conversation_id = ? WHERE id = ?").run(conversation.id, id);

    createNotification({
      userId: listing.seller_id,
      type: "used_market",
      title: "New Used Market order",
      body: `${buyerName} started a protected order for ${listing.name}.`,
      actionLabel: "View order",
      actionPath: `/used-orders/${id}`,
      imageUrl: parseImages(listing.image_urls)[0] || "",
    });

    createNotification({
      userId,
      type: "used_market",
      title: "Protected order created",
      body: `Your protected order for ${listing.name} is waiting for payment.`,
      actionLabel: "Continue order",
      actionPath: `/used-orders/${id}`,
      imageUrl: parseImages(listing.image_urls)[0] || "",
    });

    return getUsedOrder(userId, id);
  });

  return order;
}

export function markUsedOrderPaid(userId, orderId, paymentReference = "") {
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(403, "Manual payment marking is disabled in production. Use Paystack verification.");
  }

  return transaction(() => {
    const row = getOrderRowForUser(userId, orderId);
    if (!row) throw new HttpError(404, "Used Market order was not found.");
    if (row.buyer_id !== userId) throw new HttpError(403, "Only the buyer can continue payment.");
    if (row.status !== "pending_payment") throw new HttpError(422, "This order is not waiting for payment.");

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE used_market_orders
      SET status = 'paid',
          payment_status = 'paid',
          stage4_status = 'paid',
          stage4_payment_status = 'paid',
          payout_status = 'on_hold',
          updated_at = ?
      WHERE id = ?
    `).run(now, row.id);

    refreshUsedListingAvailability(row.listing_id);

    insertEvent(
      row.id,
      "paid",
      paymentReference
        ? `Protected payment verified with reference ${paymentReference}.`
        : "Payment is recorded as protected. Replace this with gateway verification before production.",
    );

    createNotificationForUsers([row.buyer_id, row.seller_id], {
      type: "used_market",
      title: "Used Market payment confirmed",
      body: `Protected payment for ${row.listing_name} has been confirmed.`,
      actionLabel: "View order",
      actionPath: `/used-orders/${row.id}`,
      imageUrl: parseImages(row.listing_image_urls)[0] || "",
    });

    return getUsedOrder(userId, row.id);
  });
}

export function updateUsedOrderStatus(user, orderId, status, note = "") {
  if (!USED_ORDER_STATUSES.has(status)) throw new HttpError(422, "Invalid used order status.");

  return transaction(() => {
    const row = getOrderRowForUser(user.user_id, orderId);
    if (!row) throw new HttpError(404, "Used Market order was not found.");

    const isBuyer = row.buyer_id === user.user_id;
    const isSeller = row.seller_id === user.user_id;
    const isAdmin = user.role === "admin";

    if (!isAdmin) {
      if (isBuyer && !["cancelled", "completed", "disputed"].includes(status)) {
        throw new HttpError(403, "Buyers can only cancel, complete, or dispute a used order.");
      }
      if (isSeller && !["seller_confirmed", "meetup_or_delivery", "disputed"].includes(status)) {
        throw new HttpError(403, "Seller cannot apply this status.");
      }
    }

    if (status === "cancelled" && row.status !== "pending_payment") {
      throw new HttpError(422, "Only unpaid used orders can be cancelled directly.");
    }
    if (status === "completed" && row.status !== "delivered") {
      throw new HttpError(422, "Buyer can only complete after seller marks delivered.");
    }
    if (["seller_confirmed", "meetup_or_delivery"].includes(status) && row.status === "pending_payment") {
      throw new HttpError(422, "Seller actions unlock after protected payment is recorded.");
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE used_market_orders SET status = ?, updated_at = ? WHERE id = ?").run(status, now, row.id);

    if (status === "cancelled") {
      releaseUsedListingUnit(row.listing_id);
    }

    if (status === "completed") {
      refreshUsedListingAvailability(row.listing_id);
    }

    insertEvent(row.id, status, note);

    createNotificationForUsers(
      [row.buyer_id, row.seller_id].filter((id) => id !== user.user_id),
      {
        type: "used_market",
        title: eventLabel(status),
        body: note || `${row.listing_name} is now ${statusLabel(status)}.`,
        actionLabel: "View order",
        actionPath: `/used-orders/${row.id}`,
        imageUrl: parseImages(row.listing_image_urls)[0] || "",
      },
    );

    return getUsedOrder(user.user_id, row.id);
  });
}


export function verifyUsedOrderDelivery(user, orderId, code, note = "") {
  const deliveryCode = clean(code, 20);

  if (!deliveryCode) {
    throw new HttpError(422, "Enter the buyer delivery code.");
  }

  const deliveredOrder = transaction(() => {
    const row = getOrderRowForUser(user.user_id, orderId);

    if (!row) {
      throw new HttpError(404, "Used Market order was not found.");
    }

    const isSeller = row.seller_id === user.user_id;
    const isAdmin = user.role === "admin";

    if (!isSeller && !isAdmin) {
      throw new HttpError(403, "Only the seller can verify the delivery code.");
    }

    if (row.status !== "meetup_or_delivery") {
      throw new HttpError(
        422,
        "Delivery code can only be verified when pickup or delivery is in progress.",
      );
    }

    if (row.payment_status !== "paid") {
      throw new HttpError(422, "Protected payment must be verified before the delivery code can be used.");
    }

    if (String(row.verification_code || "") !== deliveryCode) {
      throw new HttpError(422, "The delivery code is incorrect.");
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE used_market_orders
      SET status = 'delivered',
          stage4_status = 'delivered',
          fulfillment_status = 'delivered',
          updated_at = ?
      WHERE id = ?
    `).run(now, row.id);

    insertEvent(
      row.id,
      "delivered",
      note || "Seller verified the buyer delivery code and marked the item delivered.",
    );

    createNotification({
      userId: row.buyer_id,
      type: "used_market",
      title: "Used item delivered",
      body: `${row.listing_name} has been marked delivered.`,
      actionLabel: "View order",
      actionPath: `/used-orders/${row.id}`,
      imageUrl: parseImages(row.listing_image_urls)[0] || "",
    });

    return getUsedOrder(user.user_id, row.id);
  });

  markPayoutDeliveryVerified({
    sourceType: "used_order",
    orderId: deliveredOrder.id,
    actorId: user.user_id,
    note: "Used Market delivery code verified.",
  });

  return deliveredOrder;
}

export function openUsedOrderReturn(user, orderId, input = {}) {
  return createReturnRequest(user, orderId, { ...input, sourceType: "used_order" });
}

export function replyToUsedOrderReturn(user, returnId, input = {}) {
  return respondToReturnRequest(user, returnId, input);
}

export function openUsedOrderDispute(user, orderId, input = {}) {
  return createDispute(user, orderId, { ...input, sourceType: "used_order" });
}

export function listReturnsForUsedOrder(user, orderId) {
  return listOrderReturns(user, orderId, "used_order");
}

export function submitUsedDeliveryProof(user, orderId, fileUrl, note = "") {
  const row = getOrderRowForUser(user.user_id, orderId);
  if (!row) throw new HttpError(404, "Used Market order was not found.");
  if (row.seller_id !== user.user_id && user.role !== "admin") {
    throw new HttpError(403, "Only seller can submit delivery proof.");
  }

  db.prepare(`
    INSERT INTO used_market_delivery_proofs (id, order_id, seller_id, proof_image_url, note, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'submitted', ?)
  `).run(createId("udp"), row.id, row.seller_id, fileUrl || null, clean(note, 1000), new Date().toISOString());

  createNotification({
    userId: row.buyer_id,
    type: "used_market",
    title: "Delivery proof submitted",
    body: `${row.listing_name} has delivery proof attached by the seller.`,
    actionLabel: "View order",
    actionPath: `/used-orders/${row.id}`,
    imageUrl: fileUrl || parseImages(row.listing_image_urls)[0] || "",
  });

  return { success: true };
}
