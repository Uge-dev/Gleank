import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { FiAlertTriangle, FiAward, FiCheckCircle, FiClock, FiFileText, FiLock, FiRefreshCw, FiShield, FiUpload } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import { riderApi, type VerificationCenterResponse, type VerificationRequirement } from '../services/riderApi';
import { apiUrl } from '../../lib/api';

type RequirementDraft = {
  payload: Record<string, string | boolean>;
  files: Record<string, File | null>;
};

function emptyDraft(): RequirementDraft {
  return { payload: {}, files: {} };
}

function statusTone(status: string) {
  if (status === 'approved') return 'border-emerald-100 bg-emerald-50';
  if (status === 'submitted' || status === 'under_review') return 'border-amber-100 bg-amber-50';
  if (status === 'needs_information' || status === 'rejected') return 'border-rose-100 bg-rose-50';
  return 'border-slate-100 bg-white';
}

function nextAction(status: string) {
  if (status === 'needs_information' || status === 'rejected') return 'Try Again';
  return 'Submit';
}

function formatTime(value?: string) {
  if (!value) return 'Not submitted';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function fieldsForRequirement(requirement: VerificationRequirement) {
  switch (requirement.code) {
    case 'rider_personal_profile':
    case 'rider_home_address':
      return [
        ['fullLegalName', 'Full legal name'],
        ['homeAddress', 'Full home address'],
        ['state', 'State'],
        ['cityLga', 'City/LGA'],
        ['nearestLandmark', 'Nearest landmark'],
      ];
    case 'rider_emergency_contact':
      return [
        ['fullName', 'Contact full name'],
        ['relationship', 'Relationship'],
        ['primaryPhone', 'Primary phone'],
        ['alternativePhone', 'Alternative phone'],
        ['address', 'Address'],
      ];
    case 'rider_guarantor':
      return [
        ['fullName', 'Guarantor full name'],
        ['relationship', 'Relationship to rider'],
        ['phone', 'Phone'],
        ['email', 'Email'],
        ['address', 'Address'],
        ['occupation', 'Occupation'],
      ];
    case 'rider_government_id':
      return [
        ['idType', 'ID type'],
        ['idNumberReference', 'ID number/reference'],
        ['expiryDate', 'Expiry date'],
      ];
    case 'rider_vehicle_capacity':
    case 'rider_vehicle_authorization':
      return [
        ['vehicleType', 'Vehicle type'],
        ['plateInformation', 'Plate information'],
        ['packageSizes', 'Package sizes supported'],
        ['weightLimit', 'Weight limit'],
        ['fragileCapability', 'Fragile-item capability'],
      ];
    case 'rider_service_zone':
      return [
        ['serviceZones', 'Service zones'],
        ['locationPermissionState', 'Location permission state'],
      ];
    default:
      return [['note', 'Submission note']];
  }
}

function fileFieldsForRequirement(requirement: VerificationRequirement) {
  switch (requirement.code) {
    case 'rider_government_id':
      return [
        ['identityDocument', 'Government ID front image/PDF'],
        ['documents', 'Back image or expiry proof'],
      ];
    case 'rider_identity_selfie':
      return [['selfie', 'Identity selfie']];
    case 'rider_guarantor':
      return [['documents', 'Guarantor government ID or consent document']];
    case 'rider_vehicle_authorization':
      return [['vehicleDocument', 'Vehicle ownership/authorization proof']];
    case 'rider_home_address':
      return [['documents', 'Residential proof, if available']];
    default:
      return [];
  }
}

function RequirementCard({
  requirement,
  draft,
  onDraftChange,
  onSubmit,
  onRequestResubmission,
  submitting,
  requestingResubmission,
}: {
  requirement: VerificationRequirement;
  draft: RequirementDraft;
  onDraftChange: (draft: RequirementDraft) => void;
  onSubmit: () => void;
  onRequestResubmission: (reason: string) => void;
  submitting: boolean;
  requestingResubmission: boolean;
}) {
  const [resubmissionReason, setResubmissionReason] = useState('');
  const fields = fieldsForRequirement(requirement);
  const fileFields = fileFieldsForRequirement(requirement);
  const isSystem = requirement.workflowType === 'system';
  const isProvider = requirement.workflowType === 'provider';
  const pendingResubmission = requirement.resubmissionRequest?.status === 'pending';

  function updateField(key: string, value: string | boolean) {
    onDraftChange({ ...draft, payload: { ...draft.payload, [key]: value } });
  }

  function updateFile(field: string, event: ChangeEvent<HTMLInputElement>) {
    onDraftChange({
      ...draft,
      files: { ...draft.files, [field]: event.target.files?.[0] || null },
    });
  }

  return (
    <Card className={`border p-5 ${statusTone(requirement.status)}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-slate-950">{requirement.title}</h3>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Stage {requirement.requiredLevel}</span>
            {requirement.blocking ? <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-600">Blocking</span> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{requirement.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge value={requirement.status} />
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">{requirement.workflowType}</span>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Last submitted</p>
          <p className="mt-1 text-sm font-bold text-slate-700">{formatTime(requirement.latestSubmission?.submittedAt)}</p>
        </div>
      </div>

      {requirement.adminFeedback ? (
        <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-700">
          Admin feedback: {requirement.adminFeedback}
        </div>
      ) : null}

      {requirement.latestSubmission?.documentUrls?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {requirement.latestSubmission.documentUrls.map((url, index) => (
            <a
              key={`${url}-${index}`}
              href={apiUrl(url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700"
            >
              <FiFileText /> View version {requirement.latestSubmission?.version || 1}.{index + 1}
            </a>
          ))}
        </div>
      ) : null}

      {!requirement.previousStageApproved ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-slate-100 px-4 py-4 text-sm font-bold leading-6 text-slate-600">
          <FiLock className="mt-1 shrink-0" />
          This form opens after Stage {requirement.requiredLevel - 1} is approved.
        </div>
      ) : requirement.status === 'approved' ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-100 px-4 py-4 text-sm font-bold leading-6 text-emerald-800">
            <FiLock className="mt-1 shrink-0" />
            <span>
              Approved and locked. The submitted form has been removed so approved information cannot be changed without admin permission.
            </span>
          </div>

          {pendingResubmission ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold leading-6 text-amber-800">
              <p>Your request is waiting for admin review.</p>
              <p className="mt-2 text-amber-900">Reason: {requirement.resubmissionRequest?.reason}</p>
            </div>
          ) : requirement.canRequestResubmission ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="block text-sm font-black text-slate-800">
                Why do you need to change this approved information?
                <textarea
                  value={resubmissionReason}
                  onChange={(event) => setResubmissionReason(event.target.value)}
                  rows={3}
                  minLength={8}
                  placeholder="Explain the correction or update you need to make."
                  className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none focus:border-slate-950"
                />
              </label>
              {requirement.resubmissionRequest?.status === 'rejected' ? (
                <p className="mt-2 text-sm font-bold text-rose-700">
                  Admin response: {requirement.resubmissionRequest.adminFeedback || 'The previous request was not opened.'}
                </p>
              ) : null}
              <Button
                icon={FiRefreshCw}
                disabled={requestingResubmission || resubmissionReason.trim().length < 8}
                onClick={() => onRequestResubmission(resubmissionReason.trim())}
              >
                {requestingResubmission ? 'Sending request...' : 'Request resubmission'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : requirement.status === 'submitted' || requirement.status === 'under_review' ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-100 px-4 py-4 text-sm font-bold leading-6 text-amber-800">
          <FiLock className="mt-1 shrink-0" />
          Submitted and locked while admin reviews this information.
        </div>
      ) : isSystem ? (
        <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-600">
          This requirement updates automatically from your account. If it is still incomplete, update the matching account detail first.
        </div>
      ) : isProvider ? (
        <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-600">
          This advanced check must return a verified result from the configured identity provider. A note or static selfie cannot complete it.
        </div>
      ) : requirement.canSubmit ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map(([key, label]) => (
              <label key={key} className="block text-sm font-bold text-slate-700">
                {label}
                <input
                  value={String(draft.payload[key] || '')}
                  onChange={(event) => updateField(key, event.target.value)}
                  required
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-slate-950"
                />
              </label>
            ))}
          </div>
          {requirement.code === 'rider_guarantor' ? (
            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft.payload.consentConfirmed)}
                onChange={(event) => updateField('consentConfirmed', event.target.checked)}
                required
                className="h-4 w-4"
              />
              Guarantor consent has been confirmed.
            </label>
          ) : null}
          {fileFields.map(([field, label], index) => (
            <label key={field} className="block text-sm font-bold text-slate-700">
              {label}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => updateFile(field, event)}
                required={index === 0}
                className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm"
              />
            </label>
          ))}
          <Button icon={FiUpload} disabled={submitting}>
            {submitting ? 'Submitting...' : nextAction(requirement.status)}
          </Button>
        </form>
      ) : null}

      {requirement.submissions?.length ? (
        <details className="mt-4 rounded-2xl bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-black text-slate-800">View history</summary>
          <div className="mt-3 space-y-2">
            {requirement.submissions.map((submission) => (
              <div key={submission.id} className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                Version {submission.version} · {submission.status} · {formatTime(submission.submittedAt)}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Card>
  );
}

export default function VerificationCenter() {
  const { rider } = useAuth();
  const [center, setCenter] = useState<VerificationCenterResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RequirementDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const requirements = center?.case.requirements || [];
  const levelGroups = useMemo(() => {
    const groups = new Map<number, VerificationRequirement[]>();
    requirements.forEach((requirement) => {
      const level = requirement.requiredLevel || 1;
      if (level > 3) return;
      groups.set(level, [...(groups.get(level) || []), requirement]);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [requirements]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setCenter(await riderApi.verificationCenter());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Verification could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(requirement: VerificationRequirement) {
    setSavingCode(requirement.code);
    setError('');
    setNotice('');
    try {
      const draft = drafts[requirement.code] || emptyDraft();
      const response = await riderApi.submitVerificationRequirement(requirement.code, draft.payload, draft.files);
      setCenter(response);
      setDrafts((current) => ({ ...current, [requirement.code]: emptyDraft() }));
      setNotice(`${requirement.title} submitted for admin review.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Requirement could not be submitted.');
    } finally {
      setSavingCode('');
    }
  }

  async function requestUpgrade() {
    if (!center) return;
    setSavingCode('upgrade');
    setError('');
    try {
      if (center.case.currentVerifiedLevel >= 3) return;
      setCenter(await riderApi.requestVerificationLevel(Math.max(2, center.case.currentVerifiedLevel + 1), 'Requesting the next rider verification stage.'));
      setNotice('Next-stage request sent to admin.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upgrade request could not be sent.');
    } finally {
      setSavingCode('');
    }
  }

  async function requestResubmission(requirement: VerificationRequirement, reason: string) {
    setSavingCode(`resubmission:${requirement.id}`);
    setError('');
    setNotice('');
    try {
      setCenter(await riderApi.requestRequirementResubmission(requirement.id, reason));
      setNotice(`${requirement.title} resubmission request sent to admin.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Resubmission request could not be sent.');
    } finally {
      setSavingCode('');
    }
  }

  if (!rider) return null;

  return (
    <div>
      <PageHeader title="Rider Verification" subtitle="Submit, replace and track each rider requirement without losing previous versions." />

      {notice ? <div className="mb-4 rounded-3xl bg-emerald-50 px-5 py-4 text-sm font-extrabold text-emerald-700">{notice}</div> : null}
      {error ? <div className="mb-4 rounded-3xl bg-rose-50 px-5 py-4 text-sm font-extrabold text-rose-700">{error}</div> : null}

      {loading ? (
        <Card className="p-6">
          <div className="flex items-center gap-3 text-sm font-black text-slate-600"><FiRefreshCw className="animate-spin" /> Loading verification center...</div>
        </Card>
      ) : center ? (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Requirement-based verification</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950">{rider.fullName}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Stage {center.case.currentVerifiedLevel} of 3 approved · {center.case.completionPercent}% complete
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge value={center.case.overallStatus} />
                    <StatusBadge value={center.case.operationalStatus} />
                  </div>
                </div>
                <Button
                  icon={FiAward}
                  disabled={savingCode === 'upgrade' || center.case.currentVerifiedLevel >= 3}
                  onClick={requestUpgrade}
                >
                  {center.case.currentVerifiedLevel >= 3
                    ? 'All stages approved'
                    : savingCode === 'upgrade'
                      ? 'Requesting...'
                      : 'Request next stage'}
                </Button>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-950" style={{ width: `${center.case.completionPercent}%` }} />
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
                {center.case.eligibility?.eligible ? <FiCheckCircle /> : <FiAlertTriangle />} Dispatch eligibility
              </h3>
              {center.case.eligibility?.eligible ? (
                <p className="mt-3 rounded-2xl bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-700">
                  Eligible for dispatch based on the same backend checks used by rider assignment.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {(center.case.eligibility?.blockingReasons || []).slice(0, 5).map((reason) => (
                    <p key={reason.code} className="rounded-2xl bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">
                      {reason.message}
                    </p>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {!center.thirdParty?.dojahConfigured ? (
            <div className="mb-6 rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold leading-6 text-amber-800">
              <FiShield className="mr-2 inline" /> Live-face/NIN provider is not configured, so liveness stays incomplete until the production provider is connected.
            </div>
          ) : null}

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            {center.case.stageReadiness.map((stage) => (
              <Card
                key={stage.stage}
                className={`border p-5 ${
                  stage.approved
                    ? 'border-emerald-100 bg-emerald-50'
                    : stage.approvalReady
                      ? 'border-amber-100 bg-amber-50'
                      : 'border-slate-100 bg-white'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Stage {stage.stage}</p>
                <h3 className="mt-2 text-lg font-black text-slate-950">{stage.title}</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                  {stage.approved
                    ? 'Approved'
                    : stage.approvalReady
                      ? 'Complete and waiting for admin approval'
                      : stage.started
                        ? 'In progress — finish every item'
                        : 'Not started'}
                </p>
                {stage.stage === 1 ? (
                  <p className="mt-2 text-xs font-bold leading-5 text-emerald-700">
                    Approval at this stage qualifies you for standard dispatch.
                  </p>
                ) : null}
              </Card>
            ))}
          </div>

          <div className="space-y-8">
            {levelGroups.map(([level, rows]) => (
              <section key={level}>
                <div className="mb-3 flex items-center gap-2">
                  <FiClock className="text-slate-400" />
                  <h2 className="text-lg font-black text-slate-950">Stage {level} requirements</h2>
                </div>
                <div className="grid gap-4">
                  {rows.map((requirement) => (
                    <RequirementCard
                      key={requirement.id}
                      requirement={requirement}
                      draft={drafts[requirement.code] || emptyDraft()}
                      onDraftChange={(draft) => setDrafts((current) => ({ ...current, [requirement.code]: draft }))}
                      onSubmit={() => submit(requirement)}
                      onRequestResubmission={(reason) => requestResubmission(requirement, reason)}
                      submitting={savingCode === requirement.code}
                      requestingResubmission={savingCode === `resubmission:${requirement.id}`}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
