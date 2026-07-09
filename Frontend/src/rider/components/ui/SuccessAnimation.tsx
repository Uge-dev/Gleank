import { motion } from 'framer-motion';
import { FiCheck } from 'react-icons/fi';

export default function SuccessAnimation({ title, message }: { title: string; message: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-8 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
        transition={{ type: 'spring', stiffness: 180, damping: 14 }}
        className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-glow"
      >
        <FiCheck className="text-4xl" />
      </motion.div>
      <h3 className="mt-5 text-2xl font-extrabold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
    </motion.div>
  );
}
