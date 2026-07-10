import { FiCheckCircle } from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import { formatCurrency, formatDateTime } from '../utils/format';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';

export default function CompletedDeliveries() {
  const { completed } = useRiderData();
  return (
    <div>
      <PageHeader title="Completed Deliveries" subtitle="History of successfully delivered packages." />
      {completed.length === 0 ? (
        <EmptyState icon={FiCheckCircle} title="No completed deliveries" message="Delivered orders will appear here after confirmation." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {completed.map((order) => (
            <Card key={order.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-950">{order.customerName}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Seller: {order.sellerName}</p>
                </div>
                <StatusBadge value="Delivered" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Delivery Date</p>
                  <p className="mt-2 text-sm font-bold text-slate-800">{formatDateTime(order.completedAt || order.orderDate)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Payment Method</p>
                  <p className="mt-2 text-sm font-bold text-slate-800">{order.paymentMethod === 'paid_online' ? 'Pay Now' : 'Pay at Delivery via Gleenc'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Amount</p>
                  <p className="mt-2 text-sm font-black text-slate-950">{formatCurrency(order.totalAmount)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
