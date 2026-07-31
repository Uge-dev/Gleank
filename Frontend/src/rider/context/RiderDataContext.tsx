import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { shouldUseApi, shouldUseMock } from '../config/env';
import { deliveryActivities, earningsSummary, completedOrders as seedCompletedOrders } from '../data/mockData';
import { riderApi } from '../services/riderApi';
import { riderLocalStore } from '../services/riderLocalStore';
import type {
  AssignmentStatus,
  DeliveryActivity,
  EarningsSummary,
  FullDeliveryOrder,
  NotificationItem,
  PrivateAssignment,
  RiderDashboardStats,
  SafetyReportPayload,
} from '../types';
import { useAuth } from './AuthContext';

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
  stats: RiderDashboardStats;
  unlockedOrderIds: string[];
  loading: boolean;
  apiConnected: boolean;
  refresh: () => Promise<void>;
  startDelivery: (assignmentId: string) => Promise<void>;
  verifyPickupCode: (sellerPickupCode: string, assignmentId?: string, proofFile?: File | null, proofNote?: string, locationLabel?: string) => Promise<VerifyResult>;
  verifyDeliveryCode: (orderId: string, customerDeliveryCode: string) => Promise<VerifyResult>;
  generatePayment: (orderId: string) => Promise<PaymentLinkResult>;
  confirmOnlinePayment: (orderId: string) => Promise<void>;
  markCashReceived: (orderId: string) => void;
  completeDelivery: (orderId: string, customerDeliveryCode?: string, proofFile?: File | null, proofNote?: string, locationLabel?: string) => Promise<DeliveryCompletionResult>;
  failDelivery: (assignmentId: string, note?: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
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
    cashCollected: cashOrders.length,
    onlinePaymentsDelivered: onlineDelivered.length,
    platformFeesHandled: 0,
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

function scheduleRiderDispatchBeep(audio: AudioContext) {
  try {
    const startAt = audio.currentTime + 0.02;
    [0, 0.24, 0.48].forEach((offset, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = index === 1 ? 'square' : 'sine';
      oscillator.frequency.value = index === 1 ? 1046 : 880;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.42, startAt + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.18);
      oscillator.stop(startAt + offset + 0.2);
    });
  } catch {
    // The next user interaction will retry a pending sound alert.
  }
}

function showRiderNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration()
        .then((registration) => {
          if (!registration) {
            new Notification(title, { body, tag: 'gleenc-rider-dispatch' });
            return;
          }
          return registration.showNotification(title, {
            body,
            tag: 'gleenc-rider-dispatch',
            icon: '/glc%20red%20yel%20logo.png',
            badge: '/glc%20red%20yel%20logo.png',
            data: { url: '/rider/assignments' },
          });
        })
        .catch(() => {
          new Notification(title, { body, tag: 'gleenc-rider-dispatch' });
        });
      return;
    }
    new Notification(title, { body, tag: 'gleenc-rider-dispatch' });
  }
}

function isNewAssignmentNotification(notification: NotificationItem) {
  return /new assignment|new delivery|delivery assigned|delivery offer|seller sent a delivery offer|new delivery batch/i.test(
    `${notification.title} ${notification.message}`,
  );
}

export function RiderDataProvider({ children }: { children: ReactNode }) {
  const { rider } = useAuth();
  const initial = shouldUseMock() ? riderLocalStore.load() : emptyLocalState();
  const [assignments, setAssignments] = useState<PrivateAssignment[]>(initial.assignments);
  const [orders, setOrders] = useState<FullDeliveryOrder[]>(initial.orders);
  const [completed, setCompleted] = useState<FullDeliveryOrder[]>(initial.completed);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initial.notifications);
  const [activities, setActivities] = useState<DeliveryActivity[]>(shouldUseMock() ? deliveryActivities : []);
  const [earnings, setEarnings] = useState<EarningsSummary>(
    shouldUseMock() ? calculateEarnings(initial.completed, initial.orders, true) : emptyEarnings(),
  );
  const [stats, setStats] = useState<RiderDashboardStats>(emptyStats());
  const [unlockedOrderIds, setUnlockedOrderIds] = useState<string[]>(initial.unlockedOrderIds);
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const hydratedRef = useRef(false);
  const knownAssignmentIdsRef = useRef<Set<string>>(new Set(initial.assignments.map((item) => item.id)));
  const knownNotificationIdsRef = useRef<Set<string>>(new Set(initial.notifications.map((item) => item.id)));
  const knownDispatchOfferIdsRef = useRef<Set<string>>(new Set());
  const alertedEventIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingSoundRef = useRef(false);

  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContextRef.current = new AudioContextClass();
    return audioContextRef.current;
  }

  function playDispatchAlert() {
    const audio = getAudioContext();
    if (!audio) return;
    if (audio.state === 'running') {
      pendingSoundRef.current = false;
      scheduleRiderDispatchBeep(audio);
      return;
    }
    pendingSoundRef.current = true;
    void audio.resume()
      .then(() => {
        if (!pendingSoundRef.current) return;
        pendingSoundRef.current = false;
        scheduleRiderDispatchBeep(audio);
      })
      .catch(() => undefined);
  }

  function alertNewDispatch(id: string, title: string, body: string) {
    const alertId = id || `${title}:${body}`;
    if (alertedEventIdsRef.current.has(alertId)) return;
    alertedEventIdsRef.current.add(alertId);
    playDispatchAlert();
    if ('vibrate' in navigator) {
      navigator.vibrate([180, 80, 180, 80, 260]);
    }
    showRiderNotification(title, body);
  }

  useEffect(() => {
    function unlockAudio() {
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
      const audio = getAudioContext();
      if (!audio || audio.state === 'running') return;
      void audio.resume()
        .then(() => {
          if (!pendingSoundRef.current) return;
          pendingSoundRef.current = false;
          scheduleRiderDispatchBeep(audio);
        })
        .catch(() => undefined);
    }

    document.addEventListener('pointerdown', unlockAudio, true);
    document.addEventListener('keydown', unlockAudio, true);
    return () => {
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, []);

  function applyStateFromLocal() {
    const state = riderLocalStore.load();
    setAssignments(state.assignments);
    setOrders(state.orders);
    setCompleted(state.completed);
    setNotifications(state.notifications);
    setActivities(deliveryActivities);
    setEarnings(calculateEarnings(state.completed, state.orders, true));
    setStats({
      ...emptyStats(),
      assigned: state.assignments.filter((item) => item.status === 'assigned').length,
      newAssignments: state.assignments.filter((item) => item.status === 'assigned').length,
      active: state.assignments.filter((item) => ['accepted', 'arrived_at_pickup', 'package_picked_up', 'out_for_delivery'].includes(item.status)).length,
      completed: state.completed.length,
      highRiskTasks: state.assignments.filter((item) => item.riskLevel === 'high').length,
    });
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
        setActivities([]);
        setEarnings(emptyEarnings());
        setStats(emptyStats());
        setUnlockedOrderIds(empty.unlockedOrderIds);
      }
      return;
    }
    setLoading(true);
    try {
      const payload = await riderApi.dashboard();
      const dispatchPayload = await riderApi.activeDispatches().catch(() => ({ dispatches: [] }));
      const nextAssignments = payload.assignments;
      const nextNotifications = payload.notifications;
      const nextDispatchOffers = dispatchPayload.dispatches || [];
      const newAssignments = nextAssignments.filter((item) =>
        item.status === 'assigned' &&
        (!hydratedRef.current || !knownAssignmentIdsRef.current.has(item.id)),
      );
      const newDispatchOffers = nextDispatchOffers.filter((item) =>
        item.status === 'offered' &&
        (!hydratedRef.current || !knownDispatchOfferIdsRef.current.has(item.id)),
      );
      const newDispatchNotifications = nextNotifications.filter((item) =>
        !item.read &&
        isNewAssignmentNotification(item) &&
        (!hydratedRef.current || !knownNotificationIdsRef.current.has(item.id)),
      );

      if (newDispatchOffers[0]) {
        alertNewDispatch(
          `offer:${newDispatchOffers[0].id}`,
          'New Gleenc dispatch',
          'A delivery batch is waiting for your response.',
        );
      } else if (newAssignments[0]) {
        alertNewDispatch(
          `assignment:${newAssignments[0].id}`,
          'New Gleenc assignment',
          `${newAssignments[0].sellerName} assigned a delivery to you.`,
        );
      } else if (newDispatchNotifications[0]) {
        alertNewDispatch(
          `notification:${newDispatchNotifications[0].id}`,
          newDispatchNotifications[0].title,
          newDispatchNotifications[0].message,
        );
      }

      knownAssignmentIdsRef.current = new Set(nextAssignments.map((item) => item.id));
      knownNotificationIdsRef.current = new Set(nextNotifications.map((item) => item.id));
      knownDispatchOfferIdsRef.current = new Set(nextDispatchOffers.map((item) => item.id));
      hydratedRef.current = true;

      setAssignments(nextAssignments);
      setOrders(payload.orders);
      setCompleted(payload.completed);
      setNotifications(nextNotifications);
      setActivities(payload.activities);
      setEarnings(payload.earnings);
      setStats({
        ...payload.stats,
        pendingOffers: nextDispatchOffers.length,
        newAssignments: payload.stats.assigned + nextDispatchOffers.length,
      });
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
    if (!rider?.id) {
      const empty = emptyLocalState();
      setAssignments(empty.assignments);
      setOrders(empty.orders);
      setCompleted(empty.completed);
      setNotifications(empty.notifications);
      setActivities([]);
      setEarnings(emptyEarnings());
      setStats(emptyStats());
      setUnlockedOrderIds(empty.unlockedOrderIds);
      setApiConnected(false);
      hydratedRef.current = false;
      return undefined;
    }

    knownAssignmentIdsRef.current = new Set();
    knownNotificationIdsRef.current = new Set();
    knownDispatchOfferIdsRef.current = new Set();
    alertedEventIdsRef.current = new Set();
    hydratedRef.current = false;
    void refresh();
    if (!shouldUseApi()) return undefined;
    const refreshWhenActive = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void refresh();
      }
    };
    const interval = window.setInterval(() => {
      refreshWhenActive();
    }, 10000);
    window.addEventListener('focus', refreshWhenActive);
    window.addEventListener('online', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenActive);
      window.removeEventListener('online', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
    };
  }, [rider?.id]);

  useEffect(() => {
    if (!rider?.id || !shouldUseApi()) return undefined;
    return riderApi.subscribeToNotifications({
      onNotification(notification) {
        setNotifications((current) => [
          notification,
          ...current.filter((item) => item.id !== notification.id),
        ]);
        if (isNewAssignmentNotification(notification)) {
          alertNewDispatch(
            `notification:${notification.id}`,
            notification.title,
            notification.message,
          );
        }
        void refresh();
      },
    });
  }, [rider?.id]);

  function updateAssignmentStatus(assignmentId: string, status: AssignmentStatus) {
    setAssignments((current) => current.map((item) => (item.id === assignmentId ? { ...item, status } : item)));
    setOrders((current) => current.map((item) => (item.assignmentId === assignmentId ? { ...item, status } : item)));
  }

  const value = useMemo<RiderDataContextValue>(() => ({
    assignments,
    orders,
    completed,
    activities,
    notifications,
    earnings,
    stats,
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
          void refresh();
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
          void refresh();
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
    async verifyDeliveryCode(orderId: string, customerDeliveryCode: string) {
      if (!orderId) return { ok: false, message: 'Active delivery order is required.' };
      if (!customerDeliveryCode.trim()) return { ok: false, message: 'Enter the buyer delivery code to continue.' };
      if (shouldUseApi()) {
        try {
          const response = await riderApi.verifyDeliveryCode(orderId, customerDeliveryCode);
          setAssignments((current) => current.map((item) => (item.id === response.assignment.id ? response.assignment : item)));
          if (response.order) {
            setOrders((current) => [response.order!, ...current.filter((item) => item.id !== response.order!.id)]);
            setUnlockedOrderIds((current) => Array.from(new Set([...current, response.order!.id])));
          }
          setApiConnected(true);
          void refresh();
          return { ok: true, order: response.order };
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) {
            return { ok: false, message: error instanceof Error ? error.message : 'Delivery code verification failed.' };
          }
        }
      }
      if (!shouldUseMock()) return { ok: false, message: 'Rider API is not connected.' };
      return { ok: false, message: 'Delivery code verification needs the live Gleenc API.' };
    },
    async generatePayment(orderId: string) {
      if (shouldUseApi()) {
        try {
          const response = await riderApi.generatePayment(orderId);
          if (response.assignment) {
            setAssignments((current) => current.map((item) => (item.id === response.assignment!.id ? response.assignment! : item)));
          }
          setApiConnected(true);
          return { paymentLink: response.paymentLink, reference: response.reference };
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) throw error instanceof Error ? error : new Error('Payment link could not be generated.');
        }
      }
      if (!shouldUseMock()) throw new Error('Rider API is not connected.');
      const result = riderLocalStore.generatePayment(orderId);
      applyStateFromLocal();
      return result;
    },
    async confirmOnlinePayment(orderId: string) {
      if (shouldUseApi()) {
        await refresh();
        return;
      }
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
      const assignment = assignments.find((item) => item.id === order?.assignmentId || item.orderId === orderId);
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
          void refresh();
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
          void refresh();
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
    async markNotificationRead(notificationId: string) {
      if (shouldUseApi()) {
        try {
          await riderApi.markNotificationRead(notificationId);
          setNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
          setApiConnected(true);
          return;
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) throw error instanceof Error ? error : new Error('Notification could not be updated.');
        }
      }
      if (!shouldUseMock()) return;
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
        } catch (error) {
          setApiConnected(false);
          if (!shouldUseMock()) {
            return { ok: false, reference: error instanceof Error ? error.message : undefined };
          }
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
  }), [activities, apiConnected, assignments, completed, earnings, loading, notifications, orders, stats, unlockedOrderIds]);

  return <RiderDataContext.Provider value={value}>{children}</RiderDataContext.Provider>;
}

export function useRiderData() {
  const context = useContext(RiderDataContext);
  if (!context) throw new Error('useRiderData must be used inside RiderDataProvider');
  return context;
}
