import { useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiBookmark,
  FiBriefcase,
  FiGrid,
  FiHeart,
  FiInfo,
  FiMapPin,
  FiMessageCircle,
  FiSearch,
  FiSend,
  FiStar,
  FiUserPlus,
} from "react-icons/fi";

import AuthModal from "../components/AuthModal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { MarketProductCard } from "../components/MarketCards";
import { useAuth } from "../context/AuthContext";
import {
  followPublicStore,
  getPublicStore,
  unfollowPublicStore,
} from "../services/seller.service";
import type { MarketProduct } from "../services/market.service";
import type {
  PublicStoreWorkspace,
  SellerProduct,
  SellerService,
} from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type StoreTab = "Products" | "Services" | "Favorites" | "About";

const tabs: StoreTab[] = ["Products", "Services", "Favorites", "About"];

const coverFallback =
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80";

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

const serviceFallback =
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatServiceRange(service: SellerService) {
  const min = Number(service.minPrice || 0);
  const max = Number(service.maxPrice || 0);

  if (min > 0 && max > min) {
    return `${formatPrice(min)} - ${formatPrice(max)}`;
  }

  if (min > 0) {
    return `From ${formatPrice(min)}`;
  }

  return `From ${formatPrice(service.price)}`;
}

function compactNumber(value: number) {
  if (value >= 1_000_000) {
    const formatted = value / 1_000_000;
    return `${Number.isInteger(formatted) ? formatted.toFixed(0) : formatted.toFixed(1)}M`;
  }

  if (value >= 1_000) {
    const formatted = value / 1_000;
    return `${Number.isInteger(formatted) ? formatted.toFixed(0) : formatted.toFixed(1)}k`;
  }

  return String(value);
}

function SellerStore() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const tabsContainerRef = useRef<HTMLDivElement | null>(null);

  const [workspace, setWorkspace] = useState<PublicStoreWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<StoreTab>("Products");
  const [activeHighlight, setActiveHighlight] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [error, setError] = useState("");
  const [shareNotice, setShareNotice] = useState("");

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const ignoreSwipeRef = useRef(false);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError("");

    void getPublicStore(id)
      .then((response) => {
        if (!active) return;

        setWorkspace(response);
        setIsFollowing(response.interaction.isFollowing);
        setFollowerCount(response.interaction.followerCount);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "This seller profile could not be loaded.",
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

  useEffect(() => {
    const activeButton = tabsContainerRef.current?.querySelector(
      "button.active",
    );

    activeButton?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeTab]);

  const filteredProducts = useMemo(() => {
    if (!workspace) return [];

    const query = searchTerm.trim().toLowerCase();

    return workspace.products.filter((product) => {
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);

      const matchesHighlight =
        activeHighlight === "All" ||
        activeHighlight === "Favorites" ||
        product.category === activeHighlight;

      const matchesFavorite =
        activeTab !== "Favorites" || product.isFeatured;

      return matchesSearch && matchesHighlight && matchesFavorite;
    });
  }, [activeHighlight, activeTab, searchTerm, workspace]);

  const filteredServices = useMemo(() => {
    if (!workspace) return [];

    const query = searchTerm.trim().toLowerCase();

    return workspace.services.filter((service) => {
      const matchesSearch =
        !query ||
        service.name.toLowerCase().includes(query) ||
        service.category.toLowerCase().includes(query);

      const matchesFavorite =
        activeTab !== "Favorites" || service.isFeatured;

      return matchesSearch && matchesFavorite;
    });
  }, [activeTab, searchTerm, workspace]);

  function requireAuth(action?: () => void) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return false;
    }

    action?.();
    return true;
  }

  async function toggleFollow() {
    if (!requireAuth() || !workspace) return;

    try {
      const response = isFollowing
        ? await unfollowPublicStore(workspace.store.slug)
        : await followPublicStore(workspace.store.slug);

      setIsFollowing(response.interaction.isFollowing);
      setFollowerCount(response.interaction.followerCount);

      setWorkspace((current) => {
        if (!current) return current;

        return {
          ...current,
          interaction: {
            ...current.interaction,
            isFollowing: response.interaction.isFollowing,
            followerCount: response.interaction.followerCount,
          },
        };
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The follow action could not be completed.",
      );
    }
  }

  function openMessages() {
    if (!workspace) return;

    requireAuth(() =>
      navigate(
        `/messages?seller=${encodeURIComponent(
          workspace.store.slug,
        )}&name=${encodeURIComponent(workspace.store.name)}`,
      ),
    );
  }

  async function shareProfile() {
    if (!workspace) return;

    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${workspace.store.name} on Gleenc`,
          text: workspace.store.description,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareNotice("Profile link copied");
        window.setTimeout(() => setShareNotice(""), 2200);
      }
    } catch {
      // Closing the native share sheet is not an application error.
    }
  }

  function selectTab(tab: StoreTab) {
    setActiveTab(tab);
    setActiveHighlight(tab === "Favorites" ? "Favorites" : "All");
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    const interactiveTarget = target?.closest(
      [
        ".feed-media-shell",
        ".feed-media-slider",
        ".product-media-area",
        ".product-media-slider",
        ".feed-actions",
        ".product-card-buttons",
        ".cart-quantity-control",
        "button",
        "a",
        "input",
        "textarea",
        "select",
      ].join(","),
    );

    ignoreSwipeRef.current = Boolean(interactiveTarget);
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (
      touchStartX.current === null ||
      touchStartY.current === null ||
      ignoreSwipeRef.current
    ) {
      touchStartX.current = null;
      touchStartY.current = null;
      ignoreSwipeRef.current = false;
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const endY = event.changedTouches[0]?.clientY ?? touchStartY.current;
    const distanceX = endX - touchStartX.current;
    const distanceY = endY - touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;
    ignoreSwipeRef.current = false;

    if (
      Math.abs(distanceX) < 110 ||
      Math.abs(distanceY) > 42 ||
      Math.abs(distanceX) < Math.abs(distanceY) * 1.8
    ) {
      return;
    }

    const currentIndex = tabs.indexOf(activeTab);

    const nextIndex =
      distanceX < 0
        ? Math.min(tabs.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);

    if (nextIndex === currentIndex) return;

    selectTab(tabs[nextIndex]);
  }

  if (isLoading) {
    return (
      <section className="seller-store-page">
        <LoadingState
          title="Loading seller profile"
          message="Gleenc is syncing this seller's products and services."
        />
      </section>
    );
  }

  if (!workspace) {
    return (
      <section className="seller-store-page">
        <Link to="/search" className="seller-back-link">
          ← Back to Market
        </Link>

        {error ? (
          <ErrorState
            title="Store not found"
            message={error}
            onRetry={() => window.location.reload()}
          />
        ) : (
          <EmptyState
            icon={<FiGrid />}
            title="Store not found"
            message="This seller store may have been removed or paused."
          />
        )}
      </section>
    );
  }

  const { store, interaction, highlights } = workspace;

  const favoriteProducts = filteredProducts.filter((item) => item.isFeatured);
  const favoriteServices = filteredServices.filter((item) => item.isFeatured);

  return (
    <>
      <section className="seller-store-page">
        <div className="seller-twitter-shell">
          <div className="seller-cover-twitter">
            <img
              src={resolveMediaUrl(store.coverUrl, coverFallback)}
              alt={store.name}
            />
          </div>

          <div className="seller-twitter-body">
            <div className="seller-avatar-twitter">
              {store.logoUrl ? (
                <img
                  src={resolveMediaUrl(store.logoUrl, coverFallback)}
                  alt={store.name}
                />
              ) : (
                <span>{store.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="seller-twitter-actions">
              <button
                type="button"
                className={isFollowing ? "following" : ""}
                onClick={() => void toggleFollow()}
              >
                <FiUserPlus />
                {isFollowing ? "Following" : "Follow"}
              </button>

              <button type="button" onClick={openMessages}>
                <FiMessageCircle />
                Message
              </button>

              <button
                type="button"
                className="seller-share-action"
                onClick={() => void shareProfile()}
                aria-label="Share store"
              >
                <FiSend />
              </button>
            </div>

            <div className="seller-tiktok-info">
              <div className="seller-title-line">
                <h1>{store.name}</h1>
                <span>|</span>
                <p>@{store.slug}</p>
              </div>

              <div className="seller-tiktok-stats">
                <span>
                  <strong>{workspace.products.length}</strong> Products
                </span>

                <span>
                  <strong>{compactNumber(followerCount)}</strong> Followers
                </span>

                <span>
                  <strong>{compactNumber(interaction.likesCount)}</strong> Likes
                </span>
              </div>

              <p className="seller-bio-text">
                {store.description ||
                  "This seller is building their Gleenc store."}
              </p>

              <p className="seller-campus-text">{store.campus}</p>

              {shareNotice && (
                <p className="seller-share-notice" role="status">
                  {shareNotice}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="seller-highlights-section">
          <button
            type="button"
            className={
              activeHighlight === "All"
                ? "seller-highlight active"
                : "seller-highlight"
            }
            onClick={() => {
              setActiveHighlight("All");
              setActiveTab("Products");
            }}
          >
            <div>
              <FiGrid />
            </div>
            <span>All</span>
          </button>

          {highlights.map((highlight) => (
            <button
              type="button"
              key={highlight.id}
              className={
                activeHighlight === highlight.category
                  ? "seller-highlight active"
                  : "seller-highlight"
              }
              onClick={() => {
                setActiveHighlight(highlight.category);
                setActiveTab(
                  highlight.category === "Favorites"
                    ? "Favorites"
                    : "Products",
                );
              }}
            >
              <div>
                {highlight.imageUrl ? (
                  <img
                    src={resolveMediaUrl(highlight.imageUrl, productFallback)}
                    alt={highlight.title}
                  />
                ) : (
                  <FiGrid />
                )}
              </div>

              <span>{highlight.title}</span>
            </button>
          ))}
        </div>

        <div className="seller-store-sticky">
          <div className="seller-store-search">
            <FiSearch />

            <input
              type="search"
              placeholder="Search this store..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <div className="seller-store-tabs" ref={tabsContainerRef}>
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => selectTab(tab)}
                aria-label={tab}
              >
                {tab === "Products" && <FiGrid />}
                {tab === "Services" && <FiBriefcase />}
                {tab === "Favorites" && <FiBookmark />}
                {tab === "About" && <FiInfo />}

                <span className="seller-tab-label">{tab}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="seller-store-swipe-content"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activeTab === "Products" && (
            <ProductGrid
              products={filteredProducts}
              store={store}
            />
          )}

          {activeTab === "Services" && (
            <ServiceGrid
              services={filteredServices}
              storeCampus={store.campus}
              onMessage={openMessages}
            />
          )}

          {activeTab === "Favorites" && (
            <>
              <ProductGrid
                products={favoriteProducts}
                store={store}
                favorite
              />

              {favoriteServices.length > 0 && (
                <ServiceGrid
                  services={favoriteServices}
                  storeCampus={store.campus}
                  onMessage={openMessages}
                  favorite
                />
              )}
            </>
          )}

          {activeTab === "About" && (
            <div className="seller-about-grid">
              <section>
                <h2>About {store.name}</h2>

                <p>
                  {store.description || "No store description has been added."}
                </p>

                <p className="seller-about-campus">{store.campus}</p>
              </section>

              <section>
                <h2>Store Trust</h2>

                <div className="seller-trust-list">
                  <span>
                    <FiStar />
                    {store.verified
                      ? "Verified campus seller"
                      : "Campus seller"}
                  </span>

                  <span>
                    <FiHeart />
                    {compactNumber(interaction.likesCount)} total likes
                  </span>

                  <span>
                    <FiBookmark />
                    {workspace.products.length} products listed
                  </span>

                  <span>
                    <FiMessageCircle />
                    Message seller for availability
                  </span>
                </div>
              </section>
            </div>
          )}
        </div>
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

    </>
  );
}

function marketSourceLabel(store: PublicStoreWorkspace["store"]) {
  if (store.sellerType === "local_market") return "Local Market";
  if (store.sellerType === "nearby") return "Nearby Market";
  if (store.sellerType === "used_market") return "Used Market";
  return "Campus Market";
}

function toMarketProduct(
  product: SellerProduct,
  store: PublicStoreWorkspace["store"],
): MarketProduct {
  return {
    ...product,
    storeName: store.name,
    storeSlug: store.slug,
    storeCampus: store.campus,
    store: {
      id: store.id,
      slug: store.slug,
      name: store.name,
      campus: store.campus,
      category: store.category,
      logoUrl: store.logoUrl,
      coverUrl: store.coverUrl,
      verified: store.verified,
      sellerType: store.sellerType,
      marketId: store.marketId,
    },
    interaction: product.interaction || {
      likeCount: 0,
      commentCount: 0,
      saveCount: 0,
      shareCount: 0,
      viewCount: 0,
      liked: false,
    },
  };
}

function ProductGrid({
  products,
  store,
  favorite = false,
}: {
  products: SellerProduct[];
  store: PublicStoreWorkspace["store"];
  favorite?: boolean;
}) {
  if (!products.length) {
    return (
      <div className="seller-empty-box">
        <h3>{favorite ? "No favorite products yet" : "No products found"}</h3>

        <p>
          {favorite
            ? "Products selected by this seller will appear here."
            : "This seller has no product matching your search."}
        </p>
      </div>
    );
  }

  return (
    <div className="seller-store-market-grid">
      {products.map((product) => (
        <MarketProductCard
          key={product.id}
          product={toMarketProduct(product, store)}
          sourceLabel={marketSourceLabel(store)}
        />
      ))}
    </div>
  );
}

function ServiceGrid({
  services,
  storeCampus,
  onMessage,
  favorite = false,
}: {
  services: SellerService[];
  storeCampus: string;
  onMessage: () => void;
  favorite?: boolean;
}) {
  if (!services.length) {
    return (
      <div className="seller-empty-box">
        <h3>{favorite ? "No favorite services yet" : "No services listed yet"}</h3>

        <p>
          {favorite
            ? "Services selected by this seller will appear here."
            : "This seller has no service matching your search."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        favorite
          ? "seller-services-grid seller-favorite-services"
          : "seller-services-grid"
      }
    >
      {services.map((service) => (
        <article className="seller-service-card" key={service.id}>
          <img
            src={resolveMediaUrl(service.imageUrls[0], serviceFallback)}
            alt={service.name}
          />

          <div>
            <span className="seller-service-type">
              {service.serviceType || service.category}
            </span>
            <h3>{service.name}</h3>
            <p className="seller-service-location">
              <FiMapPin />
              {service.location || storeCampus || "Campus service"}
            </p>
            <p className="seller-service-description">
              {service.description || "Message this seller to discuss availability, timing, and service details."}
            </p>
            <p>{service.durationMinutes} minutes • {service.category}</p>
            <strong>{formatServiceRange(service)}</strong>

            {service.isFeatured && (
              <span className="seller-service-favorite">Favorite</span>
            )}

            <button type="button" onClick={onMessage}>
              Book Service
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export default SellerStore;
