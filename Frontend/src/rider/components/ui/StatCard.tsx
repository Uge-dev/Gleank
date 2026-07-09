import type { IconType } from 'react-icons';
import { motion } from 'framer-motion';
import Card from './Card';

export default function StatCard({ label, value, icon: Icon, tone = 'cyan', detail }: { label: string; value: string | number; icon: IconType; tone?: 'cyan' | 'green' | 'dark' | 'orange' | 'purple'; detail?: string }) {
  const tones = {
    cyan: 'from-cyan-50 to-white text-cyan-700 bg-cyan-100',
    green: 'from-emerald-50 to-white text-emerald-700 bg-emerald-100',
    dark: 'from-slate-100 to-white text-slate-800 bg-slate-200',
    orange: 'from-orange-50 to-white text-orange-700 bg-orange-100',
    purple: 'from-violet-50 to-white text-violet-700 bg-violet-100'
  };
  return (
    <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} whileHover={{ y: -4 }}>
      <Card className={`bg-gradient-to-br p-5 ${tones[tone].split(' ').slice(0, 2).join(' ')}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-extrabold text-slate-950">{value}</p>
            {detail && <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>}
          </div>
          <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tones[tone].split(' ').slice(2).join(' ')}`}>
            <Icon className="text-xl" />
          </span>
        </div>
      </Card>
    </motion.div>
  );
}
