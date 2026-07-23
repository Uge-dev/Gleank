import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiLock } from 'react-icons/fi';
import { resetPassword } from '../../../services/auth.service';
import Button from '../../components/ui/Button';

export default function RiderResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (searchParams.get('token') || '').trim(), [searchParams]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (!token) {
      setError('Reset code is missing. Request a fresh rider reset link.');
      return;
    }

    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await resetPassword({ token, password, role: 'rider' });
      setMessage(response.message);
      window.setTimeout(() => navigate('/rider/login', { replace: true }), 1200);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Rider password could not be reset.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gleenc-soft p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-7 shadow-soft">
        <Link to="/rider/login" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-500">
          <FiArrowLeft /> Rider login
        </Link>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-amber-50 text-2xl text-gleenc-red">
          <FiLock />
        </div>
        <div className="mt-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-gleenc-red">Rider recovery</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Set new password</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Create a fresh password for this rider account.
          </p>
        </div>

        <label className="mt-6 block">
          <span className="text-sm font-bold text-slate-700">New password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-red"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-bold text-slate-700">Confirm password</span>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-red"
          />
        </label>

        {message && (
          <p className="mt-4 flex gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
            <FiCheckCircle className="mt-0.5 shrink-0" /> {message}
          </p>
        )}
        {error && <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}

        <Button fullWidth size="lg" disabled={isSubmitting} className="mt-5">
          {isSubmitting ? 'Updating password...' : 'Reset password'}
        </Button>
      </form>
    </main>
  );
}
