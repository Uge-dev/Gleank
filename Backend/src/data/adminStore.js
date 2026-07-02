import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import { createNotification, createNotificationForUsers } from "../services/notification.service.js";

function naira(kobo = 0) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Math.round(Number(kobo || 0)) / 100);
}

function parseImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function firstImage(value) {
  return parseImages(value)[0] || "";
}

function mapUserRole(role) {
  return role === "buyer" ? "user" : role;
}

function userStatus(row) {
  return row.is_active ? "active" : "disabled";
}

function productStatus(row) {
  if (row.status === "active") return "approved";
  if (row.status === "out_of_stock") return "out_of_stock";
  return "pending";
}

function serviceStatus(row) {
  if (row.status === "active") return "approved";
  if (row.status === "paused") return "hidden";
  return "pending";
}

function stockStatus(stock, status) {
  return Number(stock || 0) <= 0 || status === "out_of_stock" ? "out_of_stock" : "in_stock";
}

function usedStatus(status) {
  if (status === "active") return "approved";
  return status;
}

function paymentStatus(status) {
  if (status === "paid") return "successful";
  if (status === "unpaid" || status === "initialized") return "pending";
  return status || "pending";
}

function orderDisplayStatus(status) {
  const map = {
    processing: "preparing",
    seller_confirmed: "preparing",
    ready_for_delivery: "preparing",
    delivered: "delivered",
    completed: "completed",
    pending_payment: "pending",
  };
  return map[status] || status;
}

function deliveryDisplayStatus(status) {
  const map = {
    pending_payment: "pending",
    paid: "pending",
    seller_confirmed: "assigned",
    processing: "picked_up",
    ready_for_delivery: "picked_up",
    out_for_delivery: "out_for_delivery",
    meetup_or_delivery: "out_for_delivery",
    delivered: "verified",
    completed: "verified",
    cancelled: "failed",
    disputed: "reported",
  };
  return map[status] || status;
}

function sellerVerificationStatus(row) {
  const status = row.verification_status || row.seller_verification_status || "";
  if (status === "verified") return "approved";
  if (status === "pending_verification") return "pending";
  return status || (row.verified ? "approved" : "pending");
}

function sellerPayoutStatus(row) {
  if (!row.bank_name || !row.account_name) return "on_hold";
  if (Number(row.paid_orders || 0) > 0) return "ready_for_release";
  return "on_hold";
}

function estimateFeeKobo(amountKobo) {
  return Math.round((Number(amountKobo || 0) * 5) / 105);
}

function buildUsers() {
  return db
    .prepare(`
      SELECT users.*,
             COUNT(DISTINCT orders.id) AS order_count,
             COUNT(DISTINCT saved_items.id) AS saved_count,
             COUNT(DISTINCT used_listings.id) AS used_upload_count,
             trust.id AS trust_id,
             trust.face_verified AS trust_face_verified,
             payout.id AS payout_id,
             payout.bank_name AS payout_bank_name,
             payout.account_name AS payout_account_name
      FROM users
      LEFT JOIN orders ON orders.buyer_id = users.id
      LEFT JOIN saved_items ON saved_items.user_id = users.id
      LEFT JOIN used_listings ON used_listings.seller_id = users.id
      LEFT JOIN user_trust_profiles trust ON trust.user_id = users.id
      LEFT JOIN user_payout_accounts payout ON payout.user_id = users.id
      GROUP BY users.id
      ORDER BY users.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || "",
      campus: row.campus || "",
      role: mapUserRole(row.role),
      status: userStatus(row),
      orders: Number(row.order_count || 0),
      savedItems: Number(row.saved_count || 0),
      usedUploads: Number(row.used_upload_count || 0),
      profileComplete: Boolean(row.email_verified && (row.role !== "seller" || row.trust_face_verified)),
      payoutReady: Boolean(row.payout_bank_name && row.payout_account_name),
      joined: dateOnly(row.created_at),
    }));
}

function buildSellers() {
  return db
    .prepare(`
      SELECT stores.*, users.name AS owner_name, users.email, users.phone AS owner_phone,
             seller_verification_profiles.status AS seller_verification_status,
             user_payout_accounts.bank_name, user_payout_accounts.account_name,
             seller_subscriptions.status AS subscription_status,
             COUNT(DISTINCT products.id) AS product_count,
             COUNT(DISTINCT services.id) AS service_count,
             COUNT(DISTINCT orders.id) AS order_count,
             SUM(CASE WHEN orders.payment_status = 'paid' THEN orders.total_kobo ELSE 0 END) AS paid_total,
             SUM(CASE WHEN orders.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders
      FROM stores
      JOIN users ON users.id = stores.owner_id
      LEFT JOIN seller_verification_profiles ON seller_verification_profiles.user_id = users.id
      LEFT JOIN user_payout_accounts ON user_payout_accounts.user_id = users.id
      LEFT JOIN seller_subscriptions ON seller_subscriptions.user_id = users.id
      LEFT JOIN products ON products.store_id = stores.id
      LEFT JOIN services ON services.store_id = stores.id
      LEFT JOIN orders ON orders.store_id = stores.id
      GROUP BY stores.id
      ORDER BY stores.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: row.id,
      storeName: row.name,
      ownerName: row.owner_name,
      email: row.email,
      phone: row.phone || row.owner_phone || "",
      campus: row.campus || "",
      category: row.category || "General",
      verificationStatus: sellerVerificationStatus(row),
      status: row.status === "paused" ? "suspended" : "active",
      products: Number(row.product_count || 0) + Number(row.service_count || 0),
      orders: Number(row.order_count || 0),
      earnings: naira(row.paid_total || 0),
      payoutStatus: sellerPayoutStatus(row),
      bankStatus: row.bank_name && row.account_name ? "completed" : "missing",
      rating: 0,
      joined: dateOnly(row.created_at),
    }));
}

function buildProducts() {
  const productRows = db
    .prepare(`
      SELECT products.*, stores.name AS store_name, stores.campus AS store_campus
      FROM products
      JOIN stores ON stores.id = products.store_id
      ORDER BY products.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: row.id,
      image: firstImage(row.image_urls),
      name: row.name,
      seller: row.store_name,
      category: row.category,
      campus: row.store_campus || "",
      price: naira(row.price_kobo),
      stock: Number(row.stock || 0),
      stockStatus: stockStatus(row.stock, row.status),
      type: "product",
      status: productStatus(row),
      flag: row.status === "draft" ? "needs_review" : "clean",
      dateUploaded: dateOnly(row.created_at),
    }));

  const serviceRows = db
    .prepare(`
      SELECT services.*, stores.name AS store_name, stores.campus AS store_campus
      FROM services
      JOIN stores ON stores.id = services.store_id
      ORDER BY services.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: row.id,
      image: firstImage(row.image_urls),
      name: row.name,
      seller: row.store_name,
      category: row.category,
      campus: row.store_campus || "",
      price: naira(row.price_kobo),
      stock: 1,
      stockStatus: row.status === "paused" ? "out_of_stock" : "in_stock",
      type: "service",
      status: serviceStatus(row),
      flag: row.status === "draft" ? "needs_review" : "clean",
      dateUploaded: dateOnly(row.created_at),
    }));

  return [...productRows, ...serviceRows].sort((a, b) => b.dateUploaded.localeCompare(a.dateUploaded));
}

function buildUsedItems() {
  return db
    .prepare(`
      SELECT used_listings.*, users.name AS uploader_name, users.phone AS uploader_phone,
             trust.face_verified AS face_verified,
             trust.identity_proof_url AS trust_identity_proof_url
      FROM used_listings
      JOIN users ON users.id = used_listings.seller_id
      LEFT JOIN user_trust_profiles trust ON trust.user_id = users.id
      ORDER BY used_listings.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: row.id,
      image: firstImage(row.image_urls),
      imageUrls: parseImages(row.image_urls),
      name: row.name,
      uploader: row.uploader_name,
      uploaderPhone: row.uploader_phone || "",
      contactStatus: row.face_verified ? "verified" : "pending",
      category: row.category,
      campus: row.campus || "",
      condition: String(row.condition || "").toLowerCase().replaceAll(" ", "_"),
      price: naira(row.price_kobo),
      status: usedStatus(row.status),
      safetyStatus: row.status === "active" ? "safe" : row.status === "rejected" ? "unsafe" : "needs_review",
      rejectionReason: row.review_note || "",
      serialNumber: row.serial_number || "",
      ownershipProofUrl: row.ownership_proof_url || null,
      receiptUrl: row.receipt_url || null,
      trustIdentityProofUrl: row.trust_identity_proof_url || null,
      reasonForSelling: row.reason_for_selling || "",
      defectsDisclosed: row.defects_disclosed || "",
      confirmationText: row.confirmation_text || "",
      dateSubmitted: dateOnly(row.created_at),
    }));
}

function buildOrders() {
  const normalOrders = db
    .prepare(`
      SELECT orders.*, buyer.name AS buyer_name, stores.name AS store_name,
             GROUP_CONCAT(order_items.product_name, ', ') AS item_names
      FROM orders
      JOIN users buyer ON buyer.id = orders.buyer_id
      JOIN stores ON stores.id = orders.store_id
      LEFT JOIN order_items ON order_items.order_id = orders.id
      GROUP BY orders.id
      ORDER BY orders.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: row.id,
      buyer: row.buyer_name,
      seller: row.store_name,
      item: row.item_names || "Store order",
      campus: row.campus || "",
      amount: naira(row.total_kobo),
      paymentStatus: paymentStatus(row.payment_status),
      deliveryStatus: deliveryDisplayStatus(row.status),
      orderStatus: orderDisplayStatus(row.status),
      deliveryCode: row.verification_code || "",
      pickupPoint: row.delivery_option === "Delivery" ? row.delivery_address : row.pickup_location,
      createdAt: dateOnly(row.created_at),
    }));

  const usedOrders = db
    .prepare(`
      SELECT used_market_orders.*, buyer.name AS buyer_name, seller.name AS seller_name,
             used_listings.name AS listing_name
      FROM used_market_orders
      JOIN users buyer ON buyer.id = used_market_orders.buyer_id
      JOIN users seller ON seller.id = used_market_orders.seller_id
      JOIN used_listings ON used_listings.id = used_market_orders.listing_id
      ORDER BY used_market_orders.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: row.id,
      buyer: row.buyer_name,
      seller: row.seller_name,
      item: row.listing_name,
      campus: row.campus || "",
      amount: naira(row.total_kobo),
      paymentStatus: paymentStatus(row.payment_status),
      deliveryStatus: deliveryDisplayStatus(row.status),
      orderStatus: orderDisplayStatus(row.status),
      deliveryCode: row.verification_code || "",
      pickupPoint: row.delivery_option === "Delivery" ? row.delivery_address : row.pickup_location,
      createdAt: dateOnly(row.created_at),
    }));

  return [...normalOrders, ...usedOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function buildPayments() {
  const transactionRows = db
    .prepare(`
      SELECT payment_transactions.*,
             orders.order_code, orders.total_kobo AS order_total, orders.payment_status AS order_payment_status,
             used_market_orders.order_code AS used_order_code,
             used_market_orders.total_kobo AS used_total,
             used_market_orders.protection_fee_kobo AS used_fee,
             buyer.name AS buyer_name,
             used_buyer.name AS used_buyer_name,
             stores.name AS store_name,
             used_seller.name AS used_seller_name
      FROM payment_transactions
      LEFT JOIN orders ON orders.id = payment_transactions.order_id
      LEFT JOIN users buyer ON buyer.id = orders.buyer_id
      LEFT JOIN stores ON stores.id = orders.store_id
      LEFT JOIN used_market_orders ON used_market_orders.id = payment_transactions.used_order_id
      LEFT JOIN users used_buyer ON used_buyer.id = used_market_orders.buyer_id
      LEFT JOIN users used_seller ON used_seller.id = used_market_orders.seller_id
      ORDER BY payment_transactions.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => {
      const amountKobo = row.amount_kobo || row.order_total || row.used_total || 0;
      const feeKobo = row.used_fee || estimateFeeKobo(amountKobo);
      return {
        id: row.reference,
        orderId: row.order_code || row.used_order_code || row.order_id || row.used_order_id || row.subscription_id || "",
        buyer: row.buyer_name || row.used_buyer_name || "Seller subscription",
        seller: row.store_name || row.used_seller_name || "Gleank",
        amount: naira(amountKobo),
        gleankFee: naira(feeKobo),
        sellerAmount: naira(Math.max(0, amountKobo - feeKobo)),
        gateway: row.provider === "flutterwave" ? "Flutterwave" : row.provider === "paystack" ? "Paystack" : "Bank Transfer",
        status: paymentStatus(row.status === "paid" ? "paid" : row.order_payment_status || row.status),
        payoutStatus: row.status === "paid" ? "ready_for_release" : "on_hold",
        createdAt: dateOnly(row.created_at),
      };
    });

  const orderFallbackRows = db
    .prepare(`
      SELECT orders.*, buyer.name AS buyer_name, stores.name AS store_name
      FROM orders
      JOIN users buyer ON buyer.id = orders.buyer_id
      JOIN stores ON stores.id = orders.store_id
      WHERE orders.payment_status != 'unpaid'
        AND NOT EXISTS (
          SELECT 1 FROM payment_transactions
          WHERE payment_transactions.order_id = orders.id
        )
      ORDER BY orders.created_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => {
      const feeKobo = estimateFeeKobo(row.total_kobo);
      return {
        id: row.order_code,
        orderId: row.order_code,
        buyer: row.buyer_name,
        seller: row.store_name,
        amount: naira(row.total_kobo),
        gleankFee: naira(feeKobo),
        sellerAmount: naira(Math.max(0, row.total_kobo - feeKobo)),
        gateway: "Bank Transfer",
        status: paymentStatus(row.payment_status),
        payoutStatus: row.status === "completed" ? "ready_for_release" : "on_hold",
        createdAt: dateOnly(row.created_at),
      };
    });

  return [...transactionRows, ...orderFallbackRows];
}

function buildDeliveries() {
  const normal = db
    .prepare(`
      SELECT orders.*, buyer.name AS buyer_name, stores.name AS store_name
      FROM orders
      JOIN users buyer ON buyer.id = orders.buyer_id
      JOIN stores ON stores.id = orders.store_id
      WHERE orders.status NOT IN ('pending_payment', 'cancelled')
      ORDER BY orders.updated_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: `del-${row.id}`,
      orderId: row.order_code,
      buyer: row.buyer_name,
      seller: row.store_name,
      rider: "Not assigned",
      buyerLocation: row.delivery_option === "Delivery" ? row.delivery_address : row.pickup_location,
      pickupPoint: row.pickup_location || row.delivery_address,
      status: deliveryDisplayStatus(row.status),
      codeVerified: ["delivered", "completed"].includes(row.status),
      updatedAt: dateOnly(row.updated_at),
    }));

  const used = db
    .prepare(`
      SELECT used_market_orders.*, buyer.name AS buyer_name, seller.name AS seller_name
      FROM used_market_orders
      JOIN users buyer ON buyer.id = used_market_orders.buyer_id
      JOIN users seller ON seller.id = used_market_orders.seller_id
      WHERE used_market_orders.status NOT IN ('pending_payment', 'cancelled')
      ORDER BY used_market_orders.updated_at DESC
      LIMIT 500
    `)
    .all()
    .map((row) => ({
      id: `udel-${row.id}`,
      orderId: row.order_code,
      buyer: row.buyer_name,
      seller: row.seller_name,
      rider: "Not assigned",
      buyerLocation: row.delivery_option === "Delivery" ? row.delivery_address : row.pickup_location,
      pickupPoint: row.pickup_location || row.delivery_address,
      status: deliveryDisplayStatus(row.status),
      codeVerified: ["delivered", "completed"].includes(row.status),
      updatedAt: dateOnly(row.updated_at),
    }));

  return [...normal, ...used];
}

function buildDisputes() {
  const orderDisputes = db
    .prepare(`
      SELECT orders.*, buyer.name AS buyer_name, stores.name AS store_name
      FROM orders
      JOIN users buyer ON buyer.id = orders.buyer_id
      JOIN stores ON stores.id = orders.store_id
      WHERE orders.status = 'disputed'
      ORDER BY orders.updated_at DESC
    `)
    .all()
    .map((row) => ({
      id: `dsp-${row.id}`,
      orderId: row.order_code,
      title: "Store order dispute",
      buyer: row.buyer_name,
      seller: row.store_name,
      type: "delivery",
      priority: "high",
      message: row.note || "Order was marked as disputed.",
      status: "open",
      createdAt: dateOnly(row.updated_at),
    }));

  const usedReports = db
    .prepare(`
      SELECT used_listing_reports.*, used_listings.name AS listing_name,
             reporter.name AS reporter_name, seller.name AS seller_name
      FROM used_listing_reports
      JOIN used_listings ON used_listings.id = used_listing_reports.listing_id
      JOIN users reporter ON reporter.id = used_listing_reports.reporter_id
      JOIN users seller ON seller.id = used_listings.seller_id
      ORDER BY used_listing_reports.created_at DESC
    `)
    .all()
    .map((row) => ({
      id: row.id,
      orderId: row.listing_id,
      title: row.reason || "Used Market report",
      buyer: row.reporter_name,
      seller: row.seller_name,
      type: "product",
      priority: row.status === "open" ? "high" : "medium",
      message: row.details || `Report for ${row.listing_name}`,
      status: row.status === "resolved" || row.status === "dismissed" ? "resolved" : row.status,
      createdAt: dateOnly(row.created_at),
    }));

  return [...orderDisputes, ...usedReports];
}

function buildFeedback() {
  return db
    .prepare(`
      SELECT * FROM user_security_events
      WHERE event_type LIKE '%feedback%'
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .all()
    .map((row) => ({
      id: row.id,
      from: row.user_id,
      role: "user",
      category: "app",
      rating: 0,
      message: row.event_type,
      status: "unread",
      createdAt: dateOnly(row.created_at),
    }));
}

function supportAdminRow() {
  const existingAdmin = db
    .prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
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
      ?, 'Gleank Support', 'support@gleank.local', 'support-account',
      'admin', 'Gleank HQ', '', NULL, 1, 1, ?, 0, NULL, 0, NULL,
      NULL, ?, ?, ?
    )
  `).run(id, now, now, now, now);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function mapSupportRole(role) {
  if (role === "buyer") return "user";
  return role || "user";
}

function buildSupportConversations() {
  const messages = db.prepare(`
    SELECT messages.*, users.name AS sender_name, users.role AS sender_role
    FROM messages
    JOIN users ON users.id = messages.sender_id
    WHERE messages.conversation_id = ?
    ORDER BY messages.created_at ASC
    LIMIT 160
  `);

  return db
    .prepare(`
      SELECT conversations.*,
             users.name AS user_name,
             users.email AS user_email,
             users.role AS user_role,
             users.campus AS user_campus,
             users.avatar_url AS user_avatar_url,
             (
               SELECT COUNT(*)
               FROM messages unread
               WHERE unread.conversation_id = conversations.id
                 AND unread.sender_id = conversations.buyer_id
                 AND unread.is_read = 0
             ) AS unread_count
      FROM conversations
      JOIN users ON users.id = conversations.buyer_id
      WHERE conversations.context_type = 'support'
      ORDER BY COALESCE(conversations.last_message_at, conversations.updated_at) DESC
      LIMIT 100
    `)
    .all()
    .map((row) => {
      const conversationMessages = messages.all(row.id).map((message) => ({
        id: message.id,
        senderId: message.sender_id,
        senderName: message.sender_name || "Gleank user",
        senderRole: mapSupportRole(message.sender_role),
        body: message.body,
        isAdmin: message.sender_role === "admin",
        createdAt: message.created_at,
      }));

      return {
        id: row.id,
        userId: row.buyer_id,
        userName: row.user_name,
        userEmail: row.user_email,
        userRole: mapSupportRole(row.user_role),
        campus: row.user_campus || "",
        avatarUrl: row.user_avatar_url || "",
        lastMessage: row.last_message_body || conversationMessages.at(-1)?.body || "",
        lastMessageAt: row.last_message_at || row.updated_at,
        unreadCount: Number(row.unread_count || 0),
        status: Number(row.unread_count || 0) > 0 ? "unread" : "read",
        messages: conversationMessages,
      };
    });
}

function buildActivityLogs() {
  const security = db
    .prepare(`
      SELECT user_security_events.*, users.name AS user_name
      FROM user_security_events
      LEFT JOIN users ON users.id = user_security_events.user_id
      ORDER BY user_security_events.created_at DESC
      LIMIT 80
    `)
    .all()
    .map((row) => ({
      id: row.id,
      admin: row.user_name || "System",
      action: row.event_type.replaceAll("_", " "),
      target: row.user_id,
      time: row.created_at,
    }));

  const orders = db
    .prepare(`
      SELECT order_events.*, orders.order_code
      FROM order_events
      JOIN orders ON orders.id = order_events.order_id
      ORDER BY order_events.created_at DESC
      LIMIT 80
    `)
    .all()
    .map((row) => ({
      id: row.id,
      admin: "Order system",
      action: row.label,
      target: row.order_code,
      time: row.created_at,
    }));

  return [...security, ...orders]
    .sort((a, b) => String(b.time).localeCompare(String(a.time)))
    .slice(0, 100);
}

export function buildAdminOverview(data) {
  const totalRevenueKobo = data.payments.reduce((sum, payment) => {
    const numeric = Number(String(payment.amount).replace(/[^\d.-]/g, ""));
    return sum + (Number.isFinite(numeric) ? numeric * 100 : 0);
  }, 0);
  const pendingPayoutCount = data.payments.filter((payment) => ["on_hold", "ready_for_release"].includes(payment.payoutStatus)).length;
  const unreadSupportCount = data.supportConversations.reduce(
    (sum, conversation) => sum + Number(conversation.unreadCount || 0),
    0,
  );

  return {
    totalUsers: data.users.length,
    totalSellers: data.sellers.length,
    pendingSellerVerifications: data.sellers.filter((seller) => seller.verificationStatus === "pending").length,
    activeProducts: data.products.filter((product) => product.status === "approved" && product.stockStatus !== "out_of_stock").length,
    pendingProducts: data.products.filter((product) => product.status === "pending").length,
    pendingUsedItems: data.usedItems.filter((item) => item.status === "pending").length,
    totalOrders: data.orders.length,
    pendingDeliveries: data.deliveries.filter((delivery) => delivery.status !== "verified" && delivery.status !== "failed").length,
    totalRevenue: naira(totalRevenueKobo),
    pendingPayouts: `${pendingPayoutCount} pending`,
    openDisputes: data.disputes.filter((dispute) => ["open", "reviewing"].includes(dispute.status)).length,
    unreadFeedback: data.feedback.filter((item) => item.status === "unread").length,
    unreadSupport: unreadSupportCount,
  };
}

export function getAdminDataset() {
  const data = {
    users: buildUsers(),
    sellers: buildSellers(),
    products: buildProducts(),
    usedItems: buildUsedItems(),
    orders: buildOrders(),
    payments: buildPayments(),
    deliveries: buildDeliveries(),
    disputes: buildDisputes(),
    supportConversations: buildSupportConversations(),
    feedback: buildFeedback(),
    activityLogs: buildActivityLogs(),
  };

  return { overview: buildAdminOverview(data), ...data };
}

function cleanSupportBody(value) {
  return String(value || "").trim().slice(0, 1600);
}

function markSupportConversationReadInternal(conversationId) {
  const conversation = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND context_type = 'support'")
    .get(conversationId);

  if (!conversation) throw new HttpError(404, "Support conversation was not found.");

  db.prepare(`
    UPDATE messages
    SET is_read = 1
    WHERE conversation_id = ? AND sender_id = ?
  `).run(conversation.id, conversation.buyer_id);

  return conversation;
}

export function markSupportConversationRead(conversationId) {
  transaction(() => {
    markSupportConversationReadInternal(conversationId);
  });

  return getAdminDataset();
}

export function sendAdminSupportMessage(conversationId, input) {
  const body = cleanSupportBody(input?.body);
  if (!body) throw new HttpError(422, "Message cannot be empty.");

  transaction(() => {
    const conversation = markSupportConversationReadInternal(conversationId);
    const admin = supportAdminRow();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, body, attachment_url, is_read, created_at)
      VALUES (?, ?, ?, ?, NULL, 0, ?)
    `).run(createId("msg"), conversation.id, admin.id, body, now);

    db.prepare(`
      UPDATE conversations
      SET seller_id = ?, last_message_body = ?, last_message_at = ?, updated_at = ?
      WHERE id = ?
    `).run(admin.id, body, now, now, conversation.id);

    createNotification({
      userId: conversation.buyer_id,
      type: "message",
      title: "Gleank Support replied",
      body,
      actionLabel: "Open support chat",
      actionPath: "/messages?support=1",
    });
  });

  return getAdminDataset();
}

function assertKnownCollection(collection) {
  const allowed = new Set(["users", "sellers", "products", "usedItems", "orders", "payments", "deliveries", "disputes", "feedback"]);
  if (!allowed.has(collection)) throw new HttpError(404, "Unknown admin collection.");
}

function normalizeProductStatus(status) {
  if (status === "approved" || status === "in_stock") return "active";
  if (status === "out_of_stock") return "out_of_stock";
  return "draft";
}

function normalizeServiceStatus(status) {
  if (status === "approved" || status === "in_stock") return "active";
  if (status === "hidden" || status === "out_of_stock") return "paused";
  return "draft";
}

function normalizeUsedStatus(status) {
  if (status === "approved" || status === "safe") return "active";
  if (status === "removed" || status === "unsafe") return "rejected";
  return status;
}

function normalizeOrderStatus(status) {
  const map = {
    preparing: "processing",
    picked_up: "processing",
    assigned: "seller_confirmed",
    verified: "delivered",
    refunded: "cancelled",
  };
  return map[status] || status;
}

function updateUser(id, fields) {
  if ("status" in fields) {
    const active = fields.status === "active" ? 1 : 0;
    db.prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?").run(active, new Date().toISOString(), id);
    createNotification({
      userId: id,
      type: "admin",
      title: active ? "Account activated" : "Account status changed",
      body: active
        ? "Admin has activated your Gleank account."
        : "Admin has changed your Gleank account status. Contact support if this seems wrong.",
      actionLabel: "View profile",
      actionPath: "/profile",
    });
  }
}

function updateSeller(id, fields) {
  const now = new Date().toISOString();
  const storeForNotice = db.prepare("SELECT id, owner_id, name, slug FROM stores WHERE id = ?").get(id);
  if ("status" in fields) {
    const status = fields.status === "active" ? "active" : "paused";
    db.prepare("UPDATE stores SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    if (storeForNotice) {
      createNotification({
        userId: storeForNotice.owner_id,
        type: "admin",
        title: "Store status updated",
        body: `${storeForNotice.name} is now ${status}.`,
        actionLabel: "Open dashboard",
        actionPath: "/dashboard",
      });
    }
  }
  if ("verificationStatus" in fields) {
    const status = fields.verificationStatus === "approved" ? "verified" : fields.verificationStatus === "pending" ? "pending_verification" : fields.verificationStatus;
    db.prepare(`
      UPDATE stores
      SET verified = ?, verification_status = ?, verification_note = ?, verified_at = ?, updated_at = ?
      WHERE id = ?
    `).run(status === "verified" ? 1 : 0, status, `Admin set seller verification to ${status}.`, status === "verified" ? now : null, now, id);

    const store = db.prepare("SELECT owner_id FROM stores WHERE id = ?").get(id);
    if (store) {
      db.prepare(`
        UPDATE seller_verification_profiles
        SET status = ?, note = ?, verified_at = ?, updated_at = ?
        WHERE user_id = ?
      `).run(status, `Admin set seller verification to ${status}.`, status === "verified" ? now : null, now, store.owner_id);
    }
    if (storeForNotice) {
      createNotification({
        userId: storeForNotice.owner_id,
        type: "admin",
        title: "Seller verification updated",
        body: `${storeForNotice.name} verification is now ${status}.`,
        actionLabel: "Open seller setup",
        actionPath: "/seller/onboarding",
      });
    }
  }
}

function updateProductOrService(id, fields) {
  const now = new Date().toISOString();
  const product = db.prepare(`
    SELECT products.id, products.name, products.store_id, stores.owner_id
    FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE products.id = ?
  `).get(id);
  if (product) {
    if ("status" in fields || "stockStatus" in fields || "stock" in fields) {
      const status = normalizeProductStatus(fields.status || fields.stockStatus || "approved");
      const stock = "stock" in fields ? Number(fields.stock || 0) : status === "out_of_stock" ? 0 : null;
      if (stock === null) {
        db.prepare("UPDATE products SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
      } else {
        db.prepare("UPDATE products SET status = ?, stock = ?, updated_at = ? WHERE id = ?").run(status, stock, now, id);
      }
      createNotification({
        userId: product.owner_id,
        type: "admin",
        title: "Product status updated",
        body: `${product.name} is now ${status}.`,
        actionLabel: "Open dashboard",
        actionPath: "/dashboard",
      });
    }
    return;
  }

  const service = db.prepare(`
    SELECT services.id, services.name, stores.owner_id
    FROM services
    JOIN stores ON stores.id = services.store_id
    WHERE services.id = ?
  `).get(id);
  if (service && ("status" in fields || "stockStatus" in fields)) {
    const status = normalizeServiceStatus(fields.status || fields.stockStatus || "approved");
    db.prepare("UPDATE services SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      now,
      id,
    );
    createNotification({
      userId: service.owner_id,
      type: "admin",
      title: "Service status updated",
      body: `${service.name} is now ${status}.`,
      actionLabel: "Open dashboard",
      actionPath: "/dashboard",
    });
  }
}

function updateUsedItem(id, fields) {
  const now = new Date().toISOString();
  const status = normalizeUsedStatus(fields.status || fields.safetyStatus || "pending");
  const note = fields.rejectionReason || fields.reviewNote || "";
  const listing = db.prepare("SELECT id, seller_id, name FROM used_listings WHERE id = ?").get(id);
  db.prepare("UPDATE used_listings SET status = ?, review_note = COALESCE(NULLIF(?, ''), review_note), updated_at = ? WHERE id = ?").run(status, note, now, id);
  db.prepare(`
    INSERT INTO used_listing_reviews (id, listing_id, reviewer_id, status, note, created_at)
    VALUES (?, ?, NULL, ?, ?, ?)
  `).run(createId("ulr"), id, status === "active" ? "approved" : status === "rejected" ? "rejected" : "pending", note || `Admin set status to ${status}.`, now);
  if (listing) {
    createNotification({
      userId: listing.seller_id,
      type: "admin",
      title: "Used Market review updated",
      body: `${listing.name} is now ${status}.${note ? ` ${note}` : ""}`,
      actionLabel: "View listing",
      actionPath: `/used-market/${listing.id}`,
    });
  }
}

function updateOrder(id, fields) {
  const now = new Date().toISOString();
  const nextStatus = normalizeOrderStatus(fields.orderStatus || fields.deliveryStatus || fields.status || "");
  const payment = fields.paymentStatus || "";

  const normal = db.prepare("SELECT id, order_code, buyer_id, seller_id FROM orders WHERE id = ? OR order_code = ?").get(id, id);
  if (normal) {
    if (nextStatus) db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, normal.id);
    if (payment) db.prepare("UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?").run(payment === "successful" ? "paid" : payment === "pending" ? "unpaid" : payment, now, normal.id);
    createNotificationForUsers([normal.buyer_id, normal.seller_id], {
      type: "admin",
      title: "Order updated by admin",
      body: `Order ${normal.order_code} was updated${nextStatus ? ` to ${nextStatus}` : ""}.`,
      actionLabel: "View order",
      actionPath: `/orders/${normal.id}`,
    });
    return;
  }

  const used = db.prepare("SELECT id, order_code, buyer_id, seller_id FROM used_market_orders WHERE id = ? OR order_code = ?").get(id, id);
  if (used) {
    if (nextStatus) db.prepare("UPDATE used_market_orders SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, used.id);
    if (payment) db.prepare("UPDATE used_market_orders SET payment_status = ?, updated_at = ? WHERE id = ?").run(payment === "successful" ? "paid" : payment === "pending" ? "unpaid" : payment, now, used.id);
    createNotificationForUsers([used.buyer_id, used.seller_id], {
      type: "admin",
      title: "Used Market order updated by admin",
      body: `Order ${used.order_code} was updated${nextStatus ? ` to ${nextStatus}` : ""}.`,
      actionLabel: "View order",
      actionPath: `/used-orders/${used.id}`,
    });
  }
}

function updatePayment(id, fields) {
  const now = new Date().toISOString();
  const status = fields.status === "successful" ? "paid" : fields.status === "pending" ? "initialized" : fields.status === "refunded" ? "cancelled" : fields.status;
  if (status) {
    db.prepare("UPDATE payment_transactions SET status = ?, updated_at = ? WHERE reference = ? OR id = ?").run(status, now, id, id);
  }
}

function updateDispute(id, fields) {
  const now = new Date().toISOString();
  if (id.startsWith("dsp-")) {
    const orderId = id.replace(/^dsp-/, "");
    const status = fields.status === "resolved" || fields.status === "rejected" ? "completed" : "disputed";
    db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, now, orderId);
  } else {
    const status = fields.status === "resolved" ? "resolved" : fields.status === "rejected" ? "dismissed" : "reviewing";
    db.prepare("UPDATE used_listing_reports SET status = ? WHERE id = ?").run(status, id);
  }
}

export function updateRecordFields(collection, id, fields) {
  assertKnownCollection(collection);
  transaction(() => {
    if (collection === "users") updateUser(id, fields);
    if (collection === "sellers") updateSeller(id, fields);
    if (collection === "products") updateProductOrService(id, fields);
    if (collection === "usedItems") updateUsedItem(id, fields);
    if (collection === "orders" || collection === "deliveries") updateOrder(id.replace(/^del-|^udel-/, ""), fields);
    if (collection === "payments") updatePayment(id, fields);
    if (collection === "disputes") updateDispute(id, fields);
  });
  return getAdminDataset();
}

export function updateRecordStatus(collection, id, status, field = "status") {
  return updateRecordFields(collection, id, { [field]: status });
}

export function deleteRecord(collection, id) {
  assertKnownCollection(collection);
  transaction(() => {
    if (collection === "users") updateUser(id, { status: "disabled" });
    if (collection === "sellers") updateSeller(id, { status: "suspended" });
    if (collection === "products") updateProductOrService(id, { status: "hidden" });
    if (collection === "usedItems") updateUsedItem(id, { status: "removed", rejectionReason: "Removed by admin." });
    if (collection === "orders") updateOrder(id, { orderStatus: "cancelled" });
    if (collection === "payments") updatePayment(id, { status: "failed" });
    if (collection === "deliveries") updateOrder(id.replace(/^del-|^udel-/, ""), { deliveryStatus: "failed" });
    if (collection === "disputes") updateDispute(id, { status: "resolved" });
  });
  return getAdminDataset();
}

export function resetAdminDataset() {
  return getAdminDataset();
}
