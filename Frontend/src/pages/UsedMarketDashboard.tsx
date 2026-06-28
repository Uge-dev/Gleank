import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiCreditCard,
  FiMessageCircle,
  FiPackage,
  FiPlus,
  FiShield,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { getConversations } from "../services/message.service";
import { getOwnUsedListings } from "../services/marketplace.service";
import { getUsedOrders } from "../services/used-order.service";
import type { GleankConversation, UsedListing, UsedMarketOrder } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function UsedMarketDashboard() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<UsedListing[]>([]);
  const [orders, setOrders] = useState<UsedMarketOrder[]>([]);
  const [conversations, setConversations] = useState<GleankConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      getOwnUsedListings(),
      getUsedOrders(),
      getConversations(),
    ])
      .then(([listingResponse, orderResponse, conversationResponse]) => {
        if (!active) return;
        setListings(listingResponse.listings);
        setOrders(orderResponse.orders);
        setConversations(conversationResponse.conversations.filter((item) => item.contextType.startsWith("used")));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return (
      <section className="used-dashboard-page">
        <LoadingState
          title="Loading your Used Market workspace"
          message="Fetching listings, orders, and messages."
        />
      </section>
    );
  }

  return (
    <section className="used-dashboard-page">
      <div className="used-flow-hero">
        <span>
          <FiShield />
          Used Market Workspace
        </span>
        <h1>Manage your used listings, protected orders, and item messages.</h1>
        <p>
          This workspace is for ordinary users selling used items. You do not need a full seller store to manage used-market activity.
        </p>
        <button type="button" onClick={() => navigate("/used-market/submit")}>
          <FiPlus />
          Upload used item
        </button>
      </div>

      <div className="used-dashboard-stats">
        <div><FiPackage /><strong>{listings.length}</strong><span>Listings</span></div>
        <div><FiCreditCard /><strong>{orders.length}</strong><span>Orders</span></div>
        <div><FiMessageCircle /><strong>{conversations.length}</strong><span>Messages</span></div>
      </div>

      <div className="used-dashboard-grid">
        <section className="used-dashboard-card">
          <div className="used-section-head">
            <div>
              <span>Listings</span>
              <h2>My used items</h2>
            </div>
            <Link to="/used-market/submit">Add item</Link>
          </div>

          {listings.length === 0 ? (
            <EmptyState
              icon={<FiPackage />}
              title="No used items yet"
              message="Upload a used item with proof and payout details."
            />
          ) : (
            <div className="used-mini-list">
              {listings.slice(0, 8).map((listing) => (
                <Link to={`/used-market/${listing.id}`} key={listing.id}>
                  <img src={resolveMediaUrl(listing.imageUrls[0], usedFallback)} alt={listing.name} />
                  <div><strong>{listing.name}</strong><span>{listing.status}</span></div>
                  <small>{formatPrice(listing.price)}</small>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="used-dashboard-card">
          <div className="used-section-head">
            <div>
              <span>Orders</span>
              <h2>Protected used orders</h2>
            </div>
          </div>

          {orders.length === 0 ? (
            <EmptyState
              icon={<FiCreditCard />}
              title="No used orders yet"
              message="Orders appear here when someone buys safely or when you buy a used item."
            />
          ) : (
            <div className="used-mini-list">
              {orders.slice(0, 8).map((order) => (
                <Link to={`/used-orders/${order.id}`} key={order.id}>
                  <img src={resolveMediaUrl(order.listingImageUrl, usedFallback)} alt={order.listingName} />
                  <div><strong>{order.listingName}</strong><span>{order.statusLabel}</span></div>
                  <small>{formatPrice(order.total)}</small>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default UsedMarketDashboard;
