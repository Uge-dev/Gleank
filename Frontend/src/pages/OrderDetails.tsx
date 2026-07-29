import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheck,
  FiClock,
  FiCreditCard,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiPhone,
  FiShoppingBag,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import { getOrder } from "../services/order.service";
import {
  initializeOrdersPayment,
  initializePayAtDeliveryPayment,
} from "../services/payment.service";
import type { GleencOrder, OrderStatus } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { formatNaira } from "../utils/price";
import "./OrderDetails.css";

const timelineStatuses: OrderStatus[] = [
  "pending_payment",
  "paid",
  "seller_confirmed",
  "processing",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "completed",
];

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function getStatusIndex(status: OrderStatus) {
  const index = timelineStatuses.indexOf(status);
  return index >= 0 ? index : 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function canContinuePayment(order: GleencOrder) {
  return (
    order.paymentStatus === "unpaid" &&
    !["delivered", "completed", "cancelled", "disputed"].includes(order.status)
  );
}

function OrderDetails() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const paymentNotice =
    typeof location.state === "object" &&
    location.state &&
    "paymentNotice" in location.state
      ? String(location.state.paymentNotice || "")
      : "";
  const [order, setOrder] = useState<GleencOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOpeningPayment, setIsOpeningPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void getOrder(id)
      .then((response) => {
        if (active) setOrder(response.order);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Order could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  async function handleContinuePayment() {
    if (!order || !canContinuePayment(order) || isOpeningPayment) return;

    setPaymentError("");
    setIsOpeningPayment(true);

    try {
      const response =
        order.paymentMethod === "pay_on_delivery"
          ? await initializePayAtDeliveryPayment(order.id)
          : await initializeOrdersPayment([order.id]);
      sessionStorage.setItem("gleank_pending_payment_reference", response.payment.reference);
      window.location.href = response.payment.authorizationUrl;
    } catch (requestError) {
      setPaymentError(
        requestError instanceof Error
          ? requestError.message
          : "Payment could not be reopened.",
      );
      setIsOpeningPayment(false);
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading order details..." />;
  }

  if (!order) {
    return (
      <section className="page-shell order-details-page">
        <Link className="back-link" to="/orders">
          <FiArrowLeft /> Back to orders
        </Link>
        <h1>Order not found</h1>
        <p>{error || "This order may have been removed or does not exist."}</p>
      </section>
    );
  }

  const activeIndex = getStatusIndex(order.status);
  const showContinuePayment = canContinuePayment(order);
  const isSeller = user?.id === order.sellerId || user?.role === "seller";

  return (
    <section className="page-shell order-details-page order-details-upgraded-page">
      <Link className="back-link" to="/orders">
        <FiArrowLeft /> Back to orders
      </Link>

      <div className="order-details-hero">
        <div>
          <span className="eyebrow">Order Status</span>
          <h1>{order.orderCode}</h1>
          <p>
            Your order from {order.storeName} is currently {order.statusLabel}.
          </p>
        </div>
        <div className="order-details-status-pill">{order.statusLabel}</div>
      </div>

      {paymentNotice && <div className="order-details-payment-notice">{paymentNotice}</div>}
      {paymentError && <div className="order-details-payment-error">{paymentError}</div>}

      <div className="order-details-grid">
        <main className="order-details-main-card">
          <div className="delivery-info-strip">
            <span><FiMapPin /> {order.deliveryOption}</span>
            <strong>
              {order.deliveryOption === "Delivery" ? order.deliveryAddress : order.pickupLocation}
            </strong>
          </div>

          <section>
            <div className="checkout-section-title">
              <FiClock />
              <div>
                <h2>Order Timeline</h2>
                <p>Follow the order from payment to completion.</p>
              </div>
            </div>

            <div className="order-timeline">
              {timelineStatuses.map((status, index) => (
                <div className="timeline-row" key={status}>
                  <span className={index <= activeIndex ? "done" : ""}>
                    {index <= activeIndex ? <FiCheck /> : <FiClock />}
                  </span>
                  <div>
                    <h3>
                      {status
                        .replaceAll("_", " ")
                        .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                    </h3>
                    <p>{index <= activeIndex ? "This stage has been reached." : "Waiting for this stage."}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="checkout-section-title">
              <FiShoppingBag />
              <div>
                <h2>Order Items</h2>
                <p>{order.items.length} item(s) in this seller order.</p>
              </div>
            </div>

            <div className="order-detail-items">
              {order.items.map((item) => {
                const image = resolveMediaUrl(item.productImageUrl, productFallback);

                return (
                  <article key={item.id}>
                    <img src={image} alt={item.productName} />
                    <div>
                      <h3>{item.productName}</h3>
                      <p>Qty {item.quantity} • {formatNaira(item.unitPrice)}</p>
                    </div>
                    <strong>{formatNaira(item.total)}</strong>
                  </article>
                );
              })}
            </div>
          </section>

          <section>
            <div className="checkout-section-title">
              <FiPackage />
              <div>
                <h2>Order Events</h2>
                <p>Every important action is recorded here.</p>
              </div>
            </div>

            <div className="order-events-list">
              {order.events.map((event) => (
                <article key={event.id}>
                  <h3>{event.label}</h3>
                  <p>{event.note || event.status} • {formatDate(event.createdAt)}</p>
                </article>
              ))}
            </div>
          </section>
        </main>

        <aside className="order-details-side-card">
          <section>
            <h2>Delivery Details</h2>
            <p><strong>{order.deliveryOption}</strong></p>
            <p>{order.deliveryOption === "Delivery" ? order.deliveryAddress : order.pickupLocation}</p>
            {order.buyerPhone ? <p><FiPhone /> Buyer phone: {order.buyerPhone}</p> : null}
            <p><FiShoppingBag /> Seller: {order.storeName}</p>
          </section>

          <section className="delivery-code-panel">
            <span>Delivery Code</span>
            <strong>{order.verificationCode || "Locked"}</strong>
            <p>
              {order.verificationCode
                ? "Keep this private. Share it only after receiving the correct item."
                : "Your delivery code unlocks only after Gleenc verifies payment."}
            </p>
          </section>

          <section>
            <h2>Payment Summary</h2>
            <div className="payment-summary-line">
              <span>Subtotal</span>
              <strong>{formatNaira(order.subtotal)}</strong>
            </div>
            <div className="payment-summary-line">
              <span>Delivery fee</span>
              <strong>{formatNaira(order.deliveryFee)}</strong>
            </div>
            <div className="payment-summary-line total">
              <span>Total</span>
              <strong>{formatNaira(order.total)}</strong>
            </div>
            <p className="payment-status-note">Payment status: {order.paymentStatus}</p>
            <p className="payment-status-note">
              Method:{" "}
              {order.paymentMethod === "pay_on_delivery"
                ? "Pay at Delivery through Gleenc/Paystack"
                : "Pay Now through Gleenc/Paystack"}
            </p>
            {order.payoutStatus && (
              <p className="payment-status-note">Seller payout: {order.payoutStatus}</p>
            )}

            {showContinuePayment && (
              <button
                className="continue-payment-btn detail-payment-btn"
                type="button"
                disabled={isOpeningPayment}
                onClick={() => void handleContinuePayment()}
              >
                <FiCreditCard />
                {isOpeningPayment ? "Opening payment..." : "Continue Payment"}
              </button>
            )}
          </section>

          <Link className="order-message-link" to={`/messages?order=${order.id}`}>
            <FiMessageCircle /> {isSeller ? "Message buyer" : "Message seller"}
          </Link>
        </aside>
      </div>
    </section>
  );
}

export default OrderDetails;
