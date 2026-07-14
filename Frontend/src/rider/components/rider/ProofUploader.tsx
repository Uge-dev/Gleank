import type { ChangeEvent } from 'react';
import { FiCamera, FiFileText, FiMapPin } from 'react-icons/fi';

interface ProofUploaderProps {
  fileName: string;
  note: string;
  locationLabel: string;
  onFileNameChange: (value: string) => void;
  onFileChange?: (file: File | null) => void;
  required?: boolean;
  onNoteChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  compact?: boolean;
}

export default function ProofUploader({ fileName, note, locationLabel, onFileNameChange, onFileChange, onNoteChange, onLocationChange, compact, required }: ProofUploaderProps) {
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    onFileNameChange(file?.name || '');
    onFileChange?.(file);
  }

  return (
    <div className="space-y-3 text-left">
      <label className="block">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><FiCamera /> Proof photo {required ? <strong className="text-rose-600">*</strong> : null}</span>
        <input type="file" accept="image/*" capture="environment" required={required && !fileName} onChange={handleFile} className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
        {fileName && <span className="mt-2 block text-xs font-bold text-emerald-700">Selected: {fileName}</span>}
      </label>
      <label className="block">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><FiFileText /> Proof note</span>
        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={compact ? 2 : 3}
          placeholder="Example: Package sealed, no visible damage, collected directly from seller."
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan focus:bg-white"
        />
      </label>
      <label className="block">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><FiMapPin /> Current location / landmark</span>
        <input
          value={locationLabel}
          onChange={(event) => onLocationChange(event.target.value)}
          placeholder="Example: FUPRE Small Gate / Ugbomro Market Shop B12"
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan focus:bg-white"
        />
      </label>
    </div>
  );
}
