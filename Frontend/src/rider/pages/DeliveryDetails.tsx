import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { FiAlertTriangle, FiCheckCircle, FiMapPin, FiPhoneCall, FiShield } from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import { formatDateTime } from '../utils/format';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import ProductList from '../components/rider/ProductList';
import PaymentPanel from '../components/rider/PaymentPanel';
import StatusBadge from '../components/ui/StatusBadge';
import SuccessAnimation from '../components/ui/SuccessAnimation';
import SecurityChecklist from '../components/rider/SecurityChecklist';
import ProofUploader from '../components/rider/ProofUploader';

export default function DeliveryDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, unlockedOrderIds, completeDelivery, reportSafetyIssue } = useRiderData();
  const order = orders.find((item) => item.id === orderId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState('');
  const [fileName, setFileName] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [safetyNote, setSafetyNote] = useState('');

  if (!order) return <Navigate to="/rider/active" replace />;
  if (!unlockedOrderIds.includes(order.id)) return <Navigate to={`/rider/verify/${order.assignmentId}`} replace />;

  const isPaid = order.paymentStatus === 'paid';

  async function handleComplete(event: FormEvent) {
    event.preventDefault();
    setCompleteError('');
    if (deliveryCode.length < 6) {
      setCompleteError('Enter the 6-digit buyer delivery OTP.');
      return;
    }
    if (!proofFile) {
      setCompleteError('Upload delivery proof photo before confirming delivery.');
      return;
    }
    const result = await completeDelivery(order!.id, deliveryCode, proofFile, proofNote, locationLabel || order!.deliveryAddress);
    if (!result.ok) {
      setCompleteError(result.message || 'Unable to complete delivery.');
      return;
    }
    setConfirmOpen(false);
    setSuccess(true);
    window.setTimeout(() => navigate('/rider/completed'), 1800);
  }

  async function submitSafetyReport() {
    await reportSafetyIssue({ orderId: order!.id, assignmentId: order!.assignmentId, type: 'other', note: safetyNote || 'Rider needs support on active delivery.', locationLabel });
    setSafetyOpen(false);
    setSafetyNote('');
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl pt-16">
        <SuccessAnimation title="Delivered Successfully" message="Delivery OTP and proof were recorded. Order status has been updated and rider earnings will be credited." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Delivery Details" subtitle="Full order information is visible only after seller pickup OTP/proof. Complete delivery only with buyer OTP and proof." />

      <div className="mb-5 rounded-[1.4rem] border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
        <FiShield className="mr-2 inline" /> Pickup verified. Private delivery details unlocked.
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-gleenc-cyan">Order Information</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Private delivery</h2>
                <p className="mt-1 text-sm text-slate-500">Order Date: {formatDateTime(order.orderDate)}</p>
                <p className="mt-1 text-xs font-bold text-amber-600">Buyer delivery code is hidden from riders and must be entered only when the buyer provides it.</p>
                <p className="mt-1 text-sm text-slate-500 capitalize">Channel: {order.orderChannel.replace(/_/g, ' ')} {order.marketName ? `· ${order.marketName}` : ''}</p>
              </div>
              <StatusBadge value={order.status} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Delivery OTP</p>
                <p className="mt-2 text-sm font-black text-slate-950">Enter only after buyer provides it</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Payment</p>
                <p className="mt-2 text-sm font-black text-slate-950">{isPaid ? 'Confirmed' : 'Buyer payment pending'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Security</p>
                <p className="mt-2 text-sm font-black text-slate-950">Proof photo required</p>
              </div>
            </div>
          </Card>

          <ProductList order={order} />
          <PaymentPanel order={order} />
          <SecurityChecklist title="Order Security Checks" items={order.securityChecks} />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-xl font-extrabold text-slate-950">Customer Information</h2>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-lg font-black text-slate-950">{order.customerName}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{order.customerPhone}</p>
              <a href={`tel:${order.customerPhone}`} className="mt-4 inline-flex"><Button variant="secondary" icon={FiPhoneCall}>Call Customer</Button></a>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-extrabold text-slate-950">Seller Information</h2>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-lg font-black text-slate-950">{order.sellerName}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{order.sellerPhone}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">{order.sellerType.replace(/_/g, ' ')}</p>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-extrabold text-slate-950">Delivery Address</h2>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold leading-6 text-slate-800">{order.deliveryAddress}</p>
              <p className="mt-3 text-sm leading-6 text-slate-500">{order.deliveryNotes}</p>
              <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`} className="mt-4 inline-flex">
                <Button variant="secondary" icon={FiMapPin}>Open Navigation</Button>
              </a>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-extrabold text-slate-950">Complete Delivery</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enabled only after payment is confirmed. Buyer must provide delivery OTP and rider must submit proof.</p>
            {isPaid ? (
              <Link to={`/rider/verify/${order.assignmentId}`} className="mt-5 block">
                <Button icon={FiCheckCircle} size="lg" fullWidth>
                  Open Code Verification
                </Button>
              </Link>
            ) : (
              <Button className="mt-5" icon={FiCheckCircle} size="lg" disabled fullWidth>
                Open Code Verification
              </Button>
            )}
            {!isPaid && <p className="mt-3 text-center text-xs font-bold text-rose-600">Confirm payment first before completing delivery.</p>}
            <Button className="mt-3" variant="danger" icon={FiAlertTriangle} onClick={() => setSafetyOpen(true)} fullWidth>Report Issue</Button>
            <Link to="/rider/active" className="mt-3 block text-center text-sm font-bold text-slate-500 hover:text-slate-950">
              Back to Active Deliveries
            </Link>
          </Card>
        </div>
      </div>

      <Modal open={confirmOpen} title="Verify Buyer Delivery OTP" onClose={() => setConfirmOpen(false)}>
        <form onSubmit={handleComplete} className="space-y-4">
          <input
            value={deliveryCode}
            onChange={(event) => setDeliveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter buyer delivery OTP"
            required
            className="w-full rounded-[1.4rem] border border-slate-200 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[0.35em] text-slate-950 outline-none transition focus:border-gleenc-cyan focus:bg-white"
          />
          <ProofUploader fileName={fileName} note={proofNote} locationLabel={locationLabel} onFileNameChange={setFileName} onFileChange={setProofFile} onNoteChange={setProofNote} onLocationChange={setLocationLabel} compact required />
          {completeError && <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{completeError}</p>}
          <p className="text-xs font-semibold leading-6 text-slate-400">
            For security, Gleenc never displays the buyer&apos;s delivery code to riders.
            Ask the buyer to provide the OTP in person after payment is confirmed.
          </p>
          <Button size="lg" disabled={deliveryCode.length < 6 || !proofFile} fullWidth>Confirm Delivery</Button>
        </form>
      </Modal>

      <Modal open={safetyOpen} title="Report Delivery Issue" message="Use this for buyer threat, wrong location, package problem, payment issue, accident, or emergency. Support/admin will receive it." onClose={() => setSafetyOpen(false)} onConfirm={submitSafetyReport} confirmLabel="Send Report">
        <textarea value={safetyNote} onChange={(event) => setSafetyNote(event.target.value)} rows={4} placeholder="Explain what happened..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
      </Modal>
    </div>
  );
}
