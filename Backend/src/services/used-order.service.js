import { db, transaction } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import { createUsedOrderConversation } from "./message.service.js";

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
    paid: "Paid safely to Gleank",
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

  const existingOpen = openOrderForListing(listingId);
  if (existingOpen) {
    throw new HttpError(409, "This item is already in a protected checkout or order process.");
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
    const protectionFeeKobo = Math.round(Number(listing.price_kobo || 0) * 0.03);
    const deliveryFeeKobo = 0;
    const totalKobo = listing.price_kobo + protectionFeeKobo + deliveryFeeKobo;

    db.prepare(`
      INSERT INTO used_market_orders (
        id, order_code, listing_id, buyer_id, seller_id, status, payment_status,
        item_price_kobo, protection_fee_kobo, delivery_fee_kobo, total_kobo,
        buyer_name, buyer_phone, campus, delivery_option, delivery_address,
        pickup_location, note, verification_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending_payment', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      generateOrderCode(),
      listing.id,
      userId,
      listing.seller_id,
      listing.price_kobo,
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

    insertEvent(id, "pending_payment", "Protected order created. Buyer should complete payment to reserve this item.");

    const conversation = createUsedOrderConversation(userId, id);
    db.prepare("UPDATE used_market_orders SET conversation_id = ? WHERE id = ?").run(conversation.id, id);

    return getUsedOrder(userId, id);
  });

  return order;
}

export function markUsedOrderPaid(userId, orderId) {
  return transaction(() => {
    const row = getOrderRowForUser(userId, orderId);
    if (!row) throw new HttpError(404, "Used Market order was not found.");
    if (row.buyer_id !== userId) throw new HttpError(403, "Only the buyer can continue payment.");
    if (row.status !== "pending_payment") throw new HttpError(422, "This order is not waiting for payment.");

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE used_market_orders
      SET status = 'paid', payment_status = 'paid', updated_at = ?
      WHERE id = ?
    `).run(now, row.id);

    db.prepare("UPDATE used_listings SET status = 'sold', updated_at = ? WHERE id = ?").run(now, row.listing_id);

    insertEvent(row.id, "paid", "Payment is recorded as protected. Replace this with Paystack/Flutterwave verification before production.");
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
      if (isSeller && !["seller_confirmed", "meetup_or_delivery", "delivered", "disputed"].includes(status)) {
        throw new HttpError(403, "Seller cannot apply this status.");
      }
    }

    if (status === "cancelled" && row.status !== "pending_payment") {
      throw new HttpError(422, "Only unpaid used orders can be cancelled directly.");
    }
    if (status === "completed" && row.status !== "delivered") {
      throw new HttpError(422, "Buyer can only complete after seller marks delivered.");
    }
    if (["seller_confirmed", "meetup_or_delivery", "delivered"].includes(status) && row.status === "pending_payment") {
      throw new HttpError(422, "Seller actions unlock after protected payment is recorded.");
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE used_market_orders SET status = ?, updated_at = ? WHERE id = ?").run(status, now, row.id);

    if (status === "cancelled") {
      db.prepare("UPDATE used_listings SET status = 'active', updated_at = ? WHERE id = ?").run(now, row.listing_id);
    }

    if (status === "completed") {
      db.prepare("UPDATE used_listings SET status = 'sold', updated_at = ? WHERE id = ?").run(now, row.listing_id);
    }

    insertEvent(row.id, status, note);
    return getUsedOrder(user.user_id, row.id);
  });
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

  return { success: true };
}
