import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiHeart,
  FiMapPin,
  FiPlus,
  FiSearch,
  FiShield,
  FiShoppingBag,
} from "react-icons/fi";

import AuthModal from "../components/AuthModal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import UsedListingTrustBadges from "../components/UsedListingTrustBadges";
import { useAuth } from "../context/AuthContext";
import { useSaved } from "../context/SavedContext";
import {
  getOwnUsedListings,
  getUsedListings,
  getUsedMarketTrustStatus,
  updateUsedListingStatus,
} from "../services/marketplace.service";
import type { UsedListing, UsedMarketTrustStatus } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const usedCategories = [
  "All",
  "Phones",
  "Laptops",
  "Books",
  "Fashion",
  "Furniture",
  "Electronics",
  "Hostel",
  "Others",
] as const;

const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function postedAt(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(elapsed / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function UsedMarket() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isSaved, toggleSaved } = useSaved();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<(typeof usedCategories)[number]>("All");
  const [listings, setListings] = useState<UsedListing[]>([]);
  const [ownListings, setOwnListings] = useState<UsedListing[]>([]);
  const [trust, setTrust] = useState<UsedMarketTrustStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await getUsedListings({
          query,
          category: activeCategory === "All" ? "" : activeCategory,
        });
        if (active) setListings(response.listings);
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Used Market could not be loaded.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeCategory, query]);

  useEffect(() => {
    if (!isAuthenticated) {
      setOwnListings([]);
      setTrust(null);
      return;
    }

    void getOwnUsedListings().then((response) => setOwnListings(response.listings));
    void getUsedMarketTrustStatus().then(setTrust).catch(() => setTrust(null));
  }, [isAuthenticated]);

  function requireAuth(action: () => void) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    action();
  }

  async function handleToggleSave(id: string) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    await toggleSaved("used_listing", id);
  }

  async function handleStatus(listing: UsedListing) {
    const status = listing.status === "sold" ? "active" : "sold";
    const response = await updateUsedListingStatus(listing.id, status);
    setOwnListings((current) =>
      current.map((item) => (item.id === listing.id ? response.listing : item)),
    );
    setListings((current) =>
      status === "sold"
        ? current.filter((item) => item.id !== listing.id)
        : [response.listing, ...current],
    );
  }

  function scrollTabs(direction: "left" | "right") {
    document.querySelector(".used-tabs-row")?.scrollBy({
      left: direction === "left" ? -240 : 240,
      behavior: "smooth",
    });
  }

  if (isLoading && listings.length === 0) {
    return (
      <section className="used-market-page secure-used-market-page">
        <LoadingState
          title="Loading secure Used Market"
          message="Checking approved student listings and trust signals."
        />
      </section>
    );
  }

  if (error && listings.length === 0) {
    return (
      <section className="used-market-page secure-used-market-page">
        <ErrorState
          title="Used Market failed to load"
          message={error}
          onRetry={() => window.location.reload()}
        />
      </section>
    );
  }

  return (
    <>
      <section className="used-market-page secure-used-market-page">
        <div className="secure-market-hero">
          <span>
            <FiShield />
            Buyer Protected Used Market
          </span>
          <h1>Buy and sell used campus items with proof and trust checks.</h1>
          <p>
            Every used product requires seller identity details, ownership proof,
            and payout account setup before it can be approved.
          </p>
          <div className="secure-market-hero-actions">
            <button
              type="button"
              onClick={() => requireAuth(() => navigate("/used-market/submit"))}
            >
              <FiPlus />
              Sell used item securely
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => requireAuth(() => navigate("/used-market/dashboard"))}
            >
              <FiShoppingBag />
              My Used Market
            </button>
          </div>
        </div>

        <div className="secure-used-trust-strip">
          <div>
            <FiShield />
            <strong>Ownership proof</strong>
            <span>Required before listing review</span>
          </div>
          <div>
            <FiCheckCircle />
            <strong>Seller trust profile</strong>
            <span>{trust?.trustProfile?.isComplete ? "Completed" : "Required for sellers"}</span>
          </div>
          <div>
            <FiShoppingBag />
            <strong>Buyer payment protection</strong>
            <span>Payment will be held before payout</span>
          </div>
        </div>

        <div className="used-market-sticky secure-used-toolbar">
          <div className="used-search-row">
            <div className="used-search-box">
              <FiSearch />
              <input
                type="search"
                placeholder="Search used phones, laptops, books, hostel items..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")}>Clear</button>
              )}
            </div>

            <button
              type="button"
              className="used-filter-btn"
              onClick={() => requireAuth(() => navigate("/used-market/submit"))}
            >
              <FiPlus />
              Sell Used Item
            </button>
          </div>

          <div className="used-tabs-shell">
            <button
              type="button"
              className="used-tab-arrow used-tab-left"
              onClick={() => scrollTabs("left")}
              aria-label="Scroll categories left"
            >
              <FiChevronLeft />
            </button>
            <div className="used-tabs-row">
              {usedCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={activeCategory === category ? "active" : ""}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="used-tab-arrow used-tab-right"
              onClick={() => scrollTabs("right")}
              aria-label="Scroll categories right"
            >
              <FiChevronRight />
            </button>
          </div>
        </div>

        {ownListings.length > 0 && (
          <section className="my-used-secure-panel">
            <div className="secure-section-title">
              <div>
                <span>Your submissions</span>
                <h2>Review status and seller controls</h2>
              </div>
            </div>

            <div className="my-used-listings">
              {ownListings.slice(0, 4).map((listing) => (
                <div className="my-used-listing" key={listing.id}>
                  <img
                    src={resolveMediaUrl(listing.imageUrls[0], usedFallback)}
                    alt={listing.name}
                  />
                  <div>
                    <strong>{listing.name}</strong>
                    <p>{listing.status === "pending" ? "Pending Gleank review" : listing.status}</p>
                  </div>
                  <button type="button" onClick={() => void handleStatus(listing)}>
                    {listing.status === "sold" ? "Mark active" : "Mark sold"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {listings.length === 0 ? (
          <EmptyState
            icon={<FiAlertCircle />}
            title="No approved used items found"
            message="Try another category or check again after sellers submit approved listings."
          />
        ) : (
          <div className="secure-used-grid">
            {listings.map((listing) => (
              <article className="secure-used-card" key={listing.id}>
                <Link to={`/used-market/${listing.id}`} className="secure-used-card-image">
                  <img
                    src={resolveMediaUrl(listing.imageUrls[0], usedFallback)}
                    alt={listing.name}
                  />
                  <span>{listing.condition}</span>
                </Link>

                <div className="secure-used-card-body">
                  <div className="secure-used-card-top">
                    <span>
                      <FiMapPin />
                      {listing.campus}
                    </span>
                    <small>
                      <FiClock />
                      {postedAt(listing.createdAt)}
                    </small>
                  </div>

                  <Link to={`/used-market/${listing.id}`}>
                    <h3>{listing.name}</h3>
                  </Link>
                  <strong>{formatPrice(listing.price)}</strong>
                  <p>{listing.category} • {listing.deliveryOption}</p>

                  <UsedListingTrustBadges listing={listing} compact />

                  <div className="secure-used-card-actions">
                    <button
                      type="button"
                      className={isSaved("used_listing", listing.id) ? "active" : ""}
                      onClick={() => void handleToggleSave(listing.id)}
                    >
                      <FiHeart />
                    </button>
                    <Link to={`/used-market/${listing.id}`}>View protected details</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
}

export default UsedMarket;
