import { NavLink, useNavigate } from 'react-router-dom';
import { FiBell, FiCheckCircle, FiCreditCard, FiHome, FiLogOut, FiPackage, FiSettings, FiShield, FiTruck, FiUser } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../ui/StatusBadge';

const navItems = [
  { label: 'Dashboard', path: '/rider', icon: FiHome, end: true },
  { label: 'Assigned Orders', path: '/rider/assigned', icon: FiPackage },
  { label: 'Active Deliveries', path: '/rider/active', icon: FiTruck },
  { label: 'Completed Deliveries', path: '/rider/completed', icon: FiCheckCircle },
  { label: 'Earnings', path: '/rider/earnings', icon: FiCreditCard },
  { label: 'Notifications', path: '/rider/notifications', icon: FiBell },
  { label: 'Verification Center', path: '/rider/verification', icon: FiShield },
  { label: 'Safety Center', path: '/rider/safety', icon: FiShield },
  { label: 'Profile', path: '/rider/profile', icon: FiUser },
  { label: 'Settings', path: '/rider/settings', icon: FiSettings }
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { rider, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/rider/login');
  }

  return (
    <aside className="flex h-full flex-col border-r border-slate-100 bg-white/90 p-5 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gleenc-gradient font-black text-gleenc-dark shadow-glow">G</div>
        <div>
          <p className="text-lg font-black tracking-tight text-slate-950">Gleenc</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Rider DMS</p>
        </div>
      </div>

      <div className="mt-6 rounded-[1.4rem] bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <img src={rider?.profilePhoto} alt="Rider" className="h-11 w-11 rounded-2xl object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-slate-950">{rider?.fullName}</p>
            {rider && <StatusBadge value={rider.availability} pulse={rider.availability === 'online'} />}
          </div>
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-all ${
                isActive ? 'bg-slate-950 text-white shadow-card' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
              }`
            }
          >
            <item.icon className="text-lg" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <button onClick={handleLogout} className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-rose-600 hover:bg-rose-50">
        <FiLogOut className="text-lg" />
        Logout
      </button>
    </aside>
  );
}
