import { FiLock, FiShield } from 'react-icons/fi';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Security and delivery preferences for the rider account." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-6">
          <div className="flex gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-50 text-gleenc-cyan"><FiShield /></div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">Privacy Mode</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Order details remain hidden until the customer Pickup Code is verified.</p>
              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Enabled</div>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-700"><FiLock /></div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">Account Security</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Password update, two-factor authentication, and device management can be connected to the backend later.</p>
              <button className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">Manage Security</button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
