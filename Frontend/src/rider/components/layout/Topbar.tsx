import { FiArrowLeft, FiBell, FiMenu, FiMessageCircle } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRiderData } from '../../context/RiderDataContext';
import StatusBadge from '../ui/StatusBadge';
import { getMainPortalReturn, returnToMainPortal } from '../../utils/portalReturn';

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { rider } = useAuth();
  const { notifications } = useRiderData();
  const unread = notifications.filter((item) => !item.read).length;
  const mainPortalReturn = getMainPortalReturn();

  return (
    <header className="fixed left-0 right-0 top-0 z-30 border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur-xl lg:left-72 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onMenu} className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-slate-100 text-slate-700 lg:hidden">
            <FiMenu />
          </button>
          <button
            type="button"
            onClick={returnToMainPortal}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl bg-slate-950 px-3 text-left text-white transition hover:bg-slate-800"
            aria-label={mainPortalReturn.label}
            title={mainPortalReturn.label}
          >
            <FiArrowLeft className="flex-none text-lg" />
            <span className="hidden min-w-0 sm:block">
              <strong className="block truncate text-xs font-black">Back to Gleenc</strong>
              <small className="block truncate text-[10px] font-semibold text-slate-300">
                {mainPortalReturn.label.replace("Back to ", "")}
              </small>
            </span>
          </button>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-black text-slate-950">{rider?.fullName || 'Rider'}</p>
            <p className="text-xs font-semibold text-slate-400">Rider</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/rider/messages" className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700" aria-label="Open messages">
            <FiMessageCircle />
          </Link>
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
