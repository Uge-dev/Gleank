import { FiWifiOff } from 'react-icons/fi';

export default function ApiConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;

  return (
    <div className="mb-5 rounded-[1.3rem] border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
      <FiWifiOff className="mr-2 inline" />
      Gleenc is reconnecting your rider presence. Keep this page open and connected; your online status will update automatically.
    </div>
  );
}
