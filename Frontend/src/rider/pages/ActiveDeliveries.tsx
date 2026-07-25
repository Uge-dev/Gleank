import { FiNavigation, FiSearch, FiShield } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useRiderData } from '../context/RiderDataContext';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';

export default function ActiveDeliveries() {
  const { assignments, unlockedOrderIds, orders } = useRiderData();
  const active = assignments.filter((item) => ['accepted', 'arrived_at_pickup', 'package_picked_up', 'out_for_delivery'].includes(item.status));

  return (
    <div>
      <PageHeader title="Active Deliveries" subtitle="Accepted deliveries and packages already picked from sellers. Verify pickup before full details unlock; verify delivery OTP before completing." />
      {active.length === 0 ? (
        <EmptyState title="No active delivery" message="Accept a seller-assigned delivery first, then it will appear here." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {active.map((assignment) => {
            const order = orders.find((item) => item.assignmentId === assignment.id);
            const isUnlocked = order ? unlockedOrderIds.includes(order.id) : false;
            return (
              <Card key={assignment.id} className="p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-950">{assignment.sellerName}</h3>
                    <p className="mt-1 text-sm text-slate-500">{assignment.marketName || assignment.orderChannel.replace(/_/g, ' ')} · {assignment.category}</p>
                  </div>
                  <StatusBadge value={assignment.status} pulse />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pickup</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{assignment.pickupLocation}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Delivery Area</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{assignment.deliveryLocation}</p>
                    {!isUnlocked && <p className="mt-1 text-xs text-amber-600"><FiShield className="inline" /> Full address locked until pickup proof.</p>}
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <a className="flex-1" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(isUnlocked && order ? order.deliveryAddress : assignment.pickupLocation)}`}>
                    <Button variant="secondary" icon={FiNavigation} fullWidth>Navigate</Button>
                  </a>
                  {isUnlocked && order ? (
                    <Link className="flex-1" to={`/rider/delivery/${order.id}`}><Button icon={FiSearch} fullWidth>View Details</Button></Link>
                  ) : (
                    <Link className="flex-1" to="/rider/verify-code"><Button icon={FiSearch} fullWidth>Verify Pickup</Button></Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
