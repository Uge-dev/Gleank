import { completedOrders, fullOrders, mockRider, notifications as seedNotifications, privateAssignments } from '../data/mockData';
import type { FullDeliveryOrder, NotificationItem, PrivateAssignment, ProofRecord, Rider, SafetyReportPayload } from '../types';

interface LocalState {
  rider: Rider;
  assignments: PrivateAssignment[];
  orders: FullDeliveryOrder[];
  completed: FullDeliveryOrder[];
  notifications: NotificationItem[];
  unlockedOrderIds: string[];
}

const key = 'gleenc-rider-dashboard-state-v4';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function initialState(): LocalState {
  return {
    rider: clone(mockRider),
    assignments: clone(privateAssignments),
    orders: clone(fullOrders),
    completed: clone(completedOrders),
    notifications: clone(seedNotifications),
    unlockedOrderIds: ['order-003', 'order-004']
  };
}

function safeStorage() {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function load(): LocalState {
  const storage = safeStorage();
  if (!storage) return initialState();
  try {
    const stored = storage.getItem(key);
    return stored ? { ...initialState(), ...(JSON.parse(stored) as Partial<LocalState>) } : initialState();
  } catch {
    return initialState();
  }
}

function save(state: LocalState) {
  safeStorage()?.setItem(key, JSON.stringify(state));
}

function mutate(updater: (state: LocalState) => LocalState): LocalState {
  const next = updater(load());
  save(next);
  return next;
}

function notify(state: LocalState, title: string, message: string, type: NotificationItem['type'] = 'system') {
  state.notifications = [
    { id: `note-${Date.now()}-${Math.random().toString(16).slice(2)}`, title, message, type, createdAt: new Date().toISOString(), read: false },
    ...state.notifications
  ];
}

function updateAssignment(state: LocalState, assignmentId: string, patch: Partial<PrivateAssignment>) {
  state.assignments = state.assignments.map((item) => (item.id === assignmentId ? { ...item, ...patch } : item));
  state.orders = state.orders.map((item) => (item.assignmentId === assignmentId ? { ...item, ...patch } : item));
}

function updateOrder(state: LocalState, orderId: string, patch: Partial<FullDeliveryOrder>) {
  const updated = state.orders.map((item) => (item.id === orderId ? { ...item, ...patch } : item));
  state.orders = updated;
  const changed = updated.find((item) => item.id === orderId);
  if (changed) {
    state.assignments = state.assignments.map((assignment) => (assignment.id === changed.assignmentId ? { ...assignment, status: changed.status } : assignment));
  }
}

export const riderLocalStore = {
  reset() {
    const state = initialState();
    save(state);
    return state;
  },
  load,
  login(email: string) {
    return mutate((state) => ({ ...state, rider: { ...state.rider, email } })).rider;
  },
  signup(payload: Partial<Rider> & { password: string }) {
    return mutate((state) => ({
      ...state,
      rider: {
        ...state.rider,
        fullName: payload.fullName || 'New Gleenc Rider',
        email: payload.email || 'newrider@gleenc.local',
        phone: payload.phone || '08000000000',
        vehicleType: payload.vehicleType || 'Motorcycle',
        status: 'pending',
        verificationStatus: 'pending_review',
        verificationLevel: 'basic',
        maxPackageValue: 20000
      }
    })).rider;
  },
  acceptAssignment(assignmentId: string) {
    const state = mutate((current) => {
      updateAssignment(current, assignmentId, { status: 'accepted' });
      notify(current, 'Assignment Accepted', 'Proceed to seller pickup point and verify seller pickup OTP.', 'delivery');
      return current;
    });
    return state.assignments.find((item) => item.id === assignmentId)!;
  },
  verifyPickup(assignmentId: string, sellerPickupCode: string, proofFileName?: string, proofNote?: string, locationLabel?: string) {
    const state = load();
    const order = state.orders.find((item) => item.assignmentId === assignmentId);
    if (!order) return { ok: false as const, message: 'No order found for this assignment.' };
    if (order.sellerPickupCode !== sellerPickupCode.trim()) return { ok: false as const, message: 'Invalid seller pickup OTP. Confirm the code from the seller.' };
    const proof: ProofRecord = { id: `proof-${Date.now()}`, type: 'pickup', fileName: proofFileName, note: proofNote, locationLabel, createdAt: new Date().toISOString() };
    const next = mutate((current) => {
      updateOrder(current, order.id, { status: 'package_picked_up', pickupProof: proof });
      current.unlockedOrderIds = Array.from(new Set([...current.unlockedOrderIds, order.id]));
      notify(current, 'Pickup Verified', `${order.orderNumber} is unlocked. Proceed to buyer and collect delivery OTP.`, 'security');
      return current;
    });
    return { ok: true as const, order: next.orders.find((item) => item.id === order.id)! };
  },
  generatePayment(orderId: string) {
    const reference = `PAY-${Math.floor(100000 + Math.random() * 900000)}`;
    const paymentLink = `https://paystack.com/pay/gleenc-${orderId}-${reference.toLowerCase()}`;
    mutate((state) => {
      updateOrder(state, orderId, { paymentLink, paymentReference: reference });
      notify(state, 'Payment Link Generated', `Payment reference ${reference} is ready for customer payment.`, 'payment');
      return state;
    });
    return { paymentLink, reference };
  },
  confirmOnlinePayment(orderId: string) {
    return mutate((state) => {
      updateOrder(state, orderId, { paymentStatus: 'paid', paymentMethod: 'paid_online', escrowStatus: 'held' });
      notify(state, 'Payment Confirmed', 'Online payment has been confirmed and held safely.', 'payment');
      return state;
    });
  },
  markCashReceived(orderId: string) {
    return mutate((state) => {
      updateOrder(state, orderId, { paymentStatus: 'paid', paymentMethod: 'pay_on_delivery', cashReconciliationStatus: 'not_required' });
      notify(state, 'Platform Payment Confirmed', 'Buyer payment has been confirmed through Gleenc before delivery completion.', 'payment');
      return state;
    });
  },
  completeDelivery(orderId: string, customerDeliveryCode: string, proofFileName?: string, proofNote?: string, locationLabel?: string) {
    const state = load();
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false as const, message: 'No delivery order found.' };
    if (order.customerDeliveryCode !== customerDeliveryCode.trim()) return { ok: false as const, message: 'Invalid customer delivery OTP.' };
    if (order.paymentStatus !== 'paid') return { ok: false as const, message: 'Platform payment must be confirmed before completing delivery.' };
    const proof: ProofRecord = { id: `proof-${Date.now()}`, type: 'delivery', fileName: proofFileName, note: proofNote, locationLabel, createdAt: new Date().toISOString() };
    const next = mutate((current) => {
      const changedOrder = current.orders.find((item) => item.id === orderId)!;
      const completedOrder: FullDeliveryOrder = { ...changedOrder, status: 'delivered', escrowStatus: changedOrder.paymentStatus === 'paid' ? 'released' : 'not_required', deliveryProof: proof, completedAt: new Date().toISOString() };
      current.orders = current.orders.filter((item) => item.id !== orderId);
      current.assignments = current.assignments.filter((item) => item.id !== changedOrder.assignmentId);
      current.completed = [completedOrder, ...current.completed];
      current.unlockedOrderIds = current.unlockedOrderIds.filter((id) => id !== orderId);
      notify(current, 'Delivery Completed', `${completedOrder.orderNumber} completed. Earnings will be credited.`, 'delivery');
      return current;
    });
    return { ok: true as const, order: next.completed.find((item) => item.id === orderId)! };
  },
  failDelivery(assignmentId: string, note?: string) {
    return mutate((state) => {
      updateAssignment(state, assignmentId, { status: 'failed' });
      notify(state, 'Delivery Failed', note || 'Delivery marked as failed and support has been notified.', 'delivery');
      return state;
    });
  },
  reportSafetyIssue(payload: SafetyReportPayload) {
    mutate((state) => {
      notify(state, 'Safety Report Sent', `Support reference: SR-${Date.now().toString().slice(-6)}`, 'security');
      return state;
    });
    return { ok: true, reference: `SR-${Date.now().toString().slice(-6)}`, payload };
  },
  markNotificationRead(notificationId: string) {
    return mutate((state) => {
      state.notifications = state.notifications.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
      return state;
    });
  },
  submitCashReconciliation(orderIds: string[], note?: string) {
    return mutate((state) => {
      state.completed = state.completed.map((order) => (orderIds.includes(order.id) ? { ...order, cashReconciliationStatus: 'submitted' } : order));
      state.orders = state.orders.map((order) => (orderIds.includes(order.id) ? { ...order, cashReconciliationStatus: 'submitted' } : order));
      notify(state, 'Payment Audit Submitted', note || 'Platform payment audit request has been submitted for admin approval.', 'payment');
      return state;
    });
  }
};
