import { FiShield } from 'react-icons/fi';
import { useMemo, useState } from 'react';
import { useRiderData } from '../context/RiderDataContext';
import AssignmentCard from '../components/rider/AssignmentCard';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';

const categories = ['All', 'Food', 'Groceries', 'Fashion', 'Electronics', 'Books', 'Health', 'Beauty', 'Household', 'Used Items', 'Others'];
const channels = ['All', 'campus', 'physical_market', 'nearby_market', 'used_market'];

export default function AssignedOrders() {
  const { assignments } = useRiderData();
  const [category, setCategory] = useState('All');
  const [channel, setChannel] = useState('All');
  const assigned = assignments.filter((item) => ['assigned', 'accepted', 'arrived_at_pickup'].includes(item.status));
  const filtered = useMemo(() => {
    return assigned.filter((item) => {
      const categoryOk = category === 'All' || item.category === category;
      const channelOk = channel === 'All' || item.orderChannel === channel;
      return categoryOk && channelOk;
    });
  }, [assigned, category, channel]);

  return (
    <div>
      <PageHeader
        title="Assigned Orders"
        subtitle="Private seller-assigned tasks. Full customer/order/payment data stays locked until seller pickup OTP and proof are recorded."
      />

      <div className="mb-4 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {channels.map((item) => (
            <button
              key={item}
              onClick={() => setChannel(item)}
              className={`rounded-full px-4 py-2 text-sm font-bold capitalize transition-all ${channel === item ? 'bg-slate-950 text-white' : 'bg-white text-slate-500 hover:text-slate-950'}`}
            >
              {item.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-5 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${category === item ? 'bg-gleenc-gradient text-gleenc-dark' : 'bg-white text-slate-500 hover:text-slate-950'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FiShield} title="No private assignments" message="No seller-assigned delivery tasks are currently waiting in this category/channel." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {filtered.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}
        </div>
      )}
    </div>
  );
}
