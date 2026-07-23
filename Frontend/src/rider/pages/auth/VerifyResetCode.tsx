import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiKey } from 'react-icons/fi';
import Button from '../../components/ui/Button';

export default function RiderVerifyResetCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanCode = code.trim();

    if (cleanCode.length < 32) {
      setError('Enter the full reset code from your email.');
      return;
    }

    navigate(`/rider/reset-password?token=${encodeURIComponent(cleanCode)}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gleenc-soft p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-7 shadow-soft">
        <Link to="/rider/forgot-password" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-500">
          <FiArrowLeft /> Back
        </Link>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-amber-50 text-2xl text-gleenc-red">
          <FiKey />
        </div>
        <div className="mt-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-gleenc-red">Rider reset code</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Verify reset code</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Paste the recovery code sent to your rider email, then set a new password.
          </p>
        </div>

        <label className="mt-6 block">
          <span className="text-sm font-bold text-slate-700">Reset code</span>
          <textarea
            value={code}
            onChange={(event) => {
              setError('');
              setCode(event.target.value);
            }}
            required
            rows={4}
            className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-red"
            placeholder="Paste the code from your email"
          />
        </label>

        {error && <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}

        <Button fullWidth size="lg" className="mt-5">
          Continue
        </Button>
      </form>
    </main>
  );
}
