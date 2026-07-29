import { FiAlertCircle, FiCheckCircle, FiInfo } from 'react-icons/fi';
import Card from '../ui/Card';
import type { DeliveryActivity } from '../../types';
import { formatDateTime } from '../../utils/format';

const icons = {
  success: FiCheckCircle,
  info: FiInfo,
  warning: FiAlertCircle
};

const tones = {
  success: 'bg-emerald-50 text-emerald-600',
  info: 'bg-cyan-50 text-cyan-600',
  warning: 'bg-amber-50 text-amber-600'
};

export default function DeliveryActivityList({ activities }: { activities: DeliveryActivity[] }) {
  return (
    <Card className="p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-slate-950">Recent Delivery Activity</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Live</span>
      </div>
      <div className="space-y-4">
        {activities.length === 0 && (
          <div className="rounded-2xl bg-slate-50 p-5 text-center">
            <p className="font-bold text-slate-700">No delivery activity yet</p>
            <p className="mt-1 text-sm text-slate-500">Assignments, pickups, delivery verification, completion, and failures will appear here automatically.</p>
          </div>
        )}
        {activities.map((activity) => {
          const Icon = icons[activity.status];
          return (
            <div key={activity.id} className="flex gap-3 rounded-2xl bg-slate-50 p-4">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tones[activity.status]}`}>
                <Icon />
              </div>
              <div>
                <p className="font-bold text-slate-950">{activity.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{activity.description}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{formatDateTime(activity.time)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
