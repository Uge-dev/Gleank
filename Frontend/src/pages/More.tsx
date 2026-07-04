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
import { FaWhatsapp } from "react-icons/fa";
import { getSupportWhatsAppUrl } from "../utils/support";

const moreLinks = [
  {
    title: "Profile",
    description: "View and manage your Gleenc profile.",
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
    description: "Manage your store, products, services, and orders.",
    icon: <FiSettings />,
    path: "/dashboard",
  },
  {
    title: "Help Center",
    description: "Read guides and help articles.",
    icon: <FiHelpCircle />,
    path: "/help",
  },
  {
    title: "Chat with Admin",
    description: "Open a live support chat with Gleenc admin.",
    icon: <FiMessageCircle />,
    path: "/messages?support=1",
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

        <a
          href={getSupportWhatsAppUrl("Hello Gleenc Support, I need help with my account.")}
          className="more-page-card whatsapp"
          target="_blank"
          rel="noreferrer"
        >
          <div className="more-page-card-icon">
            <FaWhatsapp />
          </div>

          <div>
            <strong>WhatsApp Support</strong>
            <p>Chat with Gleenc admin on WhatsApp.</p>
          </div>

          <FiChevronRight />
        </a>
      </div>
    </section>
  );
}

export default More;
