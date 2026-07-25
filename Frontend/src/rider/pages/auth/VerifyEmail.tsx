import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiAlertCircle, FiCheckCircle, FiMail, FiRefreshCw } from 'react-icons/fi';
import { resendVerification, verifyEmail } from '../../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const { rider, refreshSession } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;

    let active = true;

    void verifyEmail(token)
      .then(async (result) => {
        if (!active) return;
        setMessage(result.message || 'Email verified successfully.');
        await refreshSession().catch(() => undefined);
        window.setTimeout(() => {
          if (active) navigate('/rider', { replace: true });
        }, 900);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Email verification could not be completed.',
        );
      })
      .finally(() => {
        if (active) setIsWorking(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, refreshSession, token]);

  async function handleResend() {
    setError('');
    setMessage('');
    setIsWorking(true);

    try {
      const result = await resendVerification();
      setMessage(result.message || 'Verification email prepared.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Verification email could not be prepared.',
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gleenc-soft p-4">
      <motion.section
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-7 text-center shadow-soft"
      >
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-cyan-50 text-3xl text-gleenc-cyan">
          {message || rider?.emailVerified ? <FiCheckCircle /> : <FiMail />}
        </div>

        <p className="mt-5 text-sm font-black uppercase tracking-[0.28em] text-gleenc-cyan">
          Rider email verification
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">
          {message || rider?.emailVerified ? 'Email verified' : 'Verify your rider email'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Rider dispatch, delivery codes, and profile checks stay locked until your email is verified.
        </p>

        {isWorking && (
          <p className="mt-5 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
            Checking verification link...
          </p>
        )}

        {error && (
          <p className="mt-5 inline-flex w-full items-center gap-2 rounded-2xl bg-rose-50 p-3 text-left text-sm font-bold text-rose-700">
            <FiAlertCircle /> {error}
          </p>
        )}

        {message && (
          <p className="mt-5 inline-flex w-full items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-left text-sm font-bold text-emerald-700">
            <FiCheckCircle /> {message}
          </p>
        )}

        {!rider?.emailVerified && (
          <Button className="mt-6" fullWidth disabled={isWorking} onClick={handleResend}>
            <FiRefreshCw />
            {isWorking ? 'Preparing...' : 'Resend verification'}
          </Button>
        )}

        <div className="mt-5 flex flex-col gap-2 text-sm font-bold">
          <Link to="/rider" className="text-gleenc-cyan">Continue to Rider Dashboard</Link>
          <Link to="/rider/login" className="text-slate-500">Back to Rider Login</Link>
        </div>
      </motion.section>
    </main>
  );
}
