import { NavLink } from 'react-router-dom';
import { FiCheckCircle, FiHome, FiKey, FiMessageCircle, FiPackage, FiTruck } from 'react-icons/fi';
import { useRiderData } from '../../context/RiderDataContext';

type RiderMobileNavItem = {
  label: string;
  path: string;
  icon: typeof FiHome;
  end?: boolean;
  badge?: 'assignments' | 'active';
};

const riderMobileNavItems: RiderMobileNavItem[] = [
  { label: 'Home', path: '/rider', icon: FiHome, end: true },
  { label: 'New Jobs', path: '/rider/assigned', icon: FiPackage, badge: 'assignments' },
  { label: 'Active', path: '/rider/active', icon: FiTruck, badge: 'active' },
  { label: 'Done', path: '/rider/completed', icon: FiCheckCircle },
  { label: 'Chats', path: '/rider/messages', icon: FiMessageCircle }
];

export default function RiderMobileNav() {
  const { stats } = useRiderData();

  function badgeCount(type?: 'assignments' | 'active') {
    if (type === 'assignments') return stats.newAssignments;
    if (type === 'active') return stats.active;
    return 0;
  }

  return (
    <>
      <NavLink
        to="/rider/verify-code"
        className={({ isActive }) =>
          `fixed bottom-[5.7rem] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.18em] shadow-[0_18px_45px_rgba(15,23,42,0.22)] transition-all lg:hidden ${
            isActive ? 'bg-gleenc-red text-white' : 'bg-slate-950 text-white'
          }`
        }
      >
        <FiKey className="text-base" />
        Verify
      </NavLink>
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[1.6rem] border border-slate-200 bg-white/95 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl lg:hidden">
        {riderMobileNavItems.map((item) => {
          const Icon = item.icon;
          const count = badgeCount(item.badge);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-black transition-all ${
                  isActive
                    ? 'bg-slate-950 text-white shadow-card'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
                }`
              }
            >
              <span className="relative">
                <Icon className="text-[1.15rem]" />
                {count > 0 && (
                  <small className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white">
                    {count}
                  </small>
                )}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
