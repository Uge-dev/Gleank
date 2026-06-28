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
  FiUploadCloud,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getSellerVerification,
  updateSellerVerification,
  type SellerVerificationResponse,
} from "../services/seller-verification.service";
import { activateSellerSubscriptionForDevelopment } from "../services/subscription.service";

function SellerOnboarding() {
  const { user, store } = useAuth();
  const [state, setState] = useState<SellerVerificationResponse | null>(null);
  const [identityFileName, setIdentityFileName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const result = await getSellerVerification();
      setState(result);
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
      await activateSellerSubscriptionForDevelopment();
      await load();
      setMessage("Development subscription activated for 30 days.");
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
        <h1>Unlock a verified Gleank seller workspace.</h1>
        <p>
          Complete seller identity, accept the seller agreement, and keep your ₦3,000 monthly subscription active before publishing campus products or services.
        </p>
      </div>

      {error && <div className="seller-onboarding-message error"><FiAlertCircle />{error}</div>}
      {message && <div className="seller-onboarding-message success"><FiCheckCircle />{message}</div>}

      <div className="seller-onboarding-grid">
        <form className="seller-onboarding-form" onSubmit={handleSubmit}>
          <div className="seller-onboarding-title">
            <span>Verification</span>
            <h2>Seller identity</h2>
            <p>Use details that match your student ID or valid identity proof.</p>
          </div>

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
            <label>
              <span>Student ID / Matric No.</span>
              <input name="studentId" defaultValue={verification?.studentId || ""} required />
            </label>
          </div>

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

          <label className="seller-onboarding-upload">
            <FiUploadCloud />
            <strong>{identityFileName || "Upload identity proof"}</strong>
            <p>Student ID, school card, or clear identity proof image. JPEG, PNG, WebP, or GIF.</p>
            <input
              name="identityProof"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => setIdentityFileName(event.target.files?.[0]?.name || "")}
              required={!verification?.identityProofUrl}
            />
          </label>

          <label className="seller-agreement-row">
            <input name="agreementAccepted" type="checkbox" value="true" defaultChecked={verification?.agreementAccepted || false} required />
            <span>
              I confirm that my seller information is correct and I understand that Gleank charges a ₦3,000 monthly seller fee and adds a 5% platform fee to buyer-facing prices.
            </span>
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit seller verification"}
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
            <h3>₦{(subscription?.amount || 3000).toLocaleString()} / month</h3>
            <p>
              Status: <strong>{subscription?.status || "inactive"}</strong>
              {subscription?.currentPeriodEnd ? ` · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ""}
            </p>
            {!subscription?.isActive && (
              <button type="button" onClick={handleDevelopmentSubscription} disabled={isSubmitting}>
                Activate development subscription
              </button>
            )}
          </div>

          <div className="seller-status-list">
            <span className={user?.emailVerified ? "done" : ""}>Email verified</span>
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
