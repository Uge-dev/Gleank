import { lazy, Suspense, useEffect } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";

import { applyTheme, getSavedTheme, watchSystemTheme } from "./utils/theme";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { SavedProvider } from "./context/SavedContext";
import GleencNav from "./components/GleencNav";
import CartDrawer from "./components/CartDrawer";
import ProtectedPage from "./components/ProtectedPage";

const Home = lazy(() => import("./pages/Home"));
const Search = lazy(() => import("./pages/Search"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const SellerStore = lazy(() => import("./pages/SellerStore"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Create = lazy(() => import("./pages/commerce/MyProducts"));
const Orders = lazy(() => import("./pages/commerce/Orders"));
const OrderDetails = lazy(() => import("./pages/commerce/OrderDetails"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const Profile = lazy(() => import("./pages/commerce/Account"));
const More = lazy(() => import("./pages/More"));
const Cart = lazy(() => import("./pages/Cart"));
const Saved = lazy(() => import("./pages/Saved"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const AccountSecurity = lazy(() => import("./pages/AccountSecurity"));
const Help = lazy(() => import("./pages/Help"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const PaymentCallback = lazy(() => import("./pages/PaymentCallback"));

const CompleteProfile=lazy(()=>import('./pages/commerce/CompleteProfile'));
const SellingSettings=lazy(()=>import('./pages/commerce/SellingSettings'));
const Earnings=lazy(()=>import('./pages/commerce/Earnings'));
const Opportunities=lazy(()=>import('./pages/commerce/Opportunities'));
function OnboardingGate(){
 const {user,isLoading}=useAuth(); const location=useLocation();
 if(!isLoading && user && !user.profile && !['/complete-profile','/verify-email','/payment/callback'].includes(location.pathname))
  return <Navigate to={'/complete-profile?next='+encodeURIComponent(location.pathname+location.search+location.hash)} replace />;
 return null;
}
function RouteFallback() {
  return <div className="app-route-loading" role="status">Loading page...</div>;
}

function App() {
  useEffect(() => {
    applyTheme(getSavedTheme());
    return watchSystemTheme();
  }, []);

  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  if (isAdminRoute) {
    return (
      <div className="gleank-app admin-app-shell">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/admin/*" element={<AdminDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <AuthProvider>
      <SavedProvider>
        <CartProvider>
          <div className="gleank-app">
            <OnboardingGate />
            <GleencNav />
            <CartDrawer />

            <main className="gleank-main">
              <Suspense fallback={<RouteFallback />}>
                <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/market/*" element={<Navigate to="/search" replace />} />
          <Route path="/used-market/*" element={<Navigate to="/search" replace />} />
          <Route path="/used-orders/*" element={<Navigate to="/orders" replace />} />
          <Route path="/rider/*" element={<Navigate to="/" replace />} />
          <Route path="/products/:id" element={<ProductDetails />} />
          <Route path="/stores/:id" element={<SellerStore />} />
          <Route path="/more" element={<More />} />

          <Route
            path="/messages"
            element={
              <ProtectedPage>
                <Messages />
              </ProtectedPage>
            }
          />

          <Route
            path="/notifications"
            element={
              <ProtectedPage>
                <Notifications />
              </ProtectedPage>
            }
          />

          <Route
            path="/create"
            element={
              <ProtectedPage >
                <Create />
              </ProtectedPage>
            }
          />

          <Route
            path="/orders"
            element={
              <ProtectedPage>
                <Orders />
              </ProtectedPage>
            }
          />

          <Route
            path="/purchases"
            element={
              <ProtectedPage>
                <Orders />
              </ProtectedPage>
            }
          />

          <Route
            path="/orders/:id"
            element={
              <ProtectedPage>
                <OrderDetails />
              </ProtectedPage>
            }
          />

          <Route
            path="/order-success"
            element={<OrderSuccess />}
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedPage >
                <Navigate to="/my-products" replace />
              </ProtectedPage>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedPage>
                <Profile />
              </ProtectedPage>
            }
          />

          <Route
            path="/cart"
            element={
              <ProtectedPage>
                <Cart />
              </ProtectedPage>
            }
          />

          <Route
            path="/saved"
            element={
              <ProtectedPage>
                <Saved />
              </ProtectedPage>
            }
          />

          <Route
            path="/checkout"
            element={
              <ProtectedPage>
                <Checkout />
              </ProtectedPage>
            }
          />
          <Route
  path="/payment/callback"
  element={<PaymentCallback />}
/>

          <Route path="/complete-profile" element={<ProtectedPage><CompleteProfile /></ProtectedPage>} />
          <Route path="/selling-settings" element={<ProtectedPage><SellingSettings /></ProtectedPage>} />
          <Route path="/my-products" element={<ProtectedPage><Create /></ProtectedPage>} />
          <Route path="/earnings" element={<ProtectedPage><Earnings /></ProtectedPage>} />
          <Route path="/opportunities" element={<ProtectedPage><Opportunities /></ProtectedPage>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route
            path="/account/security"
            element={
              <ProtectedPage>
                <AccountSecurity />
              </ProtectedPage>
            }
          />
          <Route
            path="/seller/onboarding"
            element={
              <ProtectedPage>
                <SellingSettings />
              </ProtectedPage>
            }
          />
          <Route
            path="/seller/subscription"
            element={
              <ProtectedPage >
                <SellingSettings />
              </ProtectedPage>
            }
          />
          <Route path="/help" element={<Help />} />

          <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </CartProvider>
      </SavedProvider>
    </AuthProvider>
  );
}

export default App;
