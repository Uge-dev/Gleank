import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCamera, FiCheckCircle, FiLock, FiSearch, FiShield } from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import ProofUploader from '../components/rider/ProofUploader';
import SecurityChecklist from '../components/rider/SecurityChecklist';
import StatusBadge from '../components/ui/StatusBadge';

export default function DeliveryVerification() {
  const { assignmentId } = useParams();
  const { assignments, orders, verifyPickupCode, completeDelivery } = useRiderData();
  const navigate = useNavigate();
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [fileName, setFileName] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  const assignment = useMemo(() => assignments.find((item) => item.id === assignmentId), [assignments, assignmentId]);
  const order = useMemo(
    () => orders.find((item) => item.assignmentId === assignmentId || item.id === assignment?.orderId),
    [assignment?.orderId, assignmentId, orders],
  );
  const canVerifyDelivery = Boolean(
    assignment && ['package_picked_up', 'out_for_delivery'].includes(assignment.status) && (assignment.orderId || order?.id),
  );
  const mode = canVerifyDelivery ? 'delivery' : 'pickup';

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (verificationCode.length < 6) {
      setError(mode === 'delivery' ? 'Enter the 6-digit buyer delivery OTP.' : 'Enter the 6-digit seller pickup OTP.');
      return;
    }
    if (!proofFile) {
      setError(mode === 'delivery' ? 'Upload delivery proof photo before completing delivery.' : 'Upload pickup proof photo before verifying seller pickup.');
      return;
    }
    setSearching(true);
    const result = mode === 'delivery'
      ? await completeDelivery(order?.id || assignment?.orderId || '', verificationCode, proofFile, proofNote, locationLabel || assignment?.deliveryLocation)
      : await verifyPickupCode(verificationCode, assignmentId, proofFile, proofNote, locationLabel || assignment?.pickupLocation);
    setSearching(false);
    if (!result.ok) {
      setError(result.message || 'No order found.');
      return;
    }
    navigate(mode === 'delivery' ? '/rider/completed' : result.order ? `/rider/delivery/${result.order.id}` : '/rider/active');
  }

  return (
    <div>
      <PageHeader title="Code Verification" subtitle="Use one secure page to verify seller pickup OTP first, then buyer delivery OTP when you arrive." />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="flex min-h-[58vh] items-center justify-center">
          <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-2xl">
            <Card className="p-7 text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[2rem] bg-cyan-50 text-gleenc-cyan">
                {mode === 'delivery' ? <FiCheckCircle className="text-4xl" /> : <FiLock className="text-4xl" />}
              </div>
              <h1 className="mt-6 text-3xl font-black text-slate-950">
                {mode === 'delivery' ? 'Verify Buyer Delivery' : 'Verify Seller Pickup'}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
                {mode === 'delivery'
                  ? 'Ask the buyer for the delivery OTP after payment is confirmed. Add delivery proof before completing the order.'
                  : 'Ask the seller for the pickup OTP. Add a package proof photo/note before leaving the pickup point.'}
              </p>

              {assignment && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={assignment.status} />
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600">{assignment.orderChannel.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-3 font-extrabold text-slate-950">{assignment.sellerName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {mode === 'delivery' ? assignment.deliveryLocation : assignment.pickupLocation}
                  </p>
                </div>
              )}

              <form onSubmit={handleSearch} className="mt-7 space-y-5">
                <input
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={mode === 'delivery' ? 'Enter 6-digit Buyer Delivery OTP' : 'Enter 6-digit Seller Pickup OTP'}
                  className="w-full rounded-[1.4rem] border border-slate-200 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[0.35em] text-slate-950 outline-none transition focus:border-gleenc-cyan focus:bg-white"
                />
                <ProofUploader fileName={fileName} note={proofNote} locationLabel={locationLabel} onFileNameChange={setFileName} onFileChange={setProofFile} onNoteChange={setProofNote} onLocationChange={setLocationLabel} compact required />
                {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</motion.p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button icon={mode === 'delivery' ? FiCheckCircle : FiSearch} size="lg" disabled={verificationCode.length < 6 || !proofFile || searching} fullWidth>
                    {searching ? 'Verifying...' : mode === 'delivery' ? 'Verify & Complete' : 'Verify & Unlock'}
                  </Button>
                  <Button type="button" variant="secondary" icon={FiCamera} size="lg" fullWidth>
                    Scan OTP Soon
                  </Button>
                </div>
              </form>

              <p className="mt-6 text-xs font-semibold leading-6 text-slate-400">
                {mode === 'delivery'
                  ? "Buyer delivery OTP must come from the buyer in person. Gleenc does not display private buyer codes to riders."
                  : 'Pickup OTP must come from the seller in person. Gleenc does not display private buyer delivery codes to riders.'}
              </p>
              <Link to="/rider/assigned" className="mt-4 inline-block text-sm font-bold text-slate-500 hover:text-slate-950">Back to assigned orders</Link>
            </Card>
          </motion.div>
        </div>
        <div className="space-y-5">
          <SecurityChecklist
            title="Pickup Security Rules"
            items={[
              'Collect package only from the listed seller/pickup location.',
              'Verify seller pickup OTP before leaving the seller point.',
              'Capture proof photo and note package condition.',
              'Do not reveal buyer details to seller beyond what is necessary.',
              'For high-value/used items, do not accept unsealed or different product without support approval.'
            ]}
          />
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-950"><FiShield /> Why this step matters</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">This prevents fake pickup claims, package switching, seller/rider disputes, and buyer security exposure. It also creates evidence for refund and delivery investigations.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
