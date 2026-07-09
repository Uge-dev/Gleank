import { FiDatabase, FiWifiOff } from 'react-icons/fi';

export default function ApiConnectionBanner({ connected }: { connected: boolean }) {
  return (
    <div className={`mb-5 rounded-[1.3rem] border p-4 text-sm font-semibold ${connected ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-800'}`}>
      {connected ? <FiDatabase className="mr-2 inline" /> : <FiWifiOff className="mr-2 inline" />}
      {connected ? 'Connected to Gleank backend rider APIs.' : 'Running in safe local preview mode. Set VITE_GLEANK_API_URL and implement /api/rider routes when merging into the full Gleank backend.'}
    </div>
  );
}
