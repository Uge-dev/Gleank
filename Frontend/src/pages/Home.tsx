import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiBookOpen,
  FiChevronRight,
  FiCpu,
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
import { useAuth } from "../context/AuthContext";
import { useSaved } from "../context/SavedContext";
import ProductCommentDrawer from "../components/ProductCommentDrawer";
import {
  likePublicProduct,
  sharePublicProduct,
  unlikePublicProduct,
  viewPublicProduct,
} from "../services/marketplace.service";
import { searchMarketplace } from "../services/search.service";
import {
  followPublicStore,
  unfollowPublicStore,
} from "../services/seller.service";
import type { SavedItemType, SearchResults } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { getAnonViewerId } from "../utils/visitor";

type RightTab = "hot" | "vendors";

const emptyResults: SearchResults = {
  stores: [],
  products: [],
  services: [],
  usedListings: [],
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

function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isSaved, toggleSaved } = useSaved();
  const viewedProductIdsRef = useRef<Set<string>>(new Set());

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<RightTab>("hot");
  const [marketplace, setMarketplace] = useState<SearchResults>(emptyResults);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommentProductId, setActiveCommentProductId] = useState<
  string | null
>(null);

  useEffect(() => {
    let active = true;

    void searchMarketplace("")
      .then((response) => {
        if (active) setMarketplace(response);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

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

async function handleProductViewed(productId: string) {
  if (viewedProductIdsRef.current.has(productId)) return;

  viewedProductIdsRef.current.add(productId);

  try {
    const response = await viewPublicProduct(productId, getAnonViewerId());

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
    {
      title: "Academic materials",
      subtitle: "Books, notes, handouts",
      icon: <FiBookOpen />,
      tone: "purple",
      query: "Books",
    },
    {
      title: "Student services",
      subtitle: "Repairs, typing, design",
      icon: <FiCpu />,
      tone: "dark",
      query: "Services",
    },
  ];

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
              {marketplace.products.length === 0 ? (
                <EmptyState
                  icon={<FiShoppingBag />}
                  eyebrow="Marketplace ready"
                  title="No published products yet"
                  message="Products created and activated by sellers will appear here automatically."
                  actionLabel="Search Marketplace"
                  onAction={() => navigate("/search")}
                />
              ) : (
                marketplace.products.map((product) => {
                  const productStore = marketplace.stores.find(
                    (store) => store.slug === product.storeSlug,
                  );

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
                      onComment={() => setActiveCommentProductId(product.id)}
                      onShare={() => void shareProduct(product.id, product.name)}
                      onViewed={() => void handleProductViewed(product.id)}
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
                    <h3>Active campus sellers</h3>
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
                      <div className="mini-seller" key={store.id}>
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
                            {store.category} • {store.campus}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleToggleFollow(store.slug)}
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
  isOpen={Boolean(activeCommentProductId)}
  productId={activeCommentProductId}
  productName={
    marketplace.products.find((item) => item.id === activeCommentProductId)
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

export default Home;