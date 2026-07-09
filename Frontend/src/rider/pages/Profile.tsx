import { FiStar, FiTruck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';

export default function Profile() {
  const { rider, updateAvailability } = useAuth();
  if (!rider) return null;

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your rider account, vehicle, contact, rating, and availability details." />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-7 text-center">
          <img src={rider.profilePhoto} alt={rider.fullName} className="mx-auto h-28 w-28 rounded-[2rem] object-cover shadow-card" />
          <h2 className="mt-5 text-2xl font-black text-slate-950">{rider.fullName}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{rider.email}</p>
          <div className="mt-4 flex justify-center gap-2">
            <StatusBadge value={rider.status} />
            <StatusBadge value={rider.availability} pulse={rider.availability === 'online'} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <FiStar className="mx-auto text-xl text-amber-500" />
              <p className="mt-2 text-xl font-black text-slate-950">{rider.deliveryRating}</p>
              <p className="text-xs font-bold text-slate-400">Rating</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <FiTruck className="mx-auto text-xl text-gleenc-cyan" />
              <p className="mt-2 text-xl font-black text-slate-950">{rider.vehicleType}</p>
              <p className="text-xs font-bold text-slate-400">Vehicle</p>
            </div>
          </div>
        </Card>

        <Card className="p-7">
          <h2 className="text-xl font-extrabold text-slate-950">Rider Details</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Info label="Full Name" value={rider.fullName} />
            <Info label="Phone Number" value={rider.phone} />
            <Info label="Email" value={rider.email} />
            <Info label="Vehicle Type" value={rider.vehicleType} />
            <Info label="Admin Verification" value={rider.verificationStatus.replace(/_/g, ' ')} />
            <Info label="Phone Verification" value="SMS OTP required before phone changes" />
          </div>
          <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            <strong className="block text-amber-950">Profile completion rule</strong>
            Your email must be verified and admin must approve your rider profile before you can receive deliveries.
            Phone number changes should go through OTP verification once the SMS provider is connected.
          </div>
          <div className="mt-7">
            <label className="text-sm font-bold text-slate-700">Availability</label>
            <select value={rider.availability} onChange={(event) => updateAvailability(event.target.value as typeof rider.availability)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-gleenc-cyan">
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="busy">Busy</option>
              <option value="break">Break</option>
            </select>
            <p className="mt-2 text-sm text-slate-500">Sellers can only assign delivery tasks to available online riders.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 font-extrabold text-slate-950">{value}</p>
    </div>
  );
}
