import type { ReactNode } from "react";
import { useState } from "react";
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
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

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

  const { cartCount, openCartDrawer } = useCart();

  const isLoggedIn = isAuthenticated;

  function openAuthModal() {
    setAuthModalOpen(true);
  }

  async function handleLogout() {
    await logout();
    navigate("/");
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

  const mobileNavItems = [
    navItems.find((item) => item.label === "For You"),
    navItems.find((item) => item.label === "Used Market"),
    navItems.find((item) => item.label === "Cart"),
    navItems.find((item) => item.label === "Notifications"),
    navItems.find((item) => item.label === "Profile"),
  ].filter(Boolean) as NavItem[];

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
                onClick={handleLogout}
              >
                <IoLogOutOutline />
                Logout
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
                </span>

                <span className="gleank-mobile-label">
                  {item.mobileLabel}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <MoreDrawer
        isOpen={moreDrawerOpen}
        onClose={() => setMoreDrawerOpen(false)}
        onRequireAuth={openAuthModal}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default GleankNav;
