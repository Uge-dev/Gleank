import { FiClock, FiMapPin, FiPhone, FiTruck, FiX } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import { useRiderData } from '../context/RiderDataContext';
import AssignmentCard from '../components/rider/AssignmentCard';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import { shouldUseApi } from '../config/env';
import { ApiClientError } from '../services/apiClient';
import { riderApi } from '../services/riderApi';
import type { RiderDispatchOffer } from '../services/riderApi';

export default function AssignedOrders() {
  const { assignments, refresh } = useRiderData();
  const [dispatches, setDispatches] = useState<RiderDispatchOffer[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchAction, setDispatchAction] = useState('');
  const [dispatchError, setDispatchError] = useState('');
  const assigned = assignments.filter((item) =>
    ['assigned', 'accepted', 'arrived_at_pickup'].includes(item.status),
  );

  async function loadDispatches() {
    if (
      !shouldUseApi() ||
      !navigator.onLine ||
      document.visibilityState !== 'visible'
    ) return;

    setDispatchLoading(true);
    try {
      const payload = await riderApi.activeDispatches();
      setDispatches(
        (payload.dispatches || []).filter((offer) => offer.status === 'offered'),
      );
      setDispatchError('');
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 403) {
        const payload = requestError.payload as {
          error?: { details?: Array<{ message?: string }> };
          details?: Array<{ message?: string }>;
        } | null;
        const reasons = payload?.error?.details || payload?.details || [];
        setDispatchError(
          reasons.map((reason) => reason.message).filter(Boolean).join(' ') ||
          'Complete rider verification before accepting jobs.',
        );
      } else {
        setDispatchError('Unable to load new jobs. Please try again.');
      }
    } finally {
      setDispatchLoading(false);
    }
  }

  useEffect(() => {
    void loadDispatches();
    const refreshOnFocus = () => void loadDispatches();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadDispatches();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const interval = window.setInterval(() => void loadDispatches(), 10000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  async function acceptDispatch(dispatchId: string) {
    setDispatchAction(dispatchId);
    try {
      await riderApi.acceptDispatch(dispatchId);
      setDispatches((current) => current.filter((offer) => offer.id !== dispatchId));
      await refresh();
      await loadDispatches();
      setDispatchError('');
    } catch (requestError) {
      setDispatchError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'This job could not be accepted. Refresh and try again.',
      );
    } finally {
      setDispatchAction('');
    }
  }

  async function rejectDispatch(dispatchId: string) {
    setDispatchAction(dispatchId);
    try {
      await riderApi.rejectDispatch(dispatchId, 'Rider unavailable for this batch.');
      await loadDispatches();
      setDispatchError('');
    } catch {
      setDispatchError('This job could not be declined. Please try again.');
    } finally {
      setDispatchAction('');
    }
  }

  const hasJobs = dispatches.length > 0 || assigned.length > 0;

  return (
    <div>
      <PageHeader title="New Jobs" subtitle="Accept a job, then follow the pickup and delivery steps." />

      {dispatchError && (
        <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {dispatchError}
        </div>
      )}

      {dispatches.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-950">Available now</h2>
            {dispatchLoading ? <span className="text-xs font-bold text-slate-400">Refreshing</span> : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {dispatches.map((offer) => {
              const batch = offer.batch;
              const pickupTasks = batch?.pickupTasks || [];
              const remainingMinutes = offer.remainingSeconds != null
                ? Math.max(0, Math.ceil(offer.remainingSeconds / 60))
                : null;
              const packageLabel = [
                batch?.packageSizeSummary,
                batch?.weightClassSummary,
                batch?.fragilitySummary,
              ].filter(Boolean).join(' · ') || 'Delivery package';

              return (
                <Card key={offer.id} className="border border-emerald-100 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Delivery job</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">
                        {batch?.pickupCount || pickupTasks.length || 1} pickup
                        {(batch?.pickupCount || pickupTasks.length || 1) === 1 ? '' : 's'}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{packageLabel}</p>
                    </div>
                    {remainingMinutes != null ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                        <FiClock className="mr-1 inline" /> {remainingMinutes} min
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2">
                    {pickupTasks.length ? pickupTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-sm font-black text-slate-800">
                          {task.pickupSequence || 1}. {task.sellerName || 'Seller'}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          <FiMapPin className="mr-1 inline" />
                          {task.pickupLocation || 'Pickup location unavailable'}
                        </p>
                        {task.sellerPhone ? (
                          <a className="mt-1 block text-xs font-bold text-emerald-700" href={`tel:${task.sellerPhone}`}>
                            <FiPhone className="mr-1 inline" /> {task.sellerPhone}
                          </a>
                        ) : null}
                      </div>
                    )) : (
                      <p className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-500">
                        Pickup details will appear after acceptance.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Button
                      icon={FiTruck}
                      disabled={dispatchAction === offer.id}
                      onClick={() => acceptDispatch(offer.id)}
                      fullWidth
                    >
                      {dispatchAction === offer.id ? 'Working...' : 'Accept'}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={FiX}
                      disabled={dispatchAction === offer.id}
                      onClick={() => rejectDispatch(offer.id)}
                      fullWidth
                    >
                      Decline
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {assigned.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-black text-slate-950">Assigned to you</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {assigned.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        </section>
      )}

      {!hasJobs && !dispatchLoading && !dispatchError ? (
        <EmptyState
          icon={FiTruck}
          title="No new jobs"
          message="Keep the rider app open. New jobs appear automatically."
        />
      ) : null}
    </div>
  );
}
