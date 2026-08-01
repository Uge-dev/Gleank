import { lazy, Suspense, useEffect } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";

import { applyTheme, getSavedTheme, watchSystemTheme } from "./utils/theme";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { SavedProvider } from "./context/SavedContext";
import GleencNav from "./components/GleencNav";
import CartDrawer from "./components/CartDrawer";
import ProtectedPage from "./components/ProtectedPage";
import LocationPermissionNotice from "./components/LocationPermissionNotice";

const Home = lazy(() => import("./pages/Home"));
const Search = lazy(() => import("./pages/Search"));
const Market = lazy(() => import("./pages/Market"));
const CampusMarket = lazy(() => import("./pages/CampusMarket"));
const LocalMarkets = lazy(() => import("./pages/LocalMarkets"));
const LocalMarketDetails = lazy(() => import("./pages/LocalMarketDetails"));
const NearbySellers = lazy(() => import("./pages/NearbySellers"));
const MarketSearchResults = lazy(() => import("./pages/MarketSearchResults"));
const UsedMarket = lazy(() => import("./pages/UsedMarket"));
const SubmitUsedProduct = lazy(() => import("./pages/SubmitUsedProduct"));
const UsedProductDetails = lazy(() => import("./pages/UsedProductDetails"));
const UsedCheckout = lazy(() => import("./pages/UsedCheckout"));
const UsedOrderDetails = lazy(() => import("./pages/UsedOrderDetails"));
const UsedMarketDashboard = lazy(() => import("./pages/UsedMarketDashboard"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const SellerStore = lazy(() => import("./pages/SellerStore"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Create = lazy(() => import("./pages/Create"));
const Orders = lazy(() => import("./pages/Orders"));
const SellerOrders = lazy(() => import("./pages/SellerOrders"));
const SellerRiderSelection = lazy(() => import("./pages/SellerRiderSelection"));
const OrderDetails = lazy(() => import("./pages/OrderDetails"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const More = lazy(() => import("./pages/More"));
const Cart = lazy(() => import("./pages/Cart"));
const Saved = lazy(() => import("./pages/Saved"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const AccountSecurity = lazy(() => import("./pages/AccountSecurity"));
const SellerOnboarding = lazy(() => import("./pages/SellerOnboarding"));
const SellerSubscription = lazy(() => import("./pages/SellerSubscription"));
const Help = lazy(() => import("./pages/Help"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const PaymentCallback = lazy(() => import("./pages/PaymentCallback"));
const RiderModule = lazy(() => import("./rider/RiderModule"));

function RouteFallback() {
  return <div className="app-route-loading" role="status">Loading page...</div>;
}

function AccountOrders() {
  const { user } = useAuth();

  return user?.role === "seller" || user?.role === "admin"
    ? <SellerOrders />
    : <Orders />;
}

function App() {
  useEffect(() => {
    applyTheme(getSavedTheme());
    return watchSystemTheme();
  }, []);

  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isRiderRoute = location.pathname.startsWith("/rider");
  const shouldRestoreRiderPortal =
    location.pathname === "/" &&
    typeof window !== "undefined" &&
    (window.sessionStorage.getItem("gleenc-current-portal") ||
      window.localStorage.getItem("gleenc-last-portal")) === "rider";

  if (shouldRestoreRiderPortal) {
    return <Navigate to="/rider" replace />;
  }

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

  if (isRiderRoute) {
    return <Suspense fallback={<RouteFallback />}><RiderModule /></Suspense>;
  }

  return (
    <AuthProvider>
      <SavedProvider>
        <CartProvider>
          <div className="gleank-app">
            <LocationPermissionNotice />
            <GleencNav />
            <CartDrawer />

            <main className="gleank-main">
              <Suspense fallback={<RouteFallback />}>
                <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/market" element={<Market />} />
          <Route path="/market/search" element={<MarketSearchResults />} />
          <Route path="/market/campus" element={<CampusMarket />} />
          <Route path="/market/local" element={<LocalMarkets />} />
          <Route path="/market/local/:marketId" element={<LocalMarketDetails />} />
          <Route path="/market/nearby" element={<NearbySellers />} />

          <Route path="/used-market" element={<UsedMarket />} />
          <Route
            path="/used-market/dashboard"
            element={
              <ProtectedPage>
                <UsedMarketDashboard />
              </ProtectedPage>
            }
          />
          <Route
            path="/used-market/submit"
            element={
              <ProtectedPage>
                <SubmitUsedProduct />
              </ProtectedPage>
            }
          />
          <Route
            path="/used-market/:id/checkout"
            element={
              <ProtectedPage>
                <UsedCheckout />
              </ProtectedPage>
            }
          />
          <Route path="/used-market/:id" element={<UsedProductDetails />} />
          <Route
            path="/used-orders/:id"
            element={
              <ProtectedPage>
                <UsedOrderDetails />
              </ProtectedPage>
            }
          />
          <Route
            path="/used-messages"
            element={
              <ProtectedPage>
                <Navigate to="/messages" replace />
              </ProtectedPage>
            }
          />


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
              <ProtectedPage roles={["seller", "admin"]}>
                <Create />
              </ProtectedPage>
            }
          />

          <Route
            path="/orders"
            element={
              <ProtectedPage>
                <AccountOrders />
              </ProtectedPage>
            }
          />

          <Route
            path="/seller/orders/:orderId/riders"
            element={
              <ProtectedPage roles={["seller", "admin"]}>
                <SellerRiderSelection />
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
              <ProtectedPage roles={["seller", "admin"]}>
                <Dashboard />
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
                <SellerOnboarding />
              </ProtectedPage>
            }
          />
          <Route
            path="/seller/subscription"
            element={
              <ProtectedPage roles={["seller", "admin"]}>
                <SellerSubscription />
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
