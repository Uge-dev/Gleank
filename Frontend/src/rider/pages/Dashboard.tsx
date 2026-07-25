import { FiCheckCircle, FiCreditCard, FiMapPin, FiPackage, FiShield, FiTruck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useRiderData } from '../context/RiderDataContext';
import { formatCurrency } from '../utils/format';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import DeliveryActivityList from '../components/rider/DeliveryActivityList';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import ApiConnectionBanner from '../components/rider/ApiConnectionBanner';

export default function Dashboard() {
  const { rider, apiConnected } = useAuth();
  const { assignments, completed, earnings, activities } = useRiderData();
  const activeDeliveries = assignments.filter((item) => ['accepted', 'arrived_at_pickup', 'package_picked_up', 'out_for_delivery'].includes(item.status));
  const assignedOrders = assignments.filter((item) => item.status === 'assigned');
  const highRisk = assignments.filter((item) => item.riskLevel === 'high').length;

  return (
    <div>
      <PageHeader title={`Welcome ${rider?.fullName.split(' ')[0] || 'Rider'} 👋`} subtitle="Manage seller-assigned deliveries with pickup OTP, proof capture, delivery OTP, payment protection, and safety reporting." />
      <ApiConnectionBanner connected={apiConnected} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="New Assignments" value={assignedOrders.length} icon={FiPackage} tone="cyan" />
        <StatCard label="Active Deliveries" value={activeDeliveries.length} icon={FiTruck} tone="green" />
        <StatCard label="Completed" value={completed.length} icon={FiCheckCircle} tone="dark" />
        <StatCard label="Today's Earnings" value={formatCurrency(earnings.today)} icon={FiCreditCard} tone="orange" />
        <StatCard label="Platform Payout Pending" value={formatCurrency(earnings.riderPayoutPending)} icon={FiCreditCard} tone="purple" />
        <StatCard label="High Risk Tasks" value={highRisk} icon={FiShield} tone="dark" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <DeliveryActivityList activities={activities} />
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-lg font-extrabold text-slate-950">Trust readiness</h2>
            <p className="mt-1 text-sm text-slate-500">Your verification, profile completion and location readiness control delivery assignment eligibility.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <FiShield className="text-slate-950" />
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Verification</p>
                <StatusBadge value={rider?.verificationStatus || 'pending_review'} />
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <FiCheckCircle className="text-slate-950" />
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Profile</p>
                <strong className="text-lg text-slate-950">{rider?.profileCompletionPercent || 0}%</strong>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <FiMapPin className="text-slate-950" />
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Area</p>
                <strong className="text-sm text-slate-950">{rider?.activeZone || 'Not set'}</strong>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-extrabold text-slate-950">Live Delivery Queue</h2>
            <p className="mt-1 text-sm text-slate-500">Seller-assigned tasks across campus, physical market, nearby market, and used-market orders.</p>
            <div className="mt-5 space-y-3">
              {assignments.slice(0, 5).map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-slate-950">{assignment.sellerName}</p>
                    <p className="truncate text-sm text-slate-500">{assignment.marketName || assignment.orderChannel.replace(/_/g, ' ')} · {assignment.pickupLocation}</p>
                  </div>
                  <StatusBadge value={assignment.status} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
