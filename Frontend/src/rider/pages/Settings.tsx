import { FiLock, FiMail, FiShield } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { rider } = useAuth();

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
              <p className="mt-2 text-sm leading-6 text-slate-500">
                This is the rider-only security area. Password reset works from the shared Gleenc login, but it will return this account to the rider workspace because the account role is rider.
              </p>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
                <p className="flex items-center gap-2"><FiMail /> {rider?.email || 'Rider email not loaded'}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">Use this same email on the normal Gleenc login page. Gleenc will detect rider role and open Rider Dashboard.</p>
              </div>
              <Link to="/rider/forgot-password" className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">
                Reset Rider Password
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
