import { FiBarChart2, FiCheckCircle, FiCreditCard, FiDollarSign, FiTrendingUp } from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import { formatCurrency } from '../utils/format';
import EarningsChart from '../components/rider/EarningsChart';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';

export default function Earnings() {
  const { earnings } = useRiderData();
  return (
    <div>
      <PageHeader title="Earnings" subtitle="Track rider payouts, cash collected, online payments delivered, and delivery performance." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Today's Earnings" value={formatCurrency(earnings.today)} icon={FiDollarSign} tone="green" />
        <StatCard label="Weekly Earnings" value={formatCurrency(earnings.weekly)} icon={FiTrendingUp} tone="cyan" />
        <StatCard label="Monthly Earnings" value={formatCurrency(earnings.monthly)} icon={FiBarChart2} tone="purple" />
        <StatCard label="Cash Collected" value={formatCurrency(earnings.cashCollected)} icon={FiCreditCard} tone="orange" />
        <StatCard label="Online Payments Delivered" value={formatCurrency(earnings.onlinePaymentsDelivered)} icon={FiCreditCard} tone="dark" />
        <StatCard label="Completed Deliveries Count" value={earnings.completedDeliveriesCount} icon={FiCheckCircle} tone="green" />
      </div>
      <div className="mt-6">
        <EarningsChart earnings={earnings} />
      </div>
    </div>
  );
}
