import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiLock,
  FiMessageCircle,
  FiPackage,
  FiShield,
  FiTruck,
} from "react-icons/fi";

import ErrorState from "../components/ErrorState";
import { useAuth } from "../context/AuthContext";
import LoadingState from "../components/LoadingState";
import { createConversation } from "../services/message.service";
import {
  getUsedOrder,
  payUsedOrder,
  updateUsedOrderStatus,
} from "../services/used-order.service";
import type { UsedMarketOrder, UsedMarketOrderStatus } from "../types/domain";
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

function UsedOrderDetails() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<UsedMarketOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");

  function loadOrder() {
    setIsLoading(true);
    setError("");

    void getUsedOrder(id)
      .then((response) => setOrder(response.order))
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Used order could not be loaded.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(loadOrder, [id]);

  async function handlePay() {
    if (!order) return;
    setIsWorking(true);
    setError("");
    try {
      const response = await payUsedOrder(order.id);
      setOrder(response.order);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Payment record could not be updated.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleStatus(status: UsedMarketOrderStatus, note = "") {
    if (!order) return;
    setIsWorking(true);
    setError("");
    try {
      const response = await updateUsedOrderStatus(order.id, status, note);
      setOrder(response.order);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Order status could not be updated.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleOpenMessages() {
    if (!order) return;
    setIsWorking(true);
    try {
      const response = await createConversation({
        contextType: "used_order",
        contextId: order.id,
      });
      navigate(`/used-messages?conversation=${response.conversation.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Conversation could not be opened.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) {
    return (
      <section className="used-order-page">
        <LoadingState
          title="Loading protected used order"
          message="Fetching escrow status, timeline, and message link."
        />
      </section>
    );
  }

  if (error && !order) {
    return (
      <section className="used-order-page">
        <ErrorState title="Order unavailable" message={error} onRetry={loadOrder} />
      </section>
    );
  }

  if (!order) return null;

  const isBuyer = user?.id === order.buyerId;
  const isSeller = user?.id === order.sellerId;

  return (
    <section className="used-order-page">
      <Link to="/used-market/dashboard" className="secure-used-back">
        <FiArrowLeft />
        Used Market dashboard
      </Link>

      <div className="used-order-hero">
        <span>
          <FiShield />
          {order.statusLabel}
        </span>
        <h1>{order.orderCode}</h1>
        <p>
          Protected order for <strong>{order.listingName}</strong>. Use messages for coordination and only confirm received after inspection.
        </p>
      </div>

      {error && <p className="used-inline-error">{error}</p>}

      <div className="used-order-layout">
        <main className="used-order-main">
          <section className="used-order-card used-order-item-card">
            <img src={resolveMediaUrl(order.listingImageUrl, usedFallback)} alt={order.listingName} />
            <div>
              <h2>{order.listingName}</h2>
              <p>{order.listingCategory} • {order.listingCondition}</p>
              <strong>{formatPrice(order.total)}</strong>
            </div>
          </section>

          <section className="used-order-card">
            <div className="used-form-section-title">
              <FiClock />
              <div>
                <h2>Order timeline</h2>
                <p>Status history for this protected used-market transaction.</p>
              </div>
            </div>

            <div className="used-order-timeline">
              {order.events.map((event) => (
                <div className="used-timeline-item" key={event.id}>
                  <span />
                  <div>
                    <strong>{event.label}</strong>
                    <p>{event.note || event.status}</p>
                    <small>{new Date(event.createdAt).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="used-order-card">
            <div className="used-form-section-title">
              <FiPackage />
              <div>
                <h2>Pickup / delivery information</h2>
                <p>Use this information with the built-in messages.</p>
              </div>
            </div>
            <div className="used-order-info-grid">
              <div><span>Buyer</span><strong>{order.buyerName}</strong></div>
              <div><span>Phone</span><strong>{order.buyerPhone}</strong></div>
              <div><span>Campus</span><strong>{order.campus}</strong></div>
              <div><span>Option</span><strong>{order.deliveryOption}</strong></div>
              <div><span>Pickup</span><strong>{order.pickupLocation || "Not set"}</strong></div>
              <div><span>Delivery address</span><strong>{order.deliveryAddress || "Not required"}</strong></div>
            </div>
          </section>
        </main>

        <aside className="used-order-side">
          <section className="used-order-card">
            <div className="used-protected-status-icon">
              <FiLock />
            </div>
            <h2>Buyer protection</h2>
            <p>
              Verification code: <strong>{order.verificationCode}</strong>
            </p>
            <p className="used-small-note">
              Share this only when the item has been inspected and accepted.
            </p>
          </section>

          <section className="used-order-card">
            <div className="used-summary-lines">
              <div><span>Item price</span><strong>{formatPrice(order.itemPrice)}</strong></div>
              <div><span>Protection fee</span><strong>{formatPrice(order.protectionFee)}</strong></div>
              <div><span>Delivery fee</span><strong>{formatPrice(order.deliveryFee)}</strong></div>
              <div className="total"><span>Total</span><strong>{formatPrice(order.total)}</strong></div>
            </div>
          </section>

          <section className="used-order-card used-action-stack">
            {isBuyer && order.status === "pending_payment" && (
              <button type="button" onClick={() => void handlePay()} disabled={isWorking}>
                <FiCreditCard />
                Pay with Gleank protection
              </button>
            )}

            {isSeller && order.status === "paid" && (
              <button type="button" onClick={() => void handleStatus("seller_confirmed", "Seller confirmed item availability.")} disabled={isWorking}>
                <FiCheckCircle />
                Seller confirm availability
              </button>
            )}

            {isSeller && order.status === "seller_confirmed" && (
              <button type="button" onClick={() => void handleStatus("meetup_or_delivery", "Pickup or delivery process has started.")} disabled={isWorking}>
                <FiTruck />
                Start pickup/delivery
              </button>
            )}

            {isSeller && order.status === "meetup_or_delivery" && (
              <button type="button" onClick={() => void handleStatus("delivered", "Seller marked item delivered.")} disabled={isWorking}>
                <FiPackage />
                Mark delivered
              </button>
            )}

            {isBuyer && order.status === "delivered" && (
              <button type="button" onClick={() => void handleStatus("completed", "Buyer confirmed item received and accepted.")} disabled={isWorking}>
                <FiCheckCircle />
                Confirm received
              </button>
            )}

            {isBuyer && order.status === "pending_payment" && (
              <button type="button" className="secondary" onClick={() => void handleStatus("cancelled", "Buyer cancelled before payment.")} disabled={isWorking}>
                Cancel order
              </button>
            )}

            {(isBuyer || isSeller) && !["completed", "cancelled", "disputed"].includes(order.status) && (
              <button type="button" className="danger" onClick={() => void handleStatus("disputed", "Issue reported for Gleank review.")} disabled={isWorking}>
                <FiAlertTriangle />
                Report issue
              </button>
            )}

            <button type="button" className="secondary" onClick={() => void handleOpenMessages()} disabled={isWorking}>
              <FiMessageCircle />
              Message buyer/seller
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}

export default UsedOrderDetails;
