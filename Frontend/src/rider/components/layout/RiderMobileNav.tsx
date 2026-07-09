import { NavLink } from 'react-router-dom';
import { FiCreditCard, FiHome, FiPackage, FiTruck, FiUser } from 'react-icons/fi';
import { useRiderData } from '../../context/RiderDataContext';

type RiderMobileNavItem = {
  label: string;
  path: string;
  icon: typeof FiHome;
  end?: boolean;
  badge?: 'assignments' | 'orders';
};

const riderMobileNavItems: RiderMobileNavItem[] = [
  { label: 'Home', path: '/rider', icon: FiHome, end: true },
  { label: 'Assigned', path: '/rider/assigned', icon: FiPackage, badge: 'assignments' },
  { label: 'Active', path: '/rider/active', icon: FiTruck, badge: 'orders' },
  { label: 'Earnings', path: '/rider/earnings', icon: FiCreditCard },
  { label: 'Profile', path: '/rider/profile', icon: FiUser }
];

export default function RiderMobileNav() {
  const { assignments, orders } = useRiderData();

  function badgeCount(type?: 'assignments' | 'orders') {
    if (type === 'assignments') return assignments.length;
    if (type === 'orders') return orders.length;
    return 0;
  }

  return (
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
  );
}
