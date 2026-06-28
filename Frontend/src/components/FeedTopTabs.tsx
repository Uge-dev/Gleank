import { Link } from "react-router-dom";
import { FiBell, FiSearch } from "react-icons/fi";

type FeedTopTab = "hot" | "vendors";

type FeedTopTabsProps = {
  activeTab: FeedTopTab;
  onTabChange: (tab: FeedTopTab) => void;
  onRequireAuth: () => void;
};

function FeedTopTabs({
  activeTab,
  onTabChange,
  onRequireAuth,
}: FeedTopTabsProps) {
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

      <button onClick={onRequireAuth}>Following</button>

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
      </div>
    </div>
  );
}

export default FeedTopTabs;