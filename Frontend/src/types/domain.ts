export type UserRole = "buyer" | "seller" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  campus: string;
  phone: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
};

export type SellerStore = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  campus: string;
  category: string;
  phone: string;
  logoUrl: string | null;
  coverUrl: string | null;
  status: "active" | "paused";
  verified: boolean;
  verificationStatus?: "draft" | "pending_verification" | "verified" | "rejected" | "suspended";
  verificationNote?: string;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductInteraction = {
  likeCount: number;
  commentCount: number;
  saveCount: number;
  shareCount: number;
  viewCount: number;
  liked: boolean;
};

export type SellerProduct = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  sellerPriceKobo?: number;
  sellerPrice?: number;
  platformFeeKobo?: number;
  platformFee?: number;
  buyerPriceKobo?: number;
  buyerPrice?: number;
  priceKobo: number;
  price: number;
  stock: number;
  status: "draft" | "active" | "out_of_stock";
  isFeatured: boolean;
  imageUrls: string[];
  interaction?: ProductInteraction;
  createdAt: string;
  updatedAt: string;
};

export type SellerService = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  sellerPriceKobo?: number;
  sellerPrice?: number;
  platformFeeKobo?: number;
  platformFee?: number;
  buyerPriceKobo?: number;
  buyerPrice?: number;
  priceKobo: number;
  price: number;
  durationMinutes: number;
  status: "draft" | "active" | "paused";
  isFeatured: boolean;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type StoreHighlight = {
  id: string;
  storeId?: string;
  title: string;
  category: string;
  imageUrl: string | null;
  sortOrder?: number;
  count: number;
  createdAt?: string;
  updatedAt?: string;
};

export type SellerWorkspace = {
  store: SellerStore;
  products: SellerProduct[];
  services: SellerService[];
  highlights: StoreHighlight[];
};

export type SearchProduct = SellerProduct & {
  storeName: string;
  storeSlug: string;
  interaction: ProductInteraction;
};

export type SearchService = SellerService & {
  storeName: string;
  storeSlug: string;
};

export type StoreInteraction = {
  followerCount: number;
  likesCount: number;
  isFollowing: boolean;
};

export type SearchStore = SellerStore & {
  interaction: StoreInteraction;
};

export type SearchResults = {
  stores: SearchStore[];
  products: SearchProduct[];
  services: SearchService[];
  usedListings: UsedListing[];
};

export type PublicProduct = SellerProduct & {
  store: SellerStore;
};

export type ProductDetailsResponse = {
  product: PublicProduct;
  relatedProducts: PublicProduct[];
  interaction: ProductInteraction;
  storeInteraction: StoreInteraction;
  comments: ProductComment[];
};

export type PublicStoreWorkspace = SellerWorkspace & {
  interaction: StoreInteraction;
};

export type ProductComment = {
  id: string;
  body: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
};

export type TrustProfileStatus = "pending" | "verified" | "rejected";

export type UsedMarketTrustProfile = {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  campus: string;
  department: string;
  level: string;
  studentId: string;
  identityProofUrl: string | null;
  status: TrustProfileStatus;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UsedMarketPayoutAccount = {
  id: string;
  userId: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  accountLast4: string;
  payoutVerified: boolean;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UsedMarketTrustStatus = {
  trustProfile: UsedMarketTrustProfile | null;
  payoutAccount: UsedMarketPayoutAccount | null;
  canSubmitUsedListing: boolean;
};

export type UsedSellerTrust = {
  profileCompleted: boolean;
  identityProofSubmitted: boolean;
  payoutAccountAdded: boolean;
  payoutVerified: boolean;
  accountName: string;
  bankName: string;
  accountNumberMasked: string;
  reviewStatus: string;
  buyerProtection: boolean;
};

export type UsedListingStatus = "pending" | "active" | "sold" | "rejected";

export type UsedListing = {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  name: string;
  category: string;
  description: string;
  condition:
    | "Like New"
    | "Very Good"
    | "Good"
    | "Fair"
    | "Needs Repair";
  sellerPriceKobo?: number;
  sellerPrice?: number;
  platformFeeKobo?: number;
  platformFee?: number;
  buyerPriceKobo?: number;
  buyerPrice?: number;
  priceKobo: number;
  price: number;
  campus: string;
  pickupLocation: string;
  deliveryOption: "Pickup" | "Delivery" | "Pickup & Delivery";
  imageUrls: string[];
  status: UsedListingStatus;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  serialNumber?: string;
  ownershipProofUrl?: string | null;
  receiptUrl?: string | null;
  reasonForSelling?: string;
  defectsDisclosed?: string;
  confirmationText?: string;
  reviewNote?: string;
  sellerTrust?: UsedSellerTrust;
};

export type SavedItemType =
  | "product"
  | "store"
  | "service"
  | "used_listing";

export type SavedItem =
  | {
      id: string;
      itemType: "product";
      itemId: string;
      savedAt: string;
      item: SearchProduct;
    }
  | {
      id: string;
      itemType: "store";
      itemId: string;
      savedAt: string;
      item: SellerStore;
    }
  | {
      id: string;
      itemType: "service";
      itemId: string;
      savedAt: string;
      item: SearchService;
    }
  | {
      id: string;
      itemType: "used_listing";
      itemId: string;
      savedAt: string;
      item: UsedListing;
    };


export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "seller_confirmed"
  | "processing"
  | "ready_for_delivery"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";

export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export type OrderEvent = {
  id: string;
  orderId: string;
  status: OrderStatus;
  label: string;
  note: string;
  createdAt: string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  unitPriceKobo: number;
  unitPrice: number;
  quantity: number;
  totalKobo: number;
  total: number;
  createdAt: string;
};

export type GleankOrder = {
  id: string;
  orderCode: string;
  buyerId: string;
  sellerId: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  sellerName: string;
  sellerPhone: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: PaymentStatus;
  subtotalKobo: number;
  subtotal: number;
  deliveryFeeKobo: number;
  deliveryFee: number;
  totalKobo: number;
  total: number;
  buyerName: string;
  buyerPhone: string;
  campus: string;
  deliveryOption: "Pickup" | "Delivery";
  deliveryAddress: string;
  pickupLocation: string;
  note: string;
  verificationCode: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  events: OrderEvent[];
};


export type UsedMarketOrderStatus =
  | "pending_payment"
  | "paid"
  | "seller_confirmed"
  | "meetup_or_delivery"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";

export type UsedMarketPaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export type UsedMarketOrderEvent = {
  id: string;
  orderId: string;
  status: UsedMarketOrderStatus;
  label: string;
  note: string;
  createdAt: string;
};

export type UsedMarketOrder = {
  id: string;
  orderCode: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  conversationId: string | null;
  listingName: string;
  listingCategory: string;
  listingCondition: string;
  listingImageUrl: string | null;
  sellerName: string;
  sellerPhone: string;
  buyerName: string;
  buyerPhone: string;
  campus: string;
  status: UsedMarketOrderStatus;
  statusLabel: string;
  paymentStatus: UsedMarketPaymentStatus;
  itemPriceKobo: number;
  itemPrice: number;
  protectionFeeKobo: number;
  protectionFee: number;
  deliveryFeeKobo: number;
  deliveryFee: number;
  totalKobo: number;
  total: number;
  deliveryOption: "Pickup" | "Delivery" | "Pickup & Delivery";
  deliveryAddress: string;
  pickupLocation: string;
  note: string;
  verificationCode: string;
  createdAt: string;
  updatedAt: string;
  events: UsedMarketOrderEvent[];
};

export type GleankConversation = {
  id: string;
  contextType: "used_listing" | "used_order" | "store" | "support";
  contextId: string;
  listingId: string | null;
  orderId: string | null;
  buyerId: string;
  sellerId: string;
  buyerName: string;
  sellerName: string;
  otherUserName: string;
  listingName: string;
  listingImageUrl: string | null;
  lastMessageBody: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GleankMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  attachmentUrl: string | null;
  isRead: boolean;
  createdAt: string;
};


export type SellerVerificationStatus =
  | "draft"
  | "pending_verification"
  | "verified"
  | "rejected"
  | "suspended";

export type SellerVerificationProfile = {
  id: string;
  userId?: string;
  storeId?: string | null;
  fullName: string;
  phone: string;
  campus: string;
  studentId: string;
  identityProofUrl: string | null;
  businessDescription: string;
  agreementAccepted: boolean;
  status: SellerVerificationStatus;
  note: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  isComplete: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type SellerSubscription = {
  id: string;
  userId?: string;
  storeId?: string | null;
  planName: string;
  amountKobo: number;
  amount: number;
  status: "inactive" | "active" | "expired" | "past_due" | "cancelled";
  startsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextRenewalAt: string | null;
  lastPaymentReference?: string;
  isActive: boolean;
  isExpired: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AccountSecuritySession = {
  id: string;
  userAgent: string;
  ipAddress: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string;
};

export type AccountSecurityEvent = {
  eventType: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
};
