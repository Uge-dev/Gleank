import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./Commerce.css";
export default function Account() {
  const { user, store } = useAuth();
  return (
    <section className="commerce-page">
      <span className="commerce-eyebrow">Your profile</span>
      <h1>{user?.profile?.displayName || user?.name}</h1>
      <p>
        @{user?.profile?.username} · {user?.city}, {user?.country}
      </p>
      {user?.profile?.bio && <p>{user.profile.bio}</p>}
      {!user?.emailVerified && (
        <p className="commerce-note">
          Verify your email to place orders, sell and confirm deliveries.{" "}
          <Link to="/verify-email">Verify email</Link>
        </p>
      )}
      <div className="commerce-actions">
        <Link className="commerce-action" to="/complete-profile">
          Edit profile
        </Link>
        <Link className="commerce-action" to="/account/security">
          Account security
        </Link>
      </div>
      <div className="commerce-grid">
        {[
          {
            to: "/orders",
            title: "Orders",
            text: "Your purchases, sales and delivery confirmations.",
          },
          {
            to: "/my-products",
            title: "My products",
            text: "Manage products you own and supply.",
          },
          {
            to: "/selling-settings",
            title: "Selling settings",
            text: "Delivery coverage, charges and dispatch details.",
          },
          {
            to: "/opportunities",
            title: "Discover opportunities",
            text: "Explore supplier products and products to promote.",
          },
          {
            to: "/earnings",
            title: "Earnings",
            text: "Track held payments and settlement.",
          },
          {
            to: "/saved",
            title: "Saved",
            text: "Return to products and profiles you love.",
          },
        ].map((item) => (
          <Link className="commerce-card" key={item.to} to={item.to}>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </Link>
        ))}
      </div>
      {store && <Link to={"/stores/" + store.slug}>View public store</Link>}
    </section>
  );
}
