import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import RiderMobileNav from '../components/layout/RiderMobileNav';

export default function RiderLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gleenc-soft">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <Sidebar />
      </div>
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />
            <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'spring', stiffness: 240, damping: 28 }} className="relative h-full w-80 max-w-[86vw]">
              <Sidebar onNavigate={() => setMobileNavOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="lg:pl-72">
        <Topbar onMenu={() => setMobileNavOpen(true)} />
        <main className="px-4 pb-28 pt-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
      <RiderMobileNav />
    </div>
  );
}
