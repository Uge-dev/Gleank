import { FiBell, FiMenu } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRiderData } from '../../context/RiderDataContext';
import StatusBadge from '../ui/StatusBadge';

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { rider } = useAuth();
  const { notifications } = useRiderData();
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/75 px-4 py-3 backdrop-blur-xl lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onMenu} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700 lg:hidden">
            <FiMenu />
          </button>
          <div>
            <p className="text-sm font-black text-slate-950">Rider</p>
            <p className="text-xs font-semibold text-slate-400">Simple delivery mode</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/rider/notifications" className="relative grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <FiBell />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-black text-white">{unread}</span>}
          </Link>
          {rider && <StatusBadge value={rider.availability} pulse={rider.availability === 'online'} />}
        </div>
      </div>
    </header>
  );
}
