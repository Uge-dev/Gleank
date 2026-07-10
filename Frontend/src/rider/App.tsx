import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import RiderLayout from './layouts/RiderLayout';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
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

function ProtectedRoute({ children }: { children: ReactElement }) {
  const { rider } = useAuth();
  if (!rider) return <Navigate to="/rider/login" replace />;
  return children;
}

export default function App() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={<Navigate to="/rider" replace />} />
        <Route path="/rider/login" element={<Login />} />
        <Route path="/rider/signup" element={<Signup />} />
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
          <Route path="verify/:assignmentId" element={<DeliveryVerification />} />
          <Route path="verify" element={<DeliveryVerification />} />
          <Route path="delivery/:orderId" element={<DeliveryDetails />} />
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
  );
}
