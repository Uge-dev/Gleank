import { Link, useNavigate } from "react-router-dom";
import {
  FiBell,
  FiChevronRight,
  FiCreditCard,
  FiEdit3,
  FiHeart,
  FiLock,
  FiLogOut,
  FiMail,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiSettings,
  FiShield,
  FiShoppingBag,
  FiStar,
  FiUser,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { resolveMediaUrl } from "../utils/media";

const profileStats = [
  {
    label: "Orders",
    value: "Live",
    icon: <FiShoppingBag />,
    path: "/orders",
  },
  {
    label: "Used Market",
    value: "Secure",
    icon: <FiShield />,
    path: "/used-market/dashboard",
  },
  {
    label: "Messages",
    value: "Open",
    icon: <FiMessageCircle />,
    path: "/messages",
  },
  {
    label: "Saved",
    value: "Items",
    icon: <FiHeart />,
    path: "/saved",
  },
];

const quickActions = [
  {
    title: "My Orders",
    description: "Track your active and completed store orders.",
    icon: <FiPackage />,
    path: "/orders",
  },
  {
    title: "Used Market Dashboard",
    description: "Manage used listings, protected orders, payout setup, and buyer trust.",
    icon: <FiShield />,
    path: "/used-market/dashboard",
  },
  {
    title: "Sell a Used Item",
    description: "Upload a used item with proof, defects, and secure buyer protection.",
    icon: <FiCreditCard />,
    path: "/used-market/submit",
  },
  {
    title: "Used Market Messages",
    description: "Chat with buyers and sellers around used items and protected orders.",
    icon: <FiMessageCircle />,
    path: "/used-messages",
  },
  {
    title: "Saved Items",
    description: "View products, sellers, and used items you saved.",
    icon: <FiHeart />,
    path: "/saved",
  },
  {
    title: "Account Security",
    description: "Verify email, change password, and manage active sessions.",
    icon: <FiLock />,
    path: "/account/security",
  },
  {
    title: "Seller Onboarding",
    description: "Complete seller verification and monthly subscription setup.",
    icon: <FiStar />,
    path: "/seller/onboarding",
  },
  {
    title: "More Options",
    description: "Access help, settings, appearance, support, and preferences.",
    icon: <FiSettings />,
    path: "/more",
  },
];

function Profile() {
  const navigate = useNavigate();
  const { user, store, logout } = useAuth();

  const displayName = user?.name || "Gleank User";
  const displayEmail = user?.email || "user@gleank.com";
  const displayCampus = user?.campus || "Campus not set";
  const accountType = user?.role === "seller" ? "Campus Seller" : "Campus Buyer";
  const profileAvatarUrl =
    user?.role === "seller" && store?.logoUrl
      ? resolveMediaUrl(store.logoUrl, "")
      : user?.avatarUrl
        ? resolveMediaUrl(user.avatarUrl, "")
        : "";

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <section className="profile-page">
      <div className="profile-hero-card">
        <div className="profile-main-info">
          <div className="profile-avatar">
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt={displayName} />
            ) : (
              <FiUser />
            )}
          </div>

          <div className="profile-text">
            <span>{accountType}</span>

            <h1>{displayName}</h1>

            <p>
              Manage shopping, saved items, protected used-market orders, messages,
              seller tools, and payout trust from one clean account space.
            </p>

            <div className="profile-meta-row">
              <span>
                <FiMapPin />
                {displayCampus}
              </span>

              <span>
                <FiMail />
                {displayEmail}
              </span>

              <span>
                <FiLock />
                {user?.emailVerified ? "Email verified" : "Email not verified"}
              </span>
            </div>
          </div>

          <button type="button" className="profile-edit-btn">
            <FiEdit3 />
            Edit Profile
          </button>
        </div>
      </div>

      <div className="profile-stats-grid">
        {profileStats.map((stat) => (
          <Link to={stat.path} key={stat.label} className="profile-stat-card">
            <div>{stat.icon}</div>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </Link>
        ))}
      </div>

      <div className="profile-layout">
        <div className="profile-left-column">
          <section className="profile-section-card">
            <div className="profile-section-title">
              <div>
                <span>Quick Actions</span>
                <h2>Manage your activity</h2>
              </div>
            </div>

            <div className="profile-action-list">
              {quickActions.map((action) => (
                <Link to={action.path} key={action.title}>
                  <div className="profile-action-icon">{action.icon}</div>

                  <div>
                    <strong>{action.title}</strong>
                    <p>{action.description}</p>
                  </div>

                  <FiChevronRight />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="profile-right-column">
          <section className="profile-section-card">
            <div className="profile-section-title">
              <div>
                <span>Used Market</span>
                <h2>Secure resale tools</h2>
              </div>
            </div>

            <div className="profile-seller-box profile-used-market-box">
              <div>
                <FiShield />
              </div>

              <h3>Protected Used Market</h3>

              <p>
                Complete trust setup, list used items, respond to buyers, and
                track protected used-market orders.
              </p>

              <Link to="/used-market/dashboard">Open Used Market Dashboard</Link>
            </div>
          </section>

          <section className="profile-section-card">
            <div className="profile-section-title">
              <div>
                <span>Seller Tools</span>
                <h2>Your store access</h2>
              </div>
            </div>

            <div className="profile-seller-box">
              <div>
                <FiShoppingBag />
              </div>

              <h3>
                {user?.role === "seller"
                  ? store?.name || "Your Gleank Store"
                  : "Start selling on Gleank"}
              </h3>

              <p>
                Create products, list services, manage orders, and grow your
                campus store.
              </p>

              {user?.role === "seller" ? <Link to="/dashboard">Open Seller Dashboard</Link> : <Link to="/signup">Create Seller Account</Link>}
            </div>
          </section>

          <section className="profile-section-card">
            <div className="profile-section-title">
              <div>
                <span>Account</span>
                <h2>Settings</h2>
              </div>
            </div>

            <div className="profile-settings-list">
              <button type="button">
                <FiUser />
                Personal information
              </button>

              <button type="button">
                <FiBell />
                Notification settings
              </button>

              <button type="button" onClick={() => navigate("/account/security")}>
                <FiShield />
                Account security
              </button>

              <button type="button" onClick={() => navigate("/seller/onboarding")}>
                <FiSettings />
                Seller verification
              </button>

              <button
                type="button"
                className="profile-logout-btn"
                onClick={handleLogout}
              >
                <FiLogOut />
                Logout
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

export default Profile;
