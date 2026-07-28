import { Link } from "react-router-dom";
import { FiBell, FiSearch, FiShoppingCart } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

type FeedTopTab = "hot" | "vendors" | "following";

type FeedTopTabsProps = {
  activeTab: FeedTopTab;
  onTabChange: (tab: FeedTopTab) => void;
  onRequireAuth: () => boolean | void;
};

function FeedTopTabs({
  activeTab,
  onTabChange,
  onRequireAuth,
}: FeedTopTabsProps) {
  const { user } = useAuth();
  const { cartCount, openCartDrawer } = useCart();
  const isSeller = user?.role === "seller" || user?.role === "admin";

  return (
    <div className="for-you-fixed-tabs">
      <button
        className={activeTab === "hot" ? "active" : ""}
        onClick={() => onTabChange("hot")}
      >
        Hot Product
      </button>

      <button
        className={activeTab === "vendors" ? "active" : ""}
        onClick={() => onTabChange("vendors")}
      >
        New Vendors
      </button>

      <button
        className={activeTab === "following" ? "active" : ""}
        onClick={() => {
          if (onRequireAuth() === false) return;
          onTabChange("following");
        }}
      >
        Following
      </button>

      <div className="for-you-top-icons">
        <Link
          to="/notifications"
          className="for-you-notification-link"
          aria-label="Notifications"
        >
          <FiBell />
        </Link>

        <Link to="/search" className="for-you-search-link" aria-label="Search">
          <FiSearch />
        </Link>

        {isSeller ? (
          <button
            type="button"
            className="for-you-cart-link"
            aria-label={`Cart${cartCount ? `, ${cartCount} item(s)` : ""}`}
            onClick={openCartDrawer}
          >
            <FiShoppingCart />
            {cartCount > 0 ? <small>{cartCount}</small> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default FeedTopTabs;
