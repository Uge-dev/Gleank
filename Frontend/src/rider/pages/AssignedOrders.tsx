import { FiClock, FiCopy, FiInfo, FiMap, FiMapPin, FiPhone, FiTruck, FiX } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import { useRiderData } from '../context/RiderDataContext';
import AssignmentCard from '../components/rider/AssignmentCard';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import { shouldUseApi } from '../config/env';
import { ApiClientError } from '../services/apiClient';
import { riderApi } from '../services/riderApi';
import type { RiderDispatchOffer } from '../services/riderApi';
import { apiUrl } from '../../lib/api';

export default function AssignedOrders() {
  const { assignments, refresh } = useRiderData();
  const [dispatches, setDispatches] = useState<RiderDispatchOffer[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchAction, setDispatchAction] = useState('');
  const [dispatchError, setDispatchError] = useState('');
  const [detailOffer, setDetailOffer] = useState<RiderDispatchOffer | null>(null);
  const [copiedPhone, setCopiedPhone] = useState('');
  const assigned = assignments.filter((item) =>
    ['assigned', 'accepted', 'arrived_at_pickup'].includes(item.status),
  );

  async function loadDispatches() {
    if (
      !shouldUseApi() ||
      !navigator.onLine
    ) return;

    setDispatchLoading(true);
    try {
      const payload = await riderApi.activeDispatches();
      const nextDispatches = (payload.dispatches || []).filter(
        (offer) => offer.status === 'offered',
      );
      setDispatches(nextDispatches);
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
    const interval = window.setInterval(() => void loadDispatches(), 20000);
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
                        {typeof task.distanceToPickupKm === 'number' ? (
                          <p className="mt-1 text-xs font-black text-cyan-700">
                            {task.distanceToPickupKm.toFixed(1)} km from your current location
                          </p>
                        ) : null}
                        {task.sellerPhone ? (
                          <a className="mt-1 block text-xs font-bold text-emerald-700" href={`tel:${task.sellerPhone}`}>
                            <FiPhone className="mr-1 inline" /> {task.sellerPhone}
                          </a>
                        ) : null}
                        {typeof task.pickupPoint?.lat === 'number' && typeof task.pickupPoint?.lng === 'number' ? (
                          <a
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-slate-800 shadow-sm"
                            href={`https://www.google.com/maps/dir/?api=1&destination=${task.pickupPoint.lat},${task.pickupPoint.lng}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FiMap /> Open seller map
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
                      variant="secondary"
                      icon={FiInfo}
                      onClick={() => setDetailOffer(offer)}
                      className="sm:col-span-2"
                      fullWidth
                    >
                      Order Details
                    </Button>
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

      <Modal
        open={Boolean(detailOffer)}
        title="Order details"
        message="Review the product and seller pickup information before accepting."
        cancelLabel="Close"
        onClose={() => {
          setDetailOffer(null);
          setCopiedPhone('');
        }}
      >
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {(detailOffer?.batch?.pickupTasks || []).map((task) => {
            const phone = task.sellerPhone || '';
            const image = task.firstProduct?.imageUrl
              ? apiUrl(task.firstProduct.imageUrl)
              : '';
            return (
              <article key={task.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex gap-3">
                  {image ? (
                    <img
                      src={image}
                      alt={task.firstProduct?.name || 'Product'}
                      className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-slate-400">
                      Product
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-black text-slate-950">
                      {task.firstProduct?.name || 'Delivery product'}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Qty {task.firstProduct?.quantity || 1}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black uppercase text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        {task.packageSize || detailOffer?.batch?.packageSizeSummary || 'size pending'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        {task.packageWeightClass || detailOffer?.batch?.weightClassSummary || 'weight pending'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        {task.handlingClass || detailOffer?.batch?.fragilitySummary || 'normal handling'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-black text-slate-900">{task.sellerName || 'Seller'}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    <FiMapPin className="mr-1 inline" />
                    {task.pickupLocation || 'Pickup location unavailable'}
                  </p>
                  {typeof task.distanceToPickupKm === 'number' ? (
                    <p className="mt-2 text-sm font-black text-cyan-700">
                      {task.distanceToPickupKm.toFixed(1)} km away now
                    </p>
                  ) : null}
                  {typeof task.pickupPoint?.lat === 'number' && typeof task.pickupPoint?.lng === 'number' ? (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${task.pickupPoint.lat},${task.pickupPoint.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800"
                    >
                      <FiMap /> Open map to seller
                    </a>
                  ) : null}
                  {phone ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${phone}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white"
                      >
                        <FiPhone /> Call seller
                      </a>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                        onClick={() => {
                          void navigator.clipboard?.writeText(phone);
                          setCopiedPhone(phone);
                        }}
                      >
                        <FiCopy /> {copiedPhone === phone ? 'Copied' : 'Copy phone'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
