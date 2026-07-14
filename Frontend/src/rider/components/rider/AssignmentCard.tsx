import { FiClock, FiMapPin, FiMessageCircle, FiNavigation, FiPhoneCall, FiShield, FiTruck } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { PrivateAssignment } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { useRiderData } from '../../context/RiderDataContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import StatusBadge from '../ui/StatusBadge';

export default function AssignmentCard({ assignment }: { assignment: PrivateAssignment }) {
  const navigate = useNavigate();
  const { startDelivery } = useRiderData();
  const [contactOpen, setContactOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const telLink = `tel:${assignment.sellerPhone}`;
  const whatsAppLink = `https://wa.me/${assignment.sellerWhatsApp}`;
  const dispatchWindowLabel = assignment.dispatchTimeoutMinutes
    ? `${assignment.dispatchTimeoutMinutes} min`
    : assignment.dispatchTimeoutSeconds
      ? `${Math.round(assignment.dispatchTimeoutSeconds / 60)} min`
      : '';
  const dispatchRemainingLabel = assignment.dispatchRemainingSeconds != null
    ? `${Math.ceil(assignment.dispatchRemainingSeconds / 60)} min left`
    : assignment.dispatchExpiresAt
      ? `Expires ${formatDateTime(assignment.dispatchExpiresAt)}`
      : '';

  async function handleStartDelivery() {
    setSubmitting(true);
    await startDelivery(assignment.id);
    setSubmitting(false);
    setConfirmOpen(false);
    navigate(`/rider/verify/${assignment.id}`);
  }

  return (
    <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} whileHover={{ y: -3 }}>
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">{assignment.category}</span>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-extrabold text-cyan-700">{assignment.orderChannel.replace(/_/g, ' ')}</span>
              {dispatchWindowLabel && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-700">
                  Accept within {dispatchWindowLabel}
                </span>
              )}
              <StatusBadge value={assignment.status} />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-950">{assignment.sellerName}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{assignment.marketName || 'Campus / nearby seller'} · Seller rating {assignment.sellerRating.toFixed(1)}</p>
          </div>
          <div className="rounded-2xl bg-cyan-50 px-4 py-3 text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Distance</p>
            <p className="text-lg font-black text-slate-950">{assignment.distanceKm} km</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex gap-3">
              <FiMapPin className="mt-0.5 text-lg text-gleenc-cyan" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pickup Location</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{assignment.pickupLocation}</p>
                {assignment.pickupLandmark && <p className="mt-1 text-xs text-slate-500">{assignment.pickupLandmark}</p>}
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex gap-3">
              <FiNavigation className="mt-0.5 text-lg text-gleenc-green" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Delivery Area</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{assignment.deliveryLocation}</p>
                <p className="mt-1 text-xs text-slate-500">Full address unlocks after seller pickup OTP.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-3 text-sm font-bold text-slate-600 shadow-sm">Value: {formatCurrency(assignment.orderValue)}</div>
          <div className="rounded-2xl bg-white p-3 text-sm font-bold text-slate-600">Risk: <span className={assignment.riskLevel === 'high' ? 'text-rose-600' : assignment.riskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600'}>{assignment.riskLevel}</span></div>
          <div className="rounded-2xl bg-white p-3 text-sm font-bold text-slate-600">OTP: pickup + delivery</div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-500">
          <span className="inline-flex items-center gap-2"><FiClock /> Assigned {formatDateTime(assignment.assignedTime)}</span>
          {dispatchRemainingLabel && assignment.status === 'assigned' && (
            <span className="inline-flex items-center gap-2 text-amber-700"><FiClock /> Dispatch window: {dispatchRemainingLabel}</span>
          )}
          <span className="inline-flex items-center gap-2"><FiTruck /> ETA {formatDateTime(assignment.expectedDeliveryTime)}</span>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          <FiShield className="mr-2 inline" /> Security mode active: customer identity, full delivery address, product list, price breakdown, and payment details remain hidden until seller pickup OTP and proof are recorded.
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" icon={FiMessageCircle} onClick={() => setContactOpen(true)} fullWidth>Contact Seller</Button>
          <Button icon={FiTruck} onClick={() => setConfirmOpen(true)} fullWidth>{assignment.status === 'assigned' ? 'Accept & Verify Pickup' : 'Continue Pickup'}</Button>
        </div>
      </Card>

      <Modal open={contactOpen} title="Seller Contact" message="Use these options only for locating the seller and collecting the package. Keep order discussions inside Gleenc support where possible." onClose={() => setContactOpen(false)}>
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Seller</p>
            <p className="mt-1 font-extrabold text-slate-950">{assignment.sellerName}</p>
            <p className="mt-1 text-sm text-slate-500">{assignment.sellerPhone}</p>
          </div>
          <div className="flex gap-3">
            <a href={telLink} className="flex-1"><Button variant="dark" icon={FiPhoneCall} fullWidth>Call</Button></a>
            <a href={whatsAppLink} target="_blank" rel="noreferrer" className="flex-1"><Button variant="primary" icon={FiMessageCircle} fullWidth>WhatsApp</Button></a>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        title="Accept Assignment"
        message="Accept this delivery only if you can go to the seller now. You must verify seller pickup OTP and record proof before full order details unlock."
        confirmLabel={submitting ? 'Accepting...' : 'Accept & Proceed'}
        cancelLabel="Cancel"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleStartDelivery}
      />
    </motion.div>
  );
}
