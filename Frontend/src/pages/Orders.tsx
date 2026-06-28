import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { getOrders } from "../services/order.service";
import type { GleankOrder, OrderStatus } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { formatNaira } from "../utils/price";

type FilterStatus =
  | "All"
  | "Pending"
  | "Confirmed"
  | "Preparing"
  | "Delivered"
  | "Cancelled";

const statusFilters: FilterStatus[] = [
  "All",
  "Pending",
  "Confirmed",
  "Preparing",
  "Delivered",
  "Cancelled",
];

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function statusGroup(status: OrderStatus): Exclude<FilterStatus, "All"> {
  if (status === "pending_payment" || status === "paid") return "Pending";
  if (status === "seller_confirmed") return "Confirmed";
  if (
    status === "processing" ||
    status === "ready_for_delivery" ||
    status === "out_for_delivery"
  ) {
    return "Preparing";
  }
  if (status === "delivered" || status === "completed") return "Delivered";
  return "Cancelled";
}

function statusIcon(status: OrderStatus) {
  const group = statusGroup(status);

  if (group === "Delivered") return <FiCheckCircle />;
  if (group === "Cancelled") return <FiXCircle />;
  if (group === "Preparing") return <FiTruck />;
  if (group === "Confirmed") return <FiClock />;
  return <FiPackage />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Orders() {
  const [orders, setOrders] = useState<GleankOrder[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError("");

    void getOrders()
      .then((response) => {
        if (active) setOrders(response.orders);
      })
      .catch((requestError) => {
        if (!active) return;

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Orders could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredOrders = useMemo(() => {
    if (activeFilter === "All") return orders;
    return orders.filter((order) => statusGroup(order.status) === activeFilter);
  }, [activeFilter, orders]);

  if (isLoading) {
    return (
      <section className="orders-page">
        <LoadingState
          title="Loading your orders"
          message="Gleank is checking your latest order activity."
        />
      </section>
    );
  }

  return (
    <section className="orders-page">
      <div className="orders-hero">
        <span>My Orders</span>
        <h1>Track your campus purchases</h1>
        <p>
          All orders created from checkout now come directly from the Gleank
          backend.
        </p>
      </div>

      <div className="order-status-tabs">
        {statusFilters.map((status) => (
          <button
            type="button"
            key={status}
            className={activeFilter === status ? "active" : ""}
            onClick={() => setActiveFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      {error ? (
        <EmptyState
          icon={<FiPackage />}
          eyebrow="Orders unavailable"
          title="Could not load orders"
          message={error}
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<FiShoppingBag />}
          eyebrow="No orders yet"
          title="You do not have matching orders"
          message="When you create an order from checkout, it will appear here."
          actionLabel="Continue Shopping"
          onAction={() => {
            window.location.href = "/search";
          }}
        />
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => {
            const firstItem = order.items[0];

            return (
              <article className="order-card" key={order.id}>
                <div className="order-card-image">
                  <img
                    src={resolveMediaUrl(
                      firstItem?.productImageUrl,
                      productFallback,
                    )}
                    alt={firstItem?.productName || order.orderCode}
                  />
                </div>

                <div className="order-card-content">
                  <div className="order-card-top">
                    <div>
                      <span>{order.orderCode}</span>
                      <h2>{firstItem?.productName || "Gleank order"}</h2>
                      <p>
                        {order.storeName} • {order.items.length} item(s)
                      </p>
                    </div>

                    <div className={`order-status-pill ${statusGroup(order.status).toLowerCase()}`}>
                      {statusIcon(order.status)}
                      {order.statusLabel}
                    </div>
                  </div>

                  <div className="order-card-meta">
                    <span>{formatDate(order.createdAt)}</span>
                    <span>{order.deliveryOption}</span>
                    <span>{order.campus}</span>
                  </div>

                  <div className="order-card-bottom">
                    <strong>{formatNaira(order.total)}</strong>

                    <div>
                      <button type="button">
                        <FiMessageCircle />
                        Contact
                      </button>

                      <Link to={`/orders/${order.id}`}>
                        View details
                        <FiArrowRight />
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default Orders;
