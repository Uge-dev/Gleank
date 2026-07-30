import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import RiderLayout from './layouts/RiderLayout';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import RiderForgotPassword from './pages/auth/ForgotPassword';
import RiderResetPassword from './pages/auth/ResetPassword';
import RiderVerifyResetCode from './pages/auth/VerifyResetCode';
import RiderVerifyEmail from './pages/auth/VerifyEmail';
import Dashboard from './pages/Dashboard';
import AssignedOrders from './pages/AssignedOrders';
import ActiveDeliveries from './pages/ActiveDeliveries';
import DeliveryVerification from './pages/DeliveryVerification';
import DeliveryDetails from './pages/DeliveryDetails';
import CompletedDeliveries from './pages/CompletedDeliveries';
import Earnings from './pages/Earnings';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import VerificationCenter from './pages/VerificationCenter';
import SafetyCenter from './pages/SafetyCenter';
import NotFound from './pages/NotFound';
import LocationPermissionNotice from '../components/LocationPermissionNotice';

const Navigation = lazy(() => import('./pages/Navigation'));

function ProtectedRoute({ children }: { children: ReactElement }) {
  const { rider, loading } = useAuth();
  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-gleenc-soft p-6">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 text-center shadow-soft">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-gleenc-cyan">Gleenc Rider</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">Checking rider session...</h1>
        </div>
      </main>
    );
  }
  if (!rider) return <Navigate to="/rider/login" replace />;
  if (rider.emailVerified === false) return <Navigate to="/rider/verify-email" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <LocationPermissionNotice />
      <AnimatePresence mode="wait">
        <Routes>
        <Route path="/" element={<Navigate to="/rider" replace />} />
        <Route path="/rider/login" element={<Login />} />
        <Route path="/rider/signup" element={<Signup />} />
        <Route path="/rider/forgot-password" element={<RiderForgotPassword />} />
        <Route path="/rider/verify-email" element={<RiderVerifyEmail />} />
        <Route path="/rider/verify-reset-code" element={<RiderVerifyResetCode />} />
        <Route path="/rider/reset-password" element={<RiderResetPassword />} />
        <Route
          path="/rider"
          element={
            <ProtectedRoute>
              <RiderLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="assigned" element={<AssignedOrders />} />
          <Route path="active" element={<ActiveDeliveries />} />
          <Route path="verify-code" element={<DeliveryVerification />} />
          <Route path="verify/:assignmentId" element={<DeliveryVerification />} />
          <Route path="verify" element={<DeliveryVerification />} />
          <Route path="delivery/:orderId" element={<DeliveryDetails />} />
          <Route
            path="navigate/:assignmentId"
            element={
              <Suspense
                fallback={
                  <main className="grid min-h-[24rem] place-items-center">
                    <p className="font-bold text-slate-600">Loading map...</p>
                  </main>
                }
              >
                <Navigation />
              </Suspense>
            }
          />
          <Route path="completed" element={<CompletedDeliveries />} />
          <Route path="earnings" element={<Earnings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="verification" element={<VerificationCenter />} />
          <Route path="safety" element={<SafetyCenter />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}
