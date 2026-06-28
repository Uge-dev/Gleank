import { Link } from "react-router-dom";
import {
  FiBell,
  FiChevronRight,
  FiHeart,
  FiHelpCircle,
  FiMessageCircle,
  FiPackage,
  FiSettings,
  FiShoppingBag,
  FiUser,
} from "react-icons/fi";

const moreLinks = [
  {
    title: "Profile",
    description: "View and manage your Gleank profile.",
    icon: <FiUser />,
    path: "/profile",
  },
  {
    title: "Orders",
    description: "Track your active and completed orders.",
    icon: <FiPackage />,
    path: "/orders",
  },
  {
    title: "Messages",
    description: "Chat with sellers, buyers, and service providers.",
    icon: <FiMessageCircle />,
    path: "/messages",
  },
  {
    title: "Notifications",
    description: "View order updates, messages, and activity alerts.",
    icon: <FiBell />,
    path: "/notifications",
  },
  {
    title: "Saved Items",
    description: "Products, sellers, and posts you saved.",
    icon: <FiHeart />,
    path: "/saved",
  },
  {
    title: "Cart",
    description: "View products you want to order.",
    icon: <FiShoppingBag />,
    path: "/cart",
  },
  {
    title: "Seller Dashboard",
    description: "Manage your store, products, orders, and reels.",
    icon: <FiSettings />,
    path: "/dashboard",
  },
  {
    title: "Help & Support",
    description: "Get help using Gleank.",
    icon: <FiHelpCircle />,
    path: "/help",
  },
];

function More() {
  return (
    <section className="more-page">
      <div className="more-page-header">
        <span>More</span>
        <h1>More options</h1>
        <p>
          Access your profile, orders, messages, seller tools, saved items, and
          support from one place.
        </p>
      </div>

      <div className="more-page-grid">
        {moreLinks.map((item) => (
          <Link to={item.path} key={item.title} className="more-page-card">
            <div className="more-page-card-icon">{item.icon}</div>

            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>

            <FiChevronRight />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default More;