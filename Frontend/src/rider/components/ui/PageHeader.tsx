import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"
    >
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-gleenc-cyan">Gleenc Logistics</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </motion.div>
  );
}
