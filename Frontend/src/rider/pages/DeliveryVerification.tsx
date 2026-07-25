import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCamera, FiCheckCircle, FiCreditCard, FiLock, FiPackage, FiSearch, FiShield } from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import ProofUploader from '../components/rider/ProofUploader';
import SecurityChecklist from '../components/rider/SecurityChecklist';
import StatusBadge from '../components/ui/StatusBadge';

function isPickupStage(status?: string) {
  return status === 'accepted' || status === 'arrived_at_pickup';
}

function isDeliveryStage(status?: string) {
  return status === 'package_picked_up' || status === 'out_for_delivery';
}

export default function DeliveryVerification() {
  const { assignmentId } = useParams();
  const { assignments, orders, verifyPickupCode, verifyDeliveryCode, completeDelivery, generatePayment, confirmOnlinePayment } = useRiderData();
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
    () => orders.find((item) => item.assignmentId === assignment?.id || item.id === assignment?.orderId),
    [assignment?.id, assignment?.orderId, orders],
  );

  const mode = isDeliveryStage(assignment?.status) ? 'delivery' : 'pickup';
  const orderId = order?.id || assignment?.orderId || '';
  const deliveryCodeVerified = Boolean(order?.buyerDeliveryCodeVerifiedAt || assignment?.buyerDeliveryCodeVerifiedAt);
  const paymentWaiting = mode === 'delivery' && order?.paymentMethod === 'pay_on_delivery' && order.paymentStatus !== 'paid';
  const needsCode = mode === 'pickup' || (mode === 'delivery' && !deliveryCodeVerified);
  const needsProof = mode === 'pickup' || (mode === 'delivery' && deliveryCodeVerified);
  const canSubmit = Boolean(assignment && (!needsCode || verificationCode.length >= 6) && (!needsProof || proofFile) && !paymentWaiting && !searching);

  async function handlePaymentLink() {
    if (!orderId) return;
    setError('');
    setNotice('');
    setPaymentLoading(true);
    try {
      const result = await generatePayment(orderId);
      setPaymentLink(result.paymentLink);
      setNotice('Payment link prepared. Let the buyer pay with Gleenc/Paystack, then refresh payment before verifying their delivery code.');
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Payment link could not be prepared.');
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
      setNotice('Payment status refreshed. If payment is confirmed, buyer code verification will unlock.');
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Payment status could not be refreshed.');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!assignment) {
      setError('No active delivery was found for this rider account.');
      return;
    }
    if (assignment.status === 'assigned') {
      setError('Accept the delivery assignment first, then return here to verify the seller pickup code.');
      return;
    }
    if (!orderId) {
      setError('Active delivery order could not be found. Refresh the rider dashboard and try again.');
      return;
    }
    if (needsCode && verificationCode.length < 6) {
      setError(mode === 'delivery' ? 'Enter the 6-digit buyer delivery code.' : 'Enter the 6-digit seller pickup code.');
      return;
    }
    if (paymentWaiting) {
      setError('Buyer payment must be confirmed before the delivery code can be verified.');
      return;
    }
    if (needsProof && !proofFile) {
      setError(mode === 'delivery' ? 'Upload delivery proof photo before completing delivery.' : 'Upload pickup proof photo before verifying seller pickup.');
      return;
    }

    setSearching(true);
    const result =
      mode === 'delivery'
        ? deliveryCodeVerified
          ? await completeDelivery(orderId, '', proofFile, proofNote, locationLabel || assignment.deliveryLocation)
          : await verifyDeliveryCode(orderId, verificationCode)
        : await verifyPickupCode(verificationCode, assignment.id, proofFile, proofNote, locationLabel || assignment.pickupLocation);
    setSearching(false);

    if (!result.ok) {
      setError(result.message || 'Code verification could not be completed.');
      return;
    }

    if (mode === 'pickup') {
      navigate(result.order ? `/rider/delivery/${result.order.id}` : '/rider/active');
      return;
    }

    if (!deliveryCodeVerified) {
      setVerificationCode('');
      setNotice('Buyer delivery code verified. Upload delivery proof photo to complete this order.');
      return;
    }

    navigate('/rider/completed');
  }

  return (
    <div>
      <PageHeader title="Verify Code" subtitle="One protected page for seller pickup code first, then buyer delivery code and proof at handover." />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="flex min-h-[58vh] items-center justify-center">
          <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-2xl">
            <Card className="p-7 text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[2rem] bg-cyan-50 text-gleenc-cyan">
                {mode === 'delivery' ? <FiCheckCircle className="text-4xl" /> : <FiLock className="text-4xl" />}
              </div>
              <h1 className="mt-6 text-3xl font-black text-slate-950">
                {!assignment ? 'No Active Delivery' : mode === 'delivery' ? 'Verify Buyer Delivery' : 'Verify Seller Pickup'}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
                {!assignment
                  ? 'Accept an assigned order first. Once accepted, this page will guide you through pickup and delivery verification.'
                  : mode === 'delivery'
                    ? deliveryCodeVerified
                      ? 'Buyer code is verified. Upload handover proof to mark this order delivered.'
                      : 'Buyer delivery code is only accepted after payment is confirmed. Gleenc never displays the buyer code to riders.'
                    : 'Ask the seller for the pickup code. Add a package proof photo/note before leaving the pickup point.'}
              </p>

              {assignment && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={assignment.status} />
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600">{assignment.orderChannel.replace(/_/g, ' ')}</span>
                    {deliveryCodeVerified && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">Buyer code verified</span>}
                  </div>
                  <p className="mt-3 font-extrabold text-slate-950">{assignment.sellerName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {mode === 'delivery' ? order?.deliveryAddress || assignment.deliveryLocation : assignment.pickupLocation}
                  </p>
                  {order?.products?.[0]?.name && (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                      <FiPackage /> Package: {order.products[0].name}
                    </p>
                  )}
                </div>
              )}

              {paymentWaiting && (
                <div className="mt-5 rounded-[1.4rem] border border-amber-100 bg-amber-50 p-4 text-left">
                  <p className="text-sm font-black text-amber-800">Payment-on-delivery lock is active.</p>
                  <p className="mt-1 text-sm leading-6 text-amber-700">The buyer must pay through Gleenc/Paystack before their delivery code can unlock and before you can complete handover.</p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Button type="button" icon={FiCreditCard} onClick={handlePaymentLink} disabled={paymentLoading} fullWidth>
                      {paymentLoading ? 'Preparing...' : 'Prepare Payment Link'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={handleRefreshPayment} disabled={paymentLoading} fullWidth>
                      Refresh Payment
                    </Button>
                  </div>
                  {paymentLink && (
                    <a className="mt-3 block truncate rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700" href={paymentLink} target="_blank" rel="noreferrer">
                      {paymentLink}
                    </a>
                  )}
                </div>
              )}

              <form onSubmit={handleSearch} className="mt-7 space-y-5">
                {needsCode && (
                  <input
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={mode === 'delivery' ? 'Enter 6-digit Buyer Delivery Code' : 'Enter 6-digit Seller Pickup Code'}
                    className="w-full rounded-[1.4rem] border border-slate-200 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[0.35em] text-slate-950 outline-none transition focus:border-gleenc-cyan focus:bg-white"
                  />
                )}
                {needsProof && (
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
                )}
                {notice && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notice}</motion.p>}
                {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</motion.p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button icon={mode === 'delivery' ? FiCheckCircle : FiSearch} size="lg" disabled={!canSubmit} fullWidth>
                    {searching
                      ? 'Verifying...'
                      : mode === 'delivery'
                        ? deliveryCodeVerified
                          ? 'Complete Delivery'
                          : 'Verify Buyer Code'
                        : 'Verify Seller Pickup'}
                  </Button>
                  <Button type="button" variant="secondary" icon={FiCamera} size="lg" fullWidth>
                    Scan Code Soon
                  </Button>
                </div>
              </form>

              <p className="mt-6 text-xs font-semibold leading-6 text-slate-400">
                {mode === 'delivery'
                  ? 'Buyer delivery code must come from the buyer in person. It is never exposed on the rider dashboard.'
                  : 'Seller pickup code must come from the seller in person. Buyer delivery code stays locked until payment and handover.'}
              </p>
              <Link to="/rider/assigned" className="mt-4 inline-block text-sm font-bold text-slate-500 hover:text-slate-950">Back to assigned orders</Link>
            </Card>
          </motion.div>
        </div>
        <div className="space-y-5">
          <SecurityChecklist
            title="Delivery Security Rules"
            items={[
              'Accept the delivery before verifying the seller pickup code.',
              'Verify seller pickup code and capture proof before leaving the pickup point.',
              'For Pay on Delivery, confirm digital payment before buyer code verification.',
              'Verify buyer delivery code in person, then upload proof photo before completion.',
              'Never reveal buyer private codes or use screenshots as proof of handover.'
            ]}
          />
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-950"><FiShield /> Why this step matters</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">This protects seller pickup, buyer handover, payment confirmation, and admin dispute logs in one clean rider workflow.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
