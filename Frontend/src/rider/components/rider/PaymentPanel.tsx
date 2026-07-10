import { useEffect, useState } from 'react';
import { FiCreditCard, FiLink, FiRefreshCw } from 'react-icons/fi';
import type { FullDeliveryOrder } from '../../types';
import { formatCurrency } from '../../utils/format';
import { paymentStatusLabel } from '../../utils/status';
import { useRiderData } from '../../context/RiderDataContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import StatusBadge from '../ui/StatusBadge';

export default function PaymentPanel({ order }: { order: FullDeliveryOrder }) {
  const { generatePayment, confirmOnlinePayment } = useRiderData();
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<{ paymentLink: string; reference: string } | null>(
    order.paymentLink && order.paymentReference ? { paymentLink: order.paymentLink, reference: order.paymentReference } : null
  );

  useEffect(() => {
    setPaymentData(order.paymentLink && order.paymentReference ? { paymentLink: order.paymentLink, reference: order.paymentReference } : null);
  }, [order.paymentLink, order.paymentReference]);

  function handleGeneratePayment() {
    const result = generatePayment(order.id);
    setPaymentData(result);
    setLoadingPayment(true);
    window.setTimeout(() => {
      confirmOnlinePayment(order.id);
      setLoadingPayment(false);
    }, 2600);
  }

  const isPaid = order.paymentStatus === 'paid';

  return (
    <Card className="p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-extrabold text-slate-950">Payment</h2>
          <p className="mt-1 text-sm text-slate-500">Payment must be confirmed before delivery completion.</p>
        </div>
        <StatusBadge value={order.paymentStatus} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Method</p>
          <p className="mt-2 font-extrabold text-slate-950">{order.paymentMethod === 'paid_online' ? 'Pay Now' : 'Pay at Delivery'}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Amount</p>
          <p className="mt-2 font-extrabold text-slate-950">{formatCurrency(order.totalAmount)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Status</p>
          <p className="mt-2 font-extrabold text-slate-950">{paymentStatusLabel(order.paymentStatus)}</p>
        </div>
      </div>

      {!isPaid && (
        <div className="mt-5 rounded-[1.3rem] border border-rose-100 bg-rose-50 p-4">
          <p className="font-bold text-rose-700">Outstanding Amount: {formatCurrency(order.totalAmount)}</p>
          <p className="mt-1 text-sm leading-6 text-rose-600">Generate a Gleenc/Paystack payment link for the buyer. Riders must never collect cash or mark payment manually.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button icon={FiCreditCard} onClick={handleGeneratePayment} disabled={loadingPayment} fullWidth>
              {loadingPayment ? 'Waiting for Payment...' : 'Generate Paystack Payment'}
            </Button>
          </div>
        </div>
      )}

      {paymentData && (
        <div className="mt-5 rounded-[1.3rem] border border-cyan-100 bg-cyan-50 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="grid h-32 w-32 shrink-0 place-items-center rounded-2xl border-8 border-white bg-white shadow-card">
              <div className="qr-grid h-20 w-20 rounded-lg opacity-80" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Payment QR Code</p>
              <p className="mt-1 font-extrabold text-slate-950">Reference: {paymentData.reference}</p>
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white p-3 text-sm font-semibold text-slate-600">
                <FiLink className="shrink-0 text-cyan-600" />
                <span className="truncate">{paymentData.paymentLink}</span>
              </div>
              {loadingPayment && <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-cyan-700"><FiRefreshCw className="animate-spin" /> Waiting for backend confirmation...</p>}
            </div>
          </div>
        </div>
      )}

      {isPaid && (
        <div className="mt-5 rounded-[1.3rem] border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          Payment confirmed. Complete Delivery is now enabled.
        </div>
      )}
    </Card>
  );
}
