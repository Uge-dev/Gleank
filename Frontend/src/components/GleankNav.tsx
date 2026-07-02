import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate } from "react-router-dom";
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
  IoLogOutOutline,
} from "react-icons/io5";

import AuthModal from "./AuthModal";
import MoreDrawer from "./MoreDrawer";
import LogoutConfirmModal from "./LogoutConfirmModal";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { getUnreadMessageCount } from "../services/message.service";
import { getNotificationUnreadCount } from "../services/notification.service";

type NavItem = {
  label: string;
  mobileLabel: string;
  path: string;
  icon: ReactNode;
  activeIcon: ReactNode;
  showOnDesktop: boolean;
  showOnMobile: boolean;
};

function GleankNav() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const { cartCount, openCartDrawer } = useCart();

  const isLoggedIn = isAuthenticated;

  useEffect(() => {
    if (!isLoggedIn) {
      setMessageUnreadCount(0);
      setNotificationUnreadCount(0);
      return;
    }

    let active = true;

    async function loadCounts() {
      const [messageResult, notificationResult] = await Promise.allSettled([
        user?.emailVerified
          ? getUnreadMessageCount()
          : Promise.resolve({ unreadCount: 0 }),
        getNotificationUnreadCount(),
      ]);

      if (!active) return;

      if (messageResult.status === "fulfilled") {
        setMessageUnreadCount(messageResult.value.unreadCount);
      }

      if (notificationResult.status === "fulfilled") {
        setNotificationUnreadCount(notificationResult.value.unreadCount);
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
  }, [isLoggedIn, user?.emailVerified]);

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
      label: "Used Market",
      mobileLabel: "Market",
      path: "/used-market",
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

  const desktopNavItems = navItems.filter((item) => item.showOnDesktop);

  function badgeCountFor(label: string) {
    if (label === "Messages") return messageUnreadCount;
    if (label === "Notifications") return notificationUnreadCount;
    return 0;
  }

  const mobileNavItems = [
    navItems.find((item) => item.label === "For You"),
    navItems.find((item) => item.label === "Used Market"),
    navItems.find((item) => item.label === "Cart"),
    navItems.find((item) => item.label === "Notifications"),
    navItems.find((item) => item.label === "Profile"),
  ].filter(Boolean) as NavItem[];

  const mobileNav = (
    <nav className="gleank-mobile-nav">
      {mobileNavItems.map((item) => (
        <NavLink
          key={item.label}
          to={item.path}
          className={({ isActive }) =>
            isActive ? "gleank-mobile-link active" : "gleank-mobile-link"
          }
          aria-label={item.mobileLabel}
        >
          {({ isActive }) => (
            <>
              <span className="gleank-mobile-icon">
                {isActive ? item.activeIcon : item.icon}

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
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="gleank-sidebar">
        <NavLink to="/" className="gleank-logo">
          <span className="gleank-logo-full">Gleank</span>
          <span className="gleank-logo-small">G</span>
        </NavLink>

        <nav className="gleank-sidebar-menu">
          {desktopNavItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) =>
                isActive ? "gleank-nav-link active" : "gleank-nav-link"
              }
            >
              {({ isActive }) => (
                <>
                  <span className="gleank-nav-icon">
                    {isActive ? item.activeIcon : item.icon}
                    {badgeCountFor(item.label) > 0 && (
                      <small>{badgeCountFor(item.label)}</small>
                    )}
                  </span>

                  <span className="gleank-nav-text">{item.label}</span>
                </>
              )}
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
                  {(user?.name || "Gleank User").charAt(0).toUpperCase()}
                </span>

                <div>
                  <strong>{user?.name || "Gleank User"}</strong>
                  <small>{user?.role === "seller" ? "Seller" : "Buyer"}</small>
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

          <div className="sidebar-footer-links">
            <span>Company</span>
            <span>Program</span>
            <span>Terms & Policies</span>
            <span>© 2026 Gleank</span>
          </div>
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
          navigate(loggedInUser.role === "seller" ? "/dashboard" : "/profile");
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

export default GleankNav;
