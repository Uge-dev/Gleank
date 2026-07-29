import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiLock, FiMail, FiTruck } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { ApiClientError } from '../../services/apiClient';
import Button from '../../components/ui/Button';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showMainLoginLink, setShowMainLoginLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setShowMainLoginLink(false);
    setIsSubmitting(true);
    try {
      const rider = await login(email, password);
      if (rider.emailVerified === false) {
        navigate('/rider/verify-email');
        return;
      }
      navigate('/rider');
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.status === 403 &&
        /not a rider|buyer|seller|rider account/i.test(err.message)
      ) {
        setError('This is a buyer or seller account. Please log in through the buyer/seller page.');
        setShowMainLoginLink(true);
        return;
      }
      if (
        err instanceof ApiClientError &&
        err.status === 401
      ) {
        setError('Email or password is incorrect.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Email or password is incorrect.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-gleenc-soft p-4 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden rounded-[2rem] bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gleenc-cyan/25 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-gleenc-green/25 blur-3xl" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white">
            <img src="/Gleenc%20Mark.png" alt="" className="h-12 w-12 object-contain" />
          </div>
          <div>
            <p className="text-2xl font-black">Gleenc Rider</p>
            <p className="text-sm text-white/50">Delivery Management System</p>
          </div>
        </div>
        <div className="relative z-10 max-w-lg">
          <div className="mb-8 grid h-20 w-20 place-items-center rounded-[2rem] bg-white/10 text-4xl backdrop-blur">
            <FiTruck />
          </div>
          <h1 className="text-5xl font-black leading-tight tracking-tight">Secure campus deliveries without exposing private order data.</h1>
          <p className="mt-5 text-lg leading-8 text-white/60">Riders collect packages from sellers, verify customers with Pickup Codes, confirm payments, and complete deliveries with confidence.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-2 py-10">
        <motion.form initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onSubmit={handleSubmit} className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-7 shadow-soft">
          <div className="mb-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-3xl bg-white shadow-glow">
              <img src="/Gleenc%20Mark.png" alt="" className="h-14 w-14 object-contain" />
            </div>
            <h1 className="mt-5 text-3xl font-black text-slate-950">Welcome Rider</h1>
            <p className="mt-2 text-sm text-slate-500">Login to manage your assigned campus deliveries.</p>
          </div>

          <label className="mb-4 block">
            <span className="text-sm font-bold text-slate-700">Email</span>
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-gleenc-cyan">
              <FiMail className="text-slate-400" />
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" placeholder="rider@example.com" className="w-full bg-transparent text-sm outline-none" />
            </span>
          </label>

          <label className="mb-4 block">
            <span className="text-sm font-bold text-slate-700">Password</span>
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-gleenc-cyan">
              <FiLock className="text-slate-400" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required autoComplete="current-password" placeholder="Enter your password" className="w-full bg-transparent text-sm outline-none" />
            </span>
          </label>

          {error && (
            <div className="mb-4 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              <p>{error}</p>
              {showMainLoginLink && (
                <p className="mt-2">
                  Return to the buyer/seller login page{' '}
                  <Link to="/login" className="font-black underline">
                    here
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
          <Button fullWidth size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Login'}
          </Button>
          <p className="mt-4 text-center text-sm">
            <Link to="/rider/forgot-password" className="font-extrabold text-gleenc-cyan">Forgot password?</Link>
          </p>
          <p className="mt-5 text-center text-sm text-slate-500">New rider? <Link to="/rider/signup" className="font-extrabold text-gleenc-cyan">Create Riders Account</Link></p>
        </motion.form>
      </section>
    </main>
  );
}
