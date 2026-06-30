import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  FiTruck,
} from "react-icons/fi";

import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getOrder,
  payOrder,
  updateOrderStatus,
  verifyOrderDelivery,
} from "../services/order.service";
import type { GleankOrder, OrderStatus } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { formatNaira } from "../utils/price";

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

function OrderDetails() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<GleankOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");

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

  async function handlePay() {
    if (!order) return;
    setIsWorking(true);
    setError("");
    try {
      const response = await payOrder(order.id);
      setOrder(response.order);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Payment could not be recorded.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleStatus(status: OrderStatus, note = "") {
    if (!order) return;
    setIsWorking(true);
    setError("");
    try {
      const response = await updateOrderStatus(order.id, status, note);
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

  async function handleVerifyDelivery() {
    if (!order) return;
    setIsWorking(true);
    setError("");
    try {
      const response = await verifyOrderDelivery(
        order.id,
        deliveryCode,
        "Seller verified the buyer delivery code.",
      );
      setOrder(response.order);
      setDeliveryCode("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Delivery code could not be verified.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) {
    return (
      <section className="order-details-page">
        <LoadingState
          title="Loading order"
          message="Gleank is fetching this order from the backend."
        />
      </section>
    );
  }

  if (!order) {
    return (
      <section className="order-details-page">
        <Link to="/orders" className="order-back-link">
          <FiArrowLeft />
          Back to orders
        </Link>

        <div className="order-not-found">
          <FiPackage />
          <h1>Order not found</h1>
          <p>{error || "This order may have been removed or does not exist."}</p>
        </div>
      </section>
    );
  }

  const activeIndex = getStatusIndex(order.status);
  const isBuyer = user?.id === order.buyerId;
  const isSeller = user?.id === order.sellerId;

  return (
    <section className="order-details-page">
      <Link to="/orders" className="order-back-link">
        <FiArrowLeft />
        Back to orders
      </Link>

      <div className="order-details-hero">
        <div>
          <span>Order Status</span>
          <h1>{order.orderCode}</h1>
          <p>
            Your order from <strong>{order.storeName}</strong> is currently{" "}
            <strong>{order.statusLabel}</strong>.
          </p>
        </div>

        <div className="order-live-status-card">
          <div className="order-pulse-icon">
            <FiTruck />
          </div>

          <span>{order.statusLabel}</span>

          <p>
            {order.deliveryOption} •{" "}
            {order.deliveryOption === "Delivery"
              ? order.deliveryAddress
              : order.pickupLocation}
          </p>
        </div>
      </div>

      {error && <p className="used-inline-error">{error}</p>}

      <div className="order-details-layout">
        <div className="order-main-column">
          <section className="order-timeline-card">
            <div className="section-title-row">
              <div>
                <span>Progress</span>
                <h2>Order Timeline</h2>
              </div>

              <FiClock />
            </div>

            <div className="order-timeline">
              {timelineStatuses.map((status, index) => (
                <div
                  className={index <= activeIndex ? "timeline-step active" : "timeline-step"}
                  key={status}
                >
                  <div className="timeline-dot">
                    {index <= activeIndex ? <FiCheck /> : <FiClock />}
                  </div>

                  <div>
                    <h3>
                      {status
                        .replaceAll("_", " ")
                        .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                    </h3>

                    <p>
                      {index <= activeIndex
                        ? "This stage has been reached."
                        : "Waiting for this stage."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="order-items-card">
            <div className="section-title-row">
              <div>
                <span>Items</span>
                <h2>Order Items</h2>
              </div>

              <FiShoppingBag />
            </div>

            {order.items.map((item) => (
              <div className="order-product-row" key={item.id}>
                <img
                  src={resolveMediaUrl(item.productImageUrl, productFallback)}
                  alt={item.productName}
                />

                <div>
                  <h3>{item.productName}</h3>
                  <p>
                    Qty {item.quantity} • {formatNaira(item.unitPrice)}
                  </p>
                </div>

                <strong>{formatNaira(item.total)}</strong>
              </div>
            ))}
          </section>

          <section className="order-timeline-card">
            <div className="section-title-row">
              <div>
                <span>Activity</span>
                <h2>Order Events</h2>
              </div>

              <FiClock />
            </div>

            <div className="order-events-list">
              {order.events.map((event) => (
                <div className="timeline-step active" key={event.id}>
                  <div className="timeline-dot">
                    <FiCheck />
                  </div>

                  <div>
                    <h3>{event.label}</h3>
                    <p>
                      {event.note || event.status} • {formatDate(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="order-side-column">
          <section className="order-info-card">
            <h2>Delivery Details</h2>

            <div className="order-info-line">
              <FiMapPin />
              <div>
                <span>{order.deliveryOption}</span>
                <strong>
                  {order.deliveryOption === "Delivery"
                    ? order.deliveryAddress
                    : order.pickupLocation}
                </strong>
              </div>
            </div>

            <div className="order-info-line">
              <FiPhone />
              <div>
                <span>Buyer phone</span>
                <strong>{order.buyerPhone}</strong>
              </div>
            </div>

            <div className="order-info-line">
              <FiMessageCircle />
              <div>
                <span>Seller</span>
                <strong>{order.storeName}</strong>
              </div>
            </div>

            <div className="order-verification-box">
              <span>Delivery Code</span>
              <strong>{order.verificationCode}</strong>
              <p>
                Keep this private. Share it only after receiving the correct
                item.
              </p>
            </div>
          </section>

          <section className="order-info-card">
            <h2>Payment Summary</h2>

            <div className="order-price-line">
              <span>Subtotal</span>
              <strong>{formatNaira(order.subtotal)}</strong>
            </div>

            <div className="order-price-line">
              <span>Delivery fee</span>
              <strong>{formatNaira(order.deliveryFee)}</strong>
            </div>

            <div className="order-price-line total">
              <span>Total</span>
              <strong>{formatNaira(order.total)}</strong>
            </div>

            <p className="order-payment-note">
              Payment gateway is not connected yet. This order is currently{" "}
              {order.paymentStatus}.
            </p>
          </section>

          <section className="order-info-card used-action-stack">
            <h2>Order Actions</h2>

            {isBuyer && order.status === "pending_payment" && (
              <button type="button" onClick={() => void handlePay()} disabled={isWorking}>
                <FiCreditCard />
                Pay locally
              </button>
            )}

            {isSeller && order.status === "paid" && (
              <button type="button" onClick={() => void handleStatus("seller_confirmed", "Seller accepted the order.")} disabled={isWorking}>
                <FiCheck />
                Accept order
              </button>
            )}

            {isSeller && order.status === "seller_confirmed" && (
              <button type="button" onClick={() => void handleStatus("processing", "Seller started preparing the order.")} disabled={isWorking}>
                <FiPackage />
                Start processing
              </button>
            )}

            {isSeller && order.status === "processing" && (
              <button type="button" onClick={() => void handleStatus("ready_for_delivery", "Order is ready for pickup or delivery.")} disabled={isWorking}>
                <FiPackage />
                Ready for delivery
              </button>
            )}

            {isSeller && order.status === "ready_for_delivery" && (
              <button type="button" onClick={() => void handleStatus("out_for_delivery", "Order is out for delivery.")} disabled={isWorking}>
                <FiTruck />
                Out for delivery
              </button>
            )}

            {isSeller && ["ready_for_delivery", "out_for_delivery"].includes(order.status) && (
              <div className="delivery-code-action">
                <label>
                  Buyer delivery code
                  <input
                    value={deliveryCode}
                    onChange={(event) => setDeliveryCode(event.target.value)}
                    placeholder="Enter 6-digit code"
                    inputMode="numeric"
                  />
                </label>
                <button type="button" onClick={() => void handleVerifyDelivery()} disabled={isWorking || !deliveryCode.trim()}>
                  <FiCheck />
                  Verify code & mark delivered
                </button>
              </div>
            )}

            {isBuyer && order.status === "delivered" && (
              <button type="button" onClick={() => void handleStatus("completed", "Buyer confirmed delivery.")} disabled={isWorking}>
                <FiCheck />
                Confirm received
              </button>
            )}

            {(isBuyer || isSeller) && !["completed", "cancelled", "disputed"].includes(order.status) && (
              <button type="button" className="danger" onClick={() => void handleStatus("disputed", "Issue reported for Gleank review.")} disabled={isWorking}>
                Report issue
              </button>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

export default OrderDetails;
