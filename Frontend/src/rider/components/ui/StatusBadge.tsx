import type { AssignmentStatus, Availability, CashReconciliationStatus, PaymentStatus, RiderStatus, VerificationStatus } from '../../types';
import { cashReconciliationLabel, deliveryStatusLabel, paymentStatusLabel, riderStatusLabel, verificationStatusLabel } from '../../utils/status';

type StatusValue =
  | AssignmentStatus
  | PaymentStatus
  | RiderStatus
  | Availability
  | VerificationStatus
  | CashReconciliationStatus
  | 'under_review'
  | 'needs_information'
  | 'expired'
  | 'restricted'
  | 'active'
  | 'in_progress'
  | 'superseded'
  | 'Delivered'
  | 'PAID'
  | 'UNPAID';

const classes: Record<string, string> = {
  assigned: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  accepted: 'bg-blue-50 text-blue-700 border-blue-100',
  arrived_at_pickup: 'bg-violet-50 text-violet-700 border-violet-100',
  package_picked_up: 'bg-amber-50 text-amber-700 border-amber-100',
  out_for_delivery: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  failed: 'bg-rose-50 text-rose-700 border-rose-100',
  disputed: 'bg-orange-50 text-orange-700 border-orange-100',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  unpaid: 'bg-rose-50 text-rose-700 border-rose-100',
  paid_cash: 'bg-lime-50 text-lime-700 border-lime-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  suspended: 'bg-rose-50 text-rose-700 border-rose-100',
  rejected: 'bg-rose-50 text-rose-700 border-rose-100',
  online: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  offline: 'bg-slate-100 text-slate-600 border-slate-200',
  not_submitted: 'bg-slate-100 text-slate-600 border-slate-200',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-100',
  not_required: 'bg-slate-100 text-slate-600 border-slate-200',
  submitted: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  under_review: 'bg-blue-50 text-blue-700 border-blue-100',
  needs_information: 'bg-amber-50 text-amber-700 border-amber-100',
  expired: 'bg-orange-50 text-orange-700 border-orange-100',
  restricted: 'bg-orange-50 text-orange-700 border-orange-100',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  in_progress: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  superseded: 'bg-slate-100 text-slate-600 border-slate-200',
  Delivered: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  UNPAID: 'bg-rose-50 text-rose-700 border-rose-100'
};

function label(value: StatusValue | string) {
  if (['assigned', 'accepted', 'arrived_at_pickup', 'package_picked_up', 'out_for_delivery', 'delivered', 'failed', 'disputed'].includes(value)) {
    return deliveryStatusLabel(value as AssignmentStatus);
  }
  if (['paid', 'unpaid', 'paid_cash'].includes(value)) {
    return paymentStatusLabel(value as PaymentStatus);
  }
  if (['not_submitted', 'pending_review'].includes(value)) {
    return verificationStatusLabel(value as VerificationStatus);
  }
  if (['pending', 'approved', 'suspended', 'rejected'].includes(value)) {
    return riderStatusLabel(value as RiderStatus);
  }
  if (['not_required', 'submitted'].includes(value)) {
    return cashReconciliationLabel(value as CashReconciliationStatus);
  }
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function StatusBadge({ value, pulse = false }: { value: StatusValue | string; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${classes[value] || classes.assigned}`}>
      {pulse && <span className="h-2 w-2 rounded-full bg-current animate-pulse" />}
      {label(value)}
    </span>
  );
}
