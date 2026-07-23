import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiMail } from 'react-icons/fi';
import { requestPasswordReset } from '../../../services/auth.service';
import Button from '../../components/ui/Button';

export default function RiderForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset(email.trim(), 'rider');
      setMessage(response.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Password reset could not be started.');
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
          <FiMail />
        </div>
        <div className="mt-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-gleenc-red">Rider recovery</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Reset rider password</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter the email on your rider account. If it matches a rider profile, Gleenc will send a secure reset link.
          </p>
        </div>

        <label className="mt-6 block">
          <span className="text-sm font-bold text-slate-700">Rider email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            autoComplete="email"
            placeholder="rider@example.com"
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
          {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
        </Button>

        <button
          type="button"
          onClick={() => navigate('/rider/verify-reset-code')}
          className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
        >
          I already have a reset code
        </button>
      </form>
    </main>
  );
}
