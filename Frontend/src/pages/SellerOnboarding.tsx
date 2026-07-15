import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiExternalLink,
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
import { savePayoutAccount } from "../services/trust.service";
import { initializeSellerSubscriptionPayment } from "../services/payment.service";
import { getLocalMarkets, type LocalMarket } from "../services/market.service";
import { apiUrl } from "../lib/api";

type SellerType = "used_market" | "campus" | "local_market" | "nearby";

const sellerTypeOptions: Array<{
  value: SellerType;
  label: string;
  description: string;
}> = [
  {
    value: "used_market",
    label: "Used Market Seller",
    description: "Sell fairly-used or pre-owned products safely.",
  },
  {
    value: "campus",
    label: "Campus Seller",
    description: "Sell to students and buyers around your campus.",
  },
  {
    value: "local_market",
    label: "Local Market Seller",
    description: "Sell from an approved physical market like Igbudu, Ugbomro, Jakpa, or Okha.",
  },
  {
    value: "nearby",
    label: "Nearby Independent Seller",
    description: "Sell from your shop, hostel, home area, office, or business location.",
  },
];

function SellerOnboarding() {
  const { user, store, refreshSession } = useAuth();
  const [state, setState] = useState<SellerVerificationResponse | null>(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceReference, setFaceReference] = useState("");
  const [sellerType, setSellerType] = useState<SellerType>("campus");
  const [localMarkets, setLocalMarkets] = useState<LocalMarket[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingPayout, setIsSavingPayout] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const result = await getSellerVerification();
      setState(result);
      setFaceVerified(Boolean(result.verification?.faceVerified));
      setFaceReference(result.verification?.faceReference || "");
      setSellerType((result.verification?.sellerType as SellerType) || "campus");
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
    void getLocalMarkets()
      .then((response) => setLocalMarkets(response.markets))
      .catch(() => setLocalMarkets([]));
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
      setMessage(
        result.verification?.status === "verified"
          ? "Seller profile completed successfully. Your seller dashboard is ready."
          : "Seller verification submitted successfully. Admin review is pending.",
      );
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

  function focusSection(sectionId: string) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    section.scrollIntoView({ behavior: "smooth", block: "center" });

    window.setTimeout(() => {
      const focusable = section.querySelector<HTMLElement>(
        "input, select, textarea, button",
      );
      focusable?.focus({ preventScroll: true });
    }, 350);
  }

  function handleReadinessClick(sectionId: string, redirectPath?: string) {
    if (redirectPath) {
      window.location.href = redirectPath;
      return;
    }

    focusSection(sectionId);
  }

  async function handlePayoutSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSavingPayout(true);

    try {
      const formData = new FormData(event.currentTarget);
      await savePayoutAccount({
        bankName: String(formData.get("bankName") || ""),
        accountName: String(formData.get("accountName") || ""),
        accountNumber: String(formData.get("accountNumber") || ""),
      });
      await load();
      setMessage("Payout account saved. Admin can now review and use this account for seller payouts.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Payout account could not be saved.",
      );
    } finally {
      setIsSavingPayout(false);
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
  const subscriptionActive = Boolean(subscription?.isActive);
  const verificationReady = verification?.status === "verified";
  const verificationSubmitted =
    verificationReady || verification?.status === "pending_verification";
  const phoneReady = Boolean(user?.phoneVerified || verification?.phone || user?.phone);
  const faceReady = Boolean(faceVerified || verification?.faceVerified);
  const payoutReady = Boolean(state?.readiness?.payoutReady);
  const platformFeeReady = Boolean(state?.readiness?.hasStore || store || verificationSubmitted);
  const sellerSetupComplete =
    verificationReady && subscriptionActive && platformFeeReady && payoutReady;
  const payoutAccount = state?.readiness?.payoutAccount;

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
      {sellerSetupComplete && (
        <div className="seller-onboarding-message success">
          <FiCheckCircle />
          <span>Your seller profile, payment, face check, and 5% buyer-facing platform fee are ready.</span>
          <Link to="/dashboard">Open seller dashboard</Link>
        </div>
      )}

      <div className="seller-onboarding-grid">
        <form className="seller-onboarding-form" onSubmit={handleSubmit}>
          <div className="seller-onboarding-title" id="seller-identity-section">
            <span>Verification</span>
            <h2>Seller identity</h2>
            <p>Use your real seller details, choose the correct seller type, and complete live face verification. Existing buyer details are prefilled where possible.</p>
          </div>

          <div className="seller-onboarding-type-grid">
            {sellerTypeOptions.map((option) => (
              <label
                className={sellerType === option.value ? "seller-type-card active" : "seller-type-card"}
                key={option.value}
              >
                <input
                  type="radio"
                  name="sellerType"
                  value={option.value}
                  checked={sellerType === option.value}
                  onChange={() => setSellerType(option.value)}
                />
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </label>
            ))}
          </div>

          <div className="seller-onboarding-form-grid">
            <label>
              <span>Store name</span>
              <input
                name="storeName"
                defaultValue={store?.name || `${user?.name?.split(" ")[0] || "Gleenc"} Store`}
                placeholder="Destiny Gadgets"
                required
              />
            </label>
            <label>
              <span>Primary category</span>
              <input
                name="storeCategory"
                defaultValue={store?.category || ""}
                placeholder="Food, Fashion, Gadgets, Services..."
                required
              />
            </label>
            <label>
              <span>Operating hours</span>
              <input
                name="operatingHours"
                defaultValue={verification?.operatingHours || store?.operatingHours || ""}
                placeholder="Mon - Sat, 8am - 7pm"
              />
            </label>
          </div>

          <div className="seller-onboarding-form-grid">
            <label>
              <span>Full name</span>
              <input name="fullName" defaultValue={verification?.fullName || user?.name || ""} required />
            </label>
            <label id="seller-phone-section">
              <span>Phone number</span>
              <input name="phone" defaultValue={verification?.phone || user?.phone || ""} required />
              <small className="seller-phone-verify-note">
                {user?.phoneVerified
                  ? "Phone verified. Contact changes should still be confirmed with OTP."
                  : "Phone OTP verification is required before changing this number."}
              </small>
            </label>
            <label>
              <span>WhatsApp contact</span>
              <input
                name="whatsappPhone"
                defaultValue={verification?.whatsappPhone || store?.whatsappPhone || user?.phone || ""}
                placeholder="WhatsApp number for pickup coordination"
              />
            </label>
            <label>
              <span>Can riders WhatsApp you?</span>
              <select
                name="allowRiderWhatsAppContact"
                defaultValue={
                  verification?.allowRiderWhatsAppContact === false ||
                  store?.allowRiderWhatsAppContact === false
                    ? "false"
                    : "true"
                }
              >
                <option value="true">Yes, allow rider WhatsApp contact</option>
                <option value="false">No, use call/in-app messaging only</option>
              </select>
            </label>
          </div>

          {sellerType === "campus" && (
            <div className="seller-onboarding-form-grid">
              <label>
                <span>Approved campus</span>
                <input name="campus" defaultValue={verification?.campus || user?.campus || ""} placeholder="FUPRE" required />
              </label>
              <label>
                <span>Campus pickup point</span>
                <input
                  name="pickupLocation"
                  defaultValue={verification?.pickupLocation || store?.pickupLocation || ""}
                  placeholder="Main gate, hostel area, department..."
                  required
                />
              </label>
              <label>
                <span>Nearest landmark</span>
                <input
                  name="nearestLandmark"
                  defaultValue={verification?.nearestLandmark || store?.nearestLandmark || ""}
                  placeholder="Library, lecture hall, cafeteria..."
                />
              </label>
            </div>
          )}

          {sellerType === "local_market" && (
            <div className="seller-onboarding-special-block">
              <div className="seller-onboarding-title compact">
                <span>Local Market setup</span>
                <h2>Join an approved market</h2>
                <p>Local Market sellers remain hidden until admin approves the market seller profile.</p>
              </div>
              <div className="seller-onboarding-form-grid">
                <label>
                  <span>Select your market</span>
                  <select name="marketId" defaultValue={verification?.marketId || store?.marketId || ""}>
                    <option value="">Select approved Local Market</option>
                    {localMarkets.map((market) => (
                      <option value={market.id} key={market.id}>
                        {market.name} · {market.area || market.city || market.state}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Shop/stall number</span>
                  <input name="shopStallNumber" defaultValue={verification?.shopStallNumber || store?.shopStallNumber || ""} placeholder="Block A, Stall 24" />
                </label>
                <label>
                  <span>Line/section/block</span>
                  <input name="shopSection" defaultValue={verification?.shopSection || store?.shopSection || ""} placeholder="Phone line, foodstuff section..." />
                </label>
                <label>
                  <span>Market landmark</span>
                  <input name="nearestLandmark" defaultValue={verification?.nearestLandmark || store?.nearestLandmark || ""} placeholder="Near main gate, beside union office..." />
                </label>
                <label>
                  <span>Pickup point</span>
                  <input name="pickupLocation" defaultValue={verification?.pickupLocation || store?.pickupLocation || ""} placeholder="Exact rider pickup point" required />
                </label>
                <label>
                  <span>Area/location note</span>
                  <input name="locationArea" defaultValue={verification?.locationArea || store?.locationArea || ""} placeholder="Market area or address note" />
                </label>
              </div>

              <div className="seller-onboarding-title compact">
                <span>Can’t find your market?</span>
                <h2>Request market approval</h2>
                <p>This request goes to admin review and will not become public automatically.</p>
              </div>
              <div className="seller-onboarding-form-grid">
                <label>
                  <span>Market name</span>
                  <input name="marketRequestName" placeholder="Example: Igbudu Market" />
                </label>
                <label>
                  <span>State</span>
                  <input name="marketRequestState" placeholder="Delta" />
                </label>
                <label>
                  <span>City/area</span>
                  <input name="marketRequestCityArea" placeholder="Warri, Ugbomro..." />
                </label>
                <label>
                  <span>Address/landmark</span>
                  <input name="marketRequestAddressLandmark" placeholder="Near main road, beside..." />
                </label>
                <label>
                  <span>What do you sell?</span>
                  <input name="marketRequestSells" placeholder="Phones, foodstuff, fashion..." />
                </label>
                <label>
                  <span>Shop/stall details</span>
                  <input name="marketRequestShopDetails" placeholder="Line, stall number, section..." />
                </label>
              </div>
            </div>
          )}

          {sellerType === "nearby" && (
            <div className="seller-onboarding-form-grid">
              <label>
                <span>Business area/location</span>
                <input name="locationArea" defaultValue={verification?.locationArea || store?.locationArea || ""} placeholder="Effurun, Ugbomro, Abraka..." required />
              </label>
              <label>
                <span>Business address / pickup location</span>
                <input name="pickupLocation" defaultValue={verification?.pickupLocation || store?.pickupLocation || ""} placeholder="Shop, hostel, office, home area..." required />
              </label>
              <label>
                <span>Nearest landmark</span>
                <input name="nearestLandmark" defaultValue={verification?.nearestLandmark || store?.nearestLandmark || ""} placeholder="Nearest junction, filling station..." />
              </label>
            </div>
          )}

          {sellerType === "used_market" && (
            <div className="seller-onboarding-special-block">
              <div className="seller-onboarding-form-grid">
                <label>
                  <span>Area/location</span>
                  <input name="locationArea" defaultValue={verification?.locationArea || store?.locationArea || user?.campus || ""} placeholder="Where buyers/riders can locate items" required />
                </label>
                <label>
                  <span>Pickup preference</span>
                  <input name="pickupLocation" defaultValue={verification?.pickupLocation || store?.pickupLocation || ""} placeholder="Meetup point, rider pickup point..." required />
                </label>
                <label>
                  <span>Nearest landmark</span>
                  <input name="nearestLandmark" defaultValue={verification?.nearestLandmark || store?.nearestLandmark || ""} placeholder="Safe landmark for pickup" />
                </label>
              </div>
              <div className="seller-onboarding-message warning">
                <FiShield />
                <span>Used Market rules: only real items, no stolen/fake/restricted goods, actual item photos required, defects must be disclosed, and high-value items may need stronger verification.</span>
              </div>
            </div>
          )}

          <div className="seller-face-check-card" id="seller-face-section">
            <FiShield />
            <div>
              <span>Real-time face verification</span>
              <strong>{faceVerified ? "Face check completed" : "Face check required"}</strong>
              <p>
                Gleenc stores the verification result, provider reference and timestamp for admin review.
              </p>
            </div>
            <button type="button" onClick={handleLocalFaceCheck}>
              {faceVerified ? "Run again" : "Start face check"}
            </button>
          </div>

          <input type="hidden" name="faceVerified" value={faceVerified ? "true" : "false"} />
          <input type="hidden" name="faceProvider" value="local" />
          <input type="hidden" name="faceReference" value={faceReference} />

          <label className="seller-onboarding-full" id="seller-document-section">
            <span>Seller identity document</span>
            <input
              name="identityProof"
              type="file"
              accept="image/*"
              required={!verification?.identityProofUrl}
            />
            <small>
              Upload a clear ID/student/business identity image for admin review.
              {verification?.identityProofUrl ? (
                <a href={apiUrl(verification.identityProofUrl)} target="_blank" rel="noreferrer">
                  <FiExternalLink /> View current document
                </a>
              ) : null}
            </small>
          </label>

          <label className="seller-onboarding-full">
            <span>Business description</span>
            <textarea
              name="businessDescription"
              defaultValue={verification?.businessDescription || store?.description || ""}
              placeholder="Explain what you sell, pickup process, order confirmation rules, and availability."
              rows={6}
              required
            />
          </label>

          <label className="seller-agreement-row" id="seller-fee-section">
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
          <div className="seller-status-card" id="seller-review-section">
            <FiShield />
            <span>Verification status</span>
            <h3>{verification?.status?.replaceAll("_", " ") || "draft"}</h3>
            <p>{verification?.note || "Submit your seller verification to unlock product publishing."}</p>
          </div>

          <div className="seller-status-card subscription" id="seller-subscription-section">
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

          <form
            className="seller-status-card seller-payout-card"
            id="seller-payout-section"
            onSubmit={handlePayoutSubmit}
          >
            <FiCreditCard />
            <span>Seller payout account</span>
            <h3>{payoutReady ? "Payout account ready" : "Add payout account"}</h3>
            <p>
              {payoutAccount?.isComplete
                ? `${payoutAccount.bankName} • ${payoutAccount.accountName} • ${payoutAccount.accountNumberMasked}`
                : "Add the account admin should use when seller funds are ready for payout."}
            </p>
            <label>
              <span>Bank name</span>
              <input
                name="bankName"
                defaultValue={payoutAccount?.bankName || ""}
                placeholder="Access Bank, GTBank, Opay..."
                required
              />
            </label>
            <label>
              <span>Account name</span>
              <input
                name="accountName"
                defaultValue={payoutAccount?.accountName || ""}
                placeholder="Account holder name"
                required
              />
            </label>
            <label>
              <span>Account number</span>
              <input
                name="accountNumber"
                inputMode="numeric"
                placeholder={payoutAccount?.accountNumberMasked || "10-digit account number"}
                required
                minLength={10}
              />
            </label>
            <button type="submit" disabled={isSavingPayout}>
              {isSavingPayout ? "Saving..." : payoutReady ? "Update payout" : "Save payout"}
            </button>
          </form>

          <div className="seller-status-list">
            <button
              type="button"
              className={user?.emailVerified ? "done" : ""}
              onClick={() =>
                handleReadinessClick(
                  "seller-identity-section",
                  user?.emailVerified ? undefined : "/verify-email",
                )
              }
            >
              Email verified
            </button>
            <button
              type="button"
              className={phoneReady ? "done" : ""}
              onClick={() => handleReadinessClick("seller-phone-section")}
            >
              Phone verification ready
            </button>
            <button
              type="button"
              className={faceReady ? "done" : ""}
              onClick={() => handleReadinessClick("seller-face-section")}
            >
              Face verification complete
            </button>
            <button
              type="button"
              className={verificationReady ? "done" : ""}
              onClick={() => handleReadinessClick("seller-review-section")}
            >
              Seller verified
            </button>
            <button
              type="button"
              className={subscriptionActive ? "done" : ""}
              onClick={() => handleReadinessClick("seller-subscription-section")}
            >
              Subscription active
            </button>
            <button
              type="button"
              className={payoutReady ? "done" : ""}
              onClick={() => handleReadinessClick("seller-payout-section")}
            >
              Payout account ready
            </button>
            <button
              type="button"
              className={platformFeeReady ? "done" : ""}
              onClick={() => handleReadinessClick("seller-fee-section")}
            >
              5% buyer-facing platform fee ready
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default SellerOnboarding;
