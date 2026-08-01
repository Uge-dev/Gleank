import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import RiderLayout from './layouts/RiderLayout';
import LocationPermissionNotice from '../components/LocationPermissionNotice';

const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const RiderForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const RiderResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const RiderVerifyResetCode = lazy(() => import('./pages/auth/VerifyResetCode'));
const RiderVerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AssignedOrders = lazy(() => import('./pages/AssignedOrders'));
const ActiveDeliveries = lazy(() => import('./pages/ActiveDeliveries'));
const DeliveryVerification = lazy(() => import('./pages/DeliveryVerification'));
const DeliveryDetails = lazy(() => import('./pages/DeliveryDetails'));
const Navigation = lazy(() => import('./pages/Navigation'));
const CompletedDeliveries = lazy(() => import('./pages/CompletedDeliveries'));
const Earnings = lazy(() => import('./pages/Earnings'));
const Notifications = lazy(() => import('./pages/Notifications'));
const RiderMessages = lazy(() => import('./pages/Messages'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const VerificationCenter = lazy(() => import('./pages/VerificationCenter'));
const SafetyCenter = lazy(() => import('./pages/SafetyCenter'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RiderRouteFallback() {
  return (
    <main className="grid min-h-[24rem] place-items-center">
      <p className="font-bold text-slate-600">Loading rider page...</p>
    </main>
  );
}

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
        <Suspense fallback={<RiderRouteFallback />}>
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
            element={<Navigation />}
          />
          <Route path="completed" element={<CompletedDeliveries />} />
          <Route path="earnings" element={<Earnings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="messages" element={<RiderMessages />} />
          <Route path="verification" element={<VerificationCenter />} />
          <Route path="safety" element={<SafetyCenter />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AnimatePresence>
    </>
  );
}
