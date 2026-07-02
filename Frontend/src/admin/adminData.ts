export type AdminStatus =
  | "active"
  | "suspended"
  | "disabled"
  | "pending"
  | "approved"
  | "rejected"
  | "hidden"
  | "removed"
  | "out_of_stock"
  | "in_stock"
  | "paid"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded"
  | "successful"
  | "failed"
  | "on_hold"
  | "ready_for_release"
  | "released"
  | "assigned"
  | "picked_up"
  | "verified"
  | "open"
  | "reviewing"
  | "waiting_for_buyer"
  | "waiting_for_seller"
  | "resolved"
  | "unread"
  | "read"
  | "answered"
  | "safe"
  | "unsafe"
  | "needs_review"
  | "reported";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  campus: string;
  role: "user" | "seller" | "admin";
  status: AdminStatus;
  orders: number;
  savedItems: number;
  usedUploads: number;
  profileComplete: boolean;
  payoutReady: boolean;
  joined: string;
};

export type AdminSeller = {
  id: string;
  storeName: string;
  ownerName: string;
  email: string;
  phone: string;
  campus: string;
  category: string;
  verificationStatus: AdminStatus;
  status: AdminStatus;
  products: number;
  orders: number;
  earnings: string;
  payoutStatus: AdminStatus;
  bankStatus: "completed" | "missing";
  rating: number;
  joined: string;
};

export type AdminProduct = {
  id: string;
  image: string;
  name: string;
  seller: string;
  category: string;
  campus: string;
  price: string;
  stock: number;
  stockStatus: AdminStatus;
  type: "product" | "service";
  status: AdminStatus;
  flag: AdminStatus | "clean";
  dateUploaded: string;
};

export type AdminUsedItem = {
  id: string;
  image: string;
  imageUrls?: string[];
  name: string;
  uploader: string;
  uploaderPhone: string;
  contactStatus: AdminStatus;
  category: string;
  campus: string;
  condition: "new" | "like_new" | "very_good" | "good" | "fair" | "needs_repair";
  price: string;
  status: AdminStatus;
  safetyStatus: AdminStatus;
  rejectionReason?: string;
  serialNumber?: string;
  ownershipProofUrl?: string | null;
  receiptUrl?: string | null;
  trustIdentityProofUrl?: string | null;
  reasonForSelling?: string;
  defectsDisclosed?: string;
  confirmationText?: string;
  dateSubmitted: string;
};

export type AdminOrder = {
  id: string;
  buyer: string;
  seller: string;
  item: string;
  campus: string;
  amount: string;
  paymentStatus: AdminStatus;
  deliveryStatus: AdminStatus;
  orderStatus: AdminStatus;
  deliveryCode: string;
  pickupPoint: string;
  createdAt: string;
};

export type AdminPayment = {
  id: string;
  orderId: string;
  buyer: string;
  seller: string;
  amount: string;
  gleankFee: string;
  sellerAmount: string;
  gateway: "Paystack" | "Flutterwave" | "Bank Transfer";
  status: AdminStatus;
  payoutStatus: AdminStatus;
  createdAt: string;
};

export type AdminDelivery = {
  id: string;
  orderId: string;
  buyer: string;
  seller: string;
  rider: string;
  buyerLocation: string;
  pickupPoint: string;
  status: AdminStatus;
  codeVerified: boolean;
  updatedAt: string;
};

export type AdminDispute = {
  id: string;
  orderId: string;
  title: string;
  buyer: string;
  seller: string;
  type: "delivery" | "payment" | "product" | "seller" | "refund";
  priority: "low" | "medium" | "high";
  message: string;
  status: AdminStatus;
  createdAt: string;
};

export type AdminFeedback = {
  id: string;
  from: string;
  role: "user" | "seller";
  category: "app" | "payment" | "delivery" | "seller" | "used_market";
  rating: number;
  message: string;
  status: AdminStatus;
  createdAt: string;
};

export type AdminSupportMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "user" | "seller" | "admin";
  body: string;
  isAdmin: boolean;
  createdAt: string;
};

export type AdminSupportConversation = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: "user" | "seller" | "admin";
  campus: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  status: AdminStatus;
  messages: AdminSupportMessage[];
};

export type AdminActivityLog = {
  id: string;
  admin: string;
  action: string;
  target: string;
  time: string;
};

export type AdminOverview = {
  totalUsers: number;
  totalSellers: number;
  pendingSellerVerifications: number;
  activeProducts: number;
  pendingProducts: number;
  pendingUsedItems: number;
  totalOrders: number;
  pendingDeliveries: number;
  totalRevenue: string;
  pendingPayouts: string;
  openDisputes: number;
  unreadFeedback: number;
  unreadSupport: number;
};

export type AdminDataset = {
  overview: AdminOverview;
  users: AdminUser[];
  sellers: AdminSeller[];
  products: AdminProduct[];
  usedItems: AdminUsedItem[];
  orders: AdminOrder[];
  payments: AdminPayment[];
  deliveries: AdminDelivery[];
  disputes: AdminDispute[];
  supportConversations: AdminSupportConversation[];
  feedback: AdminFeedback[];
  activityLogs: AdminActivityLog[];
};

export const emptyAdminDataset: AdminDataset = {
  overview: {
    totalUsers: 0,
    totalSellers: 0,
    pendingSellerVerifications: 0,
    activeProducts: 0,
    pendingProducts: 0,
    pendingUsedItems: 0,
    totalOrders: 0,
    pendingDeliveries: 0,
    totalRevenue: "₦0",
    pendingPayouts: "0 pending",
    openDisputes: 0,
    unreadFeedback: 0,
    unreadSupport: 0,
  },
  users: [],
  sellers: [],
  products: [],
  usedItems: [],
  orders: [],
  payments: [],
  deliveries: [],
  disputes: [],
  supportConversations: [],
  feedback: [],
  activityLogs: [],
};
