import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";
import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { getOrders } from "../services/order.service";
import {
  initializeOrdersPayment,
  initializePayAtDeliveryPayment,
} from "../services/payment.service";
import type { GleencOrder, OrderStatus } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { formatNaira } from "../utils/price";
import "./Orders.css";

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
  if (group === "Confirmed") return <FiPackage />;
  return <FiClock />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function canContinuePayment(order: GleencOrder) {
  return order.paymentStatus === "unpaid" || order.status === "pending_payment";
}

function Orders() {
  const [orders, setOrders] = useState<GleencOrder[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [payingOrderId, setPayingOrderId] = useState("");
  const [paymentError, setPaymentError] = useState("");

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

  const orderCounts = useMemo(() => {
    const counts: Record<FilterStatus, number> = {
      All: orders.length,
      Pending: 0,
      Confirmed: 0,
      Preparing: 0,
      Delivered: 0,
      Cancelled: 0,
    };

    for (const order of orders) {
      counts[statusGroup(order.status)] += 1;
    }

    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (activeFilter === "All") return orders;
    return orders.filter((order) => statusGroup(order.status) === activeFilter);
  }, [activeFilter, orders]);

  async function handleContinuePayment(order: GleencOrder) {
    if (!canContinuePayment(order) || payingOrderId) return;

    setPaymentError("");
    setPayingOrderId(order.id);

    try {
      const response =
        order.paymentMethod === "pay_on_delivery"
          ? await initializePayAtDeliveryPayment(order.id)
          : await initializeOrdersPayment([order.id]);
      sessionStorage.setItem("gleank_pending_payment_reference", response.payment.reference);
      window.location.assign(response.payment.authorizationUrl);
    } catch (requestError) {
      setPaymentError(
        requestError instanceof Error
          ? requestError.message
          : "Payment could not be reopened.",
      );
      setPayingOrderId("");
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading your orders..." />;
  }

  return (
    <section className="page-shell orders-page orders-upgraded-page">
      <div className="orders-page-heading">
        <span>Purchases you made</span>
        <div className="orders-heading-title-row">
          <h1>Your Orders</h1>
          <strong className="orders-total-counter" aria-label={`${orders.length} total orders`}>
            {orders.length}
          </strong>
        </div>
        <p>Track items you bought from other sellers.</p>
      </div>

      <div className="orders-filter-bar">
        {statusFilters.map((status) => (
          <button
            key={status}
            className={activeFilter === status ? "active" : ""}
            type="button"
            onClick={() => setActiveFilter(status)}
          >
            <span>{status}</span>
            <small>{orderCounts[status]}</small>
          </button>
        ))}
      </div>

      {paymentError && <div className="orders-payment-error">{paymentError}</div>}

      {error ? (
        <EmptyState
          icon={<FiXCircle />}
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
            const image = resolveMediaUrl(firstItem?.productImageUrl, productFallback);
            const showContinuePayment = canContinuePayment(order);
            const isPaying = payingOrderId === order.id;

            return (
              <article className="order-card upgraded-order-card" key={order.id}>
                <img src={image} alt={firstItem?.productName || "Order item"} />

                <div className="order-card-main">
                  <span className="order-code">{order.orderCode}</span>
                  <h2>{firstItem?.productName || "Gleenc order"}</h2>
                  <p>
                    {order.storeName} • {order.items.length} item(s)
                  </p>

                  <div className="order-meta-row">
                    <span>{statusIcon(order.status)} {order.statusLabel}</span>
                    <span>{formatDate(order.createdAt)}</span>
                    <span>{order.deliveryOption}</span>
                    <span>{order.campus}</span>
                  </div>
                </div>

                <div className="order-card-side">
                  <strong>{formatNaira(order.total)}</strong>

                  {showContinuePayment && (
                    <button
                      className="continue-payment-btn"
                      type="button"
                      disabled={isPaying}
                      onClick={() => void handleContinuePayment(order)}
                    >
                      <FiCreditCard />
                      {isPaying ? "Opening..." : "Continue Payment"}
                    </button>
                  )}

                  <div className="order-action-row">
                    <Link to={`/messages?order=${order.id}`}>
                      <FiMessageCircle /> Contact
                    </Link>
                    <Link
                      to={`/orders/${order.id}`}
                      state={{ orderView: "purchases" }}
                    >
                      View details <FiArrowRight />
                    </Link>
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
