import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import Button from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}

export default function Modal({ open, title, message, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onClose }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ scale: 0.94, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 20, opacity: 0 }}
            className="w-full max-w-md rounded-[1.8rem] bg-white p-6 shadow-soft"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-950">{title}</h3>
                {message && <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>}
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <FiX />
              </button>
            </div>
            {children && <div className="mt-5">{children}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>
              {onConfirm && <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
