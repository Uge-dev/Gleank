import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiChevronRight,
  FiShoppingBag,
  FiSmartphone,
  FiStar,
  FiTrendingUp,
  FiTruck,
  FiUsers,
  FiZap,
} from "react-icons/fi";

import FeedTopTabs from "../components/FeedTopTabs";
import AuthModal from "../components/AuthModal";
import EmptyState from "../components/EmptyState";
import FeedPostCard from "../components/FeedPostCard";
import LoadingState from "../components/LoadingState";
import NetworkFailureState from "../components/NetworkFailureState";
import ErrorState from "../components/ErrorState";
import { useAuth } from "../context/AuthContext";
import { useSaved } from "../context/SavedContext";
import ProductCommentDrawer from "../components/ProductCommentDrawer";
import { ApiError, friendlyApiErrorMessage } from "../lib/api";
import {
  likePublicProduct,
  likeUsedListing,
  sharePublicProduct,
  shareUsedListingInteraction,
  unlikePublicProduct,
  unlikeUsedListing,
  viewPublicProduct,
  viewUsedListing,
} from "../services/marketplace.service";
import { searchMarketplace } from "../services/search.service";
import {
  followPublicStore,
  unfollowPublicStore,
} from "../services/seller.service";
import type { SavedItemType, SearchResults } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type FeedTab = "hot" | "vendors" | "following";

const emptyResults: SearchResults = {
  stores: [],
  products: [],
  services: [],
  usedListings: [],
};

type FeedProduct = SearchResults["products"][number];
type FeedUsedListing = SearchResults["usedListings"][number];
type FeedItem =
  | { kind: "product"; product: FeedProduct }
  | { kind: "used"; listing: FeedUsedListing };
type CommentTarget = {
  id: string;
  name: string;
  type: "product" | "used_listing";
};

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function getStoreInitials(storeName: string) {
  return storeName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function freshnessBoost(product: { createdAt: string; updatedAt: string }) {
  const createdAt = new Date(product.createdAt || product.updatedAt || "").getTime();

  if (!Number.isFinite(createdAt)) return 0;

  const ageDays = (Date.now() - createdAt) / (24 * 60 * 60 * 1000);

  if (ageDays <= 1) return 24;
  if (ageDays <= 3) return 16;
  if (ageDays <= 7) return 10;
  if (ageDays <= 14) return 5;
  return 0;
}

function usedEngagementScore(listing: FeedUsedListing) {
  const interaction = listing.interaction;
  return (
    Number(interaction?.shareCount || 0) * 14 +
    Number(interaction?.commentCount || 0) * 10 +
    Number(interaction?.likeCount || 0) * 6 +
    Number(interaction?.saveCount || 0) * 5 +
    Number(interaction?.viewCount || 0) +
    freshnessBoost(listing)
  );
}

function feedEngagementScore(product: FeedProduct) {
  const interaction = product.interaction;

  return (
    (product.isFeatured ? 30 : 0) +
    interaction.shareCount * 14 +
    interaction.commentCount * 10 +
    interaction.likeCount * 6 +
    interaction.saveCount * 5 +
    interaction.viewCount +
    Number(product.metrics?.storeFollowers || 0) * 8 +
    Number(product.metrics?.successfulDeliveries || 0) * 12 +
    Number(product.metrics?.positiveReviews || 0) * 15 +
    freshnessBoost(product)
  );
}

function productSource(store?: SearchResults["stores"][number]) {
  if (!store) return { sourceTag: "Marketplace", sourceDetail: "" };

  if (store.sellerType === "local_market") {
    return {
      sourceTag: "Local Market",
      sourceDetail:
        store.marketName ||
        store.pickupLocation ||
        store.locationArea ||
        store.campus,
    };
  }

  if (store.sellerType === "used_market") {
    return { sourceTag: "Used Market", sourceDetail: "" };
  }

  return {
    sourceTag: "Marketplace",
    sourceDetail: "",
  };
}

function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { isSaved, toggleSaved } = useSaved();
  const viewedProductIdsRef = useRef<Set<string>>(new Set());
  const viewedUsedListingIdsRef = useRef<Set<string>>(new Set());

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<FeedTab>("hot");
  const [feedOpenedAt] = useState(() => Date.now());
  const [marketplace, setMarketplace] = useState<SearchResults>(emptyResults);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [activeCommentTarget, setActiveCommentTarget] =
    useState<CommentTarget | null>(null);

  const loadMarketplace = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await searchMarketplace("");
      setMarketplace(response);
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarketplace();
  }, [loadMarketplace]);

  useEffect(() => {
    function retryWhenBackOnline() {
      void loadMarketplace();
    }

    window.addEventListener("online", retryWhenBackOnline);
    return () => window.removeEventListener("online", retryWhenBackOnline);
  }, [loadMarketplace]);

  function requireAuth(action?: () => void) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return false;
    }

    action?.();
    return true;
  }

  function handleCommentCreated(productId: string) {
  setMarketplace((current) => ({
    ...current,
    products: current.products.map((product) =>
      product.id === productId
        ? {
            ...product,
            interaction: {
              ...product.interaction,
              commentCount: product.interaction.commentCount + 1,
            },
          }
        : product,
    ),
  }));
}

  function handleUsedCommentCreated(listingId: string) {
    setMarketplace((current) => ({
      ...current,
      usedListings: current.usedListings.map((listing) =>
        listing.id === listingId
          ? {
              ...listing,
              interaction: {
                likeCount: listing.interaction?.likeCount || 0,
                commentCount:
                  (listing.interaction?.commentCount || 0) + 1,
                saveCount: listing.interaction?.saveCount || 0,
                shareCount: listing.interaction?.shareCount || 0,
                viewCount: listing.interaction?.viewCount || 0,
                liked: listing.interaction?.liked || false,
              },
            }
          : listing,
      ),
    }));
  }

async function handleProductViewed(productId: string) {
  if (!isAuthenticated) return;
  if (viewedProductIdsRef.current.has(productId)) return;

  viewedProductIdsRef.current.add(productId);

  try {
    const response = await viewPublicProduct(productId);

    setMarketplace((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.id === productId
          ? {
              ...product,
              interaction: response.interaction,
            }
          : product,
      ),
    }));
  } catch {
    // View tracking should never break the feed.
  }
}

  async function handleUsedListingViewed(listingId: string) {
    if (!isAuthenticated) return;
    if (viewedUsedListingIdsRef.current.has(listingId)) return;

    viewedUsedListingIdsRef.current.add(listingId);

    try {
      const response = await viewUsedListing(listingId);
      setMarketplace((current) => ({
        ...current,
        usedListings: current.usedListings.map((listing) =>
          listing.id === listingId
            ? { ...listing, interaction: response.interaction }
            : listing,
        ),
      }));
    } catch {
      // View tracking must never interrupt the social feed.
    }
  }

  async function handleToggleSave(itemType: SavedItemType, itemId: string) {
    if (!requireAuth()) return;
    await toggleSaved(itemType, itemId);
  }

  async function handleToggleLike(productId: string) {
    if (!requireAuth()) return;

    const product = marketplace.products.find((item) => item.id === productId);

    if (!product) return;

    const response = product.interaction.liked
      ? await unlikePublicProduct(productId)
      : await likePublicProduct(productId);

    setMarketplace((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.id === productId
          ? {
              ...item,
              interaction: response.interaction,
            }
          : item,
      ),
    }));
  }

  async function handleToggleUsedLike(listingId: string) {
    if (!requireAuth()) return;

    const listing = marketplace.usedListings.find(
      (item) => item.id === listingId,
    );
    if (!listing) return;

    const response = listing.interaction?.liked
      ? await unlikeUsedListing(listingId)
      : await likeUsedListing(listingId);

    setMarketplace((current) => ({
      ...current,
      usedListings: current.usedListings.map((item) =>
        item.id === listingId
          ? { ...item, interaction: response.interaction }
          : item,
      ),
    }));
  }

  async function handleToggleFollow(storeSlug: string) {
    if (!requireAuth()) return;

    const store = marketplace.stores.find((item) => item.slug === storeSlug);

    if (!store) return;

    const response = store.interaction.isFollowing
      ? await unfollowPublicStore(storeSlug)
      : await followPublicStore(storeSlug);

    setMarketplace((current) => ({
      ...current,
      stores: current.stores.map((item) =>
        item.slug === storeSlug
          ? {
              ...item,
              interaction: response.interaction,
            }
          : item,
      ),
    }));
  }

async function shareProduct(productId: string, productName: string) {
  if (!requireAuth()) return;

  const product = marketplace.products.find((item) => item.id === productId);

  if (!product) return;

  const url = `${window.location.origin}/products/${productId}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: productName,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
    }

    const response = await sharePublicProduct(productId);

    setMarketplace((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.id === productId
          ? {
              ...item,
              interaction: response.interaction,
            }
          : item,
      ),
    }));
  } catch {
    // User may cancel native share. That should not break the app.
  }
}

  async function shareUsedListing(listingId: string, listingName: string) {
    if (!requireAuth()) return;

    const url = `${window.location.origin}/used-market/${listingId}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: listingName, url });
      } else {
        await navigator.clipboard.writeText(url);
      }

      const response = await shareUsedListingInteraction(listingId);
      setMarketplace((current) => ({
        ...current,
        usedListings: current.usedListings.map((listing) =>
          listing.id === listingId
            ? { ...listing, interaction: response.interaction }
            : listing,
        ),
      }));
    } catch {
      // Cancelling the native share sheet should not break the feed.
    }
  }

  const trendingItems = [
    {
      title: "Food vendors near you",
      subtitle: "Fast meals around campus",
      icon: <FiTruck />,
      tone: "green",
      query: "Food",
    },
    {
      title: "Top fashion stores",
      subtitle: "Sneakers, hoodies, watches",
      icon: <FiShoppingBag />,
      tone: "orange",
      query: "Fashion",
    },
    {
      title: "Verified used phones",
      subtitle: "Affordable gadgets",
      icon: <FiSmartphone />,
      tone: "blue",
      query: "Phones",
    },
    
  ];

  const storeBySlug = useMemo(
    () => new Map(marketplace.stores.map((store) => [store.slug, store])),
    [marketplace.stores],
  );

  const visibleFeedItems = useMemo<FeedItem[]>(() => {
    const productsOnly = marketplace.products.filter((product) => {
      const store = storeBySlug.get(product.storeSlug);
      return Boolean(store);
    });

    if (activeRightTab === "following") {
      return productsOnly
        .filter((product) => storeBySlug.get(product.storeSlug)?.interaction.isFollowing)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((product) => ({ kind: "product" as const, product }));
    }

    if (activeRightTab === "vendors") {
      const tenDaysAgo = feedOpenedAt - 10 * 24 * 60 * 60 * 1_000;

      return productsOnly
        .filter((product) => {
          const store = storeBySlug.get(product.storeSlug);
          return store?.createdAt && new Date(store.createdAt).getTime() >= tenDaysAgo;
        })
        .sort((a, b) => {
          const storeA = storeBySlug.get(a.storeSlug);
          const storeB = storeBySlug.get(b.storeSlug);
          return String(storeB?.createdAt || "").localeCompare(String(storeA?.createdAt || ""));
        })
        .map((product) => ({ kind: "product" as const, product }));
    }

    const productItems: FeedItem[] = productsOnly.map((product) => ({
      kind: "product",
      product,
    }));
    const usedItems: FeedItem[] = marketplace.usedListings.map((listing) => ({
      kind: "used",
      listing,
    }));

    return [...productItems, ...usedItems].sort((a, b) => {
      const engagementA = a.kind === "product"
        ? feedEngagementScore(a.product)
        : usedEngagementScore(a.listing);
      const engagementB = b.kind === "product"
        ? feedEngagementScore(b.product)
        : usedEngagementScore(b.listing);

      if (engagementA !== engagementB) return engagementB - engagementA;

      const dateA = a.kind === "product"
        ? a.product.createdAt || a.product.updatedAt
        : a.listing.createdAt || a.listing.updatedAt;
      const dateB = b.kind === "product"
        ? b.product.createdAt || b.product.updatedAt
        : b.listing.createdAt || b.listing.updatedAt;

      return String(dateB).localeCompare(String(dateA));
    });
  }, [
    activeRightTab,
    feedOpenedAt,
    marketplace.products,
    marketplace.usedListings,
    storeBySlug,
  ]);

  const feedEmptyCopy = {
    hot: {
      eyebrow: "Marketplace ready",
      title: "No published products yet",
      message: "Products created and activated by sellers will appear here automatically.",
    },
    vendors: {
      eyebrow: "New vendors",
      title: "No new vendor products yet",
      message: "Products from sellers who joined in the last 10 days will appear here.",
    },
    following: {
      eyebrow: "Following",
      title: "No followed seller products yet",
      message: "Follow sellers from their profiles or the seller cards to build this feed.",
    },
  }[activeRightTab];

  if (isLoading) {
    return (
      <section className="guest-feed-page">
        <LoadingState
          title="Loading the marketplace"
          message="Bringing in the latest active products and stores."
        />
      </section>
    );
  }

  return (
    <>
      <section className="guest-feed-page">
        <FeedTopTabs
          activeTab={activeRightTab}
          onTabChange={setActiveRightTab}
          onRequireAuth={() => requireAuth()}
        />

        <div className="feed-layout">
          <div className="main-feed-area">
            <div className="feed-column">
              {loadError ? (
                loadError instanceof ApiError &&
                [0, 408, 502, 503, 504].includes(loadError.status) ? (
                  <NetworkFailureState
                    title="No internet connection"
                    message="We could not load the latest products. Check your connection and try again."
                    onRetry={() => void loadMarketplace()}
                    variant="card"
                  />
                ) : (
                  <ErrorState
                    message={friendlyApiErrorMessage(loadError)}
                    onRetry={() => void loadMarketplace()}
                    variant="card"
                  />
                )
              ) : visibleFeedItems.length === 0 ? (
                <EmptyState
                  icon={<FiShoppingBag />}
                  eyebrow={feedEmptyCopy.eyebrow}
                  title={feedEmptyCopy.title}
                  message={feedEmptyCopy.message}
                  actionLabel="Search Marketplace"
                  onAction={() => navigate("/search")}
                />
              ) : (
                visibleFeedItems.map((feedItem) => {
                  if (feedItem.kind === "used") {
                    const listing = feedItem.listing;
                    const listingStore = listing.sellerStoreSlug
                      ? storeBySlug.get(listing.sellerStoreSlug)
                      : undefined;
                    const sellerName =
                      listing.sellerStoreName ||
                      listing.sellerName ||
                      "Used Market Seller";
                    const sellerHandle =
                      listing.sellerStoreSlug ||
                      `used-${listing.sellerId.slice(-6)}`;
                    const detailsPath = `/used-market/${listing.id}`;

                    return (
                      <FeedPostCard
                        key={`used-${listing.id}`}
                        id={listing.id}
                        storeName={sellerName}
                        username={sellerHandle}
                        campus={listing.campus}
                        storeLogoUrl={
                          listingStore?.logoUrl
                            ? resolveMediaUrl(listingStore.logoUrl, "")
                            : null
                        }
                        productName={listing.name}
                        price={formatPrice(listing.price)}
                        category={`Used ${listing.category}`}
                        sourceTag="Used Market"
                        images={(listing.imageUrls.length
                          ? listing.imageUrls
                          : [productFallback]
                        ).map((image) => resolveMediaUrl(image, productFallback))}
                        badgeText={listing.condition}
                        detailsPath={detailsPath}
                        profilePath={
                          listing.sellerStoreSlug
                            ? `/stores/${listing.sellerStoreSlug}`
                            : detailsPath
                        }
                        cartEnabled
                        cartItemType="used_listing"
                        maxQuantity={listing.availableQuantity || listing.quantity || 1}
                        isOwnProduct={Boolean(
                          user?.id && listing.sellerId === user.id
                        )}
                        stockLabelOverride={listing.deliveryOption}
                        showFollowAction={Boolean(listingStore)}
                        showLikeAction
                        showCommentAction
                        productLiked={listing.interaction?.liked || false}
                        likeCount={listing.interaction?.likeCount || 0}
                        commentCount={listing.interaction?.commentCount || 0}
                        shareCount={listing.interaction?.shareCount || 0}
                        viewCount={listing.interaction?.viewCount || 0}
                        productSaved={isSaved("used_listing", listing.id)}
                        storeFollowing={listingStore?.interaction.isFollowing || false}
                        onRequireAuth={() => requireAuth()}
                        onToggleProductSave={() =>
                          void handleToggleSave("used_listing", listing.id)
                        }
                        onToggleStoreFollow={
                          listing.sellerStoreSlug
                            ? () => void handleToggleFollow(listing.sellerStoreSlug!)
                            : undefined
                        }
                        onToggleLike={() =>
                          void handleToggleUsedLike(listing.id)
                        }
                        onComment={() =>
                          setActiveCommentTarget({
                            id: listing.id,
                            name: listing.name,
                            type: "used_listing",
                          })
                        }
                        onShare={() =>
                          void shareUsedListing(listing.id, listing.name)
                        }
                        onViewed={() =>
                          void handleUsedListingViewed(listing.id)
                        }
                        onSwipeToStore={() =>
                          navigate(
                            listing.sellerStoreSlug
                              ? `/stores/${listing.sellerStoreSlug}`
                              : detailsPath,
                          )
                        }
                      />
                    );
                  }

                  const product = feedItem.product;
                  const productStore = storeBySlug.get(product.storeSlug);
                  const source = productSource(productStore);

                  const storeLogoUrl = productStore?.logoUrl
                    ? resolveMediaUrl(productStore.logoUrl, "")
                    : null;

                  return (
                    <FeedPostCard
                      key={product.id}
                      id={product.id}
                      storeName={product.storeName}
                      username={product.storeSlug}
                      campus={productStore?.campus || ""}
                      storeLogoUrl={storeLogoUrl}
                      productName={product.name}
	                      price={formatPrice(product.price)}
                        category={product.category}
                        availableSizes={product.availableSizes}
                        sourceTag={source.sourceTag}
                        sourceDetail={source.sourceDetail}
                        deliveryReadinessLabel={product.deliveryReadiness?.label}
	                      badgeText={
                        product.status === "out_of_stock"
                          ? "Out of Stock"
                          : "Available"
                      }
                      images={(product.imageUrls.length
                        ? product.imageUrls
                        : [productFallback]
                      ).map((image) => resolveMediaUrl(image, productFallback))}
                      maxQuantity={product.stock}
                      isOwnProduct={Boolean(user?.id && productStore?.ownerId === user.id)}
                      productSaved={isSaved("product", product.id)}
                      productLiked={product.interaction.liked}
                      likeCount={product.interaction.likeCount}
commentCount={product.interaction.commentCount}
shareCount={product.interaction.shareCount}
viewCount={product.interaction.viewCount}
                      storeFollowing={
                        productStore?.interaction.isFollowing || false
                      }
                      onRequireAuth={() => requireAuth()}
                      onToggleProductSave={() =>
                        void handleToggleSave("product", product.id)
                      }
                      onToggleStoreFollow={() =>
                        void handleToggleFollow(product.storeSlug)
                      }
                      onToggleLike={() => void handleToggleLike(product.id)}
                      onComment={() =>
                        setActiveCommentTarget({
                          id: product.id,
                          name: product.name,
                          type: "product",
                        })
                      }
                      onShare={() => void shareProduct(product.id, product.name)}
                      onViewed={() => void handleProductViewed(product.id)}
                      onSwipeToStore={() => navigate(`/stores/${product.storeSlug}`)}
                    />
                  );
                })
              )}
            </div>
          </div>

          <aside className="feed-right-panel">
            <div className="desktop-right-boxes">
              <div className="home-side-box campus-trending-box">
                <div className="home-side-box-header">
                  <div>
                    <span>
                      <FiTrendingUp />
                      Live Trends
                    </span>
                    <h3>Browse marketplace categories</h3>
                  </div>

                  <button type="button" onClick={() => navigate("/search")}>
                    <FiZap />
                  </button>
                </div>

                <div className="campus-trend-list">
                  {trendingItems.map((item) => (
                    <button
                      type="button"
                      className={`campus-trend-item ${item.tone}`}
                      key={item.title}
                      onClick={() => navigate(`/search?q=${item.query}`)}
                    >
                      <span className="campus-trend-icon">{item.icon}</span>

                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </div>

                      <FiChevronRight />
                    </button>
                  ))}
                </div>
              </div>

              <div className="home-side-box popular-sellers-box">
                <div className="home-side-box-header">
                  <div>
                    <span>
                      <FiUsers />
                      Stores
                    </span>
                    <h3>Active sellers</h3>
                  </div>

                  <button
                    type="button"
                    className="seller-top-icon"
                    onClick={() => navigate("/search")}
                  >
                    <FiStar />
                  </button>
                </div>

                <div className="popular-seller-list">
                  {marketplace.stores.slice(0, 4).map((store) => {
                    const storeLogoUrl = store.logoUrl
                      ? resolveMediaUrl(store.logoUrl, "")
                      : null;

                    return (
                      <div
                        className="mini-seller"
                        key={store.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/stores/${store.slug || store.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/stores/${store.slug || store.id}`);
                          }
                        }}
                      >
                        <span>
                          {storeLogoUrl ? (
                            <img src={storeLogoUrl} alt={store.name} />
                          ) : (
                            getStoreInitials(store.name)
                          )}
                        </span>

                        <div>
                          <strong>{store.name}</strong>
                          <p>
                            {store.category}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleFollow(store.slug);
                          }}
                        >
                          {store.interaction.isFollowing
                            ? "Following"
                            : "Follow"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="popular-sellers-view-btn"
                  onClick={() => navigate("/search")}
                >
                  <FiStar />
                  Discover more sellers
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
      <ProductCommentDrawer
  isOpen={Boolean(activeCommentTarget)}
  productId={activeCommentTarget?.id || null}
  productName={activeCommentTarget?.name}
  targetType={activeCommentTarget?.type || "product"}
  onClose={() => setActiveCommentTarget(null)}
  onRequireAuth={() => requireAuth()}
  onCommentCreated={() => {
    if (!activeCommentTarget) return;
    if (activeCommentTarget.type === "used_listing") {
      handleUsedCommentCreated(activeCommentTarget.id);
    } else {
      handleCommentCreated(activeCommentTarget.id);
    }
  }}
/>
    </>
  );
}

export default Home;
