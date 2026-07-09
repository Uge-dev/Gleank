import type { IconType } from 'react-icons';
import { FiPackage } from 'react-icons/fi';
import Card from './Card';

export default function EmptyState({ title, message, icon: Icon = FiPackage }: { title: string; message: string; icon?: IconType }) {
  return (
    <Card className="flex flex-col items-center justify-center p-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-cyan-50 text-gleenc-cyan">
        <Icon className="text-3xl" />
      </div>
      <h3 className="mt-5 text-lg font-extrabold text-slate-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
    </Card>
  );
}
