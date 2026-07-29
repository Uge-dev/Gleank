import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import { calculateDeliveryFeeKobo } from "./delivery.service.js";
import { createNotification, createNotificationForUsers } from "./notification.service.js";
import { evaluatePayAtDeliveryEligibility } from "./payment-protection.service.js";
import { getAccountLocationPresence } from "./location.service.js";
import {
  createDispute,
  createReturnRequest,
  listOrderReturns,
  respondToReturnRequest,
} from "./return-dispute.service.js";
import { createParentOrderForOrders, syncOrderReadinessForDispatch } from "./logistics.service.js";

const ORDER_STATUSES = new Set([
  "pending_payment",
  "paid",
  "seller_confirmed",
  "processing",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
]);

const SELLER_ALLOWED_STATUS = new Set([
  "seller_confirmed",
  "processing",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "disputed",
]);

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function firstImage(value) {
  return safeJsonArray(value)[0] || null;
}

function inventoryUnavailableMessage(product, quantity) {
  const name = product?.name || "This product";
  const stock = Math.max(0, Number(product?.stock || 0));

  if (stock <= 0 || product?.status === "out_of_stock") {
    return `${name} is out of stock right now. Please remove it from your cart or choose another product.`;
  }

  return `${name} has only ${stock} item(s) left in stock. Please reduce the quantity in your cart before checkout.`;
}

function reserveProductStock(product, quantity, now) {
  const result = db.prepare(`
    UPDATE products
    SET stock = stock - ?,
        status = CASE WHEN stock - ? <= 0 THEN 'out_of_stock' ELSE status END,
        stock_status = CASE WHEN stock - ? <= 0 THEN 'out_of_stock' ELSE stock_status END,
        availability_status = CASE WHEN stock - ? <= 0 THEN 'out_of_stock' ELSE availability_status END,
        updated_at = ?
    WHERE id = ?
      AND status = 'active'
      AND stock >= ?
  `).run(quantity, quantity, quantity, quantity, now, product.id, quantity);

  if (result.changes !== 1) {
    const latest = db.prepare("SELECT * FROM products WHERE id = ?").get(product.id);
    throw new HttpError(409, inventoryUnavailableMessage(latest || product, quantity));
  }

  product.stock = Math.max(0, Number(product.stock || 0) - quantity);
  if (product.stock <= 0) {
    product.status = "out_of_stock";
    product.stock_status = "out_of_stock";
    product.availability_status = "out_of_stock";
  }
}

function restoreReservedStockForOrder(order, now = new Date().toISOString()) {
  if (!order?.stock_reserved) return;

  const items = db
    .prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ?")
    .all(order.id);

  for (const item of items) {
    db.prepare(`
      UPDATE products
      SET stock = stock + ?,
          status = CASE WHEN status = 'out_of_stock' THEN 'active' ELSE status END,
          stock_status = CASE WHEN stock_status = 'out_of_stock' THEN 'in_stock' ELSE stock_status END,
          availability_status = CASE WHEN availability_status = 'out_of_stock' THEN 'available_now' ELSE availability_status END,
          updated_at = ?
      WHERE id = ?
    `).run(Number(item.quantity || 0), now, item.product_id);
  }

  db.prepare("UPDATE orders SET stock_reserved = 0, updated_at = ? WHERE id = ?").run(now, order.id);
}

function toNaira(kobo) {
  return kobo / 100;
}

function generateOrderCode() {
  return `GLK-${Date.now().toString().slice(-8)}-${Math.random()
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
    pending_payment: "Pending Payment",
    paid: "Paid",
    seller_confirmed: "Seller Confirmed",
    processing: "Processing",
    ready_for_delivery: "Ready for Delivery",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    disputed: "Disputed",
  };

  return labels[status] || status;
}

function eventLabel(status) {
  const labels = {
    pending_payment: "Order created",
    paid: "Payment confirmed",
    seller_confirmed: "Seller accepted order",
    processing: "Seller is preparing your order",
    ready_for_delivery: "Order is ready",
    out_for_delivery: "Order is on the way",
    delivered: "Order delivered",
    completed: "Order completed",
    cancelled: "Order cancelled",
    disputed: "Order disputed",
  };

  return labels[status] || statusLabel(status);
}

function serializeOrder(row, items = [], events = []) {
  if (!row) return null;

  return {
    id: row.id,
    orderCode: row.order_code,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    storeId: row.store_id,
    storeName: row.store_name || "",
    storeSlug: row.store_slug || "",
    sellerName: row.seller_name || row.store_name || "",
    sellerPhone: row.seller_phone || "",
    status: row.status,
    statusLabel: statusLabel(row.status),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method || "pay_now",
    stage4Status: row.stage4_status || "",
    stage4PaymentStatus: row.stage4_payment_status || "",
    fulfillmentStatus: row.fulfillment_status || "",
    deliveryStatus: row.delivery_status || "",
    dispatchStatus: row.dispatch_status || row.auto_dispatch_status || "",
    sellerConfirmationStatus: row.seller_confirmation_status || "",
    sellerReadyStatus: row.seller_ready_status || "",
    sellerReadyAt: row.seller_ready_at || row.package_ready_at || null,
    buyerDeliveryWindowStart: row.buyer_delivery_window_start || null,
    buyerDeliveryWindowEnd: row.buyer_delivery_window_end || null,
    pickupVerifiedAt: row.pickup_verified_at || null,
    deliveryVerifiedAt: row.delivery_verified_at || null,
    deliveredAt: row.delivered_at || null,
    sellerConfirmationRequired: Boolean(row.seller_confirmation_required),
    sellerConfirmedAt: row.seller_confirmed_at || null,
    sellerRejectedAt: row.seller_rejected_at || null,
    sellerRejectionNote: row.seller_rejection_note || "",
    returnWindowEndsAt: row.return_window_ends_at || null,
    buyerConfirmedAt: row.buyer_confirmed_at || null,
    payoutStatus: row.payout_status || "pending_payment",
    assignedRiderId: row.assigned_rider_id || null,
    riderAssignmentId: row.rider_assignment_id || null,
    subtotalKobo: row.subtotal_kobo,
    subtotal: toNaira(row.subtotal_kobo),
    deliveryFeeKobo: row.delivery_fee_kobo,
    deliveryFee: toNaira(row.delivery_fee_kobo),
    totalKobo: row.total_kobo,
    total: toNaira(row.total_kobo),
    buyerName: row.buyer_name || "",
    buyerPhone: row.buyer_phone || "",
    campus: row.campus || "",
    deliveryOption: row.delivery_option,
    deliveryAddress: row.delivery_address || "",
    pickupLocation: row.pickup_location || "",
    note: row.note || "",
    verificationCode:
      row.payment_status === "paid" && row.viewer_id === row.buyer_id
        ? row.verification_code || ""
        : "",
    packageTagCode: row.package_tag_code || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    events,
  };
}

function serializeOrderItem(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    productImageUrl: row.product_image_url || null,
    unitPriceKobo: row.unit_price_kobo,
    unitPrice: toNaira(row.unit_price_kobo),
    quantity: row.quantity,
    totalKobo: row.total_kobo,
    total: toNaira(row.total_kobo),
    createdAt: row.created_at,
  };
}

function serializeOrderEvent(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    label: row.label,
    note: row.note || "",
    createdAt: row.created_at,
  };
}

function getOrderRowsForBuyer(userId) {
  return db
    .prepare(`
      SELECT orders.*, stores.name AS store_name, stores.slug AS store_slug,
             stores.phone AS seller_phone, users.name AS seller_name
      FROM orders
      JOIN stores ON stores.id = orders.store_id
      JOIN users ON users.id = orders.seller_id
      WHERE orders.buyer_id = ?
      ORDER BY orders.created_at DESC
    `)
    .all(userId);
}

function getOrderRowsForSeller(userId) {
  return db
    .prepare(`
      SELECT orders.*, stores.name AS store_name, stores.slug AS store_slug,
             stores.phone AS seller_phone, users.name AS seller_name
      FROM orders
      JOIN stores ON stores.id = orders.store_id
      JOIN users ON users.id = orders.seller_id
      WHERE orders.seller_id = ?
        AND (
          orders.payment_status = 'paid'
          OR orders.payment_method = 'pay_on_delivery'
        )
      ORDER BY orders.created_at DESC
    `)
    .all(userId);
}

function getOrderRowByIdForUser(userId, orderId) {
  return db
    .prepare(`
      SELECT orders.*, stores.name AS store_name, stores.slug AS store_slug,
             stores.phone AS seller_phone, users.name AS seller_name
      FROM orders
      JOIN stores ON stores.id = orders.store_id
      JOIN users ON users.id = orders.seller_id
      WHERE orders.id = ?
        AND (orders.buyer_id = ? OR orders.seller_id = ?)
    `)
    .get(orderId, userId, userId);
}

function getOrderRowByCodeForUser(userId, orderCode) {
  return db
    .prepare(`
      SELECT orders.*, stores.name AS store_name, stores.slug AS store_slug,
             stores.phone AS seller_phone, users.name AS seller_name
      FROM orders
      JOIN stores ON stores.id = orders.store_id
      JOIN users ON users.id = orders.seller_id
      WHERE orders.order_code = ?
        AND (orders.buyer_id = ? OR orders.seller_id = ?)
    `)
    .get(orderCode, userId, userId);
}

function hydrateOrder(row, viewerId = "") {
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC")
    .all(row.id)
    .map(serializeOrderItem);

  const events = db
    .prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC")
    .all(row.id)
    .map(serializeOrderEvent);

  return serializeOrder({ ...row, viewer_id: viewerId }, items, events);
}

function insertOrderEvent(orderId, status, note = "") {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO order_events (id, order_id, status, label, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("evt"), orderId, status, eventLabel(status), note, now);
}

function insertStatusHistory({
  orderId,
  statusLayer = "order",
  oldStatus = "",
  newStatus,
  changedBy = null,
  note = "",
}) {
  db.prepare(`
    INSERT INTO order_status_history (
      id, order_id, used_order_id, source_type, status_layer,
      old_status, new_status, changed_by, note, created_at
    ) VALUES (?, ?, NULL, 'store_order', ?, ?, ?, ?, ?, ?)
  `).run(
    createId("osh"),
    orderId,
    statusLayer,
    oldStatus || "",
    newStatus,
    changedBy,
    String(note || "").slice(0, 700),
    new Date().toISOString(),
  );
}

export function listOrders(userId) {
  return getOrderRowsForBuyer(userId).map((row) => hydrateOrder(row, userId));
}

export function listSellerOrders(user) {
  if (!user || !["seller", "admin"].includes(user.role)) {
    throw new HttpError(403, "Only sellers can view incoming buyer orders.");
  }

  const sellerId = user.role === "admin"
    ? String(user.sellerId || user.user_id || "")
    : String(user.user_id || user.id || "");

  if (!sellerId) {
    throw new HttpError(422, "Seller account is required.");
  }

  return getOrderRowsForSeller(sellerId).map((row) => hydrateOrder(row, sellerId));
}

export function getSellerActionableOrderCount(user) {
  if (!user || !["seller", "admin"].includes(user.role)) {
    throw new HttpError(403, "Only sellers can view seller order counts.");
  }

  const sellerId = user.role === "admin"
    ? String(user.sellerId || user.user_id || "")
    : user.user_id;

  if (!sellerId) {
    throw new HttpError(422, "Seller account is required.");
  }

  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE seller_id = ?
        AND status NOT IN ('completed', 'cancelled', 'delivered', 'refunded')
        AND (
          payment_status = 'paid'
          OR payment_method = 'pay_on_delivery'
          OR seller_confirmation_required = 1
          OR stage4_status IN (
            'pending_seller_confirmation',
            'seller_confirmation_pending',
            'seller_confirmed',
            'ready_for_dispatch',
            'dispatch_ready',
            'rider_assignment_pending',
            'rider_assigned'
          )
        )
    `)
    .get(sellerId);

  return Number(row?.count || 0);
}

export function getOrder(userId, idOrCode) {
  const row = String(idOrCode || "").startsWith("GLK-")
    ? getOrderRowByCodeForUser(userId, idOrCode)
    : getOrderRowByIdForUser(userId, idOrCode);

  if (!row) {
    throw new HttpError(404, "Order was not found.");
  }

  return hydrateOrder(row, userId);
}

export function createOrders(userId, input) {
  const items = Array.isArray(input?.items) ? input.items : [];


  if (items.length === 0) {
    throw new HttpError(422, "Your cart is empty.");
  }

  const buyerName = String(input?.buyerName || "").trim().slice(0, 120);
  const buyerPhone = String(input?.buyerPhone || "").trim().slice(0, 40);
  const campus = String(input?.campus || "").trim().slice(0, 120);
  const deliveryOption =
    input?.deliveryOption === "Delivery" ? "Delivery" : "Pickup";
  const paymentMethod =
    input?.paymentMethod === "pay_on_delivery" ? "pay_on_delivery" : "pay_now";
  const deliveryAddress = String(input?.deliveryAddress || "").trim().slice(0, 240);
  const pickupLocation = String(input?.pickupLocation || "").trim().slice(0, 240);
  const note = String(input?.note || "").trim().slice(0, 1000);
  const buyerPresence = getAccountLocationPresence(userId);

  if (!buyerName || !buyerPhone || !campus) {
    throw new HttpError(422, "Please provide your name, phone number, and campus.");
  }

  if (deliveryOption === "Delivery" && !deliveryAddress) {
    throw new HttpError(422, "Please provide the delivery address.");
  }

  if (deliveryOption === "Pickup" && !pickupLocation) {
    throw new HttpError(422, "Please provide the pickup location.");
  }

  const requestedItemMap = new Map();

  for (const item of items) {
    const productId = String(item.productId || item.id || "").trim();
    const quantity = Number(item.quantity || 1);

    if (!productId || !Number.isInteger(quantity) || quantity < 1) {
      throw new HttpError(422, "Please check the cart items and quantities.");
    }

    const current = requestedItemMap.get(productId) || { productId, quantity: 0 };
    current.quantity += quantity;
    requestedItemMap.set(productId, current);
  }

  const requestedItems = Array.from(requestedItemMap.values());

  if (requestedItems.some((item) => item.quantity > 99)) {
    throw new HttpError(422, "Please reduce product quantities before checkout.");
  }

  const createdOrders = transaction(() => {
    const grouped = new Map();

    for (const requested of requestedItems) {
      const product = db
        .prepare(`
          SELECT products.*, stores.owner_id AS seller_id,
                 stores.name AS store_name, stores.slug AS store_slug,
                 stores.phone AS seller_phone,
                 stores.pickup_lat AS seller_pickup_lat,
                 stores.pickup_lng AS seller_pickup_lng
          FROM products
          JOIN stores ON stores.id = products.store_id
          WHERE products.id = ?
            AND products.status IN ('active', 'out_of_stock')
            AND stores.status = 'active'
        `)
        .get(requested.productId);

      if (!product) {
        throw new HttpError(404, "One of the products in your cart is no longer available.");
      }

      if (product.seller_id === userId) {
        throw new HttpError(403, "Sellers cannot order their own products.");
      }

      if (product.status !== "active" || product.stock < requested.quantity) {
        throw new HttpError(409, inventoryUnavailableMessage(product, requested.quantity));
      }

      const group = grouped.get(product.store_id) || {
        storeId: product.store_id,
        sellerId: product.seller_id,
        storeName: product.store_name,
        pickupLat: product.seller_pickup_lat ?? null,
        pickupLng: product.seller_pickup_lng ?? null,
        products: [],
      };

      group.products.push({
        product,
        quantity: requested.quantity,
        lineTotalKobo: product.price_kobo * requested.quantity,
      });

      grouped.set(product.store_id, group);
    }

    if (paymentMethod === "pay_on_delivery") {
      const allProducts = Array.from(grouped.values()).flatMap((group) => group.products);
      const totalKoboForEligibility = allProducts.reduce(
        (total, item) => total + item.lineTotalKobo,
        0,
      );
      const eligibility = evaluatePayAtDeliveryEligibility(userId, {
        products: allProducts,
        totalKobo: totalKoboForEligibility,
      });

      if (!eligibility.eligible) {
        throw new HttpError(
          422,
          eligibility.reason ||
            "Pay at Delivery is not available for this order. Please use Pay Now.",
        );
      }
    }

    const now = new Date().toISOString();
    const output = [];

    for (const group of grouped.values()) {
      const sellerPresence = getAccountLocationPresence(group.sellerId);
      const pickupLat = group.pickupLat ?? sellerPresence?.lat ?? null;
      const pickupLng = group.pickupLng ?? sellerPresence?.lng ?? null;
      const deliveryLat =
        deliveryOption === "Delivery" && buyerPresence?.permissionStatus === "granted"
          ? buyerPresence.lat
          : null;
      const deliveryLng =
        deliveryOption === "Delivery" && buyerPresence?.permissionStatus === "granted"
          ? buyerPresence.lng
          : null;
      const subtotalKobo = group.products.reduce(
        (total, item) => total + item.lineTotalKobo,
        0,
      );
      const deliveryFeeKobo = calculateDeliveryFeeKobo({
        campus,
        deliveryOption,
        origin: group.storeName || "Campus Market",
        destination: deliveryOption === "Delivery" ? deliveryAddress : pickupLocation,
        deliveryAddress,
        pickupLocation,
      });
      const totalKobo = subtotalKobo + deliveryFeeKobo;
      const orderId = createId("ord");
      const orderCode = generateOrderCode();
      const sellerConfirmationRequired = group.products.some(
        (item) =>
          item.product.seller_confirmation_required ||
          item.product.availability_status === "confirm_before_payment",
      );
      const initialStatus =
        paymentMethod === "pay_on_delivery" || sellerConfirmationRequired
          ? "seller_confirmed"
          : "pending_payment";
      const stage4Status = sellerConfirmationRequired
        ? "pending_seller_confirmation"
        : paymentMethod === "pay_on_delivery"
          ? "seller_confirmation_pending"
          : "awaiting_payment";
      const stage4PaymentStatus =
        paymentMethod === "pay_on_delivery"
          ? "pay_at_delivery_pending"
          : "awaiting_payment";
      const initialNote =
        paymentMethod === "pay_on_delivery"
          ? "Buyer selected Pay at Delivery. Payment must still be completed through Gleenc/Paystack before the delivery code unlocks."
          : sellerConfirmationRequired
            ? "This order needs seller availability confirmation before payment can continue."
            : "Your order has been created and is waiting for payment.";

      for (const item of group.products) {
        reserveProductStock(item.product, item.quantity, now);
      }

      db.prepare(`
        INSERT INTO orders (
          id, order_code, buyer_id, seller_id, store_id, status, payment_status,
          payment_method, stage4_status, stage4_payment_status, fulfillment_status,
          seller_confirmation_required, payout_status, stock_reserved,
          subtotal_kobo, delivery_fee_kobo, total_kobo, buyer_name, buyer_phone,
          campus, delivery_option, delivery_address, pickup_location,
          pickup_lat, pickup_lng, delivery_lat, delivery_lng, note,
          verification_code, package_tag_code, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        orderCode,
        userId,
        group.sellerId,
        group.storeId,
        initialStatus,
        "unpaid",
        paymentMethod,
        stage4Status,
        stage4PaymentStatus,
        "pending",
        sellerConfirmationRequired ? 1 : 0,
        "pending_payment",
        1,
        subtotalKobo,
        deliveryFeeKobo,
        totalKobo,
        buyerName,
        buyerPhone,
        campus,
        deliveryOption,
        deliveryAddress,
        pickupLocation,
        pickupLat,
        pickupLng,
        deliveryLat,
        deliveryLng,
        note,
        generateVerificationCode(),
        generatePackageTagCode(),
        now,
        now,
      );

      for (const item of group.products) {
        db.prepare(`
          INSERT INTO order_items (
            id, order_id, product_id, product_name, product_image_url,
            unit_price_kobo, quantity, total_kobo, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          createId("oit"),
          orderId,
          item.product.id,
          item.product.name,
          firstImage(item.product.image_urls),
          item.product.price_kobo,
          item.quantity,
          item.lineTotalKobo,
          now,
        );
      }

      insertOrderEvent(
        orderId,
        initialStatus,
        initialNote,
      );
      insertStatusHistory({
        orderId,
        statusLayer: "stage4",
        newStatus: stage4Status,
        changedBy: userId,
        note: initialNote,
      });

      const firstProductName = group.products[0]?.product?.name || "a product";
      createNotification({
        userId: group.sellerId,
        type: "order",
        title:
          paymentMethod === "pay_on_delivery"
            ? "New Pay at Delivery order"
            : "New order received",
        body:
          paymentMethod === "pay_on_delivery"
            ? `${buyerName} placed a Pay at Delivery order for ${firstProductName}. Confirm availability before rider pickup.`
            : sellerConfirmationRequired
              ? `${buyerName} placed an order for ${firstProductName}. Confirm availability before payment.`
            : `${buyerName} placed an order for ${firstProductName}.`,
        actionLabel: "View order",
        actionPath: `/orders/${orderId}`,
        imageUrl: firstImage(group.products[0]?.product?.image_urls),
      });

      createNotification({
        userId,
        type: "order",
        title:
          paymentMethod === "pay_on_delivery"
            ? "Pay at Delivery order created"
            : "Order created",
        body:
          paymentMethod === "pay_on_delivery"
            ? `Your order ${orderCode} was sent to the seller. You will still pay securely through Gleenc/Paystack before the delivery code unlocks.`
            : sellerConfirmationRequired
              ? `Your order ${orderCode} is waiting for seller availability confirmation.`
            : `Your order ${orderCode} is waiting for payment.`,
        actionLabel: "Continue order",
        actionPath: `/orders/${orderId}`,
        imageUrl: firstImage(group.products[0]?.product?.image_urls),
      });

      output.push(hydrateOrder(getOrderRowByIdForUser(userId, orderId), userId));
    }

    return output.map((order) => hydrateOrder(getOrderRowByIdForUser(userId, order.id), userId));
  });

  const createdOrderIds = createdOrders.map((order) => order.id);

  try {
    transaction(() => {
      createParentOrderForOrders({
        buyerId: userId,
        orderIds: createdOrderIds,
      });
    });
  } catch (error) {
    console.error("Order logistics grouping failed after checkout order creation:", error);
  }

  return createdOrderIds
    .map((orderId) => getOrderRowByIdForUser(userId, orderId))
    .filter(Boolean)
    .map((row) => hydrateOrder(row, userId));
}

export function sellerConfirmOrder(user, orderId, note = "") {
  const row = getOrderRowByIdForUser(user.user_id, orderId);
  if (!row) throw new HttpError(404, "Order was not found.");
  if (user.role !== "admin" && row.seller_id !== user.user_id) {
    throw new HttpError(403, "Only the seller or admin can confirm this order.");
  }
  if (row.payment_status === "paid") {
    throw new HttpError(422, "This order payment is already confirmed.");
  }

  const now = new Date().toISOString();
  const nextStage4Status =
    row.payment_method === "pay_on_delivery"
      ? "seller_confirmed_waiting_rider"
      : "seller_confirmed_waiting_payment";
  const nextOrderStatus =
    row.payment_method === "pay_on_delivery" ? "seller_confirmed" : "pending_payment";

  db.prepare(`
    UPDATE orders
    SET status = ?,
        stage4_status = ?,
        fulfillment_status = 'seller_confirmed',
        seller_confirmed_at = ?,
        seller_rejected_at = NULL,
        seller_rejection_note = '',
        seller_confirmation_required = 0,
        updated_at = ?
    WHERE id = ?
  `).run(nextOrderStatus, nextStage4Status, now, now, row.id);

  insertOrderEvent(row.id, nextOrderStatus, note || "Seller confirmed the item is available.");
  insertStatusHistory({
    orderId: row.id,
    statusLayer: "stage4",
    oldStatus: row.stage4_status || "",
    newStatus: nextStage4Status,
    changedBy: user.user_id,
    note,
  });

  createNotification({
    userId: row.buyer_id,
    type: "order",
    title: "Seller confirmed availability",
    body:
      row.payment_method === "pay_on_delivery"
        ? "The seller confirmed your order. You will pay securely through Gleenc/Paystack when the rider arrives, before delivery code verification."
        : "The seller confirmed your order. You can now continue payment.",
    actionLabel: "View order",
    actionPath: `/orders/${row.id}`,
  });

  syncOrderReadinessForDispatch(row.id);

  return getOrder(user.user_id, row.id);
}

export function sellerRejectOrder(user, orderId, note = "") {
  const row = getOrderRowByIdForUser(user.user_id, orderId);
  if (!row) throw new HttpError(404, "Order was not found.");
  if (user.role !== "admin" && row.seller_id !== user.user_id) {
    throw new HttpError(403, "Only the seller or admin can reject this order.");
  }
  if (row.payment_status === "paid") {
    throw new HttpError(422, "Paid orders cannot be rejected here. Use cancellation/refund workflow.");
  }

  const now = new Date().toISOString();
  const reason = String(note || "Seller could not confirm availability.").slice(0, 700);

  return transaction(() => {
    db.prepare(`
      UPDATE orders
      SET status = 'cancelled',
          stage4_status = 'seller_rejected',
          fulfillment_status = 'cancelled',
          seller_rejected_at = ?,
          seller_rejection_note = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, reason, now, row.id);

    restoreReservedStockForOrder(row, now);

    insertOrderEvent(row.id, "cancelled", reason);
    insertStatusHistory({
      orderId: row.id,
      statusLayer: "stage4",
      oldStatus: row.stage4_status || "",
      newStatus: "seller_rejected",
      changedBy: user.user_id,
      note: reason,
    });

    createNotification({
      userId: row.buyer_id,
      type: "order",
      title: "Order unavailable",
      body: reason,
      actionLabel: "View order",
      actionPath: `/orders/${row.id}`,
    });

    return getOrder(user.user_id, row.id);
  });
}

export function getOrderPaymentState(userId, orderId) {
  const order = getOrder(userId, orderId);
  const payment = db
    .prepare(`
      SELECT *
      FROM payment_transactions
      WHERE order_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(order.id);

  return {
    orderId: order.id,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    stage4PaymentStatus: order.stage4PaymentStatus,
    canPayNow:
      order.paymentStatus === "unpaid" &&
      order.paymentMethod === "pay_now" &&
      !order.sellerConfirmationRequired,
    canPayAtDelivery:
      order.paymentStatus === "unpaid" &&
      order.paymentMethod === "pay_on_delivery" &&
      ["seller_confirmed", "ready_for_delivery", "out_for_delivery"].includes(order.status),
    latestPayment: payment
      ? {
          reference: payment.reference,
          status: payment.status,
          authorizationUrl: payment.authorization_url,
          createdAt: payment.created_at,
        }
      : null,
  };
}

export function updateOrderStatus(user, orderId, status, note = "") {
  if (!ORDER_STATUSES.has(status)) {
    throw new HttpError(422, "Invalid order status.");
  }

  const row = getOrderRowByIdForUser(user.user_id, orderId);

  if (!row) {
    throw new HttpError(404, "Order was not found.");
  }

  const isSeller = row.seller_id === user.user_id;
  const isBuyer = row.buyer_id === user.user_id;
  const isAdmin = user.role === "admin";

  if (!isAdmin && isSeller && !SELLER_ALLOWED_STATUS.has(status)) {
    throw new HttpError(403, "This status can only be changed after payment is connected.");
  }

  if (!isAdmin && isBuyer && status !== "completed" && status !== "disputed") {
    throw new HttpError(403, "Buyers can only complete or dispute delivered orders.");
  }

  if (status === "completed" && row.status !== "delivered") {
    throw new HttpError(422, "Buyer can only complete an order after delivery is verified.");
  }

  const now = new Date().toISOString();

  return transaction(() => {
    db.prepare(`
      UPDATE orders
      SET status = ?,
          stage4_status = ?,
          fulfillment_status = ?,
          buyer_confirmed_at = CASE WHEN ? = 'completed' THEN ? ELSE buyer_confirmed_at END,
          updated_at = ?
      WHERE id = ?
    `).run(
      status,
      status,
      status,
      status,
      now,
      now,
      orderId,
    );

    if (status === "cancelled" && row.status !== "cancelled") {
      restoreReservedStockForOrder(row, now);
    }

    insertOrderEvent(orderId, status, String(note || "").slice(0, 500));
    insertStatusHistory({
      orderId,
      statusLayer: "order",
      oldStatus: row.status,
      newStatus: status,
      changedBy: user.user_id,
      note,
    });

    createNotificationForUsers(
      [row.buyer_id, row.seller_id].filter((id) => id !== user.user_id),
      {
        type: "order",
        title: eventLabel(status),
        body: note || `Order ${row.order_code} is now ${statusLabel(status)}.`,
        actionLabel: "View order",
        actionPath: `/orders/${row.id}`,
      },
    );

    return getOrder(user.user_id, orderId);
  });
}

export function verifyOrderDelivery(user, orderId, _verificationCode, _note = "") {
  const row = getOrderRowByIdForUser(user.user_id, orderId);

  if (!row) {
    throw new HttpError(404, "Order was not found.");
  }

  throw new HttpError(
    403,
    "Final delivery code verification must be completed by the assigned rider on the rider delivery page.",
  );
}

export function markOrderPaidLocally(userId, orderId, paymentReference = "") {
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(403, "Manual payment marking is disabled in production. Use Paystack verification.");
  }

  return transaction(() => {
    const row = getOrderRowByIdForUser(userId, orderId);
    if (!row) throw new HttpError(404, "Order was not found.");
    if (row.buyer_id !== userId) throw new HttpError(403, "Only the buyer can pay for this order.");
    if (row.status !== "pending_payment") throw new HttpError(422, "This order is not waiting for payment.");

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE orders
      SET status = 'paid',
          payment_status = 'paid',
          stage4_status = 'paid',
          stage4_payment_status = 'paid',
          payout_status = 'on_hold',
          updated_at = ?
      WHERE id = ?
    `).run(now, row.id);

    insertOrderEvent(
      row.id,
      "paid",
      paymentReference
        ? `Payment verified with reference ${paymentReference}.`
        : "Payment recorded locally. Replace local provider with gateway verification before production.",
    );

    createNotificationForUsers([row.buyer_id, row.seller_id], {
      type: "order",
      title: "Payment confirmed",
      body: `Payment for order ${row.order_code} has been confirmed.`,
      actionLabel: "View order",
      actionPath: `/orders/${row.id}`,
    });

    syncOrderReadinessForDispatch(row.id);

    return getOrder(userId, row.id);
  });
}

export function openOrderReturn(user, orderId, input = {}) {
  return createReturnRequest(user, orderId, { ...input, sourceType: "store_order" });
}

export function replyToOrderReturn(user, returnId, input = {}) {
  return respondToReturnRequest(user, returnId, input);
}

export function openOrderDispute(user, orderId, input = {}) {
  return createDispute(user, orderId, { ...input, sourceType: "store_order" });
}

export function listReturnsForOrder(user, orderId) {
  return listOrderReturns(user, orderId, "store_order");
}
