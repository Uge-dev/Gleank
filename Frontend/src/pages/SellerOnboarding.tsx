import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiShield,
  FiShoppingBag,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getSellerVerification,
  updateSellerVerification,
  type SellerVerificationResponse,
} from "../services/seller-verification.service";
import { initializeSellerSubscriptionPayment } from "../services/payment.service";

function SellerOnboarding() {
  const { user, store, refreshSession } = useAuth();
  const [state, setState] = useState<SellerVerificationResponse | null>(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceReference, setFaceReference] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const result = await getSellerVerification();
      setState(result);
      setFaceVerified(Boolean(result.verification?.faceVerified));
      setFaceReference(result.verification?.faceReference || "");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Seller onboarding could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleLocalFaceCheck() {
    const reference = `local-face-${Date.now()}`;
    setFaceVerified(true);
    setFaceReference(reference);
    setMessage("Local face verification captured. Connect a real liveness provider before production.");
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const result = await updateSellerVerification(new FormData(event.currentTarget));
      setState(result);
      await refreshSession();
      setMessage("Seller verification submitted successfully.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Seller verification could not be submitted.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDevelopmentSubscription() {
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
          : "Subscription could not be activated.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="seller-onboarding-page">
        <LoadingState title="Loading seller setup" message="Preparing your seller verification workspace." />
      </section>
    );
  }

  const verification = state?.verification;
  const subscription = state?.subscription;

  return (
    <section className="seller-onboarding-page">
      <Link to="/profile" className="seller-onboarding-back">
        <FiArrowLeft /> Back to profile
      </Link>

      <div className="seller-onboarding-hero">
        <span><FiShoppingBag /> Seller Onboarding</span>
        <h1>{store ? "Complete your verified seller workspace." : "Turn your buyer account into a seller profile."}</h1>
        <p>
          {store
            ? "Complete seller identity, accept the seller agreement, and keep your ₦1,999 monthly subscription active before publishing campus products or services."
            : "You do not need another login. Add store details, complete verification, and Gleenc will upgrade this account into a seller account."}
        </p>
      </div>

      {error && <div className="seller-onboarding-message error"><FiAlertCircle />{error}</div>}
      {message && <div className="seller-onboarding-message success"><FiCheckCircle />{message}</div>}

      <div className="seller-onboarding-grid">
        <form className="seller-onboarding-form" onSubmit={handleSubmit}>
          <div className="seller-onboarding-title">
            <span>Verification</span>
            <h2>Seller identity</h2>
            <p>Use your real seller details and complete live face verification. Existing buyer details are prefilled where possible.</p>
          </div>

          {!store && (
            <div className="seller-onboarding-form-grid">
              <label>
                <span>Store name</span>
                <input
                  name="storeName"
                  defaultValue={`${user?.name?.split(" ")[0] || "Gleenc"} Store`}
                  placeholder="Destiny Gadgets"
                  required
                />
              </label>
              <label>
                <span>Store category</span>
                <input
                  name="storeCategory"
                  placeholder="Food, Fashion, Gadgets, Services..."
                  required
                />
              </label>
            </div>
          )}

          <div className="seller-onboarding-form-grid">
            <label>
              <span>Full name</span>
              <input name="fullName" defaultValue={verification?.fullName || user?.name || ""} required />
            </label>
            <label>
              <span>Phone number</span>
              <input name="phone" defaultValue={verification?.phone || user?.phone || ""} required />
            </label>
            <label>
              <span>Campus</span>
              <input name="campus" defaultValue={verification?.campus || user?.campus || ""} required />
            </label>
          </div>

          <div className="seller-face-check-card">
            <FiShield />
            <div>
              <span>Real-time face verification</span>
              <strong>{faceVerified ? "Face check completed" : "Face check required"}</strong>
              <p>
                Local mode stores only the verification result, provider, reference,
                and timestamp. Production should connect Smile ID, Dojah, Prembly,
                or another liveness provider.
              </p>
            </div>
            <button type="button" onClick={handleLocalFaceCheck}>
              {faceVerified ? "Run again" : "Run local face check"}
            </button>
          </div>

          <input type="hidden" name="faceVerified" value={faceVerified ? "true" : "false"} />
          <input type="hidden" name="faceProvider" value="local" />
          <input type="hidden" name="faceReference" value={faceReference} />

          <label className="seller-onboarding-full">
            <span>Business description</span>
            <textarea
              name="businessDescription"
              defaultValue={verification?.businessDescription || store?.description || ""}
              placeholder="Explain what you sell, how students receive orders, and your campus availability."
              rows={6}
              required
            />
          </label>

          <label className="seller-agreement-row">
            <input name="agreementAccepted" type="checkbox" value="true" defaultChecked={verification?.agreementAccepted || false} required />
            <span>
              I confirm that my seller information is correct and I understand that Gleenc charges a ₦1,999 monthly seller fee and adds a 5% platform fee to buyer-facing prices.
            </span>
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </form>

        <aside className="seller-onboarding-side">
          <div className="seller-status-card">
            <FiShield />
            <span>Verification status</span>
            <h3>{verification?.status?.replaceAll("_", " ") || "draft"}</h3>
            <p>{verification?.note || "Submit your seller verification to unlock product publishing."}</p>
          </div>

          <div className="seller-status-card subscription">
            <FiCreditCard />
            <span>Monthly seller fee</span>
            <h3>₦{(subscription?.amount || 1999).toLocaleString()} / month</h3>
            <p>
              Status: <strong>{subscription?.status || "inactive"}</strong>
              {subscription?.currentPeriodEnd ? ` · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ""}
            </p>
            {!subscription?.isActive && (
              <button type="button" onClick={handleDevelopmentSubscription} disabled={isSubmitting}>
                Pay with Paystack
              </button>
            )}
          </div>

          <div className="seller-status-list">
            <span className={user?.emailVerified ? "done" : ""}>Email verified</span>
            <span className={faceVerified ? "done" : ""}>Face verification complete</span>
            <span className={verification?.status === "verified" ? "done" : ""}>Seller verified</span>
            <span className={subscription?.isActive ? "done" : ""}>Subscription active</span>
            <span>5% buyer-facing platform fee ready</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default SellerOnboarding;
