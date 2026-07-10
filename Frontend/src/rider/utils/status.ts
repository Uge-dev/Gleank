import type { AssignmentStatus, CashReconciliationStatus, PaymentStatus, RiderStatus, VerificationStatus } from '../types';

export function deliveryStatusLabel(status: AssignmentStatus): string {
  const labels: Record<AssignmentStatus, string> = {
    assigned: 'Assigned',
    accepted: 'Accepted',
    arrived_at_pickup: 'At Pickup',
    package_picked_up: 'Package Picked Up',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    failed: 'Failed',
    disputed: 'Disputed'
  };
  return labels[status];
}

export function paymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    paid: 'PAID',
    unpaid: 'UNPAID',
    paid_cash: 'PAID (Platform Confirmed)'
  };
  return labels[status];
}

export function verificationStatusLabel(status: VerificationStatus): string {
  const labels: Record<VerificationStatus, string> = {
    not_submitted: 'Not Submitted',
    pending_review: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected'
  };
  return labels[status];
}

export function riderStatusLabel(status: RiderStatus): string {
  const labels: Record<RiderStatus, string> = {
    pending: 'Pending',
    approved: 'Approved',
    suspended: 'Suspended',
    rejected: 'Rejected'
  };
  return labels[status];
}

export function cashReconciliationLabel(status: CashReconciliationStatus): string {
  const labels: Record<CashReconciliationStatus, string> = {
    not_required: 'Not Required',
    pending: 'Pending',
    submitted: 'Submitted',
    approved: 'Approved'
  };
  return labels[status];
}
