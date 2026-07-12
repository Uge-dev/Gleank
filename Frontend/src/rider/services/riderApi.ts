import { apiRequest } from './apiClient';
import type { Availability, FullDeliveryOrder, NotificationItem, PrivateAssignment, ProofRecord, Rider, SafetyReportPayload } from '../types';

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
  pickupPoint?: BackendPoint;
  deliveryPoint?: BackendPoint;
  pickupLocation?: string;
  deliveryLocation?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerWhatsApp?: string;
  marketName?: string;
  packageSummary?: string;
  packageValue?: number;
  deliveryFee?: number;
  dispatchTimeoutSeconds?: number;
  dispatchTimeoutMinutes?: number;
  dispatchExpiresAt?: string | null;
  dispatchTimeoutPolicy?: string;
  dispatchRemainingSeconds?: number | null;
  createdAt?: string;
  acceptedAt?: string;
  updatedAt?: string;
};

type BackendDashboardResponse = BackendRiderAuthResponse & {
  assignments?: BackendAssignment[];
  completed?: BackendAssignment[];
  notifications?: Array<{
    id?: string;
    type?: string;
    title?: string;
    body?: string;
    message?: string;
    createdAt?: string;
    created_at?: string;
    read?: boolean;
  }>;
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
      pickupLocation?: string;
      pickupSequence?: number;
      status?: string;
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

function normalizeAssignment(row: BackendAssignment): PrivateAssignment {
  const orderValue = Number(row.packageValue || 0);
  const pickupLocation = row.pickupLocation || row.pickupPoint?.address || 'Pickup location unavailable';
  const deliveryLocation = row.deliveryLocation || row.deliveryPoint?.address || 'Delivery location locked until pickup';

  return {
    id: row.id || '',
    sellerName: row.sellerName || 'Seller',
    sellerPhone: row.sellerPhone || '',
    sellerWhatsApp: row.sellerWhatsApp || row.sellerPhone || '',
    sellerType: mapSellerType(row),
    marketName: row.marketName || undefined,
    pickupLocation,
    pickupLandmark: '',
    deliveryLocation,
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
    riskLevel: orderValue >= 200000 ? 'high' : orderValue >= 50000 ? 'medium' : 'low',
    securityNotes: [
      'Buyer details and delivery OTP stay hidden from riders until the buyer provides the OTP in person.',
      'Verify seller pickup OTP and capture proof before leaving pickup point.',
    ],
    requiresPickupOtp: true,
    requiresDeliveryOtp: true,
    sellerRating: 0,
  };
}

function normalizeDashboard(response: BackendDashboardResponse): RiderDashboardPayload {
  const authShape = normalizeRider(response);

  return {
    rider: authShape.rider,
    assignments: (response.assignments || []).map(normalizeAssignment),
    orders: [],
    completed: [],
    notifications: (response.notifications || []).map((item) => ({
      id: item.id || '',
      type: (item.type as NotificationItem['type']) || 'system',
      title: item.title || 'Rider update',
      message: item.message || item.body || '',
      createdAt: item.createdAt || item.created_at || new Date().toISOString(),
      read: Boolean(item.read),
    })),
  };
}

function normalizeRider(response: BackendRiderAuthResponse): { rider: Rider } {
  const user = response.user || {};
  const profile = response.riderProfile || response.profile || {};

  return {
    rider: {
      id: profile.userId || user.id || '',
      fullName: profile.fullName || user.name || 'Gleenc Rider',
      phone: profile.phone || user.phone || '',
      email: user.email || '',
      vehicleType: profile.vehicleType || 'Motorcycle',
      vehiclePlate: profile.vehiclePlate || '',
      profilePhoto: user.avatarUrl || '',
      availability: (profile.availability as Rider['availability']) || 'offline',
      status: mapRiderStatus(profile.verificationStatus),
      deliveryRating: Number(profile.ratingAverage || 0),
      verificationLevel: mapVerificationLevel(profile.verificationLevel),
      verificationStatus: mapVerificationStatus(profile.verificationStatus),
      maxPackageValue: Number(profile.maxPackageValue || 0),
      activeZone: profile.coverageArea || user.campus || 'Gleenc coverage',
      documents: [
        {
          id: 'identity-document',
          label: 'Government ID',
          status: mapVerificationStatus(profile.verificationStatus),
          required: true,
          note: 'Admin reviews this before approving rider access.',
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
  assignments: PrivateAssignment[];
  orders: FullDeliveryOrder[];
  completed: FullDeliveryOrder[];
  notifications: NotificationItem[];
}

export interface PickupVerificationPayload {
  sellerPickupCode: string;
  proofFileName?: string;
  proofNote?: string;
  locationLabel?: string;
}

export interface DeliveryCompletionPayload {
  customerDeliveryCode: string;
  proofFileName?: string;
  proofNote?: string;
  locationLabel?: string;
}

export const riderApi = {
  session() {
    return apiRequest<BackendRiderAuthResponse>('/api/rider/session').then(normalizeRider);
  },
  login(email: string, password: string) {
    return apiRequest<BackendRiderAuthResponse>('/api/rider/login', { method: 'POST', body: JSON.stringify({ email, password }) }).then(normalizeRider);
  },
  signup(payload: Partial<Rider> & { password: string }) {
    return apiRequest<BackendRiderAuthResponse>('/api/rider/register', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.fullName,
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        vehicleType: payload.vehicleType,
        vehiclePlate: payload.vehiclePlate,
        coverageArea: payload.activeZone,
      }),
    }).then(normalizeRider);
  },
  logout() {
    return apiRequest<{ ok: boolean }>('/api/rider/logout', { method: 'POST' });
  },
  updateAvailability(availability: Availability) {
    return apiRequest<BackendRiderAuthResponse>('/api/rider/availability', { method: 'PATCH', body: JSON.stringify({ availability }) }).then(normalizeRider);
  },
  dashboard() {
    return apiRequest<BackendDashboardResponse>('/api/rider/dashboard').then(normalizeDashboard);
  },
  activeDispatches() {
    return apiRequest<{ dispatches: RiderDispatchOffer[] }>('/api/rider/dispatches/active');
  },
  acceptDispatch(dispatchId: string) {
    return apiRequest<{ batch: unknown; assignments: BackendAssignment[] }>('/api/rider/dispatch/' + dispatchId + '/accept', { method: 'POST' })
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
    return apiRequest<{ assignment: BackendAssignment }>('/api/rider/assignments/' + assignmentId + '/accept', { method: 'POST' })
      .then((response) => ({ assignment: normalizeAssignment(response.assignment) }));
  },
  verifyPickup(assignmentId: string, payload: PickupVerificationPayload) {
    return apiRequest<{ assignment: BackendAssignment; order?: FullDeliveryOrder }>('/api/rider/assignments/' + assignmentId + '/pickup', { method: 'POST', body: JSON.stringify(payload) })
      .then((response) => ({
        assignment: normalizeAssignment(response.assignment),
        order: response.order,
      }));
  },
  generatePayment(orderId: string) {
    return apiRequest<{ paymentLink: string; reference: string }>('/api/rider/orders/' + orderId + '/payment-link', { method: 'POST' });
  },
  confirmCash(orderId: string) {
    return apiRequest<{ order: FullDeliveryOrder }>('/api/rider/orders/' + orderId + '/cash-collected', { method: 'POST' });
  },
  completeDelivery(orderId: string, payload: DeliveryCompletionPayload) {
    return apiRequest<{ assignment: BackendAssignment; order?: FullDeliveryOrder }>('/api/rider/orders/' + orderId + '/complete', { method: 'POST', body: JSON.stringify(payload) })
      .then((response) => ({
        assignment: normalizeAssignment(response.assignment),
        order: response.order,
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
  submitCashReconciliation(orderIds: string[], note?: string) {
    return apiRequest<{ orders: FullDeliveryOrder[] }>('/api/rider/cash-reconciliation', { method: 'POST', body: JSON.stringify({ orderIds, note }) });
  }
};
