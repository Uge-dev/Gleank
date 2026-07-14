import { FiWifiOff } from 'react-icons/fi';

export default function ApiConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;

  return (
    <div className="mb-5 rounded-[1.3rem] border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
      <FiWifiOff className="mr-2 inline" />
      Rider service is temporarily unavailable. Refresh the page or sign in again.
    </div>
  );
}
