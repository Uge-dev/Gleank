export type UserRole = "buyer" | "seller" | "rider" | "admin";

export type ModerationStatus =
  | "draft"
  | "auto_approved"
  | "approved"
  | "pending_review"
  | "flagged"
  | "rejected"
  | "hidden";

export type AvailabilityStatus =
  | "available_now"
  | "confirm_before_payment"
  | "out_of_stock"
  | "price_updated"
  | "substitute_available";

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
  sellerType?: "used_market" | "campus" | "local_market";
  operatingHours?: string;
  whatsappPhone?: string;
  allowRiderWhatsAppContact?: boolean;
  locationArea?: string;
  pickupLocation?: string;
  nearestLandmark?: string;
  marketId?: string | null;
  marketName?: string;
  shopStallNumber?: string;
  shopSection?: string;
  marketSection?: string;
  shopNumber?: string;
  shopId?: string;
  governmentTaxId?: string;
  marketAssociationId?: string;
  internalGleencShopCode?: string;
  pickupInstruction?: string;
  country?: string;
  state?: string;
  city?: string;
  nearestCampus?: string;
  nearestMarketplace?: string;
  street?: string;
  pickupPlaceId?: string;
  locationVerifiedAt?: string | null;
  kycProvider?: string;
  kycStatus?: string;
  kycLevel?: number;
  kycVerifiedAt?: string | null;
  phoneVerificationStatus?: string;
  payoutAccountStatus?: string;
  profileCompletionPercent?: number;
  pickupLat?: number | null;
  pickupLng?: number | null;
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
  availableSizes?: string[];
  status: "draft" | "active" | "out_of_stock";
  moderationStatus?: ModerationStatus;
  moderationNote?: string;
  moderationReasons?: Array<{ code?: string; message?: string; score?: number; action?: string }>;
  riskScore?: number;
  riskLevel?: "low" | "medium" | "high" | "critical" | string;
  priceValidationStatus?: string;
  priceValidationNote?: string;
  ocrReviewStatus?: string;
  requiresAdminReview?: boolean;
  lastValidatedAt?: string | null;
  availabilityStatus?: AvailabilityStatus;
  deliveryReadiness?: {
    type: "immediate" | "hours" | "days" | "scheduled_date" | string;
    value: string;
    readyAfterMinutes: number;
    readyAt: string | null;
    label: string;
  };
  sellerConfirmationRequired?: boolean;
  returnPolicy?: "standard" | "limited" | "final_sale";
  packageProfile?: {
    packageSize: "small" | "medium" | "large" | "extra_large" | string;
    packageWeightClass: "very_light" | "light" | "medium" | "heavy" | "very_heavy" | string;
    fragilityLevel: "not_fragile" | "fragile" | "very_fragile" | string;
    handlingInstructions: string[];
    packageShape: string;
    stackability: string;
    batchingEligibility: string;
    requiredVehicleType: string;
    specialDeliveryFlags: string[];
    estimatedPackageUnits: number;
    requiresSeparateDelivery: boolean;
    autoSuggested: boolean;
    sellerEdited: boolean;
    adminVerified: boolean;
    riskFlag: string;
  };
  stockStatus?: "in_stock" | "low_stock" | "confirm_before_payment" | "out_of_stock" | "temporarily_unavailable" | string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
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
  serviceType?: string;
  location?: string;
  description: string;
  sellerPriceKobo?: number;
  sellerPrice?: number;
  platformFeeKobo?: number;
  platformFee?: number;
  buyerPriceKobo?: number;
  buyerPrice?: number;
  priceKobo: number;
  price: number;
  minPriceKobo?: number;
  minPrice?: number;
  maxPriceKobo?: number;
  maxPrice?: number;
  durationMinutes: number;
  status: "draft" | "active" | "paused";
  moderationStatus?: ModerationStatus;
  moderationNote?: string;
  moderationReasons?: Array<{ code?: string; message?: string; score?: number; action?: string }>;
  riskScore?: number;
  riskLevel?: "low" | "medium" | "high" | "critical" | string;
  availabilityStatus?: AvailabilityStatus;
  sellerConfirmationRequired?: boolean;
  returnPolicy?: "standard" | "limited" | "final_sale";
  reviewedAt?: string | null;
  reviewedBy?: string | null;
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
  storeCampus?: string;
  interaction: ProductInteraction;
  metrics?: {
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    views: number;
    storeFollowers?: number;
    successfulDeliveries?: number;
    positiveReviews?: number;
  };
};

export type SearchService = SellerService & {
  storeName: string;
  storeSlug: string;
  storeCampus?: string;
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
  parentCommentId: string | null;
  replyToName: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;
  canDelete: boolean;
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
  areaLocation?: string;
  pickupPreference?: string;
  sellerType?: "used_market";
  verificationLevel?: number;
  department: string;
  level: string;
  studentId: string;
  identityProofUrl: string | null;
  faceVerified: boolean;
  faceProvider: string;
  faceReference: string;
  faceVerifiedAt: string | null;
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
  faceVerified?: boolean;
  faceProvider?: string;
  faceVerifiedAt?: string | null;
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
  areaLocation?: string;
  pickupLocation: string;
  deliveryOption: "Pickup" | "Delivery" | "Pickup & Delivery";
  quantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  returnDays?: number;
  availableSizes?: string[];
  sellerRole?: "buyer" | "seller" | "rider" | "admin" | string;
  sellerStoreSlug?: string;
  sellerStoreName?: string;
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
  categoryMetadata?: Record<string, string>;
  riskLevel?: string;
  reviewRequired?: boolean;
  sellerVerificationLevel?: number;
  sellerTrust?: UsedSellerTrust;
  interaction?: ProductInteraction;
  comments?: ProductComment[];
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
export type PaymentMethod = "pay_now" | "pay_on_delivery";

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

export type GleencOrder = {
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
  paymentMethod?: PaymentMethod;
  stage4Status?: string;
  stage4PaymentStatus?: string;
  fulfillmentStatus?: string;
  deliveryStatus?: string;
  dispatchStatus?: string;
  sellerConfirmationStatus?: string;
  sellerReadyStatus?: string;
  sellerReadyAt?: string | null;
  buyerDeliveryWindowStart?: string | null;
  buyerDeliveryWindowEnd?: string | null;
  pickupVerifiedAt?: string | null;
  deliveryVerifiedAt?: string | null;
  deliveredAt?: string | null;
  sellerConfirmationRequired?: boolean;
  sellerConfirmedAt?: string | null;
  sellerRejectedAt?: string | null;
  sellerRejectionNote?: string;
  returnWindowEndsAt?: string | null;
  buyerConfirmedAt?: string | null;
  payoutStatus?: string;
  assignedRiderId?: string | null;
  riderAssignmentId?: string | null;
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
  pickupPointId?: string;
  pickupPointAddress?: string;
  pickupPointArea?: string;
  pickupPointLat?: number | null;
  pickupPointLng?: number | null;
  note: string;
  review?: {
    id: string;
    rating: number;
    body: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
  verificationCode: string;
  sellerPickupCode?: string;
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
  paymentMethod?: PaymentMethod;
  stage4Status?: string;
  stage4PaymentStatus?: string;
  fulfillmentStatus?: string;
  fulfillmentMethod?: "undecided" | "gleenc_rider" | "external_delivery" | string;
  quantity?: number;
  returnDays?: number;
  reservationExpiresAt?: string | null;
  sellerDeliveryConfirmedAt?: string | null;
  sellerConfirmationRequired?: boolean;
  returnWindowEndsAt?: string | null;
  buyerConfirmedAt?: string | null;
  payoutStatus?: string;
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
  sellerPickupCode?: string;
  createdAt: string;
  updatedAt: string;
  events: UsedMarketOrderEvent[];
};

export type GleencConversation = {
  id: string;
  isDraft?: boolean;
  contextType: "used_listing" | "used_order" | "store" | "support";
  contextId: string;
  listingId: string | null;
  orderId: string | null;
  buyerId: string;
  sellerId: string;
  buyerName: string;
  sellerName: string;
  otherUserId: string;
  otherUserName: string;
  otherUserRole: UserRole;
  otherUserAvatarUrl: string | null;
  listingName: string;
  listingImageUrl: string | null;
  storeName: string;
  storeSlug: string;
  storeLogoUrl: string | null;
  storeCampus: string;
  storeCategory: string;
  unreadCount: number;
  lastMessageBody: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GleencMessageContext = {
  type: "product" | "used_listing";
  id: string;
  name: string;
  imageUrl: string | null;
  priceKobo: number;
  href: string;
};

export type GleencMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  senderAvatarUrl: string | null;
  body: string;
  attachmentUrl: string | null;
  context: GleencMessageContext | null;
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
  country?: string;
  state?: string;
  city?: string;
  nearestCampus?: string;
  nearestMarketplace?: string;
  street?: string;
  pickupPlaceId?: string;
  locationVerifiedAt?: string | null;
  sellerType?: "used_market" | "campus" | "local_market";
  locationArea?: string;
  pickupLocation?: string;
  nearestLandmark?: string;
  marketId?: string | null;
  marketRequest?: Record<string, string>;
  shopStallNumber?: string;
  shopSection?: string;
  whatsappPhone?: string;
  allowRiderWhatsAppContact?: boolean;
  operatingHours?: string;
  studentId: string;
  identityProofUrl: string | null;
  faceVerified: boolean;
  faceProvider: string;
  faceReference: string;
  faceVerifiedAt: string | null;
  businessDescription: string;
  agreementAccepted: boolean;
  status: SellerVerificationStatus;
  note: string;
  currentStep?: number;
  completedSteps?: string[];
  lockedSteps?: string[];
  canSubmit?: boolean;
  missingRequirements?: string[];
  adminReviewStatus?: "not_started" | "pending" | "approved" | "rejected" | "resubmission_requested" | string;
  submittedAt: string | null;
  submittedForReviewAt?: string | null;
  resubmissionRequestedAt?: string | null;
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
  status: "inactive" | "active" | "renewal_due" | "grace_period" | "expired" | "past_due" | "cancelled" | "suspended";
  databaseStatus?: string;
  startsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextRenewalAt: string | null;
  gracePeriodEndsAt?: string | null;
  renewalOpensAt?: string | null;
  lastPaymentAt?: string | null;
  lastPaymentReference?: string;
  isActive: boolean;
  isExpired: boolean;
  isGracePeriod?: boolean;
  canRenew?: boolean;
  canUseSellerTools?: boolean;
  billingCycleDays?: number;
  graceDays?: number;
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
