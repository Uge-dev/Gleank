import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCheckCircle, FiCreditCard, FiRefreshCw } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { getSellerSubscription } from "../services/subscription.service";
import type { SellerSubscription as SellerSubscriptionType } from "../types/domain";
import { initializeSellerSubscriptionPayment } from "../services/payment.service";

function SellerSubscription() {
  const [subscription, setSubscription] = useState<SellerSubscriptionType | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const result = await getSellerSubscription();
      setSubscription(result.subscription);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Subscription could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function activateDevelopment() {
  setError("");
  setMessage("");
  setIsSubmitting(true);

  try {
    const response = await initializeSellerSubscriptionPayment();
    window.location.href = response.payment.authorizationUrl;
  } catch (requestError) {
    setError(
      requestError instanceof Error
        ? requestError.message
        : "Subscription payment could not be initialized.",
    );
  } finally {
    setIsSubmitting(false);
  }
}

  if (isLoading) {
    return <section className="seller-subscription-page"><LoadingState title="Loading subscription" message="Checking seller monthly fee status." /></section>;
  }

  return (
    <section className="seller-subscription-page">
      <Link to="/seller/onboarding" className="seller-onboarding-back"><FiArrowLeft /> Seller onboarding</Link>
      <div className="seller-onboarding-hero subscription-hero">
        <span><FiCreditCard /> Seller Subscription</span>
        <h1>₦1,999 monthly seller access.</h1>
        <p>Seller publishing tools stay active only while the monthly fee is active. Use Paystack checkout in test mode until live payment activation is ready.</p>
      </div>

      {error && <div className="seller-onboarding-message error">{error}</div>}
      {message && <div className="seller-onboarding-message success"><FiCheckCircle />{message}</div>}

      <div className="subscription-plan-card">
        <div className="subscription-plan-icon"><FiCreditCard /></div>
        <span>Campus Seller Monthly</span>
        <h2>₦{(subscription?.amount || 1999).toLocaleString()} / month</h2>
        <p>Status: <strong>{subscription?.status || "inactive"}</strong></p>
        {subscription?.currentPeriodEnd && <p>Active until {new Date(subscription.currentPeriodEnd).toLocaleString()}</p>}
        {!subscription?.isActive ? (
          <button type="button" onClick={activateDevelopment} disabled={isSubmitting}>
            <FiRefreshCw /> {isSubmitting ? "Opening payment..." : "Pay with Paystack"}
          </button>
        ) : (
          <Link to="/dashboard">Open seller dashboard</Link>
        )}
      </div>
    </section>
  );
}

export default SellerSubscription;
