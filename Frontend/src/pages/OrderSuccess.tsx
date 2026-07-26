import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiHome,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiShoppingCart,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import {
  verifyPublicPayment,
  type GleencPayment,
  type PaymentSummary,
} from "../services/payment.service";
import { formatNaira } from "../utils/price";

function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const reference = useMemo(
    () =>
      (
        searchParams.get("paymentRef") ||
        searchParams.get("reference") ||
        searchParams.get("trxref") ||
        searchParams.get("ref") ||
        ""
      ).trim(),
    [searchParams],
  );

  const [payment, setPayment] = useState<GleencPayment | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(reference));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reference) {
      setIsLoading(false);
      setError("Open this page from a confirmed Gleenc payment link.");
      return;
    }

    let active = true;
    setIsLoading(true);
    setError("");

    void verifyPublicPayment(reference)
      .then((response) => {
        if (!active) return;

        setPayment(response.payment);
        setError(
          response.payment.status === "paid"
            ? ""
            : "This payment has not been confirmed yet. Please check again shortly.",
        );
      })
      .catch((requestError) => {
        if (!active) return;

        setPayment(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "We could not confirm this payment yet.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reference]);

  const summary = payment?.summary as PaymentSummary | null | undefined;
  const items = summary?.items || [];
  const orderReference = summary?.orderCode || payment?.reference || reference;
  const formattedDate = summary?.createdAt
    ? new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(summary.createdAt))
    : "Just now";

  if (isLoading) {
    return (
      <section className="order-success-page">
        <EmptyState
          icon={<FiClock />}
          eyebrow="Confirming payment"
          title="Loading your confirmed order"
          message="Gleenc is checking the payment reference securely with the server."
        />
      </section>
    );
  }

  if (!payment || payment.status !== "paid" || !summary) {
    return (
      <section className="order-success-page">
        <EmptyState
          icon={<FiShoppingCart />}
          eyebrow="Payment not confirmed"
          title="We could not load this confirmed order yet"
          message={error || "Please return to checkout or check the payment again."}
          actionLabel="Check Payment Again"
          onAction={() => {
            if (reference) {
              window.location.href = `/payment/callback?reference=${encodeURIComponent(reference)}`;
            } else {
              window.location.href = "/search";
            }
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

  const orderCount = summary.type === "seller_subscription" ? 1 : 1;
  const itemCount = items.reduce((total, item) => total + item.quantity, 0) || 1;
  const primaryLabel =
    summary.type === "seller_subscription"
      ? "Seller Subscription"
      : summary.type === "used_order"
        ? summary.listingName || "Used Market order"
        : summary.storeName || "Store order";
  const primaryHref =
    summary.type === "seller_subscription"
      ? "/seller/onboarding"
      : summary.type === "used_order" && summary.orderId
        ? `/used-orders/${summary.orderId}`
        : summary.orderId
          ? `/orders/${summary.orderId}`
          : "/orders";

  return (
    <section className="order-success-page">
      <div className="success-hero-card">
        <div className="success-icon-ring">
          <FiCheckCircle />
        </div>

        <span>Payment Confirmed</span>

        <h1>Your Gleenc payment is successful</h1>

        <p>
          Reference: <strong>{orderReference}</strong>
        </p>

        <small>{formattedDate}</small>
      </div>

      <div className="success-summary-grid">
        <div className="success-summary-card">
          <FiPackage />
          <span>Record</span>
          <strong>{orderCount}</strong>
        </div>

        <div className="success-summary-card">
          <FiShoppingBag />
          <span>{summary.type === "seller_subscription" ? "Plan" : "Items"}</span>
          <strong>{itemCount}</strong>
        </div>

        <div className="success-summary-card">
          <FiCheckCircle />
          <span>Total</span>
          <strong>{formatNaira(summary.total)}</strong>
        </div>
      </div>

      <div className="success-order-card">
        <div className="success-order-header">
          <div>
            <span>{primaryLabel}</span>
            <h2>Backend-confirmed payment details</h2>
          </div>

          <FiShoppingCart />
        </div>

        <div className="success-items-list">
          {items.length > 0 ? (
            items.map((item, index) => (
              <div className="success-item-row" key={`${item.name}-${index}`}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    Quantity {item.quantity} • {payment.purpose.replace("_", " ")}
                  </span>
                </div>

                <b>{formatNaira(item.total)}</b>
              </div>
            ))
          ) : (
            <div className="success-item-row">
              <div>
                <strong>{primaryLabel}</strong>
                <span>{payment.purpose.replace("_", " ")}</span>
              </div>

              <b>{formatNaira(summary.total)}</b>
            </div>
          )}
        </div>

        <div className="success-total-row">
          <span>Total</span>
          <strong>{formatNaira(summary.total)}</strong>
        </div>
      </div>

      <div className="order-success-actions">
        <Link to="/" className="success-secondary-link">
          <FiHome />
          Back Home
        </Link>

        <Link to={primaryHref} className="success-primary-link">
          View Details
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
