import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import { applyTheme, getSavedTheme, watchSystemTheme } from "./utils/theme";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { SavedProvider } from "./context/SavedContext";
import GleencNav from "./components/GleencNav";
import CartDrawer from "./components/CartDrawer";
import ProtectedPage from "./components/ProtectedPage";
import LocationPermissionNotice from "./components/LocationPermissionNotice";

import Home from "./pages/Home";
import Search from "./pages/Search";
import Market from "./pages/Market";
import CampusMarket from "./pages/CampusMarket";
import LocalMarkets from "./pages/LocalMarkets";
import LocalMarketDetails from "./pages/LocalMarketDetails";
import NearbySellers from "./pages/NearbySellers";
import MarketSearchResults from "./pages/MarketSearchResults";

import UsedMarket from "./pages/UsedMarket";
import SubmitUsedProduct from "./pages/SubmitUsedProduct";
import UsedProductDetails from "./pages/UsedProductDetails";
import UsedCheckout from "./pages/UsedCheckout";
import UsedOrderDetails from "./pages/UsedOrderDetails";
import UsedMarketDashboard from "./pages/UsedMarketDashboard";
import UsedMessages from "./pages/UsedMessages";

import ProductDetails from "./pages/ProductDetails";
import SellerStore from "./pages/SellerStore";

import Messages from "./pages/Messages";
import Notifications from "./pages/Notifications";
import Create from "./pages/Create";
import Orders from "./pages/Orders";
import SellerOrders from "./pages/SellerOrders";
import OrderDetails from "./pages/OrderDetails";
import OrderSuccess from "./pages/OrderSuccess";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import More from "./pages/More";
import Cart from "./pages/Cart";
import Saved from "./pages/Saved";
import Checkout from "./pages/Checkout";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyEmail from "./pages/VerifyEmail";
import AccountSecurity from "./pages/AccountSecurity";
import SellerOnboarding from "./pages/SellerOnboarding";
import SellerSubscription from "./pages/SellerSubscription";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./admin/AdminDashboard";
import PaymentCallback from "./pages/PaymentCallback";
import RiderModule from "./rider/RiderModule";

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

  if (isAdminRoute) {
    return (
      <div className="gleank-app admin-app-shell">
        <Routes>
          <Route path="/admin/*" element={<AdminDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    );
  }

  if (isRiderRoute) {
    return <RiderModule />;
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
                <UsedMessages />
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
            </main>
          </div>
        </CartProvider>
      </SavedProvider>
    </AuthProvider>
  );
}

export default App;
