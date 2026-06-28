import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";

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
    verificationCode: row.verification_code || "",
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

function getOrderRowsForUser(userId) {
  return db
    .prepare(`
      SELECT orders.*, stores.name AS store_name, stores.slug AS store_slug,
             stores.phone AS seller_phone, users.name AS seller_name
      FROM orders
      JOIN stores ON stores.id = orders.store_id
      JOIN users ON users.id = orders.seller_id
      WHERE orders.buyer_id = ? OR orders.seller_id = ?
      ORDER BY orders.created_at DESC
    `)
    .all(userId, userId);
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

function hydrateOrder(row) {
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC")
    .all(row.id)
    .map(serializeOrderItem);

  const events = db
    .prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC")
    .all(row.id)
    .map(serializeOrderEvent);

  return serializeOrder(row, items, events);
}

function insertOrderEvent(orderId, status, note = "") {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO order_events (id, order_id, status, label, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(createId("evt"), orderId, status, eventLabel(status), note, now);
}

export function listOrders(userId) {
  return getOrderRowsForUser(userId).map(hydrateOrder);
}

export function getOrder(userId, idOrCode) {
  const row = String(idOrCode || "").startsWith("GLK-")
    ? getOrderRowByCodeForUser(userId, idOrCode)
    : getOrderRowByIdForUser(userId, idOrCode);

  if (!row) {
    throw new HttpError(404, "Order was not found.");
  }

  return hydrateOrder(row);
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
  const deliveryAddress = String(input?.deliveryAddress || "").trim().slice(0, 240);
  const pickupLocation = String(input?.pickupLocation || "").trim().slice(0, 240);
  const note = String(input?.note || "").trim().slice(0, 1000);

  if (!buyerName || !buyerPhone || !campus) {
    throw new HttpError(422, "Please provide your name, phone number, and campus.");
  }

  if (deliveryOption === "Delivery" && !deliveryAddress) {
    throw new HttpError(422, "Please provide the delivery address.");
  }

  if (deliveryOption === "Pickup" && !pickupLocation) {
    throw new HttpError(422, "Please provide the pickup location.");
  }

  const requestedItems = items.map((item) => ({
    productId: String(item.productId || item.id || "").trim(),
    quantity: Number(item.quantity || 1),
  }));

  if (
    requestedItems.some(
      (item) =>
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99,
    )
  ) {
    throw new HttpError(422, "Please check the cart items and quantities.");
  }

  const createdOrders = transaction(() => {
    const grouped = new Map();

    for (const requested of requestedItems) {
      const product = db
        .prepare(`
          SELECT products.*, stores.owner_id AS seller_id,
                 stores.name AS store_name, stores.slug AS store_slug,
                 stores.phone AS seller_phone
          FROM products
          JOIN stores ON stores.id = products.store_id
          WHERE products.id = ?
            AND products.status = 'active'
            AND stores.status = 'active'
        `)
        .get(requested.productId);

      if (!product) {
        throw new HttpError(404, "One of the products in your cart is no longer available.");
      }

      if (product.stock < requested.quantity) {
        throw new HttpError(
          422,
          `${product.name} has only ${product.stock} item(s) left in stock.`,
        );
      }

      const group = grouped.get(product.store_id) || {
        storeId: product.store_id,
        sellerId: product.seller_id,
        products: [],
      };

      group.products.push({
        product,
        quantity: requested.quantity,
        lineTotalKobo: product.price_kobo * requested.quantity,
      });

      grouped.set(product.store_id, group);
    }

    const now = new Date().toISOString();
    const output = [];

    for (const group of grouped.values()) {
      const subtotalKobo = group.products.reduce(
        (total, item) => total + item.lineTotalKobo,
        0,
      );
      const deliveryFeeKobo = 0;
      const totalKobo = subtotalKobo + deliveryFeeKobo;
      const orderId = createId("ord");
      const orderCode = generateOrderCode();

      db.prepare(`
        INSERT INTO orders (
          id, order_code, buyer_id, seller_id, store_id, status, payment_status,
          subtotal_kobo, delivery_fee_kobo, total_kobo, buyer_name, buyer_phone,
          campus, delivery_option, delivery_address, pickup_location, note,
          verification_code, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        orderCode,
        userId,
        group.sellerId,
        group.storeId,
        "pending_payment",
        "unpaid",
        subtotalKobo,
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
        "pending_payment",
        "Your order has been created and is waiting for payment.",
      );

      output.push(hydrateOrder(getOrderRowByIdForUser(userId, orderId)));
    }

    return output;
  });

  return createdOrders;
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

  const now = new Date().toISOString();

  db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    now,
    orderId,
  );

  insertOrderEvent(orderId, status, String(note || "").slice(0, 500));

  return getOrder(user.user_id, orderId);
}
