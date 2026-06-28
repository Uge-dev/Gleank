import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheck,
  FiClock,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiPhone,
  FiShoppingBag,
  FiTruck,
} from "react-icons/fi";

import LoadingState from "../components/LoadingState";
import { getOrder } from "../services/order.service";
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
  const [order, setOrder] = useState<GleankOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
        </aside>
      </div>
    </section>
  );
}

export default OrderDetails;
