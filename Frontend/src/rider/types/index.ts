export type RiderStatus = 'pending' | 'approved' | 'suspended' | 'rejected';
export type Availability = 'online' | 'offline';
export type VerificationLevel = 'basic' | 'identity_verified' | 'trusted' | 'high_value';
export type VerificationStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected';

export type AssignmentStatus =
  | 'assigned'
  | 'accepted'
  | 'arrived_at_pickup'
  | 'package_picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'disputed';

export type PaymentMethod = 'paid_online' | 'pay_on_delivery' | 'cash';
export type PaymentStatus = 'paid' | 'unpaid' | 'paid_cash';
export type EscrowStatus = 'not_required' | 'held' | 'released' | 'disputed' | 'refunded';
export type NotificationType = 'assignment' | 'payment' | 'delivery' | 'cancelled' | 'system' | 'security' | 'verification';
export type RiskLevel = 'low' | 'medium' | 'high';
export type SellerType = 'campus_seller' | 'physical_market_seller' | 'nearby_independent_seller' | 'used_product_seller';
export type OrderChannel = 'campus' | 'physical_market' | 'nearby_market' | 'used_market';
export type ProofType = 'pickup' | 'delivery' | 'failed_delivery' | 'security_report';
export type CashReconciliationStatus = 'not_required' | 'pending' | 'submitted' | 'approved';

export interface RiderDocument {
  id: string;
  label: string;
  status: VerificationStatus;
  required: boolean;
  url?: string;
  note?: string;
  uploadedAt?: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface Guarantor {
  name: string;
  phone: string;
  address: string;
  relationship: string;
  status: VerificationStatus;
}

export interface Rider {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  emailVerified?: boolean;
  vehicleType: string;
  vehiclePlate?: string;
  profilePhoto: string;
  availability: Availability;
  status: RiderStatus;
  deliveryRating: number;
  verificationLevel: VerificationLevel;
  verificationStatus: VerificationStatus;
  maxPackageValue: number;
  activeZone: string;
  profileCompletionPercent?: number;
  completionMissingFields?: string[];
  verificationStages?: Record<string, boolean>;
  capacityLocked?: boolean;
  transportType?: string;
  maxPackageSize?: string;
  maxWeightClass?: string;
  fragileHandlingAbility?: string;
  deliveryBagType?: string;
  currentLocation?: { lat: number; lng: number; accuracyMeters?: number; updatedAt?: string | null } | null;
  documents: RiderDocument[];
  emergencyContact: EmergencyContact;
  guarantor: Guarantor;
  ninLinked: boolean;
}

export interface PrivateAssignment {
  id: string;
  orderId?: string;
  sellerName: string;
  sellerPhone: string;
  sellerWhatsApp: string;
  sellerType: SellerType;
  marketName?: string;
  pickupLocation: string;
  pickupLandmark?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryLocation: string;
  deliveryDetails?: string;
  deliveryLandmark?: string;
  nearestBusStop?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  packageSummary?: string;
  assignedTime: string;
  expectedDeliveryTime: string;
  dispatchTimeoutSeconds?: number;
  dispatchTimeoutMinutes?: number;
  dispatchExpiresAt?: string | null;
  dispatchTimeoutPolicy?: 'campus' | 'local_market' | 'heavy_fragile' | string;
  dispatchRemainingSeconds?: number | null;
  status: AssignmentStatus;
  distanceKm: number;
  category: 'Food' | 'Groceries' | 'Fashion' | 'Electronics' | 'Books' | 'Health' | 'Beauty' | 'Household' | 'Used Items' | 'Others';
  orderChannel: OrderChannel;
  orderValue: number;
  riskLevel: RiskLevel;
  securityNotes: string[];
  requiresPickupOtp: boolean;
  requiresDeliveryOtp: boolean;
  sellerRating: number;
  packageTagCode?: string;
  sellerPickupCodeVerifiedAt?: string | null;
  buyerDeliveryCodeVerifiedAt?: string | null;
}

export interface ProductItem {
  id: string;
  name: string;
  image: string;
  quantity: number;
  price: number;
  condition?: 'new' | 'used' | 'refurbished' | 'fresh' | 'sealed' | 'open_box';
  category?: string;
}

export interface ProofRecord {
  id: string;
  type: ProofType;
  fileName?: string;
  note?: string;
  createdAt: string;
  locationLabel?: string;
}

export interface FullDeliveryOrder {
  id: string;
  assignmentId: string;
  orderNumber: string;
  pickupCode: string;
  sellerPickupCode: string;
  customerDeliveryCode: string;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  sellerName: string;
  sellerPhone: string;
  sellerType: SellerType;
  orderChannel: OrderChannel;
  marketName?: string;
  products: ProductItem[];
  packageTagCode?: string;
  sellerPickupCodeVerifiedAt?: string | null;
  buyerDeliveryCodeVerifiedAt?: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  escrowStatus: EscrowStatus;
  totalAmount: number;
  deliveryFee: number;
  platformFee: number;
  riderEarning: number;
  deliveryAddress: string;
  deliveryNotes: string;
  deliveryDetails?: string;
  deliveryLandmark?: string;
  nearestBusStop?: string;
  status: AssignmentStatus;
  paymentLink?: string;
  paymentReference?: string;
  completedAt?: string;
  cashReconciliationStatus: CashReconciliationStatus;
  pickupProof?: ProofRecord;
  deliveryProof?: ProofRecord;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  securityChecks: string[];
}

export interface DeliveryActivity {
  id: string;
  title: string;
  description: string;
  time: string;
  status: 'success' | 'info' | 'warning';
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  actionLabel?: string;
  actionPath?: string;
}

export interface EarningsSummary {
  today: number;
  weekly: number;
  monthly: number;
  cashCollected: number;
  onlinePaymentsDelivered: number;
  platformFeesHandled: number;
  riderPayoutPending: number;
  completedDeliveriesCount: number;
  chart: Array<{ label: string; amount: number }>;
}

export interface RiderDashboardStats {
  assigned: number;
  pendingOffers: number;
  newAssignments: number;
  active: number;
  completed: number;
  highRiskTasks: number;
  totalEarnings: number;
  payoutPending: number;
}

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

export interface RouteGeometry {
  type: 'LineString' | 'MultiLineString';
  coordinates: number[][] | number[][][];
}

export interface RouteInstruction {
  id: string;
  text: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinate: RouteCoordinate | null;
}

export interface RiderRouteEstimate {
  provider: string;
  source: string;
  mode: string;
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  trafficDurationMinutes: number;
  geometry: RouteGeometry;
  instructions: RouteInstruction[];
  calculatedAt: string;
  cached: boolean;
}

export interface SafetyReportPayload {
  assignmentId?: string;
  orderId?: string;
  type: 'seller_issue' | 'buyer_issue' | 'package_issue' | 'accident' | 'threat' | 'payment_issue' | 'other';
  note: string;
  locationLabel?: string;
}

export interface ApiEnvelope<T> {
  data?: T;
  error?: string;
  message?: string;
}
