import { apiRequest } from './apiClient';
import type { Availability, FullDeliveryOrder, NotificationItem, PrivateAssignment, ProofRecord, Rider, SafetyReportPayload } from '../types';

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
    return apiRequest<{ rider: Rider }>('/api/rider/session');
  },
  login(email: string, password: string) {
    return apiRequest<{ rider: Rider }>('/api/rider/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  signup(payload: Partial<Rider> & { password: string }) {
    return apiRequest<{ rider: Rider }>('/api/rider/register', { method: 'POST', body: JSON.stringify(payload) });
  },
  logout() {
    return apiRequest<{ ok: boolean }>('/api/rider/logout', { method: 'POST' });
  },
  updateAvailability(availability: Availability) {
    return apiRequest<{ rider: Rider }>('/api/rider/availability', { method: 'PATCH', body: JSON.stringify({ availability }) });
  },
  dashboard() {
    return apiRequest<RiderDashboardPayload>('/api/rider/dashboard');
  },
  acceptAssignment(assignmentId: string) {
    return apiRequest<{ assignment: PrivateAssignment }>('/api/rider/assignments/' + assignmentId + '/accept', { method: 'POST' });
  },
  verifyPickup(assignmentId: string, payload: PickupVerificationPayload) {
    return apiRequest<{ assignment: PrivateAssignment; order: FullDeliveryOrder }>('/api/rider/assignments/' + assignmentId + '/pickup', { method: 'POST', body: JSON.stringify(payload) });
  },
  generatePayment(orderId: string) {
    return apiRequest<{ paymentLink: string; reference: string }>('/api/rider/orders/' + orderId + '/payment-link', { method: 'POST' });
  },
  confirmCash(orderId: string) {
    return apiRequest<{ order: FullDeliveryOrder }>('/api/rider/orders/' + orderId + '/cash-collected', { method: 'POST' });
  },
  completeDelivery(orderId: string, payload: DeliveryCompletionPayload) {
    return apiRequest<{ order: FullDeliveryOrder }>('/api/rider/orders/' + orderId + '/complete', { method: 'POST', body: JSON.stringify(payload) });
  },
  failDelivery(assignmentId: string, note?: string) {
    return apiRequest<{ assignment: PrivateAssignment }>('/api/rider/assignments/' + assignmentId + '/fail', { method: 'POST', body: JSON.stringify({ note }) });
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
