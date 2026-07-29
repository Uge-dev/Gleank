import { FiClock, FiMapPin, FiPhone, FiShield, FiTruck, FiX } from 'react-icons/fi';
import { useEffect, useMemo, useState } from 'react';
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
import { formatDateTime } from '../utils/format';

const categories = ['All', 'Food', 'Groceries', 'Fashion', 'Electronics', 'Books', 'Health', 'Beauty', 'Household', 'Used Items', 'Others'];
const channels = ['All', 'campus', 'physical_market', 'nearby_market', 'used_market'];

export default function AssignedOrders() {
  const { assignments, refresh } = useRiderData();
  const [category, setCategory] = useState('All');
  const [channel, setChannel] = useState('All');
  const [dispatches, setDispatches] = useState<RiderDispatchOffer[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchAction, setDispatchAction] = useState('');
  const [dispatchError, setDispatchError] = useState('');
  const assigned = assignments.filter((item) => ['assigned', 'accepted', 'arrived_at_pickup'].includes(item.status));
  const filtered = useMemo(() => {
    return assigned.filter((item) => {
      const categoryOk = category === 'All' || item.category === category;
      const channelOk = channel === 'All' || item.orderChannel === channel;
      return categoryOk && channelOk;
    });
  }, [assigned, category, channel]);

  async function loadDispatches() {
    if (!shouldUseApi()) return;
    setDispatchLoading(true);
    try {
      const payload = await riderApi.activeDispatches();
      setDispatches(
        (payload.dispatches || []).filter((offer) => offer.status === "offered"),
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
          'Dispatch access is restricted. Open Verification Center to see the exact requirement that needs attention.'
        );
      } else {
        setDispatchError('Unable to load dispatch offers right now. Please try again.');
      }
    } finally {
      setDispatchLoading(false);
    }
  }

  useEffect(() => {
    loadDispatches();
    const refreshOnFocus = () => void loadDispatches();
    window.addEventListener('focus', refreshOnFocus);
    const interval = window.setInterval(loadDispatches, 10000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, []);

  async function acceptDispatch(dispatchId: string) {
    setDispatchAction(dispatchId);
    try {
      await riderApi.acceptDispatch(dispatchId);
      await refresh();
      await loadDispatches();
      setDispatchError('');
    } catch (requestError) {
      setDispatchError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'This dispatch could not be accepted. Refresh the page and try again.',
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
      setDispatchError('This dispatch could not be rejected. Please refresh and try again.');
    } finally {
      setDispatchAction('');
    }
  }

  return (
    <div>
      <PageHeader
        title="Assigned Orders"
        subtitle="Gleenc dispatch offers and private delivery tasks. Customer/order/payment details remain locked until pickup OTP and proof are recorded."
      />

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gleenc-green">Gleenc dispatch</p>
            <h2 className="text-xl font-black text-slate-950">Batch offers waiting for you</h2>
          </div>
          {dispatchLoading && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">Refreshing</span>}
        </div>
        {dispatchError && <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{dispatchError}</div>}
        {!dispatchLoading && !dispatchError && dispatches.length === 0 && (
          <EmptyState icon={FiTruck} title="No dispatch offers available right now" message="Keep your availability online. New seller-ready orders will appear here automatically." />
        )}
        {dispatches.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {dispatches.map((offer) => {
              const batch = offer.batch;
              const pickupTasks = batch?.pickupTasks || [];
              const remainingMinutes = offer.remainingSeconds != null ? Math.max(0, Math.ceil(offer.remainingSeconds / 60)) : null;
              const packageLabel = [batch?.packageSizeSummary, batch?.weightClassSummary, batch?.fragilitySummary].filter(Boolean).join(' · ') || 'Mixed package';
              return (
                <Card key={offer.id} className="border border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50 p-5">
                  <div className="flex flex-col justify-between gap-4 md:flex-row">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase text-emerald-700">{batch?.batchType?.replace(/_/g, ' ') || 'Delivery batch'}</span>
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase text-white">Score {offer.dispatchScore}</span>
                        {remainingMinutes != null && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">{remainingMinutes} min left</span>}
                      </div>
                      <h3 className="mt-4 text-xl font-black text-slate-950">{batch?.pickupCount || pickupTasks.length || 1} pickup batch</h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">{packageLabel}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Dispatch privacy</p>
                      <p className="text-sm font-black text-slate-950">No payment details shown</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><FiMapPin /> Pickup sequence</p>
                      <div className="mt-3 space-y-2">
                        {pickupTasks.length ? pickupTasks.slice(0, 4).map((task) => (
                          <div key={task.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                            <p>#{task.pickupSequence || 1} {task.sellerName || 'Seller'}</p>
                            <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                              <FiMapPin /> {task.pickupLocation || 'Pickup location unavailable'}
                            </p>
                            {task.sellerPhone ? (
                              <a
                                className="mt-1 flex items-center gap-2 text-xs text-emerald-700"
                                href={`tel:${task.sellerPhone}`}
                              >
                                <FiPhone /> {task.sellerPhone}
                              </a>
                            ) : null}
                          </div>
                        )) : (
                          <p className="text-sm font-bold text-slate-500">Seller pickup information is unavailable.</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><FiTruck /> Dispatch rules</p>
                      <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
                        <p>Vehicle: {batch?.requiredVehicleType?.replace(/_/g, ' ') || 'compatible rider'}</p>
                        <p>Risk: <span className={batch?.riskLevel === 'high' ? 'text-rose-600' : 'text-emerald-600'}>{batch?.riskLevel || 'normal'}</span></p>
                        <p>GPS proof: {batch?.requiresGps ? 'Required' : 'Optional / zone fallback'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold text-slate-500">
                    <span className="inline-flex items-center gap-2"><FiClock /> Offered {offer.offeredAt ? formatDateTime(offer.offeredAt) : 'now'}</span>
                    {offer.expiresAt && <span className="inline-flex items-center gap-2 text-amber-700"><FiClock /> Expires {formatDateTime(offer.expiresAt)}</span>}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Button
                      icon={FiTruck}
                      disabled={dispatchAction === offer.id}
                      onClick={() => acceptDispatch(offer.id)}
                      fullWidth
                    >
                      {dispatchAction === offer.id ? 'Working...' : 'Accept batch'}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={FiX}
                      disabled={dispatchAction === offer.id}
                      onClick={() => rejectDispatch(offer.id)}
                      fullWidth
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="mb-4 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {channels.map((item) => (
            <button
              key={item}
              onClick={() => setChannel(item)}
              className={`rounded-full px-4 py-2 text-sm font-bold capitalize transition-all ${channel === item ? 'bg-slate-950 text-white' : 'bg-white text-slate-500 hover:text-slate-950'}`}
            >
              {item.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-5 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${category === item ? 'bg-gleenc-gradient text-gleenc-dark' : 'bg-white text-slate-500 hover:text-slate-950'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FiShield} title="No private assignments" message="No seller-assigned delivery tasks are currently waiting in this category/channel." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {filtered.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}
        </div>
      )}
    </div>
  );
}
