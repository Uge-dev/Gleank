import type { IconType } from 'react-icons';
import { FiBell, FiCheckCircle, FiCreditCard, FiPackage, FiShield, FiTruck, FiUserCheck, FiXCircle } from 'react-icons/fi';
import type { NotificationType } from '../types';
import { useRiderData } from '../context/RiderDataContext';
import { formatDateTime } from '../utils/format';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

const iconMap: Record<NotificationType, IconType> = {
  assignment: FiPackage,
  payment: FiCreditCard,
  delivery: FiTruck,
  cancelled: FiXCircle,
  system: FiBell,
  security: FiShield,
  verification: FiUserCheck
};

export default function Notifications() {
  const { notifications, markNotificationRead } = useRiderData();

  return (
    <div>
      <PageHeader title="Notifications" subtitle="New assignments, payment updates, delivery confirmations, and cancelled orders." />
      <div className="space-y-4">
        {notifications.map((notification) => {
          const Icon = iconMap[notification.type];
          return (
            <Card key={notification.id} className={`p-5 ${notification.read ? 'opacity-75' : 'ring-2 ring-cyan-100'}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-gleenc-cyan">
                    <Icon className="text-xl" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-950">{notification.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{notification.message}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{formatDateTime(notification.createdAt)}</p>
                  </div>
                </div>
                {!notification.read && (
                  <button onClick={() => markNotificationRead(notification.id)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                    <FiCheckCircle /> Mark Read
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
