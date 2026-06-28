import { useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiBookmark,
  FiBriefcase,
  FiGrid,
  FiHeart,
  FiInfo,
  FiMessageCircle,
  FiSearch,
  FiSend,
  FiStar,
  FiUserPlus,
} from "react-icons/fi";

import AuthModal from "../components/AuthModal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import FeedPostCard from "../components/FeedPostCard";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import { useSaved } from "../context/SavedContext";
import ProductCommentDrawer from "../components/ProductCommentDrawer";
import {
  likePublicProduct,
  sharePublicProduct,
  unlikePublicProduct,
  viewPublicProduct,
} from "../services/marketplace.service";
import {
  followPublicStore,
  getPublicStore,
  unfollowPublicStore,
} from "../services/seller.service";
import type {
  PublicStoreWorkspace,
  SellerProduct,
  SellerService,
} from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { getAnonViewerId } from "../utils/visitor";

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
  const { isSaved, toggleSaved } = useSaved();
  const viewedProductIdsRef = useRef<Set<string>>(new Set());
  const [activeCommentProductId, setActiveCommentProductId] = useState<
  string | null
>(null);

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
          title: `${workspace.store.name} on Gleank`,
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
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) return;

    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = endX - touchStartX.current;

    touchStartX.current = null;

    if (Math.abs(distance) < 55) return;

    const currentIndex = tabs.indexOf(activeTab);

    const nextIndex =
      distance < 0
        ? Math.min(tabs.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);

    selectTab(tabs[nextIndex]);
  }

  function updateProductInteraction(
    productId: string,
    interaction: SellerProduct["interaction"],
  ) {
    setWorkspace((current) => {
      if (!current) return current;

      return {
        ...current,
        products: current.products.map((product) =>
          product.id === productId
            ? {
                ...product,
                interaction,
              }
            : product,
        ),
      };
    });
  }

  function handleCommentCreated(productId: string) {
  setWorkspace((current) => {
    if (!current) return current;

    return {
      ...current,
      products: current.products.map((product) =>
        product.id === productId
          ? {
              ...product,
              interaction: product.interaction
                ? {
                    ...product.interaction,
                    commentCount: product.interaction.commentCount + 1,
                  }
                : product.interaction,
            }
          : product,
      ),
    };
  });
}

async function handleProductViewed(productId: string) {
  if (viewedProductIdsRef.current.has(productId)) return;

  viewedProductIdsRef.current.add(productId);

  try {
    const response = await viewPublicProduct(productId, getAnonViewerId());
    updateProductInteraction(productId, response.interaction);
  } catch {
    // View tracking should never break the seller profile.
  }
}

  async function toggleProductLike(product: SellerProduct) {
    if (!requireAuth()) return;

    try {
      const response = product.interaction?.liked
        ? await unlikePublicProduct(product.id)
        : await likePublicProduct(product.id);

      updateProductInteraction(product.id, response.interaction);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The like action could not be completed.",
      );
    }
  }

  async function toggleProductSave(product: SellerProduct) {
    if (!requireAuth()) return;

    try {
      const saved = await toggleSaved("product", product.id);
      const currentInteraction = product.interaction;

      if (currentInteraction) {
        updateProductInteraction(product.id, {
          ...currentInteraction,
          saveCount: Math.max(
            0,
            currentInteraction.saveCount + (saved ? 1 : -1),
          ),
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The save action could not be completed.",
      );
    }
  }

  function openProductComments(product: SellerProduct) {
  setActiveCommentProductId(product.id);
}

  async function shareProduct(product: SellerProduct) {
    const url = `${window.location.origin}/products/${product.id}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: product.description,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareNotice("Product link copied");
        window.setTimeout(() => setShareNotice(""), 2200);
      }

      const response = await sharePublicProduct(product.id);
      updateProductInteraction(product.id, response.interaction);
    } catch {
      // Closing native share is not an application error.
    }
  }

  if (isLoading) {
    return (
      <section className="seller-store-page">
        <LoadingState
          title="Loading seller profile"
          message="Gleank is syncing this seller's products and services."
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
                  "This seller is building their Gleank store."}
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

          <div className="seller-store-tabs">
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
              isFollowing={isFollowing}
              isProductSaved={(productId) => isSaved("product", productId)}
              onToggleLike={toggleProductLike}
              onToggleSave={toggleProductSave}
              onToggleStoreFollow={toggleFollow}
              onComment={openProductComments}
              onShare={shareProduct}
              onView={handleProductViewed}
            />
          )}

          {activeTab === "Services" && (
            <ServiceGrid services={filteredServices} onMessage={openMessages} />
          )}

          {activeTab === "Favorites" && (
            <>
              <ProductGrid
                products={favoriteProducts}
                store={store}
                isFollowing={isFollowing}
                isProductSaved={(productId) => isSaved("product", productId)}
                onToggleLike={toggleProductLike}
                onToggleSave={toggleProductSave}
                onToggleStoreFollow={toggleFollow}
                onComment={openProductComments}
                onShare={shareProduct}
                onView={handleProductViewed}
                favorite
              />

              {favoriteServices.length > 0 && (
                <ServiceGrid
                  services={favoriteServices}
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

      <ProductCommentDrawer
  isOpen={Boolean(activeCommentProductId)}
  productId={activeCommentProductId}
  productName={
    workspace?.products.find((item) => item.id === activeCommentProductId)
      ?.name
  }
  onClose={() => setActiveCommentProductId(null)}
  onRequireAuth={() => requireAuth()}
  onCommentCreated={() => {
    if (activeCommentProductId) {
      handleCommentCreated(activeCommentProductId);
    }
  }}
/>
    </>
  );
}

function ProductGrid({
  products,
  store,
  isFollowing,
  isProductSaved,
  onToggleLike,
  onToggleSave,
  onToggleStoreFollow,
  onComment,
  onShare,
  onView,
  favorite = false,
}: {
  products: SellerProduct[];
  store: PublicStoreWorkspace["store"];
  isFollowing: boolean;
  isProductSaved: (productId: string) => boolean;
  onToggleLike: (product: SellerProduct) => void | Promise<void>;
  onToggleSave: (product: SellerProduct) => void | Promise<void>;
  onToggleStoreFollow: () => void | Promise<void>;
  onComment: (product: SellerProduct) => void;
  onShare: (product: SellerProduct) => void | Promise<void>;
  onView: (productId: string) => void | Promise<void>;
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

  const storeLogoUrl = store.logoUrl
    ? resolveMediaUrl(store.logoUrl, "")
    : null;

  return (
    <div className="seller-feed-product-list">
      {products.map((product) => {
        const productImages = product.imageUrls.length
          ? product.imageUrls
          : [productFallback];

        return (
          <FeedPostCard
            key={product.id}
            id={product.id}
            storeName={store.name}
            username={store.slug}
            campus={store.campus}
            storeLogoUrl={storeLogoUrl}
            productName={product.name}
            price={formatPrice(product.price)}
            category={product.category}
            badgeText={
              product.status === "out_of_stock" ? "Out of Stock" : "Available"
            }
            images={productImages.map((image) =>
              resolveMediaUrl(image, productFallback),
            )}
            maxQuantity={product.stock}
            productSaved={isProductSaved(product.id)}
            productLiked={Boolean(product.interaction?.liked)}
            likeCount={product.interaction?.likeCount || 0}
            commentCount={product.interaction?.commentCount || 0}
            shareCount={product.interaction?.shareCount || 0}
            viewCount={product.interaction?.viewCount || 0}
            storeFollowing={isFollowing}
            onRequireAuth={() => undefined}
            onToggleProductSave={() => void onToggleSave(product)}
            onToggleStoreFollow={() => void onToggleStoreFollow()}
            onToggleLike={() => void onToggleLike(product)}
            onComment={() => onComment(product)}
            onShare={() => void onShare(product)}
            onViewed={() => void onView(product.id)}
          />
        );
      })}
    </div>
  );
}

function ServiceGrid({
  services,
  onMessage,
  favorite = false,
}: {
  services: SellerService[];
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
            <h3>{service.name}</h3>
            <p>{service.durationMinutes} minutes</p>
            <strong>{formatPrice(service.price)}</strong>

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