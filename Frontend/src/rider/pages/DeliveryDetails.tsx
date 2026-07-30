import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiMapPin,
  FiPhoneCall,
  FiTruck,
} from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import ProductList from '../components/rider/ProductList';
import StatusBadge from '../components/ui/StatusBadge';

export default function DeliveryDetails() {
  const { orderId } = useParams();
  const { orders, unlockedOrderIds, reportSafetyIssue } = useRiderData();
  const order = orders.find((item) => item.id === orderId);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyNote, setSafetyNote] = useState('');
  const [reporting, setReporting] = useState(false);

  if (!order) return <Navigate to="/rider/active" replace />;
  if (!unlockedOrderIds.includes(order.id)) {
    return <Navigate to={`/rider/verify/${order.assignmentId}`} replace />;
  }

  const isPaid = order.paymentStatus === 'paid';

  async function submitSafetyReport() {
    setReporting(true);
    await reportSafetyIssue({
      orderId: order!.id,
      assignmentId: order!.assignmentId,
      type: 'other',
      note: safetyNote || 'Rider needs support on an active delivery.',
      locationLabel: order!.deliveryAddress,
    });
    setReporting(false);
    setSafetyOpen(false);
    setSafetyNote('');
  }

  return (
    <div>
      <PageHeader title="Deliver Order" subtitle="Take the package to the buyer and complete verification." />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gleenc-cyan">
                  Delivery address
                </p>
                <h2 className="mt-2 text-xl font-black text-slate-950">{order.customerName}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {order.deliveryAddress}
                </p>
                {order.deliveryNotes ? (
                  <p className="mt-2 text-sm text-slate-500">{order.deliveryNotes}</p>
                ) : null}
              </div>
              <StatusBadge value={order.status} />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a href={`tel:${order.customerPhone}`}>
                <Button variant="secondary" icon={FiPhoneCall} fullWidth>Call buyer</Button>
              </a>
              <Link to={`/rider/navigate/${order.assignmentId}`}>
                <Button variant="secondary" icon={FiMapPin} fullWidth>Navigate</Button>
              </Link>
            </div>
          </Card>

          <ProductList order={order} />
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-lg font-black text-slate-950">Seller</h2>
            <p className="mt-3 font-black text-slate-800">{order.sellerName}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{order.sellerPhone}</p>
            <a href={`tel:${order.sellerPhone}`} className="mt-4 block">
              <Button variant="secondary" icon={FiPhoneCall} fullWidth>Call seller</Button>
            </a>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-950">Final step</h2>
              <StatusBadge value={isPaid ? 'paid' : 'unpaid'} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {isPaid
                ? 'Ask the buyer for the delivery code, then add proof.'
                : 'Buyer payment must be confirmed before handover.'}
            </p>
            <Link to={`/rider/verify/${order.assignmentId}`} className="mt-5 block">
              <Button icon={isPaid ? FiCheckCircle : FiTruck} size="lg" fullWidth>
                {isPaid ? 'Complete delivery' : 'Open payment step'}
              </Button>
            </Link>
            <Button
              className="mt-3"
              variant="danger"
              icon={FiAlertTriangle}
              onClick={() => setSafetyOpen(true)}
              fullWidth
            >
              Report problem
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        open={safetyOpen}
        title="Report delivery problem"
        onClose={() => setSafetyOpen(false)}
        onConfirm={submitSafetyReport}
        confirmLabel={reporting ? 'Sending...' : 'Send report'}
      >
        <textarea
          value={safetyNote}
          onChange={(event) => setSafetyNote(event.target.value)}
          rows={4}
          placeholder="What happened?"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan"
        />
      </Modal>
    </div>
  );
}
