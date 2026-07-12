import { useEffect, useState } from 'react';
import { FiMapPin, FiSave, FiStar, FiTruck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import {
  getRiderCapacityProfile,
  getZones,
  updateRiderCapacityProfile,
  type DeliveryZone,
  type RiderCapacityProfile,
} from '../../services/logistics.service';

export default function Profile() {
  const { rider, updateAvailability } = useAuth();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [capacity, setCapacity] = useState<RiderCapacityProfile | null>(null);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([getZones(), getRiderCapacityProfile()])
      .then(([zoneResponse, capacityResponse]) => {
        if (!active) return;
        setZones(zoneResponse.zones);
        setCapacity(capacityResponse.capacityProfile);
      })
      .catch(() => {
        if (active) setNotice('Capacity settings could not be loaded yet.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (!rider) return null;

  async function saveCapacity() {
    if (!capacity) return;
    setSavingCapacity(true);
    setNotice('');
    try {
      const response = await updateRiderCapacityProfile(capacity);
      setCapacity(response.capacityProfile);
      setNotice('Delivery capacity updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Capacity could not be updated.');
    } finally {
      setSavingCapacity(false);
    }
  }

  function toggleZone(zoneId: string) {
    setCapacity((current) => {
      if (!current) return current;
      const exists = current.serviceZoneIds.includes(zoneId);
      return {
        ...current,
        serviceZoneIds: exists
          ? current.serviceZoneIds.filter((id) => id !== zoneId)
          : [...current.serviceZoneIds, zoneId],
      };
    });
  }

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your rider account, vehicle, contact, rating, and availability details." />
      {notice && (
        <div className="mb-4 rounded-3xl bg-emerald-50 px-5 py-4 text-sm font-extrabold text-emerald-700">
          {notice}
        </div>
      )}
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

        <Card className="p-7 xl:col-span-2">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">Delivery Capacity</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Gleenc uses this to avoid assigning packages beyond your vehicle, bag,
                fragile handling ability, pickup count, and service zones.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveCapacity()}
              disabled={!capacity || savingCapacity}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              <FiSave /> {savingCapacity ? 'Saving...' : 'Save capacity'}
            </button>
          </div>

          {capacity && (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <CapacitySelect label="Transport type" value={capacity.transportType} onChange={(value) => setCapacity({ ...capacity, transportType: value })} options={[
                ['walking', 'Walking'],
                ['bicycle', 'Bicycle'],
                ['motorcycle', 'Motorcycle'],
                ['tricycle_keke', 'Tricycle/Keke'],
                ['car', 'Car'],
                ['van', 'Van'],
              ]} />
              <CapacitySelect label="Maximum package size" value={capacity.maxPackageSize} onChange={(value) => setCapacity({ ...capacity, maxPackageSize: value })} options={[
                ['small_only', 'Small only'],
                ['small_medium', 'Small + medium'],
                ['small_medium_large', 'Small, medium + large'],
                ['large_and_bulky', 'Large and bulky'],
                ['extra_large_supported', 'Extra large supported'],
              ]} />
              <CapacitySelect label="Maximum weight" value={capacity.maxWeightClass} onChange={(value) => setCapacity({ ...capacity, maxWeightClass: value })} options={[
                ['very_light_only', 'Very light only'],
                ['up_to_light', 'Up to light'],
                ['up_to_medium', 'Up to medium'],
                ['up_to_heavy', 'Up to heavy'],
                ['very_heavy_supported', 'Very heavy supported'],
              ]} />
              <CapacitySelect label="Fragile handling" value={capacity.fragileHandlingAbility} onChange={(value) => setCapacity({ ...capacity, fragileHandlingAbility: value })} options={[
                ['cannot_handle_fragile', 'Cannot handle fragile'],
                ['can_handle_fragile', 'Can handle fragile'],
                ['can_handle_very_fragile', 'Can handle very fragile'],
              ]} />
              <CapacitySelect label="Delivery bag / box" value={capacity.deliveryBagType} onChange={(value) => setCapacity({ ...capacity, deliveryBagType: value })} options={[
                ['none', 'None'],
                ['small_delivery_bag', 'Small delivery bag'],
                ['medium_delivery_bag', 'Medium delivery bag'],
                ['large_delivery_box', 'Large delivery box'],
                ['insulated_bag', 'Insulated bag'],
                ['fragile_item_box', 'Fragile item box'],
              ]} />
              <label className="rounded-3xl bg-slate-50 p-4">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Max pickups per batch</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={capacity.maxPickupsPerBatch}
                  onChange={(event) => setCapacity({ ...capacity, maxPickupsPerBatch: Number(event.target.value) })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none"
                />
              </label>
              <CapacitySelect label="GPS / zone mode" value={capacity.gpsPermissionStatus} onChange={(value) => setCapacity({ ...capacity, gpsPermissionStatus: value })} options={[
                ['gps_enabled', 'GPS enabled'],
                ['gps_disabled', 'GPS disabled'],
                ['gps_permission_denied', 'GPS denied'],
                ['gps_unavailable', 'GPS unavailable'],
              ]} />
              <CapacitySelect label="Current working zone" value={capacity.currentZoneId || ''} onChange={(value) => setCapacity({ ...capacity, currentZoneId: value || null })} options={[
                ['', 'Select zone'],
                ...zones.map((zone) => [zone.id, zone.name] as [string, string]),
              ]} />
              <label className="flex items-center gap-3 rounded-3xl bg-emerald-50 p-4 text-sm font-black text-emerald-800">
                <input
                  type="checkbox"
                  checked={capacity.canReceiveAutoDispatch}
                  onChange={(event) => setCapacity({ ...capacity, canReceiveAutoDispatch: event.target.checked })}
                  className="h-5 w-5 accent-emerald-600"
                />
                Receive automated dispatches
              </label>
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-slate-100 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <FiMapPin /> Service zones
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => toggleZone(zone.id)}
                  className={`rounded-full px-4 py-2 text-xs font-black capitalize ${
                    capacity?.serviceZoneIds.includes(zone.id)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {zone.name}
                </button>
              ))}
            </div>
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

function CapacitySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-3xl bg-slate-50 p-4">
      <span className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
