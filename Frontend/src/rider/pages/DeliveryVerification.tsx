import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiCheck, FiCheckCircle, FiCreditCard, FiLock, FiPackage, FiTruck } from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import ProofUploader from '../components/rider/ProofUploader';
import StatusBadge from '../components/ui/StatusBadge';

function isPickupStage(status?: string) {
  return status === 'accepted' || status === 'arrived_at_pickup';
}

function isDeliveryStage(status?: string) {
  return status === 'package_picked_up' || status === 'out_for_delivery';
}

export default function DeliveryVerification() {
  const { assignmentId } = useParams();
  const {
    assignments,
    orders,
    verifyPickupCode,
    verifyDeliveryCode,
    completeDelivery,
    generatePayment,
    confirmOnlinePayment,
  } = useRiderData();
  const navigate = useNavigate();
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searching, setSearching] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentLink, setPaymentLink] = useState('');
  const [fileName, setFileName] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  const assignment = useMemo(() => {
    if (assignmentId) return assignments.find((item) => item.id === assignmentId);
    return (
      assignments.find((item) => isDeliveryStage(item.status)) ||
      assignments.find((item) => isPickupStage(item.status)) ||
      assignments.find((item) => item.status === 'assigned')
    );
  }, [assignments, assignmentId]);

  const order = useMemo(
    () => orders.find(
      (item) => item.assignmentId === assignment?.id || item.id === assignment?.orderId,
    ),
    [assignment?.id, assignment?.orderId, orders],
  );

  const mode = isDeliveryStage(assignment?.status) ? 'delivery' : 'pickup';
  const orderId = order?.id || assignment?.orderId || '';
  const deliveryCodeVerified = Boolean(
    order?.buyerDeliveryCodeVerifiedAt || assignment?.buyerDeliveryCodeVerifiedAt,
  );
  const paymentWaiting =
    mode === 'delivery' &&
    order?.paymentMethod === 'pay_on_delivery' &&
    order.paymentStatus !== 'paid';
  const needsCode = mode === 'pickup' || (mode === 'delivery' && !deliveryCodeVerified);
  const needsProof = mode === 'pickup' || (mode === 'delivery' && deliveryCodeVerified);
  const canSubmit = Boolean(
    assignment &&
    (!needsCode || verificationCode.length >= 6) &&
    (!needsProof || proofFile) &&
    !paymentWaiting &&
    !searching,
  );

  async function handlePaymentLink() {
    if (!orderId) return;
    setError('');
    setNotice('');
    setPaymentLoading(true);
    try {
      const result = await generatePayment(orderId);
      setPaymentLink(result.paymentLink);
      setNotice('Payment link is ready.');
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : 'Payment link could not be prepared.',
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleRefreshPayment() {
    if (!orderId) return;
    setError('');
    setNotice('');
    setPaymentLoading(true);
    try {
      await confirmOnlinePayment(orderId);
      setNotice('Payment status refreshed.');
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : 'Payment status could not be refreshed.',
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!assignment) {
      setError('No active delivery found.');
      return;
    }
    if (assignment.status === 'assigned') {
      setError('Accept the delivery first.');
      return;
    }
    if (!orderId) {
      setError('Delivery details are not ready. Refresh and try again.');
      return;
    }
    if (needsCode && verificationCode.length < 6) {
      setError(`Enter the 6-digit ${mode === 'delivery' ? 'buyer' : 'seller'} code.`);
      return;
    }
    if (paymentWaiting) {
      setError('Buyer payment must be confirmed first.');
      return;
    }
    if (needsProof && !proofFile) {
      setError(`Upload ${mode === 'delivery' ? 'delivery' : 'pickup'} proof.`);
      return;
    }

    setSearching(true);
    const result =
      mode === 'delivery'
        ? deliveryCodeVerified
          ? await completeDelivery(
              orderId,
              '',
              proofFile,
              proofNote,
              locationLabel || assignment.deliveryLocation,
            )
          : await verifyDeliveryCode(orderId, verificationCode)
        : await verifyPickupCode(
            verificationCode,
            assignment.id,
            proofFile,
            proofNote,
            locationLabel || assignment.pickupLocation,
          );
    setSearching(false);

    if (!result.ok) {
      setError(result.message || 'Verification could not be completed.');
      return;
    }

    if (mode === 'pickup') {
      navigate(result.order ? `/rider/delivery/${result.order.id}` : '/rider/active');
      return;
    }

    if (!deliveryCodeVerified) {
      setVerificationCode('');
      setNotice('Buyer code verified. Add delivery proof to finish.');
      return;
    }

    navigate('/rider/completed');
  }

  const title = !assignment
    ? 'Verify Delivery'
    : mode === 'delivery'
      ? deliveryCodeVerified
        ? 'Complete Delivery'
        : 'Buyer Code'
      : 'Pickup Code';

  return (
    <div>
      <PageHeader title={title} />

      <Card className="mx-auto max-w-2xl p-5 md:p-7">
        <div className="grid grid-cols-2 gap-2">
          <ProgressStep
            done={mode === 'delivery'}
            active={mode === 'pickup'}
            icon={FiPackage}
            label="1. Pickup"
          />
          <ProgressStep
            done={deliveryCodeVerified}
            active={mode === 'delivery'}
            icon={FiTruck}
            label="2. Deliver"
          />
        </div>

        {!assignment ? (
          <div className="py-10 text-center">
            <FiLock className="mx-auto text-4xl text-slate-300" />
            <h2 className="mt-4 text-xl font-black text-slate-950">No active delivery</h2>
            <Link to="/rider/assigned" className="mt-4 inline-block">
              <Button>View new jobs</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={assignment.status} />
                <span className="text-sm font-black text-slate-950">{assignment.sellerName}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                {mode === 'delivery'
                  ? order?.deliveryAddress || assignment.deliveryLocation
                  : assignment.pickupLocation}
              </p>
            </div>

            {paymentWaiting ? (
              <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="font-black text-amber-900">Payment required</p>
                <p className="mt-1 text-sm text-amber-700">
                  Buyer must pay through Gleenc before handover.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    icon={FiCreditCard}
                    onClick={handlePaymentLink}
                    disabled={paymentLoading}
                    fullWidth
                  >
                    Get payment link
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRefreshPayment}
                    disabled={paymentLoading}
                    fullWidth
                  >
                    Check payment
                  </Button>
                </div>
                {paymentLink ? (
                  <a
                    className="mt-3 block truncate rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700"
                    href={paymentLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open payment link
                  </a>
                ) : null}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {needsCode ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {mode === 'delivery' ? 'Buyer delivery code' : 'Seller pickup code'}
                  </span>
                  <input
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    inputMode="numeric"
                    placeholder="000000"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[0.35em] text-slate-950 outline-none focus:border-gleenc-cyan focus:bg-white"
                  />
                </label>
              ) : null}

              {needsProof ? (
                <ProofUploader
                  fileName={fileName}
                  note={proofNote}
                  locationLabel={locationLabel}
                  onFileNameChange={setFileName}
                  onFileChange={setProofFile}
                  onNoteChange={setProofNote}
                  onLocationChange={setLocationLabel}
                  compact
                  required
                />
              ) : null}

              {notice ? (
                <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
                  {error}
                </p>
              ) : null}

              <Button
                icon={mode === 'delivery' ? FiCheckCircle : FiPackage}
                size="lg"
                disabled={!canSubmit}
                fullWidth
              >
                {searching
                  ? 'Working...'
                  : mode === 'delivery'
                    ? deliveryCodeVerified
                      ? 'Complete Delivery'
                      : 'Verify Buyer Code'
                    : 'Confirm Pickup'}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs font-semibold text-slate-400">
              Enter codes only when the seller or buyer gives them to you in person.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function ProgressStep({
  done,
  active,
  icon: Icon,
  label,
}: {
  done: boolean;
  active: boolean;
  icon: typeof FiPackage;
  label: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-2 rounded-2xl p-3 text-sm font-black ${
      done
        ? 'bg-emerald-50 text-emerald-700'
        : active
          ? 'bg-slate-950 text-white'
          : 'bg-slate-100 text-slate-400'
    }`}>
      {done ? <FiCheck /> : <Icon />}
      {label}
    </div>
  );
}
