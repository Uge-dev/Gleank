import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { shouldUseApi } from '../config/env';
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
  verifyPickupCode: (sellerPickupCode: string, assignmentId?: string, proofFileName?: string, proofNote?: string, locationLabel?: string) => Promise<VerifyResult>;
  generatePayment: (orderId: string) => PaymentLinkResult;
  confirmOnlinePayment: (orderId: string) => void;
  markCashReceived: (orderId: string) => void;
  completeDelivery: (orderId: string, customerDeliveryCode?: string, proofFileName?: string, proofNote?: string, locationLabel?: string) => Promise<DeliveryCompletionResult>;
  failDelivery: (assignmentId: string, note?: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => void;
  reportSafetyIssue: (payload: SafetyReportPayload) => Promise<{ ok: boolean; reference?: string }>;
  submitCashReconciliation: (orderIds: string[], note?: string) => Promise<void>;
}

const RiderDataContext = createContext<RiderDataContextValue | undefined>(undefined);

function calculateEarnings(completed: FullDeliveryOrder[], orders: FullDeliveryOrder[]): EarningsSummary {
  const deliveredToday = completed.filter((order) => order.completedAt && new Date(order.completedAt).toDateString() === new Date().toDateString());
  const cashOrders = [...completed, ...orders].filter((order) => order.paymentStatus === 'paid_cash');
  const onlineDelivered = completed.filter((order) => order.paymentStatus === 'paid');
  const riderPayoutPending = completed
    .filter((order) => order.cashReconciliationStatus !== 'pending')
    .reduce((sum, order) => sum + order.riderEarning, 0);

  return {
    ...earningsSummary,
    today: Math.max(earningsSummary.today, deliveredToday.reduce((sum, order) => sum + order.riderEarning, 0)),
    completedDeliveriesCount: earningsSummary.completedDeliveriesCount + completed.length - seedCompletedOrders.length,
    cashCollected: cashOrders.reduce((sum, order) => sum + (order.paymentStatus === 'paid_cash' ? order.totalAmount : 0), 0),
    onlinePaymentsDelivered: onlineDelivered.reduce((sum, order) => sum + order.totalAmount, 0),
    platformFeesHandled: completed.reduce((sum, order) => sum + order.platformFee, 0),
    riderPayoutPending
  };
}

export function RiderDataProvider({ children }: { children: ReactNode }) {
  const initial = riderLocalStore.load();
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
      applyStateFromLocal();
      return;
    }
    setLoading(true);
    try {
      const payload = await riderApi.dashboard();
      setAssignments(payload.assignments);
      setOrders(payload.orders);
      setCompleted(payload.completed);
      setNotifications(payload.notifications);
      setApiConnected(true);
    } catch {
      setApiConnected(false);
      applyStateFromLocal();
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
    activities: deliveryActivities,
    notifications,
    earnings: calculateEarnings(completed, orders),
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
        } catch {
          setApiConnected(false);
        }
      }
      riderLocalStore.acceptAssignment(assignmentId);
      applyStateFromLocal();
    },
    async verifyPickupCode(sellerPickupCode: string, assignmentId?: string, proofFileName?: string, proofNote?: string, locationLabel?: string) {
      if (!assignmentId) return { ok: false, message: 'Assignment ID is required for pickup verification.' };
      if (shouldUseApi()) {
        try {
          const response = await riderApi.verifyPickup(assignmentId, { sellerPickupCode, proofFileName, proofNote, locationLabel });
          setAssignments((current) => current.map((item) => (item.id === assignmentId ? response.assignment : item)));
          setOrders((current) => current.map((item) => (item.id === response.order.id ? response.order : item)));
          setUnlockedOrderIds((current) => Array.from(new Set([...current, response.order.id])));
          setApiConnected(true);
          return { ok: true, order: response.order };
        } catch (error) {
          setApiConnected(false);
        }
      }
      const result = riderLocalStore.verifyPickup(assignmentId, sellerPickupCode, proofFileName, proofNote, locationLabel);
      applyStateFromLocal();
      return result.ok ? { ok: true, order: result.order } : { ok: false, message: result.message };
    },
    generatePayment(orderId: string) {
      const result = riderLocalStore.generatePayment(orderId);
      applyStateFromLocal();
      return result;
    },
    confirmOnlinePayment(orderId: string) {
      riderLocalStore.confirmOnlinePayment(orderId);
      applyStateFromLocal();
    },
    markCashReceived(orderId: string) {
      riderLocalStore.markCashReceived(orderId);
      applyStateFromLocal();
    },
    async completeDelivery(orderId: string, customerDeliveryCode = '', proofFileName?: string, proofNote?: string, locationLabel?: string) {
      if (shouldUseApi()) {
        try {
          const response = await riderApi.completeDelivery(orderId, { customerDeliveryCode, proofFileName, proofNote, locationLabel });
          setOrders((current) => current.filter((item) => item.id !== orderId));
          setCompleted((current) => [response.order, ...current.filter((item) => item.id !== orderId)]);
          setAssignments((current) => current.filter((item) => item.id !== response.order.assignmentId));
          setUnlockedOrderIds((current) => current.filter((id) => id !== orderId));
          setApiConnected(true);
          return { ok: true, order: response.order };
        } catch (error) {
          setApiConnected(false);
        }
      }
      const result = riderLocalStore.completeDelivery(orderId, customerDeliveryCode, proofFileName, proofNote, locationLabel);
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
        } catch {
          setApiConnected(false);
        }
      }
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
        } catch {
          setApiConnected(false);
        }
      }
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
