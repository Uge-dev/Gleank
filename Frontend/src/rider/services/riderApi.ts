import { apiRequest, buildApiUrl } from './apiClient';
import type {
  DeliveryActivity,
  EarningsSummary,
  FullDeliveryOrder,
  NotificationItem,
  PrivateAssignment,
  ProofRecord,
  Rider,
  RiderDashboardStats,
  RiderRouteEstimate,
  SafetyReportPayload,
} from '../types';

const presenceSessionId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `rider-tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type BackendUser = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  campus?: string;
  avatarUrl?: string | null;
};

type BackendRiderProfile = {
  userId?: string;
  fullName?: string;
  phone?: string;
  whatsappPhone?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  transportType?: string;
  maxPackageSize?: string;
  maxWeightClass?: string;
  fragileHandlingAbility?: string;
  deliveryBagType?: string;
  capacityLocked?: boolean;
  profileCompletionPercent?: number;
  completionMissingFields?: string[];
  verificationStages?: Record<string, boolean>;
  coverageArea?: string;
  homeAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  ninLast4?: string;
  verificationStatus?: string;
  verificationLevel?: number;
  maxPackageValue?: number;
  availability?: string;
  safetyStatus?: string;
  ratingAverage?: number;
  completedDeliveries?: number;
  identityDocumentUrl?: string | null;
  selfieUrl?: string | null;
  currentLocation?: { lat: number; lng: number; accuracyMeters?: number; updatedAt?: string | null } | null;
};

type BackendRiderAuthResponse = {
  user?: BackendUser;
  riderProfile?: BackendRiderProfile | null;
  profile?: BackendRiderProfile | null;
};

type BackendPoint = {
  address?: string;
  lat?: number | null;
  lng?: number | null;
};

type BackendAssignment = {
  id?: string;
  orderId?: string;
  orderType?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  pickupPoint?: BackendPoint;
  deliveryPoint?: BackendPoint;
  pickupLocation?: string;
  deliveryLocation?: string;
  deliveryDetails?: string;
  deliveryLandmark?: string;
  nearestBusStop?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerWhatsApp?: string;
  buyerName?: string;
  buyerPhone?: string;
  marketName?: string;
  packageSummary?: string;
  riskLevel?: string;
  packageTagCode?: string;
  sellerPickupCodeVerifiedAt?: string | null;
  buyerDeliveryCodeVerifiedAt?: string | null;
  packageValue?: number;
  deliveryFee?: number;
  riderEarning?: number;
  riderEarningKobo?: number;
  dispatchTimeoutSeconds?: number;
  dispatchTimeoutMinutes?: number;
  dispatchExpiresAt?: string | null;
  dispatchTimeoutPolicy?: string;
  dispatchRemainingSeconds?: number | null;
  pickupProof?: { url?: string | null; note?: string; createdAt?: string; lat?: number | null; lng?: number | null } | null;
  deliveryProof?: { url?: string | null; note?: string; createdAt?: string; lat?: number | null; lng?: number | null } | null;
  createdAt?: string;
  acceptedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  updatedAt?: string;
};

type BackendNotification = {
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  message?: string;
  createdAt?: string;
  created_at?: string;
  read?: boolean;
  unread?: boolean;
  actionLabel?: string;
  actionPath?: string;
};

type BackendDashboardResponse = BackendRiderAuthResponse & {
  assignments?: BackendAssignment[];
  completed?: BackendAssignment[];
  notifications?: BackendNotification[] | {
    notifications?: BackendNotification[];
    unreadCount?: number;
  };
  unreadNotificationCount?: number;
  stats?: Partial<RiderDashboardStats>;
  earnings?: Partial<EarningsSummary>;
  activities?: DeliveryActivity[];
};

export type RiderDispatchOffer = {
  id: string;
  deliveryBatchId: string;
  riderId: string;
  dispatchScore: number;
  status: string;
  offeredAt?: string;
  expiresAt?: string | null;
  attemptNumber: number;
  remainingSeconds?: number | null;
  batch?: {
    id: string;
    parentOrderId?: string | null;
    batchType?: string;
    sourceZoneId?: string | null;
    destinationZoneId?: string | null;
    status?: string;
    dispatchStatus?: string;
    pickupCount?: number;
    packageSizeSummary?: string;
    weightClassSummary?: string;
    fragilitySummary?: string;
    requiredVehicleType?: string;
    riskLevel?: string;
    requiresGps?: boolean;
    deliveryFee?: number;
    packageValue?: number;
    pickupTasks?: Array<{
      id: string;
      sellerName?: string;
      sellerPhone?: string;
      pickupLocation?: string;
      pickupPoint?: BackendPoint;
      distanceToPickupKm?: number | null;
      pickupSequence?: number;
      status?: string;
      firstProduct?: {
        name?: string;
        imageUrl?: string;
        quantity?: number;
      } | null;
      packageSize?: string;
      packageWeightClass?: string;
      handlingClass?: string;
    }>;
  };
};

function mapVerificationStatus(status?: string): Rider['verificationStatus'] {
  if (status === 'verified') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_review') return 'pending_review';
  return 'not_submitted';
}

function mapRiderStatus(status?: string): Rider['status'] {
  if (status === 'verified') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'suspended') return 'suspended';
  return 'pending';
}

function mapVerificationLevel(level?: number): Rider['verificationLevel'] {
  if (Number(level || 1) >= 4) return 'high_value';
  if (Number(level || 1) >= 3) return 'trusted';
  if (Number(level || 1) >= 2) return 'identity_verified';
  return 'basic';
}

function mapAssignmentStatus(status?: string): PrivateAssignment['status'] {
  if (status === 'arrived_pickup') return 'arrived_at_pickup';
  if (status === 'picked_up') return 'package_picked_up';
  if (status === 'cancelled') return 'failed';
  if (
    status === 'assigned' ||
    status === 'accepted' ||
    status === 'out_for_delivery' ||
    status === 'delivered' ||
    status === 'failed' ||
    status === 'disputed'
  ) {
    return status;
  }
  return 'assigned';
}

function mapOrderChannel(row: BackendAssignment): PrivateAssignment['orderChannel'] {
  if (row.orderType === 'used_order') return 'used_market';
  if (row.marketName) return 'physical_market';
  return 'campus';
}

function mapSellerType(row: BackendAssignment): PrivateAssignment['sellerType'] {
  if (row.orderType === 'used_order') return 'used_product_seller';
  if (row.marketName) return 'physical_market_seller';
  return 'campus_seller';
}

function mapCategory(row: BackendAssignment): PrivateAssignment['category'] {
  const summary = String(row.packageSummary || '').toLowerCase();
  if (row.orderType === 'used_order') return 'Used Items';
  if (summary.includes('food')) return 'Food';
  if (summary.includes('book')) return 'Books';
  if (summary.includes('phone') || summary.includes('electronic') || summary.includes('gadget')) return 'Electronics';
  if (summary.includes('fashion') || summary.includes('cloth') || summary.includes('shoe')) return 'Fashion';
  return 'Others';
}

function mapRiskLevel(value?: string): PrivateAssignment['riskLevel'] {
  if (value === 'high' || value === 'medium') return value;
  return 'low';
}

function normalizeAssignment(row: BackendAssignment): PrivateAssignment {
  const orderValue = 0;
  const pickupLocation = row.pickupLocation || row.pickupPoint?.address || 'Pickup location unavailable';
  const deliveryLocation = row.deliveryLocation || row.deliveryPoint?.address || 'Delivery location locked until pickup';

  return {
    id: row.id || '',
    orderId: row.orderId || '',
    sellerName: row.sellerName || 'Seller',
    sellerPhone: row.sellerPhone || '',
    sellerWhatsApp: row.sellerWhatsApp || row.sellerPhone || '',
    sellerType: mapSellerType(row),
    marketName: row.marketName || undefined,
    pickupLocation,
    pickupLandmark: '',
    pickupLat: row.pickupPoint?.lat ?? null,
    pickupLng: row.pickupPoint?.lng ?? null,
    deliveryLocation,
    deliveryDetails: row.deliveryDetails || '',
    deliveryLandmark: row.deliveryLandmark || '',
    nearestBusStop: row.nearestBusStop || '',
    deliveryLat: row.deliveryPoint?.lat ?? null,
    deliveryLng: row.deliveryPoint?.lng ?? null,
    packageSummary: row.packageSummary || 'Gleenc delivery package',
    assignedTime: row.createdAt || row.acceptedAt || row.updatedAt || new Date().toISOString(),
    expectedDeliveryTime: row.updatedAt || row.createdAt || new Date().toISOString(),
    dispatchTimeoutSeconds: row.dispatchTimeoutSeconds,
    dispatchTimeoutMinutes: row.dispatchTimeoutMinutes,
    dispatchExpiresAt: row.dispatchExpiresAt || null,
    dispatchTimeoutPolicy: row.dispatchTimeoutPolicy,
    dispatchRemainingSeconds: row.dispatchRemainingSeconds ?? null,
    status: mapAssignmentStatus(row.status),
    distanceKm: 0,
    category: mapCategory(row),
    orderChannel: mapOrderChannel(row),
    orderValue,
    riskLevel: mapRiskLevel(row.riskLevel),
    securityNotes: [
      'Buyer details and delivery OTP stay hidden from riders until the buyer provides the OTP in person.',
      'Verify seller pickup OTP and capture proof before leaving pickup point.',
    ],
    requiresPickupOtp: true,
    requiresDeliveryOtp: true,
    sellerRating: 0,
    packageTagCode: row.packageTagCode || '',
    sellerPickupCodeVerifiedAt: row.sellerPickupCodeVerifiedAt || null,
    buyerDeliveryCodeVerifiedAt: row.buyerDeliveryCodeVerifiedAt || null,
  };
}

function normalizeProofRecord(row: BackendAssignment, type: 'pickup' | 'delivery') {
  const proof = type === 'pickup' ? row.pickupProof : row.deliveryProof;
  if (!proof) return undefined;
  return {
    id: `${type}-${row.id || row.orderId || 'proof'}`,
    type,
    fileName: proof.url || undefined,
    note: proof.note || undefined,
    createdAt: proof.createdAt || row.updatedAt || new Date().toISOString(),
    locationLabel: proof.lat != null && proof.lng != null ? `${proof.lat}, ${proof.lng}` : undefined,
  };
}

function normalizeOrder(row: BackendAssignment): FullDeliveryOrder {
  const packageValue = 0;
  const riderEarning = Number(row.riderEarning || 0);
  const deliveryFee = Number(row.deliveryFee || riderEarning || 0);
  const status = mapAssignmentStatus(row.status);
  const paymentStatus = (row.paymentStatus as FullDeliveryOrder['paymentStatus']) || 'unpaid';
  const paymentMethod = row.paymentMethod === 'pay_on_delivery' || paymentStatus === 'unpaid' ? 'pay_on_delivery' : 'paid_online';

  return {
    id: row.orderId || row.id || '',
    assignmentId: row.id || '',
    orderNumber: row.orderId || '',
    pickupCode: '',
    sellerPickupCode: '',
    customerDeliveryCode: '',
    orderDate: row.createdAt || row.acceptedAt || row.updatedAt || new Date().toISOString(),
    customerName: row.buyerName || 'Buyer',
    customerPhone: row.buyerPhone || '',
    sellerName: row.sellerName || 'Seller',
    sellerPhone: row.sellerPhone || '',
    sellerType: mapSellerType(row),
    orderChannel: mapOrderChannel(row),
    marketName: row.marketName || undefined,
    products: [{
      id: row.orderId || row.id || 'delivery-package',
      name: row.packageSummary || 'Gleenc delivery package',
      image: '',
      quantity: 1,
      price: packageValue,
      category: mapCategory(row),
    }],
    paymentMethod,
    paymentStatus,
    escrowStatus: paymentStatus === 'paid' ? 'held' : 'not_required',
    totalAmount: packageValue + deliveryFee,
    deliveryFee,
    platformFee: 0,
    riderEarning,
    deliveryAddress:
      row.deliveryLocation ||
      row.deliveryPoint?.address ||
      'Delivery address unavailable',
    deliveryNotes: row.packageSummary || '',
    deliveryDetails: row.deliveryDetails || '',
    deliveryLandmark: row.deliveryLandmark || '',
    nearestBusStop: row.nearestBusStop || '',
    packageTagCode: row.packageTagCode || '',
    sellerPickupCodeVerifiedAt: row.sellerPickupCodeVerifiedAt || null,
    buyerDeliveryCodeVerifiedAt: row.buyerDeliveryCodeVerifiedAt || null,
    status,
    completedAt: row.deliveredAt || undefined,
    cashReconciliationStatus: 'not_required',
    pickupProof: normalizeProofRecord(row, 'pickup'),
    deliveryProof: normalizeProofRecord(row, 'delivery'),
    pickupLat: row.pickupPoint?.lat ?? null,
    pickupLng: row.pickupPoint?.lng ?? null,
    deliveryLat: row.deliveryPoint?.lat ?? null,
    deliveryLng: row.deliveryPoint?.lng ?? null,
    securityChecks: [
      'Seller pickup OTP verified before private details unlock.',
      'Buyer delivery OTP is never displayed to riders.',
      'Proof photo is required before delivery can be completed.',
    ],
  };
}

function normalizeNotificationType(item: BackendNotification): NotificationItem['type'] {
  const text = `${item.type || ''} ${item.title || ''} ${item.message || item.body || ''}`.toLowerCase();
  if (/assign|dispatch|rider offer|delivery offer/.test(text)) return 'assignment';
  if (/payment|payout|earning/.test(text)) return 'payment';
  if (/cancel|reject|failed|unavailable/.test(text)) return 'cancelled';
  if (/security|safety|threat|dispute/.test(text)) return 'security';
  if (/verif|document|identity/.test(text)) return 'verification';
  if (/deliver|pickup|package/.test(text)) return 'delivery';
  return 'system';
}

function normalizeNotification(item: BackendNotification): NotificationItem {
  const read = typeof item.read === 'boolean'
    ? item.read
    : typeof item.unread === 'boolean'
      ? !item.unread
      : false;

  return {
    id: item.id || '',
    type: normalizeNotificationType(item),
    title: item.title || 'Rider update',
    message: item.message || item.body || '',
    createdAt: item.createdAt || item.created_at || new Date().toISOString(),
    read,
    actionLabel: item.actionLabel || 'Open',
    actionPath: item.actionPath || '/rider/notifications',
  };
}

function emptyStats(): RiderDashboardStats {
  return {
    assigned: 0,
    pendingOffers: 0,
    newAssignments: 0,
    active: 0,
    completed: 0,
    highRiskTasks: 0,
    totalEarnings: 0,
    payoutPending: 0,
  };
}

function emptyEarnings(): EarningsSummary {
  return {
    today: 0,
    weekly: 0,
    monthly: 0,
    cashCollected: 0,
    onlinePaymentsDelivered: 0,
    platformFeesHandled: 0,
    riderPayoutPending: 0,
    completedDeliveriesCount: 0,
    chart: [],
  };
}

function normalizeDashboard(response: BackendDashboardResponse): RiderDashboardPayload {
  const authShape = normalizeRider(response);
  const rows = response.assignments || [];
  const completed = response.completed || [];
  const notificationRows = Array.isArray(response.notifications)
    ? response.notifications
    : response.notifications?.notifications || [];
  const derivedAssigned = rows.filter((row) => row.status === 'assigned').length;
  const derivedActive = rows.filter((row) => ['accepted', 'arrived_pickup', 'picked_up', 'out_for_delivery'].includes(String(row.status || ''))).length;
  const stats = {
    ...emptyStats(),
    assigned: derivedAssigned,
    newAssignments: derivedAssigned,
    active: derivedActive,
    completed: completed.length,
    highRiskTasks: rows.filter((row) => row.riskLevel === 'high').length,
    ...response.stats,
  };

  return {
    rider: authShape.rider,
    stats,
    earnings: {
      ...emptyEarnings(),
      ...response.earnings,
      chart: Array.isArray(response.earnings?.chart) ? response.earnings.chart : [],
    },
    activities: Array.isArray(response.activities) ? response.activities : [],
    assignments: rows.map(normalizeAssignment),
    orders: rows
      .filter((row) => ['picked_up', 'out_for_delivery'].includes(String(row.status || '')))
      .map(normalizeOrder),
    completed: completed.map(normalizeOrder),
    notifications: notificationRows.map(normalizeNotification),
  };
}

function normalizeRider(response: BackendRiderAuthResponse): { rider: Rider } {
  const user = response.user || {};
  const profile = response.riderProfile || response.profile || {};
  const identityDocumentUrl = profile.identityDocumentUrl || null;
  const selfieUrl = profile.selfieUrl || null;
  const documentStatus = identityDocumentUrl && selfieUrl
    ? mapVerificationStatus(profile.verificationStatus)
    : 'not_submitted';

  return {
    rider: {
      id: profile.userId || user.id || '',
      fullName: profile.fullName || user.name || 'Gleenc Rider',
      phone: profile.phone || user.phone || '',
      email: user.email || '',
      emailVerified: Boolean((user as { emailVerified?: boolean }).emailVerified),
      vehicleType: profile.vehicleType || 'Motorcycle',
      vehiclePlate: profile.vehiclePlate || '',
      profilePhoto: user.avatarUrl || selfieUrl || '',
      availability: (profile.availability as Rider['availability']) || 'offline',
      status: mapRiderStatus(profile.verificationStatus),
      deliveryRating: Number(profile.ratingAverage || 0),
      verificationLevel: mapVerificationLevel(profile.verificationLevel),
      verificationStatus: mapVerificationStatus(profile.verificationStatus),
      maxPackageValue: Number(profile.maxPackageValue || 0),
      activeZone: profile.coverageArea || user.campus || 'Gleenc coverage',
      currentLocation: profile.currentLocation || null,
      profileCompletionPercent: Number(profile.profileCompletionPercent || 0),
      completionMissingFields: Array.isArray(profile.completionMissingFields) ? profile.completionMissingFields.map(String) : [],
      verificationStages: profile.verificationStages && typeof profile.verificationStages === 'object' ? profile.verificationStages as Record<string, boolean> : {},
      capacityLocked: Boolean(profile.capacityLocked),
      documents: [
        {
          id: 'identity-document',
          label: 'Government ID',
          status: identityDocumentUrl ? documentStatus : 'not_submitted',
          required: true,
          url: identityDocumentUrl || undefined,
          note: 'Admin reviews this before approving rider access.',
        },
        {
          id: 'profile-selfie',
          label: 'Profile/selfie image',
          status: selfieUrl ? documentStatus : 'not_submitted',
          required: true,
          url: selfieUrl || undefined,
          note: 'Used by admin to match the rider account to a real person.',
        },
        {
          id: 'phone-verification',
          label: 'Phone verification',
          status: 'pending_review',
          required: true,
          note: 'Connect an SMS provider to complete phone OTP verification.',
        },
      ],
      emergencyContact: {
        name: profile.emergencyContactName || '',
        phone: profile.emergencyContactPhone || '',
        relationship: 'Emergency contact',
      },
      guarantor: {
        name: profile.guarantorName || '',
        phone: profile.guarantorPhone || '',
        address: '',
        relationship: 'Guarantor',
        status: mapVerificationStatus(profile.verificationStatus),
      },
      ninLinked: Boolean(profile.ninLast4),
    },
  };
}

export interface RiderDashboardPayload {
  rider: Rider;
  stats: RiderDashboardStats;
  earnings: EarningsSummary;
  activities: DeliveryActivity[];
  assignments: PrivateAssignment[];
  orders: FullDeliveryOrder[];
  completed: FullDeliveryOrder[];
  notifications: NotificationItem[];
}

export type VerificationRequirement = {
  id: string;
  code: string;
  title: string;
  description: string;
  workflowType: 'form' | 'document' | 'provider' | 'system';
  status: string;
  requiredLevel: number;
  blocking: boolean;
  adminFeedback?: string;
  isLocked: boolean;
  previousStageApproved: boolean;
  canSubmit: boolean;
  canRequestResubmission: boolean;
  resubmissionRequest?: {
    id: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
    adminFeedback?: string;
    reviewedAt?: string | null;
    createdAt: string;
  } | null;
  latestSubmission?: {
    id: string;
    version: number;
    documentUrls: string[];
    submittedAt: string;
    status: string;
  } | null;
  submissions?: Array<{
    id: string;
    version: number;
    documentUrls: string[];
    submittedAt: string;
    status: string;
  }>;
  reviews?: Array<{
    id: string;
    action: string;
    feedback: string;
    newStatus: string;
    createdAt: string;
  }>;
};

export type VerificationCase = {
  id: string;
  role: 'seller' | 'rider';
  currentVerifiedLevel: number;
  requestedLevel: number;
  overallStatus: string;
  operationalStatus: string;
  operationalReason?: string;
  completionPercent: number;
  stageReadiness: Array<{
    stage: 1 | 2 | 3;
    title: string;
    started: boolean;
    approved: boolean;
    submissionComplete: boolean;
    previousStageApproved: boolean;
    approvalReady: boolean;
    missingRequirementCodes: string[];
  }>;
  requirements: VerificationRequirement[];
  eligibility?: {
    eligible: boolean;
    blockingReasons: Array<{ code: string; message: string }>;
    checks: Record<string, boolean>;
  } | null;
};

export type VerificationCenterResponse = {
  case: VerificationCase;
  thirdParty?: {
    dojahConfigured?: boolean;
    liveFaceStatus?: string;
  };
};

type ProofLocation = {
  lat: number;
  lng: number;
  accuracyMeters?: number;
};

export interface PickupVerificationPayload {
  sellerPickupCode: string;
  proofFile?: File | null;
  proofFileName?: string;
  proofNote?: string;
  locationLabel?: string;
  proofLocation: ProofLocation;
}

export interface DeliveryCompletionPayload {
  customerDeliveryCode: string;
  proofFile?: File | null;
  proofFileName?: string;
  proofNote?: string;
  locationLabel?: string;
  proofLocation: ProofLocation;
}

type RiderSignupPayload = Partial<Rider> & {
  password: string;
  identityDocument?: File | null;
  selfie?: File | null;
};

function buildProofBody(payload: PickupVerificationPayload | DeliveryCompletionPayload, codeField: 'sellerPickupCode' | 'customerDeliveryCode') {
  const codeValue = codeField === 'sellerPickupCode'
    ? (payload as PickupVerificationPayload).sellerPickupCode
    : (payload as DeliveryCompletionPayload).customerDeliveryCode;
  const proofFileName = payload.proofFileName || payload.proofFile?.name || '';

  if (payload.proofFile) {
    const formData = new FormData();
    formData.append(codeField, codeValue);
    formData.append('proofPhoto', payload.proofFile);
    formData.append('proofFileName', proofFileName);
    formData.append('proofNote', payload.proofNote || '');
    formData.append('locationLabel', payload.locationLabel || '');
    formData.append('proofLocation', JSON.stringify(payload.proofLocation));
    return formData;
  }

  return JSON.stringify({
    [codeField]: codeValue,
    proofFileName,
    proofNote: payload.proofNote || '',
    locationLabel: payload.locationLabel || '',
    proofLocation: payload.proofLocation,
  });
}

export const riderApi = {
  session() {
    return apiRequest<BackendRiderAuthResponse>('/api/rider/session').then(normalizeRider);
  },
  login(email: string, password: string) {
    return apiRequest<BackendRiderAuthResponse>('/api/rider/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      timeoutMs: 45000,
    }).then(normalizeRider);
  },
  signup(payload: RiderSignupPayload) {
    const formData = new FormData();
    formData.append('name', payload.fullName || '');
    formData.append('email', payload.email || '');
    formData.append('password', payload.password);
    formData.append('phone', payload.phone || '');
  formData.append('vehicleType', payload.vehicleType || '');
  formData.append('vehiclePlate', payload.vehiclePlate || '');
  formData.append('coverageArea', payload.activeZone || '');
  formData.append('transportType', payload.transportType || payload.vehicleType || 'motorcycle');
  formData.append('maxPackageSize', payload.maxPackageSize || 'small_medium');
  formData.append('maxWeightClass', payload.maxWeightClass || 'up_to_medium');
  formData.append('fragileHandlingAbility', payload.fragileHandlingAbility || 'can_handle_fragile');
  formData.append('deliveryBagType', payload.deliveryBagType || 'medium_delivery_bag');

    if (payload.identityDocument) {
      formData.append('identityDocument', payload.identityDocument);
    }

    if (payload.selfie) {
      formData.append('selfie', payload.selfie);
    }

    return apiRequest<BackendRiderAuthResponse>('/api/rider/register', {
      method: 'POST',
      body: formData,
      timeoutMs: 90000,
    }).then(normalizeRider);
  },
  uploadVerificationDocuments(identityDocument: File, selfie: File) {
    const formData = new FormData();
    formData.append('identityDocument', identityDocument);
    formData.append('selfie', selfie);

    return apiRequest<BackendRiderAuthResponse>('/api/rider/verification-documents', {
      method: 'POST',
      body: formData,
      timeoutMs: 90000,
    }).then(normalizeRider);
  },
  logout() {
    return apiRequest<{ ok: boolean }>('/api/rider/logout', { method: 'POST' });
  },
  presenceHeartbeat(
    currentLocation?: { lat: number; lng: number; accuracyMeters?: number },
  ) {
    return apiRequest<BackendRiderAuthResponse>('/api/rider/presence/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ currentLocation, presenceSessionId }),
    }).then(normalizeRider);
  },
  dashboard() {
    return apiRequest<BackendDashboardResponse>('/api/rider/dashboard').then(normalizeDashboard);
  },
  activeDispatches() {
    return apiRequest<{ dispatches: RiderDispatchOffer[] }>('/api/rider/dispatches/active');
  },
  subscribeToNotifications(handlers: {
    onNotification?: (notification: NotificationItem) => void;
    onError?: () => void;
  }) {
    if (typeof window === 'undefined' || !('EventSource' in window)) {
      return () => undefined;
    }

    const stream = new EventSource(buildApiUrl('/api/notifications/stream?portal=rider'), {
      withCredentials: true,
    });
    stream.addEventListener('notification', (event) => {
      try {
        handlers.onNotification?.(
          normalizeNotification(JSON.parse(event.data) as BackendNotification),
        );
      } catch {
        // Polling remains the fallback if a realtime event is malformed.
      }
    });
    stream.onerror = () => handlers.onError?.();
    return () => stream.close();
  },
  acceptDispatch(dispatchId: string) {
    return apiRequest<{ batch: unknown; assignments: BackendAssignment[] }>('/api/rider/dispatch/' + dispatchId + '/accept', {
      method: 'POST',
      body: JSON.stringify({ presenceSessionId }),
    })
      .then((response) => ({
        batch: response.batch,
        assignments: (response.assignments || []).map(normalizeAssignment),
      }));
  },
  rejectDispatch(dispatchId: string, reason = '') {
    return apiRequest<{ batch?: unknown; attempt?: unknown; intervention?: unknown }>('/api/rider/dispatch/' + dispatchId + '/reject', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  acceptAssignment(assignmentId: string) {
    return apiRequest<{ assignment: BackendAssignment }>('/api/rider/assignments/' + assignmentId + '/accept', {
      method: 'POST',
      body: JSON.stringify({ presenceSessionId }),
    })
      .then((response) => ({ assignment: normalizeAssignment(response.assignment) }));
  },
  verifyPickup(assignmentId: string, payload: PickupVerificationPayload) {
    return apiRequest<{ assignment: BackendAssignment; order?: FullDeliveryOrder }>('/api/rider/assignments/' + assignmentId + '/pickup', {
      method: 'POST',
      body: buildProofBody(payload, 'sellerPickupCode'),
    }).then((response) => ({
      assignment: normalizeAssignment(response.assignment),
      order: response.order || normalizeOrder(response.assignment),
    }));
  },
  generatePayment(orderId: string) {
    return apiRequest<{ paymentLink: string; reference: string; assignment?: BackendAssignment }>('/api/rider/orders/' + orderId + '/payment-link', { method: 'POST' })
      .then((response) => ({
        paymentLink: response.paymentLink,
        reference: response.reference,
        assignment: response.assignment ? normalizeAssignment(response.assignment) : undefined,
      }));
  },
  confirmCash(orderId: string) {
    return apiRequest<{ order: FullDeliveryOrder }>('/api/rider/orders/' + orderId + '/cash-collected', { method: 'POST' });
  },
  completeDelivery(orderId: string, payload: DeliveryCompletionPayload) {
    return apiRequest<{ assignment: BackendAssignment; order?: FullDeliveryOrder }>('/api/rider/orders/' + orderId + '/complete-delivery', {
      method: 'POST',
      body: buildProofBody(payload, 'customerDeliveryCode'),
    }).then((response) => ({
      assignment: normalizeAssignment(response.assignment),
      order: response.order || normalizeOrder(response.assignment),
    }));
  },
  verifyDeliveryCode(orderId: string, customerDeliveryCode: string) {
    return apiRequest<{ assignment: BackendAssignment }>('/api/rider/orders/' + orderId + '/verify-delivery-code', {
      method: 'POST',
      body: JSON.stringify({ customerDeliveryCode }),
    }).then((response) => ({
      assignment: normalizeAssignment(response.assignment),
      order: normalizeOrder(response.assignment),
    }));
  },
  failDelivery(assignmentId: string, note?: string) {
    return apiRequest<{ assignment: BackendAssignment }>('/api/rider/assignments/' + assignmentId + '/fail', { method: 'POST', body: JSON.stringify({ note }) })
      .then((response) => ({ assignment: normalizeAssignment(response.assignment) }));
  },
  submitProof(orderId: string, proof: ProofRecord) {
    return apiRequest<{ order: FullDeliveryOrder }>('/api/rider/orders/' + orderId + '/proof', { method: 'POST', body: JSON.stringify(proof) });
  },
  reportSafetyIssue(payload: SafetyReportPayload) {
    return apiRequest<{ ok: boolean; reference: string }>('/api/rider/security-reports', { method: 'POST', body: JSON.stringify(payload) });
  },
  markNotificationRead(notificationId: string) {
    return apiRequest<{ notification: NotificationItem }>('/api/rider/notifications/' + notificationId + '/read', { method: 'PATCH' });
  },
  updateLocation(currentLocation: { lat: number; lng: number; accuracyMeters?: number }, assignmentId = '') {
    return apiRequest<{
      online: boolean;
      availability: string;
      availabilityMode: string;
      gpsPermissionStatus: string;
      location: {
        id: string;
        lat: number | null;
        lng: number | null;
        accuracyMeters: number | null;
        address: string;
        area: string;
        zone: string;
        source: string;
        createdAt: string;
      } | null;
      lastLocationAt: string | null;
    }>('/api/rider/location', {
      method: 'POST',
      body: JSON.stringify({ currentLocation, assignmentId }),
    });
  },
  locationStatus() {
    return apiRequest<{
      online: boolean;
      availability: string;
      availabilityMode: string;
      gpsPermissionStatus: string;
      location: unknown;
      lastLocationAt: string | null;
    }>('/api/rider/location/status');
  },
  routeEstimate(
    assignmentId: string,
    currentLocation: { lat: number; lng: number },
    target: 'pickup' | 'delivery',
  ) {
    const query = new URLSearchParams({
      lat: String(currentLocation.lat),
      lng: String(currentLocation.lng),
      target,
    });
    return apiRequest<{
      routeToPickup?: RiderRouteEstimate;
      routeToDelivery?: RiderRouteEstimate;
    }>(
      `/api/rider/assignments/${encodeURIComponent(assignmentId)}/route-estimate?${query.toString()}`,
      { timeoutMs: 25_000 },
    ).then((response) => {
      const route = target === 'delivery'
        ? response.routeToDelivery
        : response.routeToPickup;
      if (!route) {
        throw new Error('The route response was incomplete. Please refresh the route.');
      }
      return route;
    });
  },
  eligibility() {
    return apiRequest<NonNullable<VerificationCase['eligibility']>>('/api/rider/eligibility');
  },
  verificationCenter() {
    return apiRequest<VerificationCenterResponse>('/api/verification/me?role=rider&history=true');
  },
  submitVerificationRequirement(code: string, payload: Record<string, unknown>, files: Record<string, File | null> = {}) {
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    formData.append('actorRole', 'rider');
    Object.entries(files).forEach(([field, file]) => {
      if (file) formData.append(field, file);
    });

    return apiRequest<VerificationCenterResponse>('/api/verification/requirements/' + encodeURIComponent(code) + '/submissions', {
      method: 'POST',
      body: formData,
      timeoutMs: 90000,
    });
  },
  requestVerificationLevel(level: number, reason = '') {
    return apiRequest<VerificationCenterResponse>('/api/verification/level-requests', {
      method: 'POST',
      body: JSON.stringify({ level, reason, actorRole: 'rider' }),
    });
  },
  requestRequirementResubmission(requirementId: string, reason: string) {
    return apiRequest<VerificationCenterResponse>(
      '/api/verification/requirements/' +
        encodeURIComponent(requirementId) +
        '/resubmission-request',
      {
        method: 'POST',
        body: JSON.stringify({ reason, actorRole: 'rider' }),
      },
    );
  },
  submitCashReconciliation(orderIds: string[], note?: string) {
    return apiRequest<{ orders: FullDeliveryOrder[] }>('/api/rider/cash-reconciliation', { method: 'POST', body: JSON.stringify({ orderIds, note }) });
  }
};
