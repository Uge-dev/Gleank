import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { shouldUseApi, shouldUseMock } from '../config/env';
import { deliveryActivities, earningsSummary, completedOrders as seedCompletedOrders } from '../data/mockData';
import { riderApi } from '../services/riderApi';
import { riderLocalStore } from '../services/riderLocalStore';
import type { AssignmentStatus, DeliveryActivity, EarningsSummary, FullDeliveryOrder, NotificationItem, PrivateAssignment, SafetyReportPayload } from '../types';

interface VerifyResult {
  ok: boolean;
  order?: FullDeliveryOrder;
  message?: string;
}

interface PaymentLinkResult {
  paymentLink: string;
  reference: string;
}

interface DeliveryCompletionResult {
  ok: boolean;
  order?: FullDeliveryOrder;
  message?: string;
}

interface RiderDataContextValue {
  assignments: PrivateAssignment[];
  orders: FullDeliveryOrder[];
  completed: FullDeliveryOrder[];
  activities: DeliveryActivity[];
  notifications: NotificationItem[];
  earnings: EarningsSummary;
  unlockedOrderIds: string[];
  loading: boolean;
  apiConnected: boolean;
  refresh: () => Promise<void>;
  startDelivery: (assignmentId: string) => Promise<void>;
  verifyPickupCode: (sellerPickupCode: string, assignmentId?: string, proofFile?: File | null, proofNote?: string, locationLabel?: string) => Promise<VerifyResult>;
  generatePayment: (orderId: string) => PaymentLinkResult;
  confirmOnlinePayment: (orderId: string) => void;
  markCashReceived: (orderId: string) => void;
  completeDelivery: (orderId: string, customerDeliveryCode?: string, proofFile?: File | null, proofNote?: string, locationLabel?: string) => Promise<DeliveryCompletionResult>;
  failDelivery: (assignmentId: string, note?: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => void;
  reportSafetyIssue: (payload: SafetyReportPayload) => Promise<{ ok: boolean; reference?: string }>;
  submitCashReconciliation: (orderIds: string[], note?: string) => Promise<void>;
}

const RiderDataContext = createContext<RiderDataContextValue | undefined>(undefined);

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

function calculateEarnings(completed: FullDeliveryOrder[], orders: FullDeliveryOrder[], includeMockBase = false): EarningsSummary {
  const base = includeMockBase ? earningsSummary : emptyEarnings();
  const deliveredToday = completed.filter((order) => order.completedAt && new Date(order.completedAt).toDateString() === new Date().toDateString());
  const cashOrders = [...completed, ...orders].filter((order) => order.paymentStatus === 'paid_cash');
  const onlineDelivered = completed.filter((order) => order.paymentStatus === 'paid');
  const riderPayoutPending = completed
    .filter((order) => order.cashReconciliationStatus !== 'pending')
    .reduce((sum, order) => sum + order.riderEarning, 0);

  return {
    ...base,
    today: Math.max(base.today, deliveredToday.reduce((sum, order) => sum + order.riderEarning, 0)),
    completedDeliveriesCount: (includeMockBase ? earningsSummary.completedDeliveriesCount - seedCompletedOrders.length : 0) + completed.length,
    cashCollected: cashOrders.reduce((sum, order) => sum + (order.paymentStatus === 'paid_cash' ? order.totalAmount : 0), 0),
    onlinePaymentsDelivered: onlineDelivered.reduce((sum, order) => sum + order.totalAmount, 0),
    platformFeesHandled: completed.reduce((sum, order) => sum + order.platformFee, 0),
    riderPayoutPending
  };
}

function emptyLocalState() {
  return {
    assignments: [] as PrivateAssignment[],
    orders: [] as FullDeliveryOrder[],
    completed: [] as FullDeliveryOrder[],
    notifications: [] as NotificationItem[],
    unlockedOrderIds: [] as string[],
  };
}

function proofLocationFromPoint(lat?: number | null, lng?: number | null) {
  return {
    lat: typeof lat === 'number' ? lat : 0,
    lng: typeof lng === 'number' ? lng : 0,
    accuracyMeters: 0,
  };
}

export function RiderDataProvider({ children }: { children: ReactNode }) {
  const initial = shouldUseMock() ? riderLocalStore.load() : emptyLocalState();
  const [assignments, setAssignments] = useState<PrivateAssignment[]>(initial.assignments);
  const [orders, setOrders] = useState<FullDeliveryOrder[]>(initial.orders);
  const [completed, setCompleted] = useState<FullDeliveryOrder[]>(initial.completed);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initial.notifications);
  const [unlockedOrderIds, setUnlockedOrderIds] = useState<string[]>(initial.unlockedOrderIds);
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);

  function applyStateFromLocal() {
    const state = riderLocalStore.load();
    setAssignments(state.assignments);
    setOrders(state.orders);
    setCompleted(state.completed);
    setNotifications(state.notifications);
    setUnlockedOrderIds(state.unlockedOrderIds);
  }

  async function refresh() {
    if (!shouldUseApi()) {
      if (shouldUseMock()) {
        applyStateFromLocal();
      } else {
        const empty = emptyLocalState();
        setAssignments(empty.assignments);
        setOrders(empty.orders);
        setCompleted(empty.completed);
        setNotifications(empty.notifications);
        setUnlockedOrderIds(empty.unlockedOrderIds);
      }
      return;
    }
    setLoading(true);
    try {
      const payload = await riderApi.dashboard();
      setAssignments(payload.assignments);
      setOrders(payload.orders);
      setCompleted(payload.completed);
      setNotifications(payload.notifications);
      setUnlockedOrderIds(payload.orders.map((order) => order.id));
      setApiConnected(true);
    } catch {
      setApiConnected(false);
      if (shouldUseMock()) {
        applyStateFromLocal();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function updateAssignmentStatus(assignmentId: string, status: AssignmentStatus) {
    setAssignments((current) => current.map((item) => (item.id === assignmentId ? { ...item, status } : item)));
    setOrders((current) => current.map((item) => (item.assignmentId === assignmentId ? { ...item, status } : item)));
  }

  const value = useMemo<RiderDataContextValue>(() => ({
    assignments,
    orders,
    completed,
    activities: shouldUseMock() ? deliveryActivities : [],
    notifications,
    earnings: calculateEarnings(completed, orders, shouldUseMock()),
    unlockedOrderIds,
    loading,
    apiConnected,
    refresh,
    async startDelivery(assignmentId: string) {
      if (shouldUseApi()) {
        try {
          const response = await riderApi.acceptAssignment(assignmentId);
          setAssignments((current) => current.map((item) => (item.id === assignmentId ? response.assignment : item)));
          setApiConnected(true);
          return;
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) throw error instanceof Error ? error : new Error('Could not accept rider assignment.');
        }
      }
      if (!shouldUseMock()) throw new Error('Rider API is not connected.');
      riderLocalStore.acceptAssignment(assignmentId);
      applyStateFromLocal();
    },
    async verifyPickupCode(sellerPickupCode: string, assignmentId?: string, proofFile?: File | null, proofNote?: string, locationLabel?: string) {
      if (!assignmentId) return { ok: false, message: 'Assignment ID is required for pickup verification.' };
      if (!proofFile) return { ok: false, message: 'Upload a pickup proof photo before verifying seller pickup.' };
      const assignment = assignments.find((item) => item.id === assignmentId);
      if (shouldUseApi()) {
        try {
          const response = await riderApi.verifyPickup(assignmentId, {
            sellerPickupCode,
            proofFile,
            proofFileName: proofFile.name,
            proofNote,
            locationLabel,
            proofLocation: proofLocationFromPoint(assignment?.pickupLat, assignment?.pickupLng),
          });
          setAssignments((current) => current.map((item) => (item.id === assignmentId ? response.assignment : item)));
          if (response.order) {
            setOrders((current) => [response.order!, ...current.filter((item) => item.id !== response.order!.id)]);
            setUnlockedOrderIds((current) => Array.from(new Set([...current, response.order!.id])));
          }
          setApiConnected(true);
          return { ok: true, order: response.order };
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) {
            return { ok: false, message: error instanceof Error ? error.message : 'Pickup verification failed.' };
          }
        }
      }
      if (!shouldUseMock()) return { ok: false, message: 'Rider API is not connected.' };
      const result = riderLocalStore.verifyPickup(assignmentId, sellerPickupCode, proofFile.name, proofNote, locationLabel);
      applyStateFromLocal();
      return result.ok ? { ok: true, order: result.order } : { ok: false, message: result.message };
    },
    generatePayment(orderId: string) {
      if (!shouldUseMock()) {
        return { paymentLink: '', reference: '' };
      }
      const result = riderLocalStore.generatePayment(orderId);
      applyStateFromLocal();
      return result;
    },
    confirmOnlinePayment(orderId: string) {
      if (!shouldUseMock()) return;
      riderLocalStore.confirmOnlinePayment(orderId);
      applyStateFromLocal();
    },
    markCashReceived(orderId: string) {
      if (!shouldUseMock()) return;
      riderLocalStore.markCashReceived(orderId);
      applyStateFromLocal();
    },
    async completeDelivery(orderId: string, customerDeliveryCode = '', proofFile?: File | null, proofNote?: string, locationLabel?: string) {
      if (!proofFile) return { ok: false, message: 'Upload delivery proof photo before confirming delivery.' };
      const order = orders.find((item) => item.id === orderId);
      const assignment = assignments.find((item) => item.id === order?.assignmentId);
      if (shouldUseApi()) {
        try {
          const response = await riderApi.completeDelivery(orderId, {
            customerDeliveryCode,
            proofFile,
            proofFileName: proofFile.name,
            proofNote,
            locationLabel,
            proofLocation: proofLocationFromPoint(order?.deliveryLat ?? assignment?.deliveryLat, order?.deliveryLng ?? assignment?.deliveryLng),
          });
          setOrders((current) => current.filter((item) => item.id !== orderId));
          if (response.order) {
            setCompleted((current) => [response.order!, ...current.filter((item) => item.id !== orderId)]);
          }
          setAssignments((current) => current.filter((item) => item.id !== response.assignment.id));
          setUnlockedOrderIds((current) => current.filter((id) => id !== orderId));
          setApiConnected(true);
          return { ok: true, order: response.order };
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) {
            return { ok: false, message: error instanceof Error ? error.message : 'Delivery completion failed.' };
          }
        }
      }
      if (!shouldUseMock()) return { ok: false, message: 'Rider API is not connected.' };
      const result = riderLocalStore.completeDelivery(orderId, customerDeliveryCode, proofFile.name, proofNote, locationLabel);
      applyStateFromLocal();
      return result.ok ? { ok: true, order: result.order } : { ok: false, message: result.message };
    },
    async failDelivery(assignmentId: string, note?: string) {
      if (shouldUseApi()) {
        try {
          const response = await riderApi.failDelivery(assignmentId, note);
          setAssignments((current) => current.map((item) => (item.id === assignmentId ? response.assignment : item)));
          setApiConnected(true);
          return;
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) throw error instanceof Error ? error : new Error('Could not mark delivery as failed.');
        }
      }
      if (!shouldUseMock()) throw new Error('Rider API is not connected.');
      riderLocalStore.failDelivery(assignmentId, note);
      updateAssignmentStatus(assignmentId, 'failed');
      applyStateFromLocal();
    },
    markNotificationRead(notificationId: string) {
      riderLocalStore.markNotificationRead(notificationId);
      applyStateFromLocal();
    },
    async reportSafetyIssue(payload: SafetyReportPayload) {
      if (shouldUseApi()) {
        try {
          const response = await riderApi.reportSafetyIssue(payload);
          setApiConnected(true);
          await refresh();
          return { ok: true, reference: response.reference };
        } catch {
          setApiConnected(false);
        }
      }
      if (!shouldUseMock()) return { ok: false };
      const response = riderLocalStore.reportSafetyIssue(payload);
      applyStateFromLocal();
      return { ok: true, reference: response.reference };
    },
    async submitCashReconciliation(orderIds: string[], note?: string) {
      if (shouldUseApi()) {
        try {
          const response = await riderApi.submitCashReconciliation(orderIds, note);
          setOrders((current) => current.map((order) => response.orders.find((item) => item.id === order.id) || order));
          setCompleted((current) => current.map((order) => response.orders.find((item) => item.id === order.id) || order));
          setApiConnected(true);
          return;
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) throw error instanceof Error ? error : new Error('Cash reconciliation failed.');
        }
      }
      if (!shouldUseMock()) throw new Error('Rider API is not connected.');
      riderLocalStore.submitCashReconciliation(orderIds, note);
      applyStateFromLocal();
    }
  }), [apiConnected, assignments, completed, loading, notifications, orders, unlockedOrderIds]);

  return <RiderDataContext.Provider value={value}>{children}</RiderDataContext.Provider>;
}

export function useRiderData() {
  const context = useContext(RiderDataContext);
  if (!context) throw new Error('useRiderData must be used inside RiderDataProvider');
  return context;
}
