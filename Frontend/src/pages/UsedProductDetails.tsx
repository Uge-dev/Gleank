import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiChevronLeft,
  FiChevronRight,
  FiFlag,
  FiHeart,
  FiLock,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiShield,
  FiShoppingBag,
} from "react-icons/fi";

import AuthModal from "../components/AuthModal";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import UsedListingTrustBadges from "../components/UsedListingTrustBadges";
import { useAuth } from "../context/AuthContext";
import { useSaved } from "../context/SavedContext";
import { createConversation } from "../services/message.service";
import { getUsedListing, reportUsedListing } from "../services/marketplace.service";
import type { UsedListing } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=1200&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function UsedProductDetails() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { isSaved, toggleSaved } = useSaved();

  const [listing, setListing] = useState<UsedListing | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMessaging, setIsMessaging] = useState(false);
  const [error, setError] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const sliderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void getUsedListing(id)
      .then((response) => {
        if (active) setListing(response.listing);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Used item could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  function requireAuth(action: () => void) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    action();
  }

  function scrollToImage(index: number) {
    if (!sliderRef.current) return;
    const width = sliderRef.current.clientWidth;
    sliderRef.current.scrollTo({ left: width * index, behavior: "smooth" });
    setActiveImage(index);
  }

  function handleImageScroll() {
    if (!sliderRef.current) return;
    const width = sliderRef.current.clientWidth;
    setActiveImage(Math.round(sliderRef.current.scrollLeft / width));
  }

  async function handleSave() {
    if (!listing) return;
    requireAuth(() => void toggleSaved("used_listing", listing.id));
  }

  async function handleMessageSeller() {
    if (!listing) return;

    requireAuth(async () => {
      setIsMessaging(true);
      try {
        const response = await createConversation({
          contextType: "used_listing",
          contextId: listing.id,
        });
        navigate(`/used-messages?conversation=${response.conversation.id}`);
      } catch (requestError) {
        setReportMessage(
          requestError instanceof Error
            ? requestError.message
            : "Message could not be opened.",
        );
      } finally {
        setIsMessaging(false);
      }
    });
  }

  function handleBuySafely() {
    if (!listing) return;
    requireAuth(() => navigate(`/used-market/${listing.id}/checkout`));
  }

  async function handleReport() {
    if (!listing) return;

    requireAuth(async () => {
      try {
        await reportUsedListing(listing.id, {
          reason: "Suspicious used listing",
          details: "Buyer requested review from listing details page.",
        });
        setReportMessage("Report sent to Gleank review team.");
      } catch (requestError) {
        setReportMessage(
          requestError instanceof Error
            ? requestError.message
            : "Report could not be submitted.",
        );
      }
    });
  }

  if (isLoading) {
    return (
      <section className="used-details-page secure-used-details-page">
        <LoadingState
          title="Loading protected used listing"
          message="Checking item details and seller trust signals."
        />
      </section>
    );
  }

  if (error || !listing) {
    return (
      <section className="used-details-page secure-used-details-page">
        <ErrorState
          title="Used item not found"
          message={error || "This used item may have been removed."}
          onRetry={() => window.location.reload()}
        />
      </section>
    );
  }

  const images = listing.imageUrls.length ? listing.imageUrls : [usedFallback];
  const isOwner = user?.id === listing.sellerId;
  const isBuyable = listing.status === "active" && !isOwner;

  return (
    <>
      <section className="used-details-page secure-used-details-page">
        <Link to="/used-market" className="secure-used-back">
          <FiArrowLeft />
          Back to Used Market
        </Link>

        <div className="secure-details-layout">
          <div className="secure-details-media-card">
            <div
              className="used-details-slider"
              ref={sliderRef}
              onScroll={handleImageScroll}
            >
              {images.map((image, index) => (
                <div className="used-details-slide" key={`${image}-${index}`}>
                  <img
                    src={resolveMediaUrl(image, usedFallback)}
                    alt={`${listing.name} ${index + 1}`}
                  />
                </div>
              ))}
            </div>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  className="used-details-arrow left"
                  onClick={() =>
                    scrollToImage(activeImage === 0 ? images.length - 1 : activeImage - 1)
                  }
                >
                  <FiChevronLeft />
                </button>
                <button
                  type="button"
                  className="used-details-arrow right"
                  onClick={() =>
                    scrollToImage(activeImage === images.length - 1 ? 0 : activeImage + 1)
                  }
                >
                  <FiChevronRight />
                </button>

                <div className="used-details-dots">
                  {images.map((_, index) => (
                    <button
                      type="button"
                      key={index}
                      className={activeImage === index ? "active" : ""}
                      onClick={() => scrollToImage(index)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <aside className="secure-details-info-card">
            <div className="secure-details-status-row">
              <span className="verified-used-pill">
                <FiShield />
                {listing.verified
                  ? "Verified used item"
                  : listing.status === "pending"
                    ? "Pending review"
                    : listing.status}
              </span>
              <span className="condition-pill">{listing.condition}</span>
            </div>

            <h1>{listing.name}</h1>
            <strong className="used-details-price">{formatPrice(listing.price)}</strong>
            <p className="used-details-description">{listing.description}</p>

            <UsedListingTrustBadges listing={listing} />

            <div className="secure-disclosure-box">
              <h2>Seller disclosure</h2>
              <div>
                <strong>Reason for selling</strong>
                <p>{listing.reasonForSelling || "Not provided."}</p>
              </div>
              <div>
                <strong>Defects disclosed</strong>
                <p>{listing.defectsDisclosed || "No defect disclosure provided."}</p>
              </div>
            </div>

            <div className="used-details-meta secure-meta-grid">
              <span>
                <FiPackage />
                {listing.category}
              </span>
              <span>
                <FiMapPin />
                {listing.campus}
              </span>
              <span>{listing.deliveryOption}</span>
              <span>{listing.pickupLocation}</span>
              {listing.serialNumber && <span>Serial: {listing.serialNumber}</span>}
            </div>

            <div className="secure-seller-box">
              <div>
                <strong>{listing.sellerName}</strong>
                <p>
                  {listing.sellerTrust?.accountName
                    ? `Payout name: ${listing.sellerTrust.accountName}`
                    : "Seller payout name hidden until review."}
                </p>
                <p>
                  {listing.sellerTrust?.bankName
                    ? `Bank: ${listing.sellerTrust.bankName}`
                    : "Bank details private."}
                </p>
              </div>
            </div>

            <div className="used-details-actions secure-details-actions">
              <button type="button" onClick={handleBuySafely} disabled={!isBuyable}>
                <FiShoppingBag />
                {isOwner ? "Your item" : "Buy safely"}
              </button>
              <button type="button" onClick={() => void handleMessageSeller()} disabled={isOwner || isMessaging}>
                <FiMessageCircle />
                {isMessaging ? "Opening..." : "Message seller"}
              </button>
              <button
                type="button"
                className={isSaved("used_listing", listing.id) ? "active" : ""}
                onClick={() => void handleSave()}
              >
                <FiHeart />
                Save
              </button>
            </div>

            <button type="button" className="secure-report-btn" onClick={() => void handleReport()}>
              <FiFlag />
              Report suspicious listing
            </button>

            {reportMessage && <p className="secure-report-message">{reportMessage}</p>}

            <div className="secure-payment-note">
              <FiLock />
              <p>
                Buyer protection: pay through Gleank, inspect the item, then confirm delivery.
                Seller payout becomes eligible only after completion or review.
              </p>
            </div>
          </aside>
        </div>

        <section className="secure-used-warning-card">
          <FiAlertTriangle />
          <div>
            <h2>Meet safely and inspect before confirmation</h2>
            <p>
              Check the product physically, confirm serial numbers for gadgets,
              and never release delivery confirmation until the item matches the listing.
            </p>
          </div>
        </section>
      </section>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
}

export default UsedProductDetails;
