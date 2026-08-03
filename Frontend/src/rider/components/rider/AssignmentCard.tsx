import {
  FiClock,
  FiMap,
  FiMapPin,
  FiMessageCircle,
  FiNavigation,
  FiPhoneCall,
  FiTruck,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { PrivateAssignment } from '../../types';
import { formatDateTime } from '../../utils/format';
import { useRiderData } from '../../context/RiderDataContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import StatusBadge from '../ui/StatusBadge';

export default function AssignmentCard({ assignment }: { assignment: PrivateAssignment }) {
  const navigate = useNavigate();
  const { startDelivery } = useRiderData();
  const { rider } = useAuth();
  const [contactOpen, setContactOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [openingChat, setOpeningChat] = useState(false);
  const telLink = `tel:${assignment.sellerPhone}`;
  const whatsAppLink = `https://wa.me/${assignment.sellerWhatsApp}`;
  const hasPickupCoordinates =
    typeof assignment.pickupLat === 'number' &&
    Number.isFinite(assignment.pickupLat) &&
    typeof assignment.pickupLng === 'number' &&
    Number.isFinite(assignment.pickupLng);
  const riderPoint = rider?.currentLocation;
  const distanceKm = hasPickupCoordinates && riderPoint
    ? haversineDistanceKm(
        riderPoint.lat,
        riderPoint.lng,
        Number(assignment.pickupLat),
        Number(assignment.pickupLng),
      )
    : null;
  const dispatchRemainingLabel = assignment.dispatchRemainingSeconds != null
    ? `${Math.ceil(assignment.dispatchRemainingSeconds / 60)} min left`
    : assignment.dispatchExpiresAt
      ? `Until ${formatDateTime(assignment.dispatchExpiresAt)}`
      : '';

  async function handleStartDelivery() {
    if (assignment.status !== 'assigned') {
      setConfirmOpen(false);
      navigate(`/rider/verify/${assignment.id}`);
      return;
    }

    setSubmitting(true);
    setActionError('');
    try {
      await startDelivery(assignment.id);
      setConfirmOpen(false);
      navigate(`/rider/verify/${assignment.id}`);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'This delivery could not be accepted.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function openSellerChat() {
    setActionError('');
    setOpeningChat(true);
    setContactOpen(false);
    navigate(`/rider/messages?assignment=${encodeURIComponent(assignment.id)}`);
    setOpeningChat(false);
  }

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={assignment.status} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600">
                {assignment.orderChannel.replace(/_/g, ' ')}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-black text-slate-950">{assignment.sellerName}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {assignment.packageSummary || assignment.category}
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-cyan-50 px-3 py-2 text-center">
            <p className="text-xs font-bold text-cyan-700">
              {distanceKm == null ? 'Distance unavailable' : `${distanceKm.toFixed(1)} km`}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <LocationRow icon={FiMapPin} label="Pickup" value={assignment.pickupLocation} />
          <LocationRow
            icon={FiNavigation}
            label="Delivery area"
            value={assignment.deliveryLocation}
            note="Full address unlocks after pickup."
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">
            Risk: {assignment.riskLevel}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5">
            <FiClock className="mr-1 inline" />
            {dispatchRemainingLabel || formatDateTime(assignment.assignedTime)}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button
            variant="secondary"
            icon={FiMap}
            disabled={!hasPickupCoordinates}
            onClick={() => navigate(`/rider/navigate/${assignment.id}`)}
            fullWidth
          >
            {hasPickupCoordinates ? 'Open seller map' : 'Map unavailable'}
          </Button>
          <Button
            variant="secondary"
            icon={FiMessageCircle}
            onClick={() => setContactOpen(true)}
            fullWidth
          >
            Message Seller
          </Button>
          <Button
            icon={FiTruck}
            onClick={() =>
              assignment.status === 'assigned'
                ? setConfirmOpen(true)
                : navigate(`/rider/verify/${assignment.id}`)
            }
            fullWidth
          >
            {assignment.status === 'assigned' ? 'Accept delivery' : 'Continue pickup'}
          </Button>
        </div>

        {actionError && (
          <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {actionError}
          </p>
        )}
      </Card>

      <Modal open={contactOpen} title="Seller contact" onClose={() => setContactOpen(false)}>
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="font-extrabold text-slate-950">{assignment.sellerName}</p>
            <p className="mt-1 text-sm text-slate-500">{assignment.sellerPhone}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              variant="secondary"
              icon={FiMessageCircle}
              disabled={openingChat}
              onClick={() => void openSellerChat()}
              fullWidth
            >
              {openingChat ? 'Opening...' : 'Message Seller'}
            </Button>
            <a href={telLink} className="flex-1">
              <Button variant="dark" icon={FiPhoneCall} fullWidth>Call</Button>
            </a>
            <a href={whatsAppLink} target="_blank" rel="noreferrer" className="flex-1">
              <Button icon={FiMessageCircle} fullWidth>WhatsApp</Button>
            </a>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        title="Accept delivery?"
        message="Accept only if you can go to the seller now."
        confirmLabel={submitting ? 'Accepting...' : 'Accept'}
        cancelLabel="Cancel"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleStartDelivery}
      />
    </>
  );
}

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLng / 2) ** 2;
  return 6_371 * 2 * Math.asin(Math.sqrt(a));
}

function LocationRow({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof FiMapPin;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
      <Icon className="mt-0.5 shrink-0 text-lg text-gleenc-cyan" />
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
        {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
      </div>
    </div>
  );
}
