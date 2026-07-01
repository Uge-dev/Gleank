import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiLoader,
} from "react-icons/fi";
import { verifyPayment, type GleankPayment } from "../services/payment.service";
import { useCart } from "../context/CartContext";
import "./PaymentCallback.css";

type CallbackState = "loading" | "success" | "pending" | "failed";

function getPaymentRedirectPath(payment: GleankPayment) {
  if (payment.purpose === "used_order" && payment.usedOrderId) {
    return `/used-orders/${payment.usedOrderId}`;
  }

  if (payment.purpose === "seller_subscription") {
    return "/seller-subscription";
  }

  if (payment.purpose === "store_order" && payment.orderId) {
    return `/orders/${payment.orderId}`;
  }

  return "/orders";
}

function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();

  const [state, setState] = useState<CallbackState>("loading");
  const [message, setMessage] = useState("Verifying your payment securely...");
  const [redirectPath, setRedirectPath] = useState("/orders");

  const reference = useMemo(() => {
    return (
      searchParams.get("reference") ||
      searchParams.get("trxref") ||
      searchParams.get("ref") ||
      ""
    ).trim();
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined;

    if (!reference) {
      setState("failed");
      setMessage("Paystack did not return a payment reference.");
      return () => undefined;
    }

    setState("loading");
    setMessage("Verifying your payment securely...");

    void verifyPayment(reference)
      .then((response) => {
        if (!active) return;

        const payment = response.payment;
        const nextRedirectPath = getPaymentRedirectPath(payment);
        const paymentStatus = String(payment.status);

        setRedirectPath(nextRedirectPath);

        if (paymentStatus === "paid") {
          clearCart();
          sessionStorage.removeItem("gleank_pending_payment_reference");

          setState("success");
          setMessage("Payment verified successfully. Redirecting you now...");

          timeoutId = window.setTimeout(() => {
            navigate(nextRedirectPath, { replace: true });
          }, 1300);

          return;
        }

        if (
          paymentStatus === "pending" ||
          paymentStatus === "initialized" ||
          paymentStatus === "abandoned"
        ) {
          setState("pending");
          setMessage(
            `Payment verification is not complete yet. Current status: ${paymentStatus}.`,
          );
          return;
        }

        setState("failed");
        setMessage(
          `Payment was not successful. Current status: ${paymentStatus}.`,
        );
      })
      .catch((error) => {
        if (!active) return;

        setState("failed");
        setMessage(
          error instanceof Error
            ? error.message
            : "Payment verification failed. Please check your orders.",
        );
      });

    return () => {
      active = false;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [clearCart, navigate, reference]);

  const icon =
    state === "loading" ? (
      <FiLoader className="payment-callback-spin" />
    ) : state === "success" ? (
      <FiCheckCircle />
    ) : state === "pending" ? (
      <FiClock />
    ) : (
      <FiAlertCircle />
    );

  return (
    <main className="payment-callback-page">
      <section className={`payment-callback-card is-${state}`}>
        <div className="payment-callback-icon">{icon}</div>

        <span className="payment-callback-eyebrow">Gleank secure payment</span>

        <h1>
          {state === "loading"
            ? "Checking payment"
            : state === "success"
              ? "Payment successful"
              : state === "pending"
                ? "Payment pending"
                : "Payment issue"}
        </h1>

        <p>{message}</p>

        {reference && (
          <div className="payment-callback-reference">
            <small>Reference</small>
            <strong>{reference}</strong>
          </div>
        )}

        {state !== "loading" && state !== "success" && (
          <div className="payment-callback-actions">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="payment-callback-primary"
            >
              Check again
              <FiArrowRight />
            </button>

            <Link to={redirectPath} className="payment-callback-secondary">
              Continue
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

export default PaymentCallback;