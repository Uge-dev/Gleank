import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createUsedOrderConversation } from "./message.service.js";
import { createNotification, createNotificationForUsers } from "./notification.service.js";
import {
  createDispute,
  createReturnRequest,
  listOrderReturns,
  respondToReturnRequest,
} from "./return-dispute.service.js";
import { generateOrderVerificationCode } from "./logistics.service.js";

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

function generatePackageTagCode() {
  return `GLC-TAG-${Date.now().toString().slice(-6)}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
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
    // Direct contact details belong to the protected rider workflow, not the
    // buyer/seller order response.
    sellerPhone: "",
    buyerName: row.buyer_name || "",
    buyerPhone: "",
    campus: row.campus || "",
    status: row.status,
    statusLabel: statusLabel(row.status),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method || "pay_now",
    stage4Status: row.stage4_status || "",
    stage4PaymentStatus: row.stage4_payment_status || "",
    fulfillmentStatus: row.fulfillment_status || "",
    fulfillmentMethod: row.fulfillment_method || "undecided",
    quantity: Math.max(1, Number(row.quantity || 1)),
    returnDays: Math.max(0, Number(row.return_days || 0)),
    reservationExpiresAt: row.reservation_expires_at || null,
    sellerDeliveryConfirmedAt: row.seller_delivery_confirmed_at || null,
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
    verificationCode:
      row.payment_status === "paid" && row.viewer_id === row.buyer_id
        ? row.verification_code || ""
        : "",
    sellerPickupCode:
      row.assigned_rider_id && row.viewer_id === row.seller_id
        ? generateOrderVerificationCode("seller-pickup", row.id)
        : "",
    packageTagCode: row.package_tag_code || "",
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

function hydrateOrder(row, viewerId = "") {
  const events = db
    .prepare(`
      SELECT * FROM used_market_order_events
      WHERE order_id = ?
      ORDER BY created_at ASC
    `)
    .all(row.id)
    .map(serializeEvent);

  return serializeOrder({ ...row, viewer_id: viewerId }, events);
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

function reserveUsedListingUnits(listingId, quantity = 1) {
  const requestedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      UPDATE used_listings
      SET reserved_quantity = reserved_quantity + ?,
          status = CASE
            WHEN reserved_quantity + ? >= quantity THEN 'sold'
            ELSE status
          END,
          updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND reserved_quantity + ? <= quantity
    `)
    .run(requestedQuantity, requestedQuantity, now, listingId, requestedQuantity);

  if (!result.changes) {
    throw new HttpError(409, "This used item is no longer available in the requested quantity. Please reduce the quantity or message the seller for more availability.");
  }
}

function releaseUsedListingUnits(listingId, quantity = 1) {
  const releasedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE used_listings
    SET reserved_quantity = CASE
          WHEN reserved_quantity >= ? THEN reserved_quantity - ?
          ELSE 0
        END,
        updated_at = ?
    WHERE id = ?
  `).run(releasedQuantity, releasedQuantity, now, listingId);

  refreshUsedListingAvailability(listingId);
}

export function releaseExpiredUsedOrderReservations() {
  const now = new Date().toISOString();
  const expired = db.prepare(`
    SELECT id, listing_id, quantity
    FROM used_market_orders
    WHERE status = 'pending_payment'
      AND payment_status = 'unpaid'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at <= ?
    LIMIT 100
  `).all(now);

  for (const row of expired) {
    const result = db.prepare(`
      UPDATE used_market_orders
      SET status = 'cancelled',
          fulfillment_status = 'reservation_expired',
          updated_at = ?
      WHERE id = ? AND status = 'pending_payment' AND payment_status = 'unpaid'
    `).run(now, row.id);
    if (result.changes) {
      releaseUsedListingUnits(row.listing_id, row.quantity);
      insertEvent(row.id, "cancelled", "Payment reservation expired and inventory was restored automatically.");
    }
  }
  return expired.length;
}

export function listUsedOrders(userId) {
  releaseExpiredUsedOrderReservations();
  return db
    .prepare(`
      ${selectOrderBase()}
      WHERE used_market_orders.buyer_id = ? OR used_market_orders.seller_id = ?
      ORDER BY used_market_orders.created_at DESC
      LIMIT 100
    `)
    .all(userId, userId)
    .map((row) => hydrateOrder(row, userId));
}

export function getUsedOrder(userId, idOrCode) {
  releaseExpiredUsedOrderReservations();
  const row = getOrderRowForUser(userId, idOrCode);
  if (!row) throw new HttpError(404, "Used Market order was not found.");
  return hydrateOrder(row, userId);
}

export function createUsedOrder(userId, input) {
  releaseExpiredUsedOrderReservations();
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

  const requestedQuantity = Math.max(1, Math.floor(Number(input?.quantity) || 1));
  const availableQuantity = Math.max(0, listingQuantity(listing) - listingReservedQuantity(listing));
  if (requestedQuantity > availableQuantity) {
    throw new HttpError(409, `Only ${availableQuantity} unit(s) are available for this used item. Reduce the quantity or message the seller for more availability.`);
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
    const sellerUnitPriceKobo = Number(listing.seller_price_kobo || 0) || Number(listing.price_kobo || 0);
    const sellerPriceKobo = sellerUnitPriceKobo * requestedQuantity;
    const protectionFeeKobo = Math.round((sellerPriceKobo * env.platformFeePercent) / 100);
    const deliveryFeeKobo = 0;
    const totalKobo = sellerPriceKobo + protectionFeeKobo + deliveryFeeKobo;
    const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO used_market_orders (
        id, order_code, listing_id, buyer_id, seller_id, status, payment_status,
        payment_method, stage4_status, stage4_payment_status, fulfillment_status,
        seller_confirmation_required, payout_status, quantity, return_days,
        reservation_expires_at, fulfillment_method,
        item_price_kobo, protection_fee_kobo, delivery_fee_kobo, total_kobo,
        buyer_name, buyer_phone, campus, delivery_option, delivery_address,
        pickup_location, note, verification_code, package_tag_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending_payment', 'unpaid', 'pay_now', 'awaiting_payment', 'awaiting_payment', 'pending', 0, 'pending_payment', ?, ?, ?, 'undecided', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
      id,
      generateOrderCode(),
      listing.id,
      userId,
      listing.seller_id,
      requestedQuantity,
      Math.max(0, Number(listing.return_days || 0)),
      reservationExpiresAt,
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
      generatePackageTagCode(),
      now,
      now,
    );

    reserveUsedListingUnits(listing.id, requestedQuantity);

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
      releaseUsedListingUnits(row.listing_id, row.quantity);
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

export function chooseUsedOrderFulfillment(user, orderId, method) {
  if (!["gleenc_rider", "external_delivery"].includes(method)) {
    throw new HttpError(422, "Choose Gleenc rider delivery or external delivery.");
  }
  const row = getOrderRowForUser(user.user_id, orderId);
  if (!row) throw new HttpError(404, "Used Market order was not found.");
  if (row.seller_id !== user.user_id && user.role !== "admin") {
    throw new HttpError(403, "Only the seller can choose delivery fulfillment.");
  }
  if (row.payment_status !== "paid") {
    throw new HttpError(409, "Delivery fulfillment unlocks after protected payment is confirmed.");
  }
  if (["delivered", "completed", "cancelled", "disputed"].includes(row.status)) {
    throw new HttpError(409, "Fulfillment can no longer be changed for this order.");
  }
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE used_market_orders
    SET fulfillment_method = ?,
        fulfillment_status = ?,
        status = CASE WHEN status = 'paid' THEN 'seller_confirmed' ELSE status END,
        seller_confirmed_at = COALESCE(seller_confirmed_at, ?),
        updated_at = ?
    WHERE id = ?
  `).run(
    method,
    method === "gleenc_rider" ? "awaiting_rider_assignment" : "external_delivery_selected",
    now,
    now,
    row.id,
  );
  insertEvent(row.id, "seller_confirmed", method === "gleenc_rider"
    ? "Seller selected delivery with a Gleenc rider."
    : "Seller selected external delivery and remains responsible for proof and buyer handover.");
  return getUsedOrder(user.user_id, row.id);
}


export function verifyUsedOrderDelivery(user, orderId, _code, _note = "") {
  const row = getOrderRowForUser(user.user_id, orderId);

  if (!row) {
    throw new HttpError(404, "Used Market order was not found.");
  }

  throw new HttpError(
    403,
    "Final delivery code verification must be completed by the assigned rider on the rider delivery page.",
  );
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
  if (row.payment_status !== "paid") {
    throw new HttpError(409, "Protected payment must be confirmed before delivery proof is submitted.");
  }
  if (row.fulfillment_method !== "external_delivery") {
    throw new HttpError(409, "Use the assigned Gleenc rider workflow for in-platform delivery proof.");
  }
  if (!fileUrl) throw new HttpError(422, "Upload a clear delivery proof image.");

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO used_market_delivery_proofs (id, order_id, seller_id, proof_image_url, note, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'submitted', ?)
  `).run(createId("udp"), row.id, row.seller_id, fileUrl, clean(note, 1000), now);

  const returnWindowEndsAt = new Date(Date.now() + Math.max(0, Number(row.return_days || 0)) * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE used_market_orders
    SET status = 'delivered',
        fulfillment_status = 'external_delivery_proof_submitted',
        seller_delivery_confirmed_at = ?,
        return_window_ends_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, returnWindowEndsAt, now, row.id);
  insertEvent(row.id, "delivered", "External delivery proof submitted. Buyer can confirm receipt or open a protected return/dispute.");

  createNotification({
    userId: row.buyer_id,
    type: "used_market",
    title: "Delivery proof submitted",
    body: `${row.listing_name} has delivery proof attached by the seller.`,
    actionLabel: "View order",
    actionPath: `/used-orders/${row.id}`,
    imageUrl: fileUrl || parseImages(row.listing_image_urls)[0] || "",
  });

  return { success: true, order: getUsedOrder(user.user_id, row.id) };
}
