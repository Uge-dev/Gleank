export const initialAdminDataset = {
  overview: {
    totalUsers: 1280,
    totalSellers: 148,
    pendingSellerVerifications: 17,
    activeProducts: 764,
    pendingProducts: 42,
    pendingUsedItems: 36,
    totalOrders: 516,
    pendingDeliveries: 41,
    totalRevenue: "₦8.74m",
    pendingPayouts: "₦940k",
    openDisputes: 9,
    unreadFeedback: 23,
  },
  users: [
    { id: "usr-1001", name: "Mira Johnson", email: "mira@student.fupre.edu", phone: "08031234567", campus: "FUPRE", role: "user", status: "active", orders: 8, savedItems: 16, usedUploads: 2, profileComplete: true, payoutReady: false, joined: "2026-06-02" },
    { id: "usr-1002", name: "David Okoro", email: "david@student.fupre.edu", phone: "08151234567", campus: "FUPRE", role: "user", status: "active", orders: 3, savedItems: 9, usedUploads: 1, profileComplete: true, payoutReady: true, joined: "2026-06-08" },
    { id: "usr-1003", name: "Sandra Efe", email: "sandra@student.delsu.edu", phone: "07061234567", campus: "DELSU", role: "user", status: "suspended", orders: 1, savedItems: 4, usedUploads: 1, profileComplete: false, payoutReady: false, joined: "2026-05-22" },
    { id: "usr-1004", name: "Campus Admin", email: "admin@gleank.com", phone: "09011234567", campus: "All campuses", role: "admin", status: "active", orders: 0, savedItems: 0, usedUploads: 0, profileComplete: true, payoutReady: true, joined: "2026-04-10" },
    { id: "usr-1005", name: "Tobi Ade", email: "tobi@student.uniben.edu", phone: "09087654321", campus: "UNIBEN", role: "user", status: "active", orders: 12, savedItems: 22, usedUploads: 0, profileComplete: true, payoutReady: false, joined: "2026-06-11" },
  ],
  sellers: [
    { id: "sel-2001", storeName: "Campus Wears", ownerName: "Chinedu Mark", email: "campuswears@gleank.com", phone: "08022221111", campus: "FUPRE", category: "Fashion", verificationStatus: "approved", status: "active", products: 45, orders: 128, earnings: "₦1.84m", payoutStatus: "on_hold", bankStatus: "completed", rating: 4.8, joined: "2026-05-16" },
    { id: "sel-2002", storeName: "Tasty Bowl", ownerName: "Joy Martins", email: "tastybowl@gleank.com", phone: "08033332222", campus: "FUPRE", category: "Food", verificationStatus: "approved", status: "active", products: 18, orders: 204, earnings: "₦2.42m", payoutStatus: "released", bankStatus: "completed", rating: 4.9, joined: "2026-05-01" },
    { id: "sel-2003", storeName: "Gadget Hub", ownerName: "Kelvin Ayo", email: "gadgethub@gleank.com", phone: "08044443333", campus: "DELSU", category: "Electronics", verificationStatus: "pending", status: "active", products: 12, orders: 36, earnings: "₦740k", payoutStatus: "on_hold", bankStatus: "missing", rating: 4.4, joined: "2026-06-12" },
    { id: "sel-2004", storeName: "Print Fast", ownerName: "Nora James", email: "printfast@gleank.com", phone: "08055554444", campus: "UNIBEN", category: "Services", verificationStatus: "pending", status: "active", products: 7, orders: 64, earnings: "₦390k", payoutStatus: "ready_for_release", bankStatus: "completed", rating: 4.6, joined: "2026-06-18" },
  ],
  products: [
    { id: "prd-3001", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=160&q=80", name: "Trendy Sneakers", seller: "Campus Wears", category: "Fashion", campus: "FUPRE", price: "₦25,000", stock: 8, stockStatus: "in_stock", type: "product", status: "approved", flag: "clean", dateUploaded: "2026-06-15" },
    { id: "prd-3002", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=160&q=80", name: "Jollof Rice Combo", seller: "Tasty Bowl", category: "Food", campus: "FUPRE", price: "₦2,500", stock: 25, stockStatus: "in_stock", type: "product", status: "approved", flag: "clean", dateUploaded: "2026-06-17" },
    { id: "prd-3003", image: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=160&q=80", name: "Wireless Earbuds", seller: "Gadget Hub", category: "Electronics", campus: "DELSU", price: "₦18,000", stock: 6, stockStatus: "in_stock", type: "product", status: "pending", flag: "needs_review", dateUploaded: "2026-06-20" },
    { id: "srv-3004", image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=160&q=80", name: "Urgent Assignment Typing", seller: "Print Fast", category: "Services", campus: "UNIBEN", price: "₦1,500", stock: 50, stockStatus: "in_stock", type: "service", status: "pending", flag: "needs_review", dateUploaded: "2026-06-21" },
    { id: "prd-3005", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=160&q=80", name: "Campus Hoodie", seller: "Campus Wears", category: "Fashion", campus: "FUPRE", price: "₦16,000", stock: 0, stockStatus: "out_of_stock", type: "product", status: "out_of_stock", flag: "clean", dateUploaded: "2026-06-07" },
  ],
  usedItems: [
    { id: "used-4001", image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=160&q=80", name: "Used HP EliteBook", uploader: "David Okoro", uploaderPhone: "08151234567", contactStatus: "verified", category: "Electronics", campus: "FUPRE", condition: "good", price: "₦185,000", status: "pending", safetyStatus: "needs_review", dateSubmitted: "2026-06-22" },
    { id: "used-4002", image: "https://images.unsplash.com/photo-1587560699334-cc4ff634909a?auto=format&fit=crop&w=160&q=80", name: "Engineering Drawing Board", uploader: "Sandra Efe", uploaderPhone: "07061234567", contactStatus: "verified", category: "School Items", campus: "DELSU", condition: "fair", price: "₦12,000", status: "rejected", safetyStatus: "unsafe", rejectionReason: "Image was not clear enough for approval.", dateSubmitted: "2026-06-19" },
    { id: "used-4003", image: "https://images.unsplash.com/photo-1565106430482-8f6e74349ca1?auto=format&fit=crop&w=160&q=80", name: "Scientific Calculator", uploader: "Mira Johnson", uploaderPhone: "08031234567", contactStatus: "verified", category: "School Items", campus: "FUPRE", condition: "like_new", price: "₦9,000", status: "approved", safetyStatus: "safe", dateSubmitted: "2026-06-18" },
    { id: "used-4004", image: "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=160&q=80", name: "Hostel Reading Chair", uploader: "Tobi Ade", uploaderPhone: "09087654321", contactStatus: "pending", category: "Furniture", campus: "UNIBEN", condition: "good", price: "₦15,500", status: "pending", safetyStatus: "needs_review", dateSubmitted: "2026-06-23" },
  ],
  orders: [
    { id: "ord-5001", buyer: "Mira Johnson", seller: "Tasty Bowl", item: "Jollof Rice Combo", campus: "FUPRE", amount: "₦2,500", paymentStatus: "successful", deliveryStatus: "pending", orderStatus: "paid", deliveryCode: "GLK-4281", pickupPoint: "FUPRE Main Gate", createdAt: "2026-06-20" },
    { id: "ord-5002", buyer: "David Okoro", seller: "Campus Wears", item: "Trendy Sneakers", campus: "FUPRE", amount: "₦25,000", paymentStatus: "successful", deliveryStatus: "verified", orderStatus: "completed", deliveryCode: "GLK-9102", pickupPoint: "Engineering Block", createdAt: "2026-06-18" },
    { id: "ord-5003", buyer: "Sandra Efe", seller: "Gadget Hub", item: "Wireless Earbuds", campus: "DELSU", amount: "₦18,000", paymentStatus: "failed", deliveryStatus: "pending", orderStatus: "cancelled", deliveryCode: "GLK-7820", pickupPoint: "Campus Park", createdAt: "2026-06-16" },
    { id: "ord-5004", buyer: "Tobi Ade", seller: "Print Fast", item: "Urgent Assignment Typing", campus: "UNIBEN", amount: "₦1,500", paymentStatus: "successful", deliveryStatus: "out_for_delivery", orderStatus: "preparing", deliveryCode: "GLK-6124", pickupPoint: "Main Library", createdAt: "2026-06-22" },
  ],
  payments: [
    { id: "pay-6001", orderId: "ord-5001", buyer: "Mira Johnson", seller: "Tasty Bowl", amount: "₦2,500", gleankFee: "₦250", sellerAmount: "₦2,250", gateway: "Paystack", status: "successful", payoutStatus: "on_hold", createdAt: "2026-06-20" },
    { id: "pay-6002", orderId: "ord-5002", buyer: "David Okoro", seller: "Campus Wears", amount: "₦25,000", gleankFee: "₦2,500", sellerAmount: "₦22,500", gateway: "Paystack", status: "successful", payoutStatus: "released", createdAt: "2026-06-18" },
    { id: "pay-6003", orderId: "ord-5003", buyer: "Sandra Efe", seller: "Gadget Hub", amount: "₦18,000", gleankFee: "₦1,800", sellerAmount: "₦16,200", gateway: "Flutterwave", status: "failed", payoutStatus: "on_hold", createdAt: "2026-06-16" },
    { id: "pay-6004", orderId: "ord-5004", buyer: "Tobi Ade", seller: "Print Fast", amount: "₦1,500", gleankFee: "₦150", sellerAmount: "₦1,350", gateway: "Bank Transfer", status: "successful", payoutStatus: "ready_for_release", createdAt: "2026-06-22" },
  ],
  deliveries: [
    { id: "del-7001", orderId: "ord-5001", buyer: "Mira Johnson", seller: "Tasty Bowl", rider: "Not assigned", buyerLocation: "Female Hostel B", pickupPoint: "FUPRE Main Gate", status: "pending", codeVerified: false, updatedAt: "2026-06-20" },
    { id: "del-7002", orderId: "ord-5002", buyer: "David Okoro", seller: "Campus Wears", rider: "Rider Ben", buyerLocation: "Engineering Block", pickupPoint: "Engineering Block", status: "verified", codeVerified: true, updatedAt: "2026-06-18" },
    { id: "del-7003", orderId: "ord-5004", buyer: "Tobi Ade", seller: "Print Fast", rider: "Rider Ella", buyerLocation: "Main Library", pickupPoint: "Main Library", status: "out_for_delivery", codeVerified: false, updatedAt: "2026-06-22" },
  ],
  disputes: [
    { id: "dsp-8001", orderId: "ord-5001", title: "Buyer says item was not delivered", buyer: "Mira Johnson", seller: "Tasty Bowl", type: "delivery", priority: "high", message: "Buyer paid but delivery status has not changed.", status: "open", createdAt: "2026-06-21" },
    { id: "dsp-8002", orderId: "ord-5002", title: "Seller payout still on hold", buyer: "David Okoro", seller: "Campus Wears", type: "payment", priority: "medium", message: "Seller says payout should already be released.", status: "resolved", createdAt: "2026-06-17" },
    { id: "dsp-8003", orderId: "used-4002", title: "Used item condition complaint", buyer: "Sandra Efe", seller: "Gadget Hub", type: "product", priority: "high", message: "Used item condition does not match listing details.", status: "reviewing", createdAt: "2026-06-19" },
  ],
  feedback: [
    { id: "fbk-9001", from: "Mira Johnson", role: "user", category: "delivery", rating: 4, message: "Delivery status should update faster after payment.", status: "unread", createdAt: "2026-06-20" },
    { id: "fbk-9002", from: "Tasty Bowl", role: "seller", category: "payment", rating: 5, message: "Add a clearer payout history screen for sellers.", status: "unread", createdAt: "2026-06-18" },
    { id: "fbk-9003", from: "David Okoro", role: "user", category: "app", rating: 5, message: "Saved items and recently viewed are useful.", status: "resolved", createdAt: "2026-06-14" },
  ],
  activityLogs: [
    { id: "log-1001", admin: "Gleank Admin", action: "Approved seller verification", target: "Campus Wears", time: "2026-06-22 09:42" },
    { id: "log-1002", admin: "Gleank Admin", action: "Rejected used market item", target: "Engineering Drawing Board", time: "2026-06-21 15:10" },
    { id: "log-1003", admin: "Gleank Admin", action: "Released payout", target: "pay-6002", time: "2026-06-20 11:28" },
  ],
};

let adminDataset = structuredClone(initialAdminDataset);

export function buildAdminOverview(data) {
  const pendingPayoutCount = data.payments.filter((payment) => payment.payoutStatus === "on_hold" || payment.payoutStatus === "ready_for_release").length;

  return {
    totalUsers: data.users.length,
    totalSellers: data.sellers.length,
    pendingSellerVerifications: data.sellers.filter((seller) => seller.verificationStatus === "pending").length,
    activeProducts: data.products.filter((product) => product.status === "approved" && product.stockStatus !== "out_of_stock").length,
    pendingProducts: data.products.filter((product) => product.status === "pending").length,
    pendingUsedItems: data.usedItems.filter((item) => item.status === "pending").length,
    totalOrders: data.orders.length,
    pendingDeliveries: data.deliveries.filter((delivery) => delivery.status !== "verified" && delivery.status !== "failed").length,
    totalRevenue: initialAdminDataset.overview.totalRevenue,
    pendingPayouts: `${pendingPayoutCount} pending`,
    openDisputes: data.disputes.filter((dispute) => dispute.status === "open" || dispute.status === "reviewing").length,
    unreadFeedback: data.feedback.filter((item) => item.status === "unread").length,
  };
}

export function getAdminDataset() {
  const { overview: _overview, ...rest } = adminDataset;
  adminDataset = { ...adminDataset, overview: buildAdminOverview(rest) };
  return adminDataset;
}

export function resetAdminDataset() {
  adminDataset = structuredClone(initialAdminDataset);
  return getAdminDataset();
}

export function updateRecordStatus(collection, id, status, field = "status") {
  const records = adminDataset[collection];

  if (!Array.isArray(records)) {
    const error = new Error("Unknown admin collection");
    error.statusCode = 404;
    throw error;
  }

  const recordIndex = records.findIndex((record) => record.id === id);

  if (recordIndex === -1) {
    const error = new Error("Record not found");
    error.statusCode = 404;
    throw error;
  }

  const record = records[recordIndex];
  const patch = { [field]: status };

  if (collection === "orders" && field === "orderStatus" && status === "completed") {
    patch.deliveryStatus = "verified";
  }

  if (collection === "deliveries") {
    patch.codeVerified = status === "verified";
  }

  records[recordIndex] = { ...record, ...patch };
  adminDataset.activityLogs = [
    {
      id: `log-${Date.now()}`,
      admin: "Gleank Admin",
      action: `Changed ${collection} status to ${status}`,
      target: id,
      time: new Date().toLocaleString(),
    },
    ...adminDataset.activityLogs,
  ];

  return getAdminDataset();
}


export function updateRecordFields(collection, id, fields) {
  const records = adminDataset[collection];

  if (!Array.isArray(records)) {
    const error = new Error("Unknown admin collection");
    error.statusCode = 404;
    throw error;
  }

  const recordIndex = records.findIndex((record) => record.id === id);

  if (recordIndex === -1) {
    const error = new Error("Record not found");
    error.statusCode = 404;
    throw error;
  }

  records[recordIndex] = { ...records[recordIndex], ...fields };
  adminDataset.activityLogs = [
    {
      id: `log-${Date.now()}`,
      admin: "Gleank Admin",
      action: `Updated ${collection} record`,
      target: id,
      time: new Date().toLocaleString(),
    },
    ...adminDataset.activityLogs,
  ];

  return getAdminDataset();
}

export function deleteRecord(collection, id) {
  const records = adminDataset[collection];

  if (!Array.isArray(records)) {
    const error = new Error("Unknown admin collection");
    error.statusCode = 404;
    throw error;
  }

  const record = records.find((item) => item.id === id);
  if (!record) {
    const error = new Error("Record not found");
    error.statusCode = 404;
    throw error;
  }

  adminDataset[collection] = records.filter((item) => item.id !== id);
  adminDataset.activityLogs = [
    {
      id: `log-${Date.now()}`,
      admin: "Gleank Admin",
      action: `Deleted ${collection} record`,
      target: id,
      time: new Date().toLocaleString(),
    },
    ...adminDataset.activityLogs,
  ];

  return getAdminDataset();
}
