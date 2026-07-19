import { useState } from 'react';
import type { FormEvent } from 'react';
import { FiAward, FiExternalLink, FiFileText, FiShield, FiUpload, FiUserCheck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import { formatCurrency } from '../utils/format';
import { riderApi } from '../services/riderApi';
import { apiUrl } from '../../lib/api';

export default function VerificationCenter() {
  const { rider, updateRiderLocally } = useAuth();
  const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  if (!rider) return null;
  const needsRequiredDocuments = rider.documents.some((doc) => doc.required && doc.status === 'not_submitted');

  async function submitDocuments(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    setError('');

    if (!identityDocument || !selfie) {
      setError('Upload both government ID and profile/selfie image before submitting.');
      return;
    }

    setSaving(true);
    try {
      const response = await riderApi.uploadVerificationDocuments(identityDocument, selfie);
      updateRiderLocally(response.rider);
      setIdentityDocument(null);
      setSelfie(null);
      setNotice('Rider verification documents submitted for admin review.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Documents could not be submitted.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Rider Verification" subtitle="Manage identity, guarantor, vehicle and document requirements for safer delivery operations." />
      {notice && <div className="mb-4 rounded-3xl bg-emerald-50 px-5 py-4 text-sm font-extrabold text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-3xl bg-rose-50 px-5 py-4 text-sm font-extrabold text-rose-700">{error}</div>}

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
                  {doc.url && (
                    <a href={apiUrl(doc.url)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-xs font-black text-emerald-700">
                      <FiExternalLink /> View submitted file
                    </a>
                  )}
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
          {needsRequiredDocuments ? (
            <form onSubmit={submitDocuments} className="mt-5 space-y-4 rounded-3xl border border-slate-100 bg-white p-4">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-slate-400">Submit missing documents</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">Upload a clear ID image and a current live profile/selfie image. Admin will review them before rider approval.</p>
              </div>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Government ID image</span>
                <input type="file" accept="image/*" required onChange={(event) => setIdentityDocument(event.target.files?.[0] || null)} className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Live profile/selfie image</span>
                <input type="file" accept="image/*" capture="user" required onChange={(event) => setSelfie(event.target.files?.[0] || null)} className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
              </label>
              <Button icon={FiUpload} disabled={saving || !identityDocument || !selfie} fullWidth>
                {saving ? 'Submitting...' : 'Submit Documents'}
              </Button>
            </form>
          ) : (
            <div className="mt-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">
              Required onboarding documents have been submitted. Admin will complete the rider verification stages from the admin dashboard.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
