import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiExternalLink,
  FiFileText,
  FiLock,
  FiShield,
  FiShoppingBag,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getSellerVerification,
  saveSellerVerificationDraft,
  submitSellerVerification,
  type SellerVerificationResponse,
} from "../services/seller-verification.service";
import { savePayoutAccount } from "../services/trust.service";
import { initializeSellerSubscriptionPayment } from "../services/payment.service";
import { getLocalMarkets, type LocalMarket } from "../services/market.service";
import { getMyVerificationCenter, type VerificationCase } from "../services/verification.service";
import { apiUrl } from "../lib/api";

type SellerType = "used_market" | "campus" | "local_market" | "nearby";
type VerificationStepKey =
  | "store_details"
  | "contact_location"
  | "face_verification"
  | "documents_business"
  | "review_submit";

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
    description:
      "Sell from an approved physical market like Igbudu, Ugbomro, Jakpa, or Okha.",
  },
  {
    value: "nearby",
    label: "Nearby Independent Seller",
    description:
      "Sell from your shop, hostel, home area, office, or business location.",
  },
];

const verificationSteps: Array<{
  step: number;
  key: VerificationStepKey;
  title: string;
  shortTitle: string;
  description: string;
}> = [
  {
    step: 1,
    key: "store_details",
    title: "Seller Type & Store Details",
    shortTitle: "Store",
    description:
      "Choose the seller type and save the basic public store details buyers will see.",
  },
  {
    step: 2,
    key: "contact_location",
    title: "Contact & Location Details",
    shortTitle: "Location",
    description:
      "Save the correct phone, WhatsApp, pickup, campus, or market location information.",
  },
  {
    step: 3,
    key: "face_verification",
    title: "Face Verification",
    shortTitle: "Face",
    description:
      "Complete the face check so admin can trust the seller identity tied to this account.",
  },
  {
    step: 4,
    key: "documents_business",
    title: "Identity Document & Business Details",
    shortTitle: "Documents",
    description:
      "Upload identity proof, describe the business clearly, and accept the seller agreement.",
  },
  {
    step: 5,
    key: "review_submit",
    title: "Review & Submit for Admin Approval",
    shortTitle: "Submit",
    description:
      "Review your progress and submit once. Submitted details stay locked while admin reviews.",
  },
];

const sectionToStep: Record<string, number> = {
  "seller-identity-section": 1,
  "seller-phone-section": 2,
  "seller-location-section": 2,
  "seller-face-section": 3,
  "seller-document-section": 4,
  "seller-fee-section": 4,
  "seller-review-section": 5,
};

function safeStep(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(verificationSteps.length, Math.max(1, Math.round(parsed)));
}

function friendlySellerError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  if (
    /SQLITE|ECONN|ENOTFOUND|Cloudinary|TypeError|stack trace|timeout/i.test(
      error.message,
    )
  ) {
    return fallback;
  }

  return error.message || fallback;
}

function formToDraftPayload(form: HTMLFormElement, nextStep: number) {
  const formData = new FormData(form);
  const payload: Record<string, string> = {};

  formData.forEach((value, key) => {
    if (value instanceof File) return;
    payload[key] = String(value);
  });

  payload.currentStep = String(nextStep);
  payload.nextStep = String(nextStep);

  return payload;
}

function SellerOnboarding() {
  const { user, store, refreshSession } = useAuth();
  const [state, setState] = useState<SellerVerificationResponse | null>(null);
  const [requirementCase, setRequirementCase] = useState<VerificationCase | null>(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceReference, setFaceReference] = useState("");
  const [sellerType, setSellerType] = useState<SellerType>("campus");
  const [currentStep, setCurrentStep] = useState(1);
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
      void getMyVerificationCenter("seller", true)
        .then((response) => setRequirementCase(response.case))
        .catch(() => setRequirementCase(null));
      setFaceVerified(Boolean(result.verification?.faceVerified));
      setFaceReference(result.verification?.faceReference || "");
      setSellerType((result.verification?.sellerType as SellerType) || "campus");
      setCurrentStep(safeStep(result.verification?.currentStep, 1));
      setError("");
    } catch (requestError) {
      setError(
        friendlySellerError(
          requestError,
          "Your progress could not be loaded. Please refresh and try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void getLocalMarkets()
      .then((response) => setLocalMarkets(response.markets))
      .catch(() => setLocalMarkets([]));
  }, []);

  const verification = state?.verification;
  const subscription = state?.subscription;
  const activeStore = state?.readiness?.store || store || null;
  const subscriptionActive = Boolean(subscription?.isActive);
  const verificationReady = verification?.status === "verified";
  const verificationSubmitted =
    verificationReady || verification?.status === "pending_verification";
  const adminResubmissionRequested =
    verification?.adminReviewStatus === "resubmission_requested";
  const submittedLocked = verificationSubmitted && !adminResubmissionRequested;
  const phoneReady = Boolean(user?.phoneVerified || verification?.phone || user?.phone);
  const faceReady = Boolean(faceVerified || verification?.faceVerified);
  const payoutReady = Boolean(state?.readiness?.payoutReady);
  const platformFeeReady = Boolean(
    state?.readiness?.hasStore || activeStore || verificationSubmitted,
  );
  const sellerSetupComplete =
    verificationReady && subscriptionActive && platformFeeReady && payoutReady;
  const payoutAccount = state?.readiness?.payoutAccount;
  const currentStepMeta = verificationSteps[currentStep - 1] || verificationSteps[0];

  const completedStepSet = useMemo(
    () => new Set(verification?.completedSteps || []),
    [verification?.completedSteps],
  );
  const lockedStepSet = useMemo(
    () => new Set(verification?.lockedSteps || []),
    [verification?.lockedSteps],
  );

  const sellerCompletionChecks = [
    { label: "Email verified", done: Boolean(user?.emailVerified), target: "seller-identity-section" },
    { label: "Phone verification ready", done: phoneReady, target: "seller-phone-section" },
    { label: "Face verification complete", done: faceReady, target: "seller-face-section" },
    { label: "Seller verified", done: verificationReady, target: "seller-review-section" },
    { label: "Subscription active", done: subscriptionActive, target: "seller-subscription-section" },
    { label: "Payout account ready", done: payoutReady, target: "seller-payout-section" },
    { label: "Platform fee ready", done: platformFeeReady, target: "seller-fee-section" },
  ];
  const sellerCompletionPercent = Math.round(
    (sellerCompletionChecks.filter((item) => item.done).length /
      sellerCompletionChecks.length) *
      100,
  );
  const sellerMissingChecks = sellerCompletionChecks
    .filter((item) => !item.done)
    .map((item) => item.label);

  function stepIsLocked(stepKey: VerificationStepKey) {
    return submittedLocked || lockedStepSet.has(stepKey);
  }

  function stepStatusLabel(stepKey: VerificationStepKey) {
    if (submittedLocked) {
      return verificationReady ? "Admin approved" : "Waiting for admin review";
    }
    if (lockedStepSet.has(stepKey)) return "Locked";
    if (completedStepSet.has(stepKey)) return "Completed";
    return "Needs action";
  }

  function handleReadinessClick(sectionId: string, redirectPath?: string) {
    if (redirectPath) {
      window.location.href = redirectPath;
      return;
    }

    const step = sectionToStep[sectionId];
    if (step) setCurrentStep(step);

    window.setTimeout(() => {
      const section = document.getElementById(sectionId);
      if (!section) return;

      section.scrollIntoView({ behavior: "smooth", block: "center" });

      window.setTimeout(() => {
        const focusable = section.querySelector<HTMLElement>(
          "input, select, textarea, button",
        );
        focusable?.focus({ preventScroll: true });
      }, 250);
    }, 80);
  }

  async function handleLocalFaceCheck() {
    if (stepIsLocked("face_verification")) return;

    const reference = `local-face-${Date.now()}`;
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const result = await saveSellerVerificationDraft({
        sellerType,
        faceVerified: "true",
        faceProvider: "local",
        faceReference: reference,
        currentStep: "4",
        nextStep: "4",
      });
      setState(result);
      setFaceVerified(true);
      setFaceReference(reference);
      setCurrentStep(safeStep(result.verification?.currentStep, 4));
      setMessage("Face check completed and saved. Continue to documents.");
    } catch (requestError) {
      setError(
        friendlySellerError(
          requestError,
          "Face verification could not be saved. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittedLocked) {
      setMessage("Your seller verification has been submitted for admin approval.");
      return;
    }

    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      if (currentStep === 3 && !faceReady) {
        setError("Complete face verification before continuing.");
        return;
      }

      if (currentStep < 5) {
        const nextStep = safeStep(currentStep + 1, currentStep + 1);
        const draftPayload =
          currentStep === 4
            ? new FormData(event.currentTarget)
            : formToDraftPayload(event.currentTarget, nextStep);

        if (draftPayload instanceof FormData) {
          const identityProof = draftPayload.get("identityProof");
          if (identityProof instanceof File && !identityProof.name) {
            draftPayload.delete("identityProof");
          }

          draftPayload.set("currentStep", String(nextStep));
          draftPayload.set("nextStep", String(nextStep));
          draftPayload.set("sellerType", sellerType);
          draftPayload.set("faceVerified", faceReady ? "true" : "false");
          draftPayload.set("faceProvider", verification?.faceProvider || "local");
          draftPayload.set(
            "faceReference",
            faceReference || verification?.faceReference || "",
          );
        }

        const result = await saveSellerVerificationDraft(draftPayload);
        setState(result);
        void getMyVerificationCenter("seller", true)
          .then((response) => setRequirementCase(response.case))
          .catch(() => setRequirementCase(null));
        setFaceVerified(Boolean(result.verification?.faceVerified));
        setFaceReference(result.verification?.faceReference || faceReference);
        setSellerType((result.verification?.sellerType as SellerType) || sellerType);
        setCurrentStep(safeStep(result.verification?.currentStep, nextStep));
        setMessage(`${currentStepMeta.shortTitle} step saved.`);
        return;
      }

      const formData = new FormData(event.currentTarget);
      formData.set("sellerType", sellerType);
      formData.set("faceVerified", faceReady ? "true" : "false");
      formData.set("faceProvider", verification?.faceProvider || "local");
      formData.set("faceReference", faceReference || verification?.faceReference || "");

      const result = await submitSellerVerification(formData);
      setState(result);
      void getMyVerificationCenter("seller", true)
        .then((response) => setRequirementCase(response.case))
        .catch(() => setRequirementCase(null));
      await refreshSession();
      setCurrentStep(safeStep(result.verification?.currentStep, 5));
      setMessage(
        result.verification?.status === "verified"
          ? "Seller profile completed successfully. Your seller dashboard is ready."
          : "Your seller verification has been submitted for admin approval.",
      );
    } catch (requestError) {
      setError(
        friendlySellerError(
          requestError,
          currentStep < 5
            ? "Seller verification could not be saved. Please try again."
            : "Seller verification could not be submitted. Please review the missing requirements and try again.",
        ),
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
        friendlySellerError(
          requestError,
          "Subscription could not be activated. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
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
      setMessage("Payout account saved for admin payout review.");
    } catch (requestError) {
      setError(
        friendlySellerError(
          requestError,
          "Payout account could not be saved. Please try again.",
        ),
      );
    } finally {
      setIsSavingPayout(false);
    }
  }

  if (isLoading) {
    return (
      <section className="seller-onboarding-page">
        <LoadingState
          title="Loading seller setup"
          message="Preparing your seller verification workspace."
        />
      </section>
    );
  }

  return (
    <section className="seller-onboarding-page">
      <Link to="/profile" className="seller-onboarding-back">
        <FiArrowLeft /> Back to profile
      </Link>

      <div className="seller-onboarding-hero">
        <span>
          <FiShoppingBag /> Seller Onboarding
        </span>
        <h1>
          {activeStore
            ? "Complete your verified seller workspace."
            : "Turn your buyer account into a seller profile."}
        </h1>
        <p>
          {activeStore
            ? "Complete seller identity, accept the seller agreement, and keep your ₦1,999 monthly subscription active before publishing campus products or services."
            : "You do not need another login. Add store details, complete verification, and Gleenc will upgrade this account into a seller account."}
        </p>
      </div>

      {error && (
        <div className="seller-onboarding-message error">
          <FiAlertCircle />
          {error}
        </div>
      )}
      {message && (
        <div className="seller-onboarding-message success">
          <FiCheckCircle />
          {message}
        </div>
      )}
      {sellerSetupComplete && (
        <div className="seller-onboarding-message success">
          <FiCheckCircle />
          <span>
            Your seller profile, payment, face check, payout account, and 5%
            buyer-facing platform fee are ready.
          </span>
          <Link to="/dashboard">Open seller dashboard</Link>
        </div>
      )}

      <div className="seller-onboarding-grid">
        <form className="seller-onboarding-form" onSubmit={handleSubmit}>
          <div className="seller-verification-stepper" aria-label="Seller verification progress">
            {verificationSteps.map((item) => (
              <button
                type="button"
                key={item.key}
                className={[
                  currentStep === item.step ? "active" : "",
                  completedStepSet.has(item.key) ? "completed" : "",
                  stepIsLocked(item.key) ? "locked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setCurrentStep(item.step)}
              >
                <span>{item.step}</span>
                <strong>{item.shortTitle}</strong>
                <small>{stepStatusLabel(item.key)}</small>
              </button>
            ))}
          </div>

          <input type="hidden" name="sellerType" value={sellerType} />
          <input type="hidden" name="faceVerified" value={faceReady ? "true" : "false"} />
          <input type="hidden" name="faceProvider" value={verification?.faceProvider || "local"} />
          <input type="hidden" name="faceReference" value={faceReference || verification?.faceReference || ""} />

          <section
            className={[
              "seller-verification-stage-card",
              stepIsLocked(currentStepMeta.key) ? "seller-verification-locked" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="seller-onboarding-title" id="seller-identity-section">
              <span>Step {currentStep} of 5</span>
              <h2>{currentStepMeta.title}</h2>
              <p>{currentStepMeta.description}</p>
            </div>

            {currentStep === 1 && (
              <fieldset disabled={stepIsLocked("store_details")}>
                <div className="seller-onboarding-type-grid">
                  {sellerTypeOptions.map((option) => (
                    <label
                      className={
                        sellerType === option.value
                          ? "seller-type-card active"
                          : "seller-type-card"
                      }
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
                      defaultValue={
                        activeStore?.name ||
                        `${user?.name?.split(" ")[0] || "Gleenc"} Store`
                      }
                      placeholder="Destiny Gadgets"
                      required
                    />
                  </label>
                  <label>
                    <span>Primary category</span>
                    <input
                      name="storeCategory"
                      defaultValue={activeStore?.category || ""}
                      placeholder="Food, Fashion, Gadgets, Services..."
                      required
                    />
                  </label>
                  <label>
                    <span>Operating hours</span>
                    <input
                      name="operatingHours"
                      defaultValue={
                        verification?.operatingHours ||
                        activeStore?.operatingHours ||
                        ""
                      }
                      placeholder="Mon - Sat, 8am - 7pm"
                    />
                  </label>
                </div>
              </fieldset>
            )}

            {currentStep === 2 && (
              <fieldset id="seller-location-section" disabled={stepIsLocked("contact_location")}>
                <div className="seller-onboarding-form-grid">
                  <label>
                    <span>Full name</span>
                    <input
                      name="fullName"
                      defaultValue={verification?.fullName || user?.name || ""}
                      required
                    />
                  </label>
                  <label id="seller-phone-section">
                    <span>Phone number</span>
                    <input
                      name="phone"
                      defaultValue={verification?.phone || user?.phone || ""}
                      required
                    />
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
                      defaultValue={
                        verification?.whatsappPhone ||
                        activeStore?.whatsappPhone ||
                        user?.phone ||
                        ""
                      }
                      placeholder="WhatsApp number for pickup coordination"
                    />
                  </label>
                  <label>
                    <span>Can riders WhatsApp you?</span>
                    <select
                      name="allowRiderWhatsAppContact"
                      defaultValue={
                        verification?.allowRiderWhatsAppContact === false ||
                        activeStore?.allowRiderWhatsAppContact === false
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
                      <input
                        name="campus"
                        defaultValue={verification?.campus || user?.campus || ""}
                        placeholder="FUPRE"
                        required
                      />
                    </label>
                    <label>
                      <span>Campus pickup point</span>
                      <input
                        name="pickupLocation"
                        defaultValue={
                          verification?.pickupLocation ||
                          activeStore?.pickupLocation ||
                          ""
                        }
                        placeholder="Main gate, hostel area, department..."
                        required
                      />
                    </label>
                    <label>
                      <span>Nearest landmark</span>
                      <input
                        name="nearestLandmark"
                        defaultValue={
                          verification?.nearestLandmark ||
                          activeStore?.nearestLandmark ||
                          ""
                        }
                        placeholder="Library, lecture hall, cafeteria..."
                        required
                      />
                    </label>
                  </div>
                )}

                {sellerType === "local_market" && (
                  <div className="seller-onboarding-special-block">
                    <div className="seller-onboarding-title compact">
                      <span>Local Market setup</span>
                      <h2>Join an approved market</h2>
                      <p>
                        Local Market sellers remain hidden until admin approves
                        the market seller profile.
                      </p>
                    </div>
                    <div className="seller-onboarding-form-grid">
                      <label>
                        <span>Select your market</span>
                        <select
                          name="marketId"
                          defaultValue={verification?.marketId || activeStore?.marketId || ""}
                        >
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
                        <input
                          name="shopStallNumber"
                          defaultValue={
                            verification?.shopStallNumber ||
                            activeStore?.shopStallNumber ||
                            ""
                          }
                          placeholder="Block A, Stall 24"
                          required
                        />
                      </label>
                      <label>
                        <span>Line/section/block</span>
                        <input
                          name="shopSection"
                          defaultValue={verification?.shopSection || activeStore?.shopSection || ""}
                          placeholder="Phone line, foodstuff section..."
                          required
                        />
                      </label>
                      <label>
                        <span>Market landmark</span>
                        <input
                          name="nearestLandmark"
                          defaultValue={
                            verification?.nearestLandmark ||
                            activeStore?.nearestLandmark ||
                            ""
                          }
                          placeholder="Near main gate, beside union office..."
                          required
                        />
                      </label>
                      <label>
                        <span>Pickup point</span>
                        <input
                          name="pickupLocation"
                          defaultValue={
                            verification?.pickupLocation ||
                            activeStore?.pickupLocation ||
                            ""
                          }
                          placeholder="Exact rider pickup point"
                          required
                        />
                      </label>
                      <label>
                        <span>Area/location note</span>
                        <input
                          name="locationArea"
                          defaultValue={
                            verification?.locationArea ||
                            activeStore?.locationArea ||
                            ""
                          }
                          placeholder="Market area or address note"
                          required
                        />
                      </label>
                    </div>

                    <div className="seller-onboarding-title compact">
                      <span>Can’t find your market?</span>
                      <h2>Request market approval</h2>
                      <p>
                        This request goes to admin review and will not become
                        public automatically.
                      </p>
                    </div>
                    <div className="seller-onboarding-form-grid">
                      <label>
                        <span>Market name</span>
                        <input
                          name="marketRequestName"
                          defaultValue={verification?.marketRequest?.marketName || ""}
                          placeholder="Example: Igbudu Market"
                        />
                      </label>
                      <label>
                        <span>State</span>
                        <input
                          name="marketRequestState"
                          defaultValue={verification?.marketRequest?.state || ""}
                          placeholder="Delta"
                        />
                      </label>
                      <label>
                        <span>City/area</span>
                        <input
                          name="marketRequestCityArea"
                          defaultValue={verification?.marketRequest?.cityArea || ""}
                          placeholder="Warri, Ugbomro..."
                        />
                      </label>
                      <label>
                        <span>Address/landmark</span>
                        <input
                          name="marketRequestAddressLandmark"
                          defaultValue={
                            verification?.marketRequest?.addressLandmark || ""
                          }
                          placeholder="Near main road, beside..."
                        />
                      </label>
                      <label>
                        <span>What do you sell?</span>
                        <input
                          name="marketRequestSells"
                          defaultValue={verification?.marketRequest?.sells || ""}
                          placeholder="Phones, foodstuff, fashion..."
                        />
                      </label>
                      <label>
                        <span>Shop/stall details</span>
                        <input
                          name="marketRequestShopDetails"
                          defaultValue={
                            verification?.marketRequest?.shopDetails || ""
                          }
                          placeholder="Line, stall number, section..."
                        />
                      </label>
                    </div>
                  </div>
                )}

                {sellerType === "nearby" && (
                  <div className="seller-onboarding-form-grid">
                    <label>
                      <span>Business area/location</span>
                      <input
                        name="locationArea"
                        defaultValue={verification?.locationArea || activeStore?.locationArea || ""}
                        placeholder="Effurun, Ugbomro, Abraka..."
                        required
                      />
                    </label>
                    <label>
                      <span>Business address / pickup location</span>
                      <input
                        name="pickupLocation"
                        defaultValue={
                          verification?.pickupLocation ||
                          activeStore?.pickupLocation ||
                          ""
                        }
                        placeholder="Shop, hostel, office, home area..."
                        required
                      />
                    </label>
                    <label>
                      <span>Nearest landmark</span>
                      <input
                        name="nearestLandmark"
                        defaultValue={
                          verification?.nearestLandmark ||
                          activeStore?.nearestLandmark ||
                          ""
                        }
                        placeholder="Nearest junction, filling station..."
                        required
                      />
                    </label>
                  </div>
                )}

                {sellerType === "used_market" && (
                  <div className="seller-onboarding-special-block">
                    <div className="seller-onboarding-form-grid">
                      <label>
                        <span>Area/location</span>
                        <input
                          name="locationArea"
                          defaultValue={
                            verification?.locationArea ||
                            activeStore?.locationArea ||
                            user?.campus ||
                            ""
                          }
                          placeholder="Where buyers/riders can locate items"
                          required
                        />
                      </label>
                      <label>
                        <span>Pickup preference</span>
                        <input
                          name="pickupLocation"
                          defaultValue={
                            verification?.pickupLocation ||
                            activeStore?.pickupLocation ||
                            ""
                          }
                          placeholder="Meetup point, rider pickup point..."
                          required
                        />
                      </label>
                      <label>
                        <span>Nearest landmark</span>
                        <input
                          name="nearestLandmark"
                          defaultValue={
                            verification?.nearestLandmark ||
                            activeStore?.nearestLandmark ||
                            ""
                          }
                          placeholder="Safe landmark for pickup"
                          required
                        />
                      </label>
                    </div>
                    <div className="seller-onboarding-message warning">
                      <FiShield />
                      <span>
                        Used Market rules: only real items, no
                        stolen/fake/restricted goods, actual item photos
                        required, defects must be disclosed, and high-value
                        items may need stronger verification.
                      </span>
                    </div>
                  </div>
                )}
              </fieldset>
            )}

            {currentStep === 3 && (
              <fieldset disabled={stepIsLocked("face_verification")}>
                <div className="seller-face-check-card" id="seller-face-section">
                  <FiShield />
                  <div>
                    <span>Real-time face verification</span>
                    <strong>
                      {faceReady ? "Face check completed" : "Face check required"}
                    </strong>
                    <p>
                      Gleenc stores the verification result, provider reference,
                      and timestamp for admin review.
                    </p>
                    {verification?.faceVerifiedAt && (
                      <small>
                        Completed {new Date(verification.faceVerifiedAt).toLocaleString()}
                      </small>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLocalFaceCheck()}
                    disabled={isSubmitting || (faceReady && stepIsLocked("face_verification"))}
                  >
                    {faceReady ? "Face check completed" : "Start face check"}
                  </button>
                </div>
              </fieldset>
            )}

            {currentStep === 4 && (
              <fieldset disabled={stepIsLocked("documents_business")}>
                <label className="seller-onboarding-full" id="seller-document-section">
                  <span>Seller identity document</span>
                  <input
                    name="identityProof"
                    type="file"
                    accept="image/*"
                    required={!verification?.identityProofUrl}
                  />
                  <small>
                    Upload a clear ID/student/business identity image for admin
                    review.
                    {verification?.identityProofUrl ? (
                      <a
                        href={apiUrl(verification.identityProofUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FiExternalLink /> View current document
                      </a>
                    ) : null}
                  </small>
                </label>

                <label className="seller-onboarding-full">
                  <span>Business description</span>
                  <textarea
                    name="businessDescription"
                    defaultValue={
                      verification?.businessDescription ||
                      activeStore?.description ||
                      ""
                    }
                    placeholder="Explain what you sell, pickup process, order confirmation rules, and availability."
                    rows={6}
                    minLength={20}
                    required
                  />
                </label>

                <label className="seller-agreement-row" id="seller-fee-section">
                  <input
                    name="agreementAccepted"
                    type="checkbox"
                    value="true"
                    defaultChecked={verification?.agreementAccepted || false}
                    required
                  />
                  <span>
                    I confirm that my seller information is correct and I
                    understand that Gleenc charges a ₦1,999 monthly seller fee
                    and adds a 5% platform fee to buyer-facing prices.
                  </span>
                </label>
              </fieldset>
            )}

            {currentStep === 5 && (
              <div className="seller-verification-review" id="seller-review-section">
                {verificationSubmitted ? (
                  <div className="seller-onboarding-message success">
                    <FiLock />
                    <span>
                      {verificationReady
                        ? "Admin has approved your seller verification."
                        : "Your seller verification has been submitted for admin approval."}
                    </span>
                  </div>
                ) : (
                  <div className="seller-onboarding-message warning">
                    <FiShield />
                    <span>
                      Review all completed steps. You can only submit after all
                      required verification items are complete.
                    </span>
                  </div>
                )}

                <div className="seller-verification-review-list">
                  {verificationSteps.slice(0, 4).map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={completedStepSet.has(item.key) ? "done" : ""}
                      onClick={() => setCurrentStep(item.step)}
                    >
                      <span>{item.title}</span>
                      <strong>{stepStatusLabel(item.key)}</strong>
                    </button>
                  ))}
                </div>

                {verification?.missingRequirements?.length ? (
                  <div className="seller-verification-missing">
                    <strong>Before final submit, complete:</strong>
                    <ul>
                      {verification.missingRequirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="seller-verification-ready">
                    All required seller verification items are ready for admin
                    review.
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="seller-verification-actions">
            <button
              type="button"
              className="secondary"
              disabled={currentStep === 1 || isSubmitting}
              onClick={() => setCurrentStep((step) => safeStep(step - 1, 1))}
            >
              Back
            </button>

            {currentStep < 5 ? (
              <button type="submit" disabled={isSubmitting || submittedLocked}>
                {isSubmitting ? "Saving..." : "Save & Continue"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  submittedLocked ||
                  !verification?.canSubmit ||
                  Boolean(verification?.missingRequirements?.length)
                }
              >
                {isSubmitting ? "Submitting..." : "Submit for Admin Approval"}
              </button>
            )}
          </div>
        </form>

        <aside className="seller-onboarding-side">
          <div className="seller-status-card seller-completion-card">
            <FiCheckCircle />
            <span>Profile completion</span>
            <h3>{sellerCompletionPercent}% complete</h3>
            <div
              className="seller-completion-meter"
              aria-label={`Seller profile ${sellerCompletionPercent}% complete`}
            >
              <div style={{ width: `${sellerCompletionPercent}%` }} />
            </div>
            <p>
              {sellerMissingChecks.length
                ? `Remaining: ${sellerMissingChecks
                    .slice(0, 3)
                    .join(", ")}${sellerMissingChecks.length > 3 ? "..." : ""}`
                : "All seller setup checks are complete."}
            </p>
          </div>

          <div className="seller-status-card" id="seller-review-status-card">
            <FiShield />
            <span>Verification status</span>
            <h3>{verification?.status?.replaceAll("_", " ") || "draft"}</h3>
            <p>
              {verification?.note ||
                "Submit your seller verification to unlock product publishing."}
            </p>
            {verification?.adminReviewStatus && (
              <small>Admin review: {verification.adminReviewStatus.replaceAll("_", " ")}</small>
            )}
          </div>

          {requirementCase ? (
            <div className="seller-status-card seller-requirement-card">
              <FiFileText />
              <span>Requirement reviews</span>
              <h3>{requirementCase.completionPercent}% complete</h3>
              <p>
                Level {requirementCase.currentVerifiedLevel} approved · {requirementCase.operationalStatus.replaceAll("_", " ")}
              </p>
              <div className="seller-requirement-list">
                {requirementCase.requirements.slice(0, 7).map((requirement) => (
                  <button
                    key={requirement.id}
                    type="button"
                    className={requirement.status === "approved" ? "done" : requirement.status}
                    onClick={() => {
                      if (requirement.code.includes("phone")) handleReadinessClick("seller-phone-section");
                      else if (requirement.code.includes("payout")) handleReadinessClick("seller-payout-section");
                      else if (requirement.code.includes("pickup") || requirement.code.includes("market")) handleReadinessClick("seller-location-section");
                      else if (requirement.code.includes("identity") || requirement.code.includes("campus")) handleReadinessClick("seller-document-section");
                      else handleReadinessClick("seller-review-section");
                    }}
                  >
                    <span>{requirement.title}</span>
                    <strong>{requirement.status.replaceAll("_", " ")}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="seller-status-card subscription" id="seller-subscription-section">
            <FiCreditCard />
            <span>Monthly seller fee</span>
            <h3>₦{(subscription?.amount || 1999).toLocaleString()} / month</h3>
            <p>
              Status: <strong>{subscription?.status || "inactive"}</strong>
              {subscription?.currentPeriodEnd
                ? ` · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : ""}
            </p>
            {!subscription?.isActive && (
              <button
                type="button"
                onClick={handleDevelopmentSubscription}
                disabled={isSubmitting}
              >
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
            {sellerCompletionChecks.map((item) => (
              <button
                type="button"
                key={item.label}
                className={item.done ? "done" : ""}
                onClick={() =>
                  handleReadinessClick(
                    item.target,
                    item.label === "Email verified" && !user?.emailVerified
                      ? "/verify-email"
                      : undefined,
                  )
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default SellerOnboarding;
