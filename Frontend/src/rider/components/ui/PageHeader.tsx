import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-end"
    >
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </motion.div>
  );
}
