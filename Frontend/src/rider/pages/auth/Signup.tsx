import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    vehicleType: 'Motorcycle',
    vehiclePlate: '',
    activeZone: '',
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await signup(form);
    navigate('/rider/profile');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gleenc-soft p-4">
      <motion.form initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onSubmit={handleSubmit} className="w-full max-w-2xl rounded-[2rem] border border-slate-100 bg-white p-7 shadow-soft">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-gleenc-cyan">Gleenc Rider</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Create Rider Account</h1>
          <p className="mt-2 text-sm text-slate-500">
            Create your rider account, verify your email, then wait for admin approval before handling deliveries.
            Phone OTP verification is required before changing your rider contact number once SMS is connected.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Full Name</span>
            <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Phone Number</span>
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Email</span>
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Password</span>
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Vehicle Type</span>
            <select value={form.vehicleType} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan">
              <option>Walking</option>
              <option>Bicycle</option>
              <option>Motorcycle</option>
              <option>Car</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Coverage Area</span>
            <input value={form.activeZone} onChange={(event) => setForm({ ...form, activeZone: event.target.value })} placeholder="FUPRE, Ugbomro, Effurun..." className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Government ID</span>
            <input type="file" className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Bike Number</span>
            <input value={form.vehiclePlate} onChange={(event) => setForm({ ...form, vehiclePlate: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Profile Picture</span>
            <input type="file" className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
        </div>

        <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          <strong className="block text-amber-900">Verification flow</strong>
          1. Verify email after signup. 2. Admin reviews your rider details. 3. Complete phone OTP verification when SMS is connected.
          Riders cannot go online or receive delivery assignments until admin marks the profile verified.
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Already have an account? <Link to="/rider/login" className="font-extrabold text-gleenc-cyan">Login</Link></p>
          <Button size="lg">Create Account</Button>
        </div>
      </motion.form>
    </main>
  );
}
