import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FiArrowRight,
  FiCheckCircle,
  FiHome,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiShoppingCart,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { getOrder } from "../services/order.service";
import type { GleankOrder } from "../types/domain";
import { formatNaira } from "../utils/price";

function readSessionOrders() {
  try {
    const saved = sessionStorage.getItem("gleank_last_orders");
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as GleankOrder[]) : [];
  } catch {
    return [];
  }
}

function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const referenceFromUrl = searchParams.get("ref") || "";
  const [orders, setOrders] = useState<GleankOrder[]>(() => readSessionOrders());

  const references = useMemo(
    () =>
      referenceFromUrl
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [referenceFromUrl],
  );

  useEffect(() => {
    if (orders.length > 0 || references.length === 0) return;

    let active = true;

    void Promise.all(
      references.map((reference) =>
        getOrder(reference).then((response) => response.order),
      ),
    )
      .then((result) => {
        if (active) setOrders(result);
      })
      .catch(() => {
        if (active) setOrders([]);
      });

    return () => {
      active = false;
    };
  }, [orders.length, references]);

  const firstOrder = orders[0];
  const orderReference =
    references.join(", ") || orders.map((order) => order.orderCode).join(", ");

  const formattedDate = firstOrder?.createdAt
    ? new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(firstOrder.createdAt))
    : "Just now";

  const grandTotal = orders.reduce((total, order) => total + order.total, 0);
  const itemCount = orders.reduce((total, order) => total + order.items.length, 0);

  if (orders.length === 0) {
    return (
      <section className="order-success-page">
        <EmptyState
          icon={<FiShoppingCart />}
          eyebrow="No order found"
          title="We could not find this order"
          message="This can happen if you opened the success page directly or your session expired."
          actionLabel="Continue Shopping"
          onAction={() => {
            window.location.href = "/search";
          }}
        />

        <div className="order-success-actions">
          <Link to="/" className="success-secondary-link">
            <FiHome />
            Back Home
          </Link>

          <Link to="/orders" className="success-primary-link">
            My Orders
            <FiArrowRight />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="order-success-page">
      <div className="success-hero-card">
        <div className="success-icon-ring">
          <FiCheckCircle />
        </div>

        <span>Order Created</span>

        <h1>Your order request has been saved</h1>

        <p>
          Reference: <strong>{orderReference}</strong>
        </p>

        <small>{formattedDate}</small>
      </div>

      <div className="success-summary-grid">
        <div className="success-summary-card">
          <FiPackage />
          <span>Orders</span>
          <strong>{orders.length}</strong>
        </div>

        <div className="success-summary-card">
          <FiShoppingBag />
          <span>Items</span>
          <strong>{itemCount}</strong>
        </div>

        <div className="success-summary-card">
          <FiCheckCircle />
          <span>Total</span>
          <strong>{formatNaira(grandTotal)}</strong>
        </div>
      </div>

      <div className="success-order-card">
        <div className="success-order-header">
          <div>
            <span>Order Breakdown</span>
            <h2>Created backend orders</h2>
          </div>

          <FiShoppingCart />
        </div>

        <div className="success-items-list">
          {orders.map((order) => (
            <div className="success-item-row" key={order.id}>
              <div>
                <strong>{order.orderCode}</strong>
                <span>
                  {order.storeName} • {order.items.length} item(s) •{" "}
                  {order.statusLabel}
                </span>
              </div>

              <b>{formatNaira(order.total)}</b>
            </div>
          ))}
        </div>

        <div className="success-total-row">
          <span>Total</span>
          <strong>{formatNaira(grandTotal)}</strong>
        </div>
      </div>

      <div className="order-success-actions">
        <Link to="/" className="success-secondary-link">
          <FiHome />
          Back Home
        </Link>

        <Link to="/orders" className="success-primary-link">
          My Orders
          <FiArrowRight />
        </Link>

        <Link to="/messages" className="success-secondary-link">
          <FiMessageCircle />
          Message Seller
        </Link>
      </div>
    </section>
  );
}

export default OrderSuccess;
