import { FiCheck, FiNavigation, FiPackage, FiTruck } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useRiderData } from '../context/RiderDataContext';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';

export default function ActiveDeliveries() {
  const { assignments, unlockedOrderIds, orders } = useRiderData();
  const active = assignments.filter((item) =>
    ['accepted', 'arrived_at_pickup', 'package_picked_up', 'out_for_delivery'].includes(item.status),
  );

  return (
    <div>
      <PageHeader title="Active Deliveries" subtitle="Finish pickup, then deliver to the buyer." />
      {active.length === 0 ? (
        <EmptyState
          icon={FiTruck}
          title="No active delivery"
          message="Accepted jobs will appear here."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {active.map((assignment) => {
            const order = orders.find((item) => item.assignmentId === assignment.id);
            const pickupDone = order ? unlockedOrderIds.includes(order.id) : false;
            const nextPath = pickupDone && order
              ? `/rider/delivery/${order.id}`
              : `/rider/verify/${assignment.id}`;
            return (
              <Card key={assignment.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">{assignment.sellerName}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {assignment.packageSummary || assignment.category}
                    </p>
                  </div>
                  <StatusBadge value={assignment.status} pulse />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Step done={pickupDone} icon={FiPackage} label="1. Pickup" />
                  <Step done={false} active={pickupDone} icon={FiTruck} label="2. Deliver" />
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {pickupDone ? 'Deliver to' : 'Pick up from'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {pickupDone && order ? order.deliveryAddress : assignment.pickupLocation}
                  </p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link to={`/rider/navigate/${assignment.id}`}>
                    <Button variant="secondary" icon={FiNavigation} fullWidth>Navigate</Button>
                  </Link>
                  <Link to={nextPath}>
                    <Button icon={pickupDone ? FiTruck : FiPackage} fullWidth>
                      {pickupDone ? 'Continue delivery' : 'Verify pickup'}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Step({
  done,
  active = false,
  icon: Icon,
  label,
}: {
  done: boolean;
  active?: boolean;
  icon: typeof FiPackage;
  label: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-2xl p-3 text-sm font-black ${
      done || active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
    }`}>
      {done ? <FiCheck /> : <Icon />}
      {label}
    </div>
  );
}
