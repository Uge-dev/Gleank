import { useState } from 'react';
import type { FormEvent } from 'react';
import { FiAlertTriangle, FiPhoneCall, FiTool } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useRiderData } from '../context/RiderDataContext';
import type { SafetyReportPayload } from '../types';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import SecurityChecklist from '../components/rider/SecurityChecklist';

export default function SafetyCenter() {
  const { rider } = useAuth();
  const { reportSafetyIssue } = useRiderData();
  const [note, setNote] = useState('');
  const [type, setType] = useState<SafetyReportPayload['type']>('other');
  const [reference, setReference] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await reportSafetyIssue({ type, note: note || 'Rider safety/support report submitted from dashboard.' });
    setReference(result.reference || 'submitted');
    setNote('');
  }

  return (
    <div>
      <PageHeader title="Safety Center" subtitle="Rider safety, emergency contact, package-security rules, and support incident reporting." />
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-950"><FiPhoneCall /> Emergency Contact</h2>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="font-extrabold text-slate-950">{rider?.emergencyContact.name}</p>
              <p className="mt-1 text-sm text-slate-500">{rider?.emergencyContact.relationship}</p>
              <a href={`tel:${rider?.emergencyContact.phone}`} className="mt-4 inline-flex"><Button variant="danger" icon={FiPhoneCall}>Call {rider?.emergencyContact.phone}</Button></a>
            </div>
          </Card>
          <SecurityChecklist
            title="Rider Safety Rules"
            items={[
              'Never collect a package without seller pickup OTP.',
              'Never hand over a package without customer delivery OTP.',
              'Do not accept address changes outside Gleenc support approval.',
              'Do not carry high-value packages above your rider level limit.',
              'Report threats, accidents, package tampering, payment pressure, or suspicious buyer/seller behavior immediately.'
            ]}
          />
        </div>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-950"><FiAlertTriangle /> Report an Issue</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Use this for package damage, wrong pickup, buyer threat, seller issue, payment issue, accident, or any suspicious delivery condition.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Issue type</span>
              <select value={type} onChange={(event) => setType(event.target.value as SafetyReportPayload['type'])} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan">
                <option value="seller_issue">Seller issue</option>
                <option value="buyer_issue">Buyer issue</option>
                <option value="package_issue">Package issue</option>
                <option value="accident">Accident</option>
                <option value="threat">Threat/security concern</option>
                <option value="payment_issue">Payment issue</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Report note</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" placeholder="Explain what happened, who was involved, and current location." />
            </label>
            {reference && <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Report sent. Reference: {reference}</p>}
            <Button icon={FiTool} size="lg" fullWidth>Submit Safety Report</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
