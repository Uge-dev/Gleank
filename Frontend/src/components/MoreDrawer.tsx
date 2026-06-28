import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiBell,
  FiBookmark,
  FiBriefcase,
  FiChevronRight,
  FiFlag,
  FiGlobe,
  FiHelpCircle,
  FiLogIn,
  FiLogOut,
  FiMessageCircle,
  FiMonitor,
  FiMoon,
  FiRefreshCcw,
  FiShield,
  FiShoppingBag,
  FiShoppingCart,
  FiSun,
  FiUser,
  FiX,
} from "react-icons/fi";

import { applyTheme, getSavedTheme, type ThemeMode } from "../utils/theme";
import { useAuth } from "../context/AuthContext";

type MoreDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onRequireAuth: () => void;
};

function MoreDrawer({ isOpen, onClose, onRequireAuth }: MoreDrawerProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>("system");
  const isLoggedIn = isAuthenticated;

  useEffect(() => {
    setTheme(getSavedTheme());
  }, []);

  function handleProtectedAction() {
    if (!isLoggedIn) {
      onClose();
      onRequireAuth();
    }
  }

  async function handleLogout() {
    await logout();
    onClose();
  }

  function handleThemeChange(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  if (!isOpen) return null;

  return (
    <div className="more-drawer-backdrop" onClick={onClose}>
      <aside
        className="more-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="more-drawer-header">
          <div>
            <span>Gleank Menu</span>
            <h2>More</h2>
          </div>

          <button type="button" onClick={onClose} aria-label="Close more menu">
            <FiX />
          </button>
        </div>

        {!isLoggedIn ? (
          <div className="more-drawer-auth-card">
            <div>
              <h3>Join Gleank</h3>
              <p>Login to sell, order, message sellers, and save products.</p>
            </div>

            <button type="button" onClick={handleProtectedAction}>
              <FiLogIn />
              Login
            </button>
          </div>
        ) : (
          <div className="more-drawer-auth-card">
            <div>
              <h3>{user?.name || "Gleank User"}</h3>
              <p>{user?.role === "seller" ? "Seller account" : "Buyer account"}</p>
            </div>

            <button type="button" onClick={handleLogout}>
              <FiLogOut />
              Logout
            </button>
          </div>
        )}

        <div className="more-section">
          <h4>Seller Tools</h4>

          <Link
            className="more-menu-row"
            to={user?.role === "seller" ? "/dashboard" : "/signup"}
            onClick={onClose}
          >
            <span className="more-row-icon green">
              <FiBriefcase />
            </span>

            <div>
              <strong>Seller Dashboard</strong>
              <small>Manage your campus business profile</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link
            className="more-menu-row"
            to={user?.role === "seller" ? "/create" : "/signup"}
            onClick={onClose}
          >
            <span className="more-row-icon orange">
              <FiShoppingBag />
            </span>

            <div>
              <strong>Sell on Gleank</strong>
              <small>Upload products and services</small>
            </div>

            <FiChevronRight />
          </Link>
        </div>

        <div className="more-section">
          <h4>Buyer Actions</h4>

          <Link className="more-menu-row" to="/profile" onClick={onClose}>
            <span className="more-row-icon">
              <FiUser />
            </span>

            <div>
              <strong>Profile</strong>
              <small>View your account and settings</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link className="more-menu-row" to="/saved" onClick={onClose}>
            <span className="more-row-icon">
              <FiBookmark />
            </span>

            <div>
              <strong>Saved Items</strong>
              <small>Products and stores you saved</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link className="more-menu-row" to="/cart" onClick={onClose}>
            <span className="more-row-icon">
              <FiShoppingCart />
            </span>

            <div>
              <strong>Cart</strong>
              <small>View products you want to order</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link className="more-menu-row" to="/orders" onClick={onClose}>
            <span className="more-row-icon">
              <FiShoppingBag />
            </span>

            <div>
              <strong>Orders</strong>
              <small>Track your purchases and requests</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link className="more-menu-row" to="/messages" onClick={onClose}>
            <span className="more-row-icon">
              <FiMessageCircle />
            </span>

            <div>
              <strong>Messages</strong>
              <small>Chat with sellers and buyers</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link className="more-menu-row" to="/notifications" onClick={onClose}>
            <span className="more-row-icon">
              <FiBell />
            </span>

            <div>
              <strong>Notifications</strong>
              <small>Orders, messages, and seller updates</small>
            </div>

            <FiChevronRight />
          </Link>
        </div>

        <div className="more-section">
          <h4>Appearance</h4>

          <div className="appearance-options">
            <button
              type="button"
              className={theme === "system" ? "active" : ""}
              onClick={() => handleThemeChange("system")}
            >
              <FiMonitor />
              <span>System</span>
            </button>

            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => handleThemeChange("light")}
            >
              <FiSun />
              <span>Light</span>
            </button>

            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => handleThemeChange("dark")}
            >
              <FiMoon />
              <span>Dark</span>
            </button>
          </div>
        </div>

        <div className="more-section">
          <h4>Support</h4>

          <Link className="more-menu-row" to="/help" onClick={onClose}>
            <span className="more-row-icon">
              <FiHelpCircle />
            </span>

            <div>
              <strong>Help & Support</strong>
              <small>Get help using Gleank</small>
            </div>

            <FiChevronRight />
          </Link>

          <button type="button" className="more-menu-row">
            <span className="more-row-icon">
              <FiShield />
            </span>

            <div>
              <strong>Privacy & Safety</strong>
              <small>Account protection and safety tips</small>
            </div>

            <FiChevronRight />
          </button>

          <button type="button" className="more-menu-row">
            <span className="more-row-icon">
              <FiRefreshCcw />
            </span>

            <div>
              <strong>Refund Help</strong>
              <small>Learn how order disputes are handled</small>
            </div>

            <FiChevronRight />
          </button>
        </div>

        <div className="more-section">
          <h4>Preferences</h4>

          <button type="button" className="more-menu-row">
            <span className="more-row-icon">
              <FiGlobe />
            </span>

            <div>
              <strong>Language</strong>
              <small>English</small>
            </div>

            <FiChevronRight />
          </button>

          <button
            type="button"
            className="more-menu-row"
            onClick={handleProtectedAction}
          >
            <span className="more-row-icon red">
              <FiFlag />
            </span>

            <div>
              <strong>Report a Problem</strong>
              <small>Tell us what is not working</small>
            </div>

            <FiChevronRight />
          </button>
        </div>

        <p className="more-drawer-footer">
          © 2026 Gleank. Campus commerce made social.
        </p>
      </aside>
    </div>
  );
}

export default MoreDrawer;
