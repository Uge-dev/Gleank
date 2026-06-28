import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiLock,
  FiMapPin,
  FiShield,
  FiShoppingBag,
} from "react-icons/fi";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getUsedListing } from "../services/marketplace.service";
import { createUsedOrder } from "../services/used-order.service";
import type { UsedListing } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function UsedCheckout() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<UsedListing | null>(null);
  const [deliveryOption, setDeliveryOption] = useState<"Pickup" | "Delivery" | "Pickup & Delivery">("Pickup");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void getUsedListing(id)
      .then((response) => {
        if (!active) return;
        setListing(response.listing);
        setDeliveryOption(response.listing.deliveryOption);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Used listing could not be loaded.",
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing) return;

    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setError("");

    try {
      const response = await createUsedOrder({
        listingId: listing.id,
        buyerName: String(formData.get("buyerName") || ""),
        buyerPhone: String(formData.get("buyerPhone") || ""),
        campus: String(formData.get("campus") || ""),
        deliveryOption,
        deliveryAddress: String(formData.get("deliveryAddress") || ""),
        pickupLocation: String(formData.get("pickupLocation") || ""),
        note: String(formData.get("note") || ""),
      });

      navigate(`/used-orders/${response.order.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Protected used order could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="used-checkout-page">
        <LoadingState
          title="Preparing protected checkout"
          message="Checking listing availability and seller trust."
        />
      </section>
    );
  }

  if (error && !listing) {
    return (
      <section className="used-checkout-page">
        <ErrorState
          title="Checkout unavailable"
          message={error}
          onRetry={() => window.location.reload()}
        />
      </section>
    );
  }

  if (!listing) return null;

  const protectionFee = Math.round(listing.price * 0.03);
  const total = listing.price + protectionFee;

  return (
    <section className="used-checkout-page">
      <Link to={`/used-market/${listing.id}`} className="secure-used-back">
        <FiArrowLeft />
        Back to item
      </Link>

      <div className="used-flow-hero">
        <span>
          <FiShield />
          Protected Used Checkout
        </span>
        <h1>Reserve this item safely through Gleank protection.</h1>
        <p>
          Your payment record is tied to delivery confirmation. The seller sees the order and can message you immediately.
        </p>
      </div>

      <div className="used-checkout-layout">
        <form className="used-checkout-form" onSubmit={handleSubmit}>
          {error && <p className="used-inline-error">{error}</p>}

          <div className="used-form-section-title">
            <FiMapPin />
            <div>
              <h2>Buyer and meetup details</h2>
              <p>Use correct contact details so the seller can coordinate pickup or delivery.</p>
            </div>
          </div>

          <div className="used-form-grid">
            <label>
              <span>Full name</span>
              <input name="buyerName" placeholder="Your full name" required />
            </label>
            <label>
              <span>Phone number</span>
              <input name="buyerPhone" placeholder="080..." required />
            </label>
            <label>
              <span>Campus</span>
              <input name="campus" placeholder="FUPRE" required />
            </label>
            <label>
              <span>Delivery option</span>
              <select
                value={deliveryOption}
                onChange={(event) =>
                  setDeliveryOption(event.target.value as "Pickup" | "Delivery" | "Pickup & Delivery")
                }
              >
                <option value="Pickup">Pickup</option>
                <option value="Delivery">Delivery</option>
                <option value="Pickup & Delivery">Pickup & Delivery</option>
              </select>
            </label>
          </div>

          {deliveryOption === "Delivery" ? (
            <label>
              <span>Delivery address</span>
              <textarea name="deliveryAddress" placeholder="Hostel, department, landmark..." required />
            </label>
          ) : (
            <label>
              <span>Pickup / meetup location</span>
              <input
                name="pickupLocation"
                defaultValue={listing.pickupLocation}
                placeholder="Safe campus pickup point"
                required
              />
            </label>
          )}

          <label>
            <span>Note to seller</span>
            <textarea name="note" placeholder="Preferred time, questions, or meetup instruction..." />
          </label>

          <div className="used-protection-note">
            <FiLock />
            <p>
              Payment gateway is the next connection point. In local development, the order is created as pending payment and can be advanced from the order page.
            </p>
          </div>

          <button type="submit" disabled={isSubmitting}>
            <FiShoppingBag />
            {isSubmitting ? "Creating protected order..." : "Create protected order"}
          </button>
        </form>

        <aside className="used-checkout-summary">
          <img src={resolveMediaUrl(listing.imageUrls[0], usedFallback)} alt={listing.name} />
          <h2>{listing.name}</h2>
          <p>{listing.condition} • {listing.campus}</p>

          <div className="used-summary-lines">
            <div>
              <span>Item price</span>
              <strong>{formatPrice(listing.price)}</strong>
            </div>
            <div>
              <span>Protection fee</span>
              <strong>{formatPrice(protectionFee)}</strong>
            </div>
            <div className="total">
              <span>Total</span>
              <strong>{formatPrice(total)}</strong>
            </div>
          </div>

          <div className="used-trust-mini-list">
            <span>
              <FiCheckCircle /> Seller trust profile checked
            </span>
            <span>
              <FiCheckCircle /> Ownership proof submitted
            </span>
            <span>
              <FiCheckCircle /> Payout account attached
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default UsedCheckout;
