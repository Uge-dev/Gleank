import { useState } from "react";
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
  FiRefreshCcw,
  FiShield,
  FiShoppingBag,
  FiShoppingCart,
  FiUser,
  FiX,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import LogoutConfirmModal from "./LogoutConfirmModal";
import { getSupportWhatsAppUrl } from "../utils/support";

type MoreDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onRequireAuth: () => void;
  messageUnreadCount?: number;
  notificationUnreadCount?: number;
};

function MoreDrawer({
  isOpen,
  onClose,
  onRequireAuth,
  messageUnreadCount = 0,
  notificationUnreadCount = 0,
}: MoreDrawerProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isLoggedIn = isAuthenticated;
  const isSellerAccount = user?.role === "seller" || user?.role === "admin";

  function handleProtectedAction() {
    if (!isLoggedIn) {
      onClose();
      onRequireAuth();
    }
  }

  async function handleLogoutConfirm() {
    setIsLoggingOut(true);

    try {
      await logout();
      setLogoutModalOpen(false);
      onClose();
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
    <div className="more-drawer-backdrop" onClick={onClose}>
      <aside
        className="more-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="more-drawer-header">
          <div>
            <span>Gleenc Menu</span>
            <h2>More</h2>
          </div>

          <button type="button" onClick={onClose} aria-label="Close more menu">
            <FiX />
          </button>
        </div>

        {!isLoggedIn ? (
          <div className="more-drawer-auth-card">
            <div>
              <h3>Join Gleenc</h3>
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
              <h3>{user?.name || "Gleenc User"}</h3>
              <p>{user?.role === "seller" ? "Gleenc member" : "Gleenc member"}</p>
            </div>

            <button type="button" onClick={() => setLogoutModalOpen(true)}>
              <FiLogOut />
              Logout
            </button>
          </div>
        )}

        <div className="more-section">
          <h4>Your tools</h4>

          <Link
            className="more-menu-row"
            to="/my-products"
            onClick={onClose}
          >
            <span className="more-row-icon green">
              <FiBriefcase />
            </span>

            <div>
              <strong>My products</strong>
              <small>Manage products and stock</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link
            className="more-menu-row"
            to="/selling-settings"
            onClick={onClose}
          >
            <span className="more-row-icon orange">
              <FiShoppingBag />
            </span>

            <div>
              <strong>Sell on Gleenc</strong>
              <small>Upload products and services</small>
            </div>

            <FiChevronRight />
          </Link>

          {isSellerAccount ? (
            <Link className="more-menu-row" to="/orders" onClick={onClose}>
              <span className="more-row-icon">
                <FiShoppingBag />
              </span>

              <div>
                <strong>Orders</strong>
                <small>Manage products purchased from your store</small>
              </div>

              <FiChevronRight />
            </Link>
          ) : null}
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

          <Link
            className="more-menu-row"
            to={isSellerAccount ? "/purchases" : "/orders"}
            onClick={onClose}
          >
            <span className="more-row-icon">
              <FiShoppingBag />
            </span>

            <div>
              <strong>{isSellerAccount ? "Your Orders" : "Orders"}</strong>
              <small>Track items you purchased from sellers</small>
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

            {messageUnreadCount > 0 && (
              <span className="more-row-badge">{messageUnreadCount}</span>
            )}

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

            {notificationUnreadCount > 0 && (
              <span className="more-row-badge">{notificationUnreadCount}</span>
            )}

            <FiChevronRight />
          </Link>
        </div>

        <div className="more-section">
          <h4>Support</h4>

          <Link className="more-menu-row" to="/help" onClick={onClose}>
            <span className="more-row-icon">
              <FiHelpCircle />
            </span>

            <div>
              <strong>Help & Support</strong>
              <small>Get help using Gleenc</small>
            </div>

            <FiChevronRight />
          </Link>

          <Link
            className="more-menu-row"
            to="/messages?support=1"
            onClick={onClose}
          >
            <span className="more-row-icon green">
              <FiMessageCircle />
            </span>

            <div>
              <strong>Chat with Admin</strong>
              <small>Open a live polling support chat</small>
            </div>

            <FiChevronRight />
          </Link>

          <a
            className="more-menu-row"
            href={getSupportWhatsAppUrl("Hello Gleenc Support, I need help.")}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
          >
            <span className="more-row-icon green">
              <FaWhatsapp />
            </span>

            <div>
              <strong>WhatsApp Support</strong>
              <small>Chat with admin on WhatsApp</small>
            </div>

            <FiChevronRight />
          </a>

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
          © 2026 Gleenc. Campus commerce made social.
        </p>
      </aside>
    </div>

    <LogoutConfirmModal
      isOpen={logoutModalOpen}
      isLoading={isLoggingOut}
      onCancel={() => setLogoutModalOpen(false)}
      onConfirm={() => void handleLogoutConfirm()}
    />
    </>
  );
}

export default MoreDrawer;
