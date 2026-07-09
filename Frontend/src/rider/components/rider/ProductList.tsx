import type { FullDeliveryOrder } from '../../types';
import { formatCurrency } from '../../utils/format';
import Card from '../ui/Card';

export default function ProductList({ order }: { order: FullDeliveryOrder }) {
  return (
    <Card className="p-5">
      <h2 className="text-xl font-extrabold text-slate-950">Products</h2>
      <div className="mt-5 space-y-3">
        {order.products.map((product) => (
          <div key={product.id} className="flex gap-4 rounded-2xl bg-slate-50 p-3">
            <img src={product.image} alt={product.name} className="h-20 w-20 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-slate-950">{product.name}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Qty: {product.quantity}</p>
              <p className="mt-2 text-sm font-black text-slate-950">{formatCurrency(product.price)}</p>
            </div>
            <p className="hidden text-sm font-extrabold text-slate-950 sm:block">{formatCurrency(product.quantity * product.price)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
