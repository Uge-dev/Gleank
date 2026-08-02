import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  IoHome,
  IoHomeOutline,
  IoSearch,
  IoSearchOutline,
  IoBagHandle,
  IoBagHandleOutline,
  IoAddCircle,
  IoAddCircleOutline,
  IoPerson,
  IoPersonOutline,
  IoEllipsisHorizontal,
  IoCart,
  IoCartOutline,
  IoChatbubbleEllipses,
  IoChatbubbleEllipsesOutline,
  IoNotifications,
  IoNotificationsOutline,
  IoReceipt,
  IoReceiptOutline,
  IoLogOutOutline,
  IoStorefront,
  IoStorefrontOutline,
} from "react-icons/io5";

import AuthModal from "./AuthModal";
import MoreDrawer from "./MoreDrawer";
import LogoutConfirmModal from "./LogoutConfirmModal";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { getUnreadMessageCount } from "../services/message.service";
import { getNotificationUnreadCount } from "../services/notification.service";
import { getSellerActionableOrderCount } from "../services/seller.service";
import { getPendingBuyerOrderCount } from "../services/order.service";
import { resolveMediaUrl } from "../utils/media";

type NavItem = {
  label: string;
  mobileLabel: string;
  path: string;
  icon: ReactNode;
  activeIcon: ReactNode;
  showOnDesktop: boolean;
  showOnMobile: boolean;
  buyerOnly?: boolean;
  sellerOnly?: boolean;
};

function GleencNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, store, isAuthenticated, logout } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [sellerOrderCount, setSellerOrderCount] = useState(0);
  const [buyerPendingOrderCount, setBuyerPendingOrderCount] = useState(0);

  const { cartCount, openCartDrawer } = useCart();

  const isLoggedIn = isAuthenticated;
  const isSellerExperience = user?.role === "seller" || user?.role === "admin";
  const sidebarAvatarUrl = store?.logoUrl
    ? resolveMediaUrl(store.logoUrl, "")
    : user?.avatarUrl
      ? resolveMediaUrl(user.avatarUrl, "")
      : "";

  useEffect(() => {
    if (!isLoggedIn) {
      setMessageUnreadCount(0);
      setNotificationUnreadCount(0);
      setSellerOrderCount(0);
      setBuyerPendingOrderCount(0);
      return;
    }

    let active = true;

    async function loadCounts() {
      const [messageResult, notificationResult, sellerOrderResult, buyerOrderResult] = await Promise.allSettled([
        user?.emailVerified
          ? getUnreadMessageCount()
          : Promise.resolve({ unreadCount: 0 }),
        getNotificationUnreadCount(),
        isSellerExperience && user?.emailVerified
          ? getSellerActionableOrderCount()
          : Promise.resolve({ count: 0 }),
        user?.emailVerified
          ? getPendingBuyerOrderCount()
          : Promise.resolve({ count: 0 }),
      ]);

      if (!active) return;

      if (messageResult.status === "fulfilled") {
        setMessageUnreadCount(messageResult.value.unreadCount);
      }

      if (notificationResult.status === "fulfilled") {
        setNotificationUnreadCount(notificationResult.value.unreadCount);
      }

      if (sellerOrderResult.status === "fulfilled") {
        setSellerOrderCount(Number(sellerOrderResult.value.count || 0));
      }
      if (buyerOrderResult.status === "fulfilled") {
        setBuyerPendingOrderCount(Number(buyerOrderResult.value.count || 0));
      }
    }

    void loadCounts();

    const timer = window.setInterval(() => {
      void loadCounts();
    }, 5000);

    function handleFocus() {
      void loadCounts();
    }

    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isLoggedIn, isSellerExperience, user?.emailVerified]);

  function openAuthModal() {
    setAuthModalOpen(true);
  }

  function handleLogoutRequest() {
    setLogoutModalOpen(true);
  }

  async function handleLogoutConfirm() {
    setIsLoggingOut(true);

    try {
      await logout();
      setLogoutModalOpen(false);
      navigate("/");
    } finally {
      setIsLoggingOut(false);
    }
  }

  const navItems: NavItem[] = [
    {
      label: "For You",
      mobileLabel: "Home",
      path: "/",
      icon: <IoHomeOutline />,
      activeIcon: <IoHome />,
      showOnDesktop: true,
      showOnMobile: true,
    },
    {
      label: "Search",
      mobileLabel: "Search",
      path: "/search",
      icon: <IoSearchOutline />,
      activeIcon: <IoSearch />,
      showOnDesktop: true,
      showOnMobile: false,
    },
    {
      label: "Market",
      mobileLabel: "Market",
      path: "/market",
      icon: <IoBagHandleOutline />,
      activeIcon: <IoBagHandle />,
      showOnDesktop: true,
      showOnMobile: true,
    },
    {
      label: "Notifications",
      mobileLabel: "Alerts",
      path: "/notifications",
      icon: <IoNotificationsOutline />,
      activeIcon: <IoNotifications />,
      showOnDesktop: true,
      showOnMobile: true,
      buyerOnly: true,
    },
    {
      label: "Messages",
      mobileLabel: "Messages",
      path: "/messages",
      icon: <IoChatbubbleEllipsesOutline />,
      activeIcon: <IoChatbubbleEllipses />,
      showOnDesktop: true,
      showOnMobile: false,
    },
    {
      label: "Create",
      mobileLabel: "Create",
      path: "/create",
      icon: <IoAddCircleOutline />,
      activeIcon: <IoAddCircle />,
      showOnDesktop: true,
      showOnMobile: false,
      sellerOnly: true,
    },
    {
      label: "Store",
      mobileLabel: "Store",
      path: "/dashboard",
      icon: <IoStorefrontOutline />,
      activeIcon: <IoStorefront />,
      showOnDesktop: true,
      showOnMobile: true,
      sellerOnly: true,
    },
    {
      label: "Orders",
      mobileLabel: "Orders",
      path: "/orders",
      icon: <IoReceiptOutline />,
      activeIcon: <IoReceipt />,
      showOnDesktop: true,
      showOnMobile: true,
      sellerOnly: true,
    },
    {
      label: "Your Orders",
      mobileLabel: "Your Orders",
      path: "/purchases",
      icon: <IoBagHandleOutline />,
      activeIcon: <IoBagHandle />,
      showOnDesktop: true,
      showOnMobile: false,
      sellerOnly: true,
    },
    {
      label: "Cart",
      mobileLabel: "Cart",
      path: "/cart",
      icon: <IoCartOutline />,
      activeIcon: <IoCart />,
      showOnDesktop: false,
      showOnMobile: true,
    },
    {
      label: "Profile",
      mobileLabel: "Profile",
      path: "/profile",
      icon: <IoPersonOutline />,
      activeIcon: <IoPerson />,
      showOnDesktop: true,
      showOnMobile: true,
    },
  ];

  function allowedForRole(item: NavItem) {
    if (item.sellerOnly) return Boolean(isSellerExperience);
    if (item.buyerOnly) return !isSellerExperience;
    return true;
  }

  function isMarketPath(pathname: string) {
    return pathname.startsWith("/market") || pathname.startsWith("/used-market");
  }

  function itemIsActive(item: NavItem, isActive: boolean) {
    if (item.label === "Market") return isActive || isMarketPath(location.pathname);
    return isActive;
  }

  const desktopNavItems = navItems.filter(
    (item) => item.showOnDesktop && allowedForRole(item),
  );

  function badgeCountFor(label: string) {
    if (label === "Messages") return messageUnreadCount;
    if (label === "Notifications") return notificationUnreadCount;
    if (label === "Orders") return sellerOrderCount;
    if (label === "Your Orders") return buyerPendingOrderCount;
    return 0;
  }

  const mobileNavLabels = isSellerExperience
    ? ["For You", "Market", "Store", "Orders", "Your Orders", "Profile"]
    : ["For You", "Market", "Cart", "Notifications", "Profile"];
  const mobileNavItems = mobileNavLabels
    .map((label) => navItems.find((item) => item.label === label))
    .filter((item): item is NavItem => {
    if (!item) return false;
    return allowedForRole(item);
  });

  const mobileNav = (
    <nav className="gleank-mobile-nav">
      {mobileNavItems.map((item) => (
        <NavLink
          key={item.label}
          to={item.path}
          className={({ isActive }) =>
            itemIsActive(item, isActive)
              ? "gleank-mobile-link active"
              : "gleank-mobile-link"
          }
          aria-label={item.mobileLabel}
        >
          {({ isActive }) => {
            const active = itemIsActive(item, isActive);

            return (
              <>
                <span className="gleank-mobile-icon">
                  {active ? item.activeIcon : item.icon}

                  {item.label === "Cart" && cartCount > 0 && (
                    <small>{cartCount}</small>
                  )}

                  {item.label !== "Cart" && badgeCountFor(item.label) > 0 && (
                    <small>{badgeCountFor(item.label)}</small>
                  )}
                </span>

                <span className="gleank-mobile-label">
                  {item.mobileLabel}
                </span>
              </>
            );
          }}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="gleank-sidebar">
        <NavLink to="/" className="gleank-logo">
          <img className="gleank-logo-mark" src="/Gleenc%20Mark.png" alt="" />
          <span className="gleank-logo-full">Gleenc</span>
        </NavLink>

        <nav className="gleank-sidebar-menu">
          {desktopNavItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) =>
                itemIsActive(item, isActive)
                  ? "gleank-nav-link active"
                  : "gleank-nav-link"
              }
            >
              {({ isActive }) => {
                const active = itemIsActive(item, isActive);

                return (
                  <>
                    <span className="gleank-nav-icon">
                      {active ? item.activeIcon : item.icon}
                    {badgeCountFor(item.label) > 0 && (
                      <small>{badgeCountFor(item.label)}</small>
                    )}
                    </span>

                    <span className="gleank-nav-text">{item.label}</span>
                  </>
                );
              }}
            </NavLink>
          ))}

          <button
            type="button"
            className="gleank-nav-link cart-nav-button"
            onClick={openCartDrawer}
          >
            <span className="gleank-nav-icon">
              {cartCount > 0 ? <IoCart /> : <IoCartOutline />}

              {cartCount > 0 && <small>{cartCount}</small>}
            </span>

            <span className="gleank-nav-text">Cart</span>
          </button>

          <button
            type="button"
            className="gleank-nav-link more-link"
            onClick={() => setMoreDrawerOpen(true)}
          >
            <span className="gleank-nav-icon more-icon-wrap">
              <IoEllipsisHorizontal />
              <span className="more-green-dot"></span>
            </span>

            <span className="gleank-nav-text">More</span>
          </button>
        </nav>

        <div className="gleank-sidebar-login-area">
          {!isLoggedIn ? (
            <button
              type="button"
              className="sidebar-login-btn"
              onClick={openAuthModal}
            >
              Log in
            </button>
          ) : (
            <div className="sidebar-user-box">
              <NavLink to="/profile" className="sidebar-user-profile">
                <span>
                  {sidebarAvatarUrl ? (
                    <img src={sidebarAvatarUrl} alt={user?.name || "Gleenc user"} />
                  ) : (
                    (user?.name || "Gleenc User").charAt(0).toUpperCase()
                  )}
                </span>

                <div>
                  <strong>{user?.name || "Gleenc User"}</strong>
                  <small>
                    {user?.role === "seller"
                      ? "Seller"
                      : user?.role === "rider"
                        ? "Rider"
                        : "Buyer"}
                  </small>
                </div>
              </NavLink>

              <button
                type="button"
                className="sidebar-logout-btn"
                onClick={handleLogoutRequest}
                disabled={isLoggingOut}
              >
                <IoLogOutOutline />
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          )}

          
        </div>
      </aside>

      {typeof document !== "undefined"
        ? createPortal(mobileNav, document.body)
        : mobileNav}

      <MoreDrawer
        isOpen={moreDrawerOpen}
        onClose={() => setMoreDrawerOpen(false)}
        onRequireAuth={openAuthModal}
        messageUnreadCount={messageUnreadCount}
        notificationUnreadCount={notificationUnreadCount}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(loggedInUser) => {
          navigate(
            loggedInUser.role === "seller"
              ? "/dashboard"
              : loggedInUser.role === "rider"
                ? "/rider"
                : "/profile",
          );
        }}
      />

      <LogoutConfirmModal
        isOpen={logoutModalOpen}
        isLoading={isLoggingOut}
        onCancel={() => setLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
      />
    </>
  );
}

export default GleencNav;
