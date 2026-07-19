import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    vehicleType: 'motorcycle',
    vehiclePlate: '',
    activeZone: '',
    maxPackageSize: 'small_medium',
    maxWeightClass: 'up_to_medium',
    fragileHandlingAbility: 'can_handle_fragile',
    deliveryBagType: 'medium_delivery_bag',
    maxPickupsPerBatch: 4,
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!identityDocument || !selfie) {
      setError('Upload rider government ID and profile/selfie image before creating your rider account.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signup({ ...form, identityDocument, selfie });
      navigate('/verify-email');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Rider account could not be created.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gleenc-soft p-4">
      <motion.form initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onSubmit={handleSubmit} className="w-full max-w-2xl rounded-[2rem] border border-slate-100 bg-white p-7 shadow-soft">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-gleenc-cyan">Gleenc Rider</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Create Rider Account</h1>
          <p className="mt-2 text-sm text-slate-500">
            Create your rider account, verify your email, then wait for admin approval before handling deliveries.
            Phone OTP verification is required before changing your rider contact number.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Full Name</span>
            <input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Phone Number</span>
            <input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Email</span>
            <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Password</span>
            <input required type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Vehicle Type</span>
            <select required value={form.vehicleType} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan">
              <option value="walking">Walking</option>
              <option value="bicycle">Bicycle</option>
              <option value="motorcycle">Motorcycle</option>
              <option value="tricycle_keke">Tricycle/Keke</option>
              <option value="car">Car</option>
              <option value="van">Van</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Coverage Area</span>
            <input required value={form.activeZone} onChange={(event) => setForm({ ...form, activeZone: event.target.value })} placeholder="FUPRE, Ugbomro, Effurun..." className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Maximum Package Size</span>
            <select required value={form.maxPackageSize} onChange={(event) => setForm({ ...form, maxPackageSize: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan">
              <option value="small_only">Small only</option>
              <option value="small_medium">Small + medium</option>
              <option value="small_medium_large">Small, medium + large</option>
              <option value="large_and_bulky">Large and bulky</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Maximum Weight</span>
            <select required value={form.maxWeightClass} onChange={(event) => setForm({ ...form, maxWeightClass: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan">
              <option value="very_light_only">Very light only</option>
              <option value="up_to_light">Up to light</option>
              <option value="up_to_medium">Up to medium</option>
              <option value="up_to_heavy">Up to heavy</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Fragile Handling</span>
            <select required value={form.fragileHandlingAbility} onChange={(event) => setForm({ ...form, fragileHandlingAbility: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan">
              <option value="cannot_handle_fragile">Cannot handle fragile</option>
              <option value="can_handle_fragile">Can handle fragile</option>
              <option value="can_handle_very_fragile">Can handle very fragile</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Delivery Bag / Box</span>
            <select required value={form.deliveryBagType} onChange={(event) => setForm({ ...form, deliveryBagType: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan">
              <option value="none">None</option>
              <option value="small_delivery_bag">Small delivery bag</option>
              <option value="medium_delivery_bag">Medium delivery bag</option>
              <option value="large_delivery_box">Large delivery box</option>
              <option value="insulated_bag">Insulated bag</option>
              <option value="fragile_item_box">Fragile item box</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Max Pickups Per Batch</span>
            <input required type="number" min={1} max={5} value={form.maxPickupsPerBatch} onChange={(event) => setForm({ ...form, maxPickupsPerBatch: Number(event.target.value) })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Government ID</span>
            <input type="file" accept="image/*" required onChange={(event) => setIdentityDocument(event.target.files?.[0] || null)} className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Bike Number</span>
            <input required value={form.vehiclePlate} onChange={(event) => setForm({ ...form, vehiclePlate: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Profile Picture</span>
            <input type="file" accept="image/*" required onChange={(event) => setSelfie(event.target.files?.[0] || null)} className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gleenc-cyan" />
          </label>
        </div>

        {error && <p className="mb-5 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}

        <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          <strong className="block text-amber-900">Verification flow</strong>
          1. Verify email after signup. 2. Admin reviews your rider details. 3. Complete phone OTP verification.
          Riders cannot go online or receive delivery assignments until admin marks the profile verified.
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Already have an account? <Link to="/rider/login" className="font-extrabold text-gleenc-cyan">Login</Link></p>
          <Button size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </Button>
        </div>
      </motion.form>
    </main>
  );
}
