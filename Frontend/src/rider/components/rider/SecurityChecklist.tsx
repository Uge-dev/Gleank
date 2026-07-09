import { FiCheckCircle, FiShield } from 'react-icons/fi';
import Card from '../ui/Card';

export default function SecurityChecklist({ title = 'Security Checklist', items }: { title?: string; items: string[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-50 text-gleenc-cyan"><FiShield /></span>
        <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">
            <FiCheckCircle className="mt-1 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
