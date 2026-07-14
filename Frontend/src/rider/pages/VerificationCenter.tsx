import { FiAward, FiFileText, FiShield, FiUserCheck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import { formatCurrency } from '../utils/format';

export default function VerificationCenter() {
  const { rider } = useAuth();

  if (!rider) return null;

  return (
    <div>
      <PageHeader title="Rider Verification" subtitle="Manage identity, guarantor, vehicle and document requirements for safer delivery operations." />

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-gleenc-cyan"><FiUserCheck className="text-2xl" /></div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">{rider.fullName}</h2>
              <p className="mt-1 text-sm text-slate-500">{rider.vehicleType} {rider.vehiclePlate ? `· ${rider.vehiclePlate}` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge value={rider.status} />
                <StatusBadge value={rider.verificationStatus} />
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Verification Level</p>
              <p className="mt-1 text-lg font-black capitalize text-slate-950">{rider.verificationLevel.replace(/_/g, ' ')}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Package Value Limit</p>
              <p className="mt-1 text-lg font-black text-slate-950">{formatCurrency(rider.maxPackageValue)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Zone</p>
              <p className="mt-1 text-lg font-black text-slate-950">{rider.activeZone}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-950"><FiFileText /> Required Documents</h2>
          <div className="mt-5 space-y-3">
            {rider.documents.map((doc) => (
              <div key={doc.id} className="flex flex-col justify-between gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-extrabold text-slate-950">{doc.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{doc.required ? 'Required' : 'Optional'} {doc.note ? `· ${doc.note}` : ''}</p>
                </div>
                <StatusBadge value={doc.status} />
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            <FiShield className="mr-2 inline" /> Higher-risk deliveries may require stronger identity checks, admin approval and additional safety review.
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-950"><FiShield /> Guarantor / Referee</h2>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="font-extrabold text-slate-950">{rider.guarantor.name}</p>
            <p className="mt-1 text-sm text-slate-500">{rider.guarantor.phone} · {rider.guarantor.relationship}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{rider.guarantor.address}</p>
            <div className="mt-3"><StatusBadge value={rider.guarantor.status} /></div>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-950"><FiAward /> Upgrade Requirements</h2>
          <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-600">
            <p className="rounded-2xl bg-slate-50 p-4">Level 1: phone/email/profile photo + vehicle details. Low-value deliveries only.</p>
            <p className="rounded-2xl bg-slate-50 p-4">Level 2: valid ID + address + guarantor. Normal campus and market deliveries.</p>
            <p className="rounded-2xl bg-slate-50 p-4">Level 3: trusted history + low complaints. Faster assignment priority.</p>
            <p className="rounded-2xl bg-slate-50 p-4">Level 4: optional NIN/vendor KYC + admin approval. High-value used-market/electronics delivery.</p>
          </div>
          <Button className="mt-5" fullWidth>Submit Missing Documents</Button>
        </Card>
      </div>
    </div>
  );
}
