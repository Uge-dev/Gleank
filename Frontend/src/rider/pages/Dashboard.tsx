import { Link } from 'react-router-dom';
import {
  FiArrowRight,
  FiCheckCircle,
  FiCreditCard,
  FiPackage,
  FiShield,
  FiTruck,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useRiderData } from '../context/RiderDataContext';
import { formatCurrency } from '../utils/format';
import PageHeader from '../components/ui/PageHeader';
import DeliveryActivityList from '../components/rider/DeliveryActivityList';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import ApiConnectionBanner from '../components/rider/ApiConnectionBanner';

const activeStatuses = [
  'accepted',
  'arrived_at_pickup',
  'package_picked_up',
  'out_for_delivery',
];

export default function Dashboard() {
  const { rider, apiConnected } = useAuth();
  const { assignments, orders, earnings, activities, stats } = useRiderData();
  const activeAssignment = assignments.find((item) =>
    activeStatuses.includes(item.status),
  );
  const activeOrder = activeAssignment
    ? orders.find((item) => item.assignmentId === activeAssignment.id)
    : undefined;
  const firstName = rider?.fullName.split(' ')[0] || 'Rider';

  const nextTask = stats.newAssignments > 0
    ? {
        title: `${stats.newAssignments} new ${stats.newAssignments === 1 ? 'job' : 'jobs'}`,
        message: 'Review the delivery and accept when ready.',
        path: '/rider/assigned',
        action: 'View new jobs',
        icon: FiPackage,
      }
    : activeAssignment
      ? {
          title:
            activeAssignment.status === 'package_picked_up' ||
            activeAssignment.status === 'out_for_delivery'
              ? 'Deliver to buyer'
              : 'Pick up from seller',
          message:
            activeAssignment.status === 'package_picked_up' ||
            activeAssignment.status === 'out_for_delivery'
              ? activeOrder?.deliveryAddress || activeAssignment.deliveryLocation
              : activeAssignment.pickupLocation,
          path:
            activeOrder &&
            (activeAssignment.status === 'package_picked_up' ||
              activeAssignment.status === 'out_for_delivery')
              ? `/rider/delivery/${activeOrder.id}`
              : `/rider/verify/${activeAssignment.id}`,
          action:
            activeAssignment.status === 'package_picked_up' ||
            activeAssignment.status === 'out_for_delivery'
              ? 'Continue delivery'
              : 'Verify pickup',
          icon: FiTruck,
        }
      : {
          title: rider?.availability === 'online' ? 'Ready for a new job' : 'Reconnecting',
          message:
            rider?.availability === 'online'
              ? 'New delivery jobs will appear automatically.'
              : 'Keep the rider app open and connected.',
          path: '/rider/assigned',
          action: 'Check jobs',
          icon: FiCheckCircle,
        };

  const NextIcon = nextTask.icon;

  return (
    <div>
      <PageHeader title={`Hi ${firstName}`} subtitle="Your next delivery action is shown below." />
      <ApiConnectionBanner connected={apiConnected} />

      <Card className="overflow-hidden border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-950 text-xl text-white">
              <NextIcon />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Next step</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{nextTask.title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{nextTask.message}</p>
            </div>
          </div>
          <Link to={nextTask.path}>
            <Button icon={FiArrowRight}>{nextTask.action}</Button>
          </Link>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SimpleStat label="New jobs" value={stats.newAssignments} icon={FiPackage} />
        <SimpleStat label="Active" value={stats.active} icon={FiTruck} />
        <SimpleStat label="Completed" value={stats.completed} icon={FiCheckCircle} />
        <SimpleStat label="Today" value={formatCurrency(earnings.today)} icon={FiCreditCard} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <DeliveryActivityList activities={activities.slice(0, 5)} />
        <Card className="p-5">
          <h2 className="text-lg font-extrabold text-slate-950">Summary</h2>
          <div className="mt-4 space-y-3">
            <SummaryRow label="Payout pending" value={formatCurrency(earnings.riderPayoutPending)} />
            <SummaryRow label="High-risk jobs" value={String(stats.highRiskTasks)} icon={FiShield} />
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
              <span className="text-sm font-bold text-slate-500">Availability</span>
              <StatusBadge
                value={rider?.availability || 'offline'}
                pulse={rider?.availability === 'online'}
              />
            </div>
          </div>
          <Link to="/rider/earnings" className="mt-4 block text-center text-sm font-black text-slate-700">
            View earnings
          </Link>
        </Card>
      </div>
    </div>
  );
}

function SimpleStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof FiPackage;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
          <Icon />
        </span>
      </div>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof FiShield;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
      <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-500">
        {Icon ? <Icon /> : null}
        {label}
      </span>
      <strong className="text-slate-950">{value}</strong>
    </div>
  );
}
