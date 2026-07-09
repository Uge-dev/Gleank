import type { EarningsSummary } from '../../types';
import { formatCurrency } from '../../utils/format';
import Card from '../ui/Card';

export default function EarningsChart({ earnings }: { earnings: EarningsSummary }) {
  const max = Math.max(...earnings.chart.map((item) => item.amount));
  return (
    <Card className="p-5">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-950">Weekly Earnings Chart</h2>
          <p className="mt-1 text-sm text-slate-500">Delivery earning trend for the week.</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">+12.4%</span>
      </div>
      <div className="flex h-64 items-end gap-3 rounded-[1.5rem] bg-slate-50 p-4">
        {earnings.chart.map((item) => (
          <div key={item.label} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex h-44 w-full items-end justify-center rounded-full bg-white p-1">
              <div
                className="w-full rounded-full bg-gleenc-gradient shadow-glow transition-all duration-500"
                style={{ height: `${Math.max((item.amount / max) * 100, 8)}%` }}
                title={formatCurrency(item.amount)}
              />
            </div>
            <span className="text-xs font-bold text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
