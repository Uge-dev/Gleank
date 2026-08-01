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

  const canPay = !subscription?.isActive || Boolean(subscription?.canRenew);
  const subscriptionStatus = subscription?.status || "inactive";
  const renewalText = subscription?.renewalOpensAt && !subscription?.canRenew
    ? `Renewal opens ${new Date(subscription.renewalOpensAt).toLocaleString()}.`
    : "";

  if (isLoading) {
    return <section className="seller-subscription-page"><LoadingState title="Loading subscription" message="Checking seller monthly fee status." /></section>;
  }

  return (
    <section className="seller-subscription-page">
      <Link to="/seller/onboarding" className="seller-onboarding-back"><FiArrowLeft /> Seller onboarding</Link>
      <div className="seller-onboarding-hero subscription-hero">
        <span><FiCreditCard /> Seller Subscription</span>
        <h1>₦1,999 monthly seller access.</h1>
        <p>Seller publishing tools are controlled by backend-verified Paystack payments. Each payment gives 31 days of access with a 7-day grace period.</p>
      </div>

      {error && <div className="seller-onboarding-message error">{error}</div>}
      {message && <div className="seller-onboarding-message success"><FiCheckCircle />{message}</div>}

      <div className="subscription-plan-card">
        <div className="subscription-plan-icon"><FiCreditCard /></div>
        <span>Seller Monthly</span>
        <h2>₦{(subscription?.amount || 1999).toLocaleString()} / month</h2>
        <p>Status: <strong>{subscriptionStatus.replaceAll("_", " ")}</strong></p>
        {subscription?.currentPeriodEnd && <p>Active until {new Date(subscription.currentPeriodEnd).toLocaleString()}</p>}
        {subscription?.gracePeriodEndsAt && subscription?.isGracePeriod && (
          <p>Grace period ends {new Date(subscription.gracePeriodEndsAt).toLocaleString()}</p>
        )}
        {renewalText && <p>{renewalText}</p>}
        {canPay ? (
          <button type="button" onClick={activateDevelopment} disabled={isSubmitting}>
            <FiRefreshCw /> {isSubmitting ? "Opening payment..." : subscription?.isActive ? "Renew with Paystack" : "Pay with Paystack"}
          </button>
        ) : (
          <Link to="/dashboard">Open seller dashboard</Link>
        )}
      </div>
    </section>
  );
}

export default SellerSubscription;
