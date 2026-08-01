import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiExternalLink,
  FiFileText,
  FiLock,
  FiMapPin,
  FiShield,
  FiShoppingBag,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getSellerVerification,
  saveSellerVerificationDraft,
  submitSellerVerification,
  submitSellerVerificationStage,
  type SellerVerificationResponse,
} from "../services/seller-verification.service";
import { savePayoutAccount } from "../services/trust.service";
import { initializeSellerSubscriptionPayment } from "../services/payment.service";
import {
  geocodeSellerLocation,
  getLocationCatalog,
  type GeocodedSellerLocation,
  type LocationCatalog,
} from "../services/structured-location.service";
import { getLocalMarkets, type LocalMarket } from "../services/market.service";
import {
  getMyVerificationCenter,
  requestVerificationRequirementResubmission,
  type VerificationCase,
} from "../services/verification.service";
import { apiUrl } from "../lib/api";

type SellerType = "used_market" | "campus" | "local_market";
type VerificationStepKey =
  | "store_details"
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
    title: "Store, Contact & Pickup Location",
    shortTitle: "Profile",
    description:
      "Complete the seller type, public store details, contact information, and exact pickup location.",
  },
  {
    step: 2,
    key: "documents_business",
    title: "Identity, Face & Seller Trust",
    shortTitle: "Trust",
    description:
      "Complete face verification, upload identity proof, describe the business, and accept the seller agreement.",
  },
  {
    step: 3,
    key: "review_submit",
    title: "Payout, Operations & Final Review",
    shortTitle: "Operations",
    description:
      "Confirm payout readiness and submit the final operating profile for admin approval.",
  },
];

const sectionToStep: Record<string, number> = {
  "seller-identity-section": 1,
  "seller-phone-section": 1,
  "seller-location-section": 1,
  "seller-face-section": 2,
  "seller-document-section": 2,
  "seller-fee-section": 3,
  "seller-review-section": 3,
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
  const navigate = useNavigate();
  const { user, store, refreshSession } = useAuth();
  const [state, setState] = useState<SellerVerificationResponse | null>(null);
  const [requirementCase, setRequirementCase] = useState<VerificationCase | null>(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceReference, setFaceReference] = useState("");
  const [sellerType, setSellerType] = useState<SellerType>("campus");
  const [currentStep, setCurrentStep] = useState(1);
  const [localMarkets, setLocalMarkets] = useState<LocalMarket[]>([]);
  const [locationCatalog, setLocationCatalog] = useState<LocationCatalog | null>(null);
  const [structuredLocation, setStructuredLocation] = useState({
    country: "Nigeria",
    state: "",
    city: "",
    nearestCampus: "",
    nearestMarketplace: "",
    street: "",
    pickupPlaceId: "",
    pickupLat: "",
    pickupLng: "",
    locationVerifiedAt: "",
  });
  const [locationMatches, setLocationMatches] = useState<GeocodedSellerLocation[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [resubmissionReasons, setResubmissionReasons] = useState<
    Record<string, string>
  >({});
  const [resubmissionRequirementId, setResubmissionRequirementId] =
    useState("");

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
      const savedLocation = result.verification;
      setStructuredLocation({
        country: savedLocation?.country || "Nigeria",
        state: savedLocation?.state || "",
        city: savedLocation?.city || "",
        nearestCampus: savedLocation?.nearestCampus || savedLocation?.campus || "",
        nearestMarketplace: savedLocation?.nearestMarketplace || "",
        street: savedLocation?.street || savedLocation?.pickupLocation || "",
        pickupPlaceId: savedLocation?.pickupPlaceId || "",
        pickupLat: String(result.readiness?.store?.pickupLat ?? ""),
        pickupLng: String(result.readiness?.store?.pickupLng ?? ""),
        locationVerifiedAt: savedLocation?.locationVerifiedAt || "",
      });
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
    void getLocationCatalog()
      .then(setLocationCatalog)
      .catch(() => setLocationCatalog(null));
  }, []);

  useEffect(() => {
    if (!requirementCase) return;
    const firstAvailableStage = Math.min(
      3,
      Math.max(1, requirementCase.currentVerifiedLevel + 1),
    );
    if (currentStep > firstAvailableStage) {
      setCurrentStep(firstAvailableStage);
    }
  }, [currentStep, requirementCase]);

  const verification = state?.verification;
  const subscription = state?.subscription;
  const activeStore = state?.readiness?.store || store || null;
  const subscriptionActive = Boolean(subscription?.isActive);
  const verificationReady =
    verification?.status === "verified" ||
    Number(requirementCase?.currentVerifiedLevel || 0) >= 3;
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
  const availableCities = useMemo(
    () =>
      locationCatalog?.states.find((item) => item.name === structuredLocation.state)
        ?.cities || [],
    [locationCatalog, structuredLocation.state],
  );

  async function findStructuredLocation() {
    const text = [
      structuredLocation.street,
      structuredLocation.nearestMarketplace,
      structuredLocation.nearestCampus,
      structuredLocation.city,
      structuredLocation.state,
      structuredLocation.country,
    ].filter(Boolean).join(", ");
    if (!structuredLocation.state || !structuredLocation.city || !structuredLocation.street) {
      setError("Choose a state and city, then enter the street before confirming the map pin.");
      return;
    }

    setError("");
    setIsGeocoding(true);
    try {
      const response = await geocodeSellerLocation(text);
      const precise = response.results.filter(
        (item) => item.placeId && item.lat !== null && item.lng !== null,
      );
      setLocationMatches(precise);
      if (!precise.length) {
        setError("No verified map pin was found. Add a clearer street, landmark, campus or marketplace and try again.");
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The address could not be mapped right now.",
      );
    } finally {
      setIsGeocoding(false);
    }
  }

  function selectStructuredLocation(result: GeocodedSellerLocation) {
    setStructuredLocation((current) => ({
      ...current,
      country: result.country || current.country,
      state: result.state || current.state,
      city: result.city || current.city,
      street: result.formattedAddress || current.street,
      pickupPlaceId: result.placeId,
      pickupLat: String(result.lat ?? ""),
      pickupLng: String(result.lng ?? ""),
      locationVerifiedAt: new Date().toISOString(),
    }));
    setLocationMatches([]);
    setMessage("Map pin confirmed. Save this stage to keep the verified pickup location.");
  }

  function updateStructuredLocation(
    field: "state" | "city" | "nearestCampus" | "nearestMarketplace" | "street",
    value: string,
  ) {
    setStructuredLocation((current) => ({
      ...current,
      [field]: value,
      ...(field === "state" ? { city: "" } : {}),
      pickupPlaceId: "",
      pickupLat: "",
      pickupLng: "",
      locationVerifiedAt: "",
    }));
    setLocationMatches([]);
  }

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
  const sellerCompletionPercent =
    requirementCase?.completionPercent ??
    Math.round(
      (sellerCompletionChecks.filter((item) => item.done).length /
        sellerCompletionChecks.length) *
        100,
    );
  const sellerMissingChecks = sellerCompletionChecks
    .filter((item) => !item.done)
    .map((item) => item.label);

  function stageForKey(stepKey: VerificationStepKey) {
    return (
      verificationSteps.find((item) => item.key === stepKey)?.step || 1
    );
  }

  function stageRequirements(stage: number) {
    return (requirementCase?.requirements || []).filter(
      (requirement) => requirement.requiredLevel === stage,
    );
  }

  function stageIsApproved(stage: number) {
    return Number(requirementCase?.currentVerifiedLevel || 0) >= stage;
  }

  function stageIsPending(stage: number) {
    const requirements = stageRequirements(stage);
    return requirements.some((requirement) =>
      ["submitted", "under_review"].includes(requirement.status),
    );
  }

  function stageNeedsCorrection(stage: number) {
    return stageRequirements(stage).some((requirement) =>
      ["needs_information", "rejected"].includes(requirement.status),
    );
  }

  function stageIsAccessible(stage: number) {
    return stage === 1 || Number(requirementCase?.currentVerifiedLevel || 0) >= stage - 1;
  }

  function stepIsLocked(stepKey: VerificationStepKey) {
    const stage = stageForKey(stepKey);
    return (
      submittedLocked ||
      stageIsApproved(stage) ||
      stageIsPending(stage) ||
      !stageIsAccessible(stage) ||
      lockedStepSet.has(stepKey)
    );
  }

  function stepStatusLabel(stepKey: VerificationStepKey) {
    const stage = stageForKey(stepKey);
    if (stageIsApproved(stage)) return "Admin approved";
    if (!stageIsAccessible(stage)) return `Complete Stage ${stage - 1}`;
    if (stageNeedsCorrection(stage)) return "Correction required";
    if (stageIsPending(stage) || submittedLocked) return "Admin review";
    if (completedStepSet.has(stepKey)) return "Completed";
    return "Needs action";
  }

  function handleReadinessClick(sectionId: string, redirectPath?: string) {
    if (redirectPath) {
      navigate(redirectPath);
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
    if (stepIsLocked("documents_business")) return;

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
        currentStep: "2",
        nextStep: "2",
      });
      setState(result);
      setFaceVerified(true);
      setFaceReference(reference);
      setCurrentStep(2);
      setMessage("Face check completed and saved. Add your identity document below.");
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
      if (currentStep === 2 && !faceReady) {
        setError("Complete face verification before continuing.");
        return;
      }

      if (currentStep < 3) {
        const draftPayload =
          currentStep === 2
            ? new FormData(event.currentTarget)
            : formToDraftPayload(event.currentTarget, currentStep);

        if (draftPayload instanceof FormData) {
          const identityProof = draftPayload.get("identityProof");
          if (identityProof instanceof File && !identityProof.name) {
            draftPayload.delete("identityProof");
          }

          draftPayload.set("currentStep", String(currentStep));
          draftPayload.set("nextStep", String(currentStep));
          draftPayload.set("sellerType", sellerType);
          draftPayload.set("faceVerified", faceReady ? "true" : "false");
          draftPayload.set("faceProvider", verification?.faceProvider || "local");
          draftPayload.set(
            "faceReference",
            faceReference || verification?.faceReference || "",
          );
        }

        const result = await submitSellerVerificationStage(
          currentStep as 1 | 2,
          draftPayload,
        );
        setState(result);
        const refreshedCase = await getMyVerificationCenter("seller", true);
        setRequirementCase(refreshedCase.case);
        setFaceVerified(Boolean(result.verification?.faceVerified));
        setFaceReference(result.verification?.faceReference || faceReference);
        setSellerType((result.verification?.sellerType as SellerType) || sellerType);
        setCurrentStep(currentStep);
        setMessage(
          `Stage ${currentStep} submitted. It is locked while admin reviews it.`,
        );
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
      setCurrentStep(3);
      setMessage(
        result.verification?.status === "verified"
          ? "Seller profile completed successfully. Your seller dashboard is ready."
          : "Your seller verification has been submitted for admin approval.",
      );
    } catch (requestError) {
      setError(
        friendlySellerError(
          requestError,
          currentStep < 3
            ? "Seller verification could not be saved. Please try again."
            : "Seller verification could not be submitted. Please review the missing requirements and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequirementResubmission(requirementId: string) {
    const reason = (resubmissionReasons[requirementId] || "").trim();
    if (reason.length < 10) {
      setError(
        "Explain why this seller requirement must be reopened (at least 10 characters).",
      );
      return;
    }

    setError("");
    setMessage("");
    setResubmissionRequirementId(requirementId);
    try {
      await requestVerificationRequirementResubmission(
        requirementId,
        reason,
      );
      const refreshedCase = await getMyVerificationCenter("seller", true);
      setRequirementCase(refreshedCase.case);
      setResubmissionReasons((current) => ({
        ...current,
        [requirementId]: "",
      }));
      setMessage(
        "Your request was sent. The requirement stays locked until admin approves reopening it.",
      );
    } catch (requestError) {
      setError(
        friendlySellerError(
          requestError,
          "The resubmission request could not be sent. Please try again.",
        ),
      );
    } finally {
      setResubmissionRequirementId("");
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
                disabled={!stageIsAccessible(item.step)}
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
              <span>Stage {currentStep} of 3</span>
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

            {currentStep === 1 && (
              <fieldset id="seller-location-section" disabled={stepIsLocked("store_details")}>
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

                <div className="seller-onboarding-special-block seller-structured-location">
                  <div className="seller-onboarding-title compact">
                    <span>Verified service area</span>
                    <h2>Business and pickup location</h2>
                    <p>
                      These fields power marketplace search and delivery distance. Your seller
                      type is not shown as a public profile tag.
                    </p>
                  </div>
                  <div className="seller-onboarding-form-grid">
                    <label>
                      <span>Country</span>
                      <select name="country" value={structuredLocation.country} onChange={() => undefined} aria-readonly="true">
                        <option value="Nigeria">Nigeria</option>
                      </select>
                    </label>
                    <label>
                      <span>State</span>
                      <select
                        name="state"
                        value={structuredLocation.state}
                        onChange={(event) => updateStructuredLocation("state", event.target.value)}
                        required
                      >
                        <option value="">Choose state</option>
                        {locationCatalog?.states.map((item) => (
                          <option key={item.name} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>City</span>
                      <select
                        name="city"
                        value={structuredLocation.city}
                        onChange={(event) => updateStructuredLocation("city", event.target.value)}
                        required
                      >
                        <option value="">Choose city</option>
                        {structuredLocation.city && !availableCities.includes(structuredLocation.city) ? (
                          <option value={structuredLocation.city}>{structuredLocation.city}</option>
                        ) : null}
                        {availableCities.map((city) => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Nearest campus</span>
                      <input
                        name="nearestCampus"
                        list="seller-campus-options"
                        value={structuredLocation.nearestCampus}
                        onChange={(event) => updateStructuredLocation("nearestCampus", event.target.value)}
                        placeholder="UNIBEN, FUPRE, UNILAG..."
                        required
                      />
                      <datalist id="seller-campus-options">
                        {locationCatalog?.campuses.map((campus) => (
                          <option key={campus} value={campus} />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      <span>Nearest marketplace</span>
                      <input
                        name="nearestMarketplace"
                        list="seller-marketplace-options"
                        value={structuredLocation.nearestMarketplace}
                        onChange={(event) => updateStructuredLocation("nearestMarketplace", event.target.value)}
                        placeholder="Igbudu Market, Ugbomro Market..."
                        required
                      />
                      <datalist id="seller-marketplace-options">
                        {locationCatalog?.marketplaces.map((market) => (
                          <option key={market.id} value={market.name} />
                        ))}
                        {localMarkets.map((market) => (
                          <option key={`local-${market.id}`} value={market.name} />
                        ))}
                      </datalist>
                    </label>
                    <label className="seller-location-street-field">
                      <span>Street / exact pickup address</span>
                      <input
                        name="street"
                        value={structuredLocation.street}
                        onChange={(event) => updateStructuredLocation("street", event.target.value)}
                        placeholder="Street, shop number, landmark and area"
                        required
                      />
                    </label>
                  </div>

                  <input type="hidden" name="pickupPlaceId" value={structuredLocation.pickupPlaceId} />
                  <input type="hidden" name="pickupLat" value={structuredLocation.pickupLat} />
                  <input type="hidden" name="pickupLng" value={structuredLocation.pickupLng} />
                  <input type="hidden" name="locationVerifiedAt" value={structuredLocation.locationVerifiedAt} />

                  <div className="seller-map-pin-actions">
                    <button type="button" onClick={() => void findStructuredLocation()} disabled={isGeocoding}>
                      <FiMapPin /> {isGeocoding ? "Finding address..." : "Find and confirm map pin"}
                    </button>
                    <span className={structuredLocation.pickupPlaceId ? "confirmed" : ""}>
                      {structuredLocation.pickupPlaceId
                        ? "Verified map pin saved in this form"
                        : "A verified map pin is required before final submission"}
                    </span>
                  </div>

                  {locationMatches.length > 0 ? (
                    <div className="seller-location-matches" aria-label="Matching map locations">
                      {locationMatches.map((result) => (
                        <button
                          type="button"
                          key={result.placeId}
                          onClick={() => selectStructuredLocation(result)}
                        >
                          <FiMapPin />
                          <span>
                            <strong>{result.formattedAddress}</strong>
                            <small>{result.city || structuredLocation.city}, {result.state || structuredLocation.state}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
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

            {currentStep === 2 && (
              <fieldset disabled={stepIsLocked("documents_business")}>
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
                    disabled={
                      isSubmitting ||
                      (faceReady && stepIsLocked("documents_business"))
                    }
                  >
                    {faceReady ? "Face check completed" : "Start face check"}
                  </button>
                </div>
              </fieldset>
            )}

            {currentStep === 2 && (
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

            {currentStep === 3 && (
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
                  {verificationSteps.slice(0, 2).map((item) => (
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

            {currentStep < 3 ? (
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  submittedLocked ||
                  stepIsLocked(currentStepMeta.key)
                }
              >
                {isSubmitting
                  ? "Submitting..."
                  : `Submit Stage ${currentStep} for Admin Review`}
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  submittedLocked ||
                  !payoutReady ||
                  !stageIsAccessible(3) ||
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
                {requirementCase.requirements.map((requirement) => (
                  <div className="seller-requirement-entry" key={requirement.id}>
                    <button
                      type="button"
                      className={
                        requirement.status === "approved"
                          ? "done"
                          : requirement.status
                      }
                      onClick={() => {
                        if (requirement.code.includes("phone")) {
                          handleReadinessClick("seller-phone-section");
                        } else if (requirement.code.includes("payout")) {
                          handleReadinessClick("seller-payout-section");
                        } else if (
                          requirement.code.includes("pickup") ||
                          requirement.code.includes("market") ||
                          requirement.code.includes("store")
                        ) {
                          handleReadinessClick("seller-location-section");
                        } else if (
                          requirement.code.includes("identity") ||
                          requirement.code.includes("campus") ||
                          requirement.code.includes("shop")
                        ) {
                          handleReadinessClick("seller-document-section");
                        } else {
                          handleReadinessClick("seller-review-section");
                        }
                      }}
                    >
                      <span>
                        Stage {requirement.requiredLevel} · {requirement.title}
                      </span>
                      <strong>{requirement.status.replaceAll("_", " ")}</strong>
                    </button>

                    {requirement.adminFeedback ? (
                      <small className="seller-requirement-feedback">
                        Admin: {requirement.adminFeedback}
                      </small>
                    ) : null}

                    {requirement.resubmissionRequest ? (
                      <small className="seller-requirement-feedback">
                        Reopen request:{" "}
                        {requirement.resubmissionRequest.status.replaceAll("_", " ")}
                        {requirement.resubmissionRequest.adminFeedback
                          ? ` · ${requirement.resubmissionRequest.adminFeedback}`
                          : ""}
                      </small>
                    ) : null}

                    {requirement.canRequestResubmission ? (
                      <div className="seller-requirement-resubmission">
                        <textarea
                          rows={2}
                          value={resubmissionReasons[requirement.id] || ""}
                          onChange={(event) =>
                            setResubmissionReasons((current) => ({
                              ...current,
                              [requirement.id]: event.target.value,
                            }))
                          }
                          placeholder="Explain why this approved requirement needs to be reopened"
                        />
                        <button
                          type="button"
                          disabled={
                            resubmissionRequirementId === requirement.id
                          }
                          onClick={() =>
                            void handleRequirementResubmission(requirement.id)
                          }
                        >
                          {resubmissionRequirementId === requirement.id
                            ? "Sending..."
                            : "Request resubmission"}
                        </button>
                      </div>
                    ) : null}
                  </div>
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
