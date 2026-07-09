import { useMemo, useState } from 'react';
import { FiCheckCircle, FiCreditCard } from 'react-icons/fi';
import { useRiderData } from '../context/RiderDataContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { formatCurrency, formatDateTime } from '../utils/format';

export default function CashReconciliation() {
  const { orders, completed, submitCashReconciliation } = useRiderData();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const cashOrders = useMemo(() => [...orders, ...completed].filter((order) => order.paymentStatus === 'paid_cash'), [orders, completed]);
  const selectedAmount = cashOrders.filter((order) => selected.includes(order.id)).reduce((sum, order) => sum + order.totalAmount, 0);

  function toggle(orderId: string) {
    setSelected((current) => current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]);
  }

  async function submit() {
    await submitCashReconciliation(selected, note);
    setSelected([]);
    setNote('');
  }

  return (
    <div>
      <PageHeader title="Cash Reconciliation" subtitle="Track pay-on-delivery cash collected from buyers and submit reconciliation for admin approval." />
      {cashOrders.length === 0 ? (
        <EmptyState icon={FiCreditCard} title="No cash orders" message="Cash-collected orders will appear here after delivery payment is recorded." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.55fr]">
          <div className="space-y-4">
            {cashOrders.map((order) => (
              <Card key={order.id} className="p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-950">{order.orderNumber}</h3>
                    <p className="mt-1 text-sm text-slate-500">{order.customerName} · {formatDateTime(order.orderDate)}</p>
                  </div>
                  <StatusBadge value={order.cashReconciliationStatus} />
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-lg font-black text-slate-950">{formatCurrency(order.totalAmount)}</p>
                  <label className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                    <input type="checkbox" checked={selected.includes(order.id)} onChange={() => toggle(order.id)} disabled={order.cashReconciliationStatus === 'submitted' || order.cashReconciliationStatus === 'approved'} />
                    Select for reconciliation
                  </label>
                </div>
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <h2 className="text-xl font-extrabold text-slate-950">Submit Cash</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Selected amount must be handed over or reconciled according to Gleank admin rules.</p>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Selected Amount</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{formatCurrency(selectedAmount)}</p>
            </div>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Optional note: transfer reference, cash handover person, location..." className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
            <Button className="mt-4" icon={FiCheckCircle} disabled={selected.length === 0} onClick={submit} fullWidth>Submit Reconciliation</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
