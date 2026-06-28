import { Link, useNavigate } from "react-router-dom";
import {
  FiBookmark,
  FiBox,
  FiMapPin,
  FiShoppingBag,
  FiTrash2,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { useSaved } from "../context/SavedContext";
import type { SavedItem } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const fallbackImage =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function itemView(saved: SavedItem) {
  if (saved.itemType === "product") {
    return {
      type: "Product",
      title: saved.item.name,
      subtitle: saved.item.storeName,
      meta: formatPrice(saved.item.price),
      image: saved.item.imageUrls[0],
      link: `/products/${saved.item.id}`,
    };
  }

  if (saved.itemType === "store") {
    return {
      type: "Store",
      title: saved.item.name,
      subtitle: saved.item.category,
      meta: saved.item.campus,
      image: saved.item.logoUrl || saved.item.coverUrl,
      link: `/stores/${saved.item.slug}`,
    };
  }

  if (saved.itemType === "service") {
    return {
      type: "Service",
      title: saved.item.name,
      subtitle: saved.item.storeName,
      meta: `From ${formatPrice(saved.item.price)}`,
      image: saved.item.imageUrls[0],
      link: `/stores/${saved.item.storeSlug}`,
    };
  }

  return {
    type: "Used item",
    title: saved.item.name,
    subtitle: saved.item.sellerName,
    meta: formatPrice(saved.item.price),
    image: saved.item.imageUrls[0],
    link: `/used-market/${saved.item.id}`,
  };
}

function Saved() {
  const navigate = useNavigate();
  const { savedItems, isLoading, error, toggleSaved, refreshSaved } = useSaved();

  if (isLoading && savedItems.length === 0) {
    return (
      <section className="saved-page">
        <LoadingState
          title="Loading saved items"
          message="Bringing together your saved products, stores, services, and used deals."
        />
      </section>
    );
  }

  if (error && savedItems.length === 0) {
    return (
      <section className="saved-page">
        <ErrorState
          title="Saved items failed to load"
          message={error}
          onRetry={() => void refreshSaved()}
        />
      </section>
    );
  }

  if (savedItems.length === 0) {
    return (
      <section className="saved-page">
        <EmptyState
          icon={<FiBookmark />}
          eyebrow="No saved items"
          title="You have not saved anything yet"
          message="Use the bookmark controls on products, stores, services, or Used Market listings."
          actionLabel="Explore Marketplace"
          onAction={() => navigate("/search")}
        />
      </section>
    );
  }

  return (
    <section className="saved-page">
      <div className="saved-page-header">
        <span>Saved Items</span>
        <h1>Your marketplace shortlist</h1>
        <p>
          Everything here is synced to your Gleank account and is available on
          your phone or any other signed-in device.
        </p>
      </div>

      {error && (
        <div className="auth-inline-message error" role="alert">
          {error}
        </div>
      )}

      <div className="saved-items-grid">
        {savedItems.map((saved) => {
          const view = itemView(saved);

          return (
            <article className="saved-market-card" key={saved.id}>
              <Link to={view.link} className="saved-market-image">
                <img
                  src={resolveMediaUrl(view.image, fallbackImage)}
                  alt={view.title}
                />
                <span>{view.type}</span>
              </Link>

              <div className="saved-market-content">
                <h3>{view.title}</h3>
                <p>
                  <FiMapPin />
                  {view.subtitle}
                </p>
                <strong>{view.meta}</strong>

                <div className="saved-market-actions">
                  <Link to={view.link}>
                    {saved.itemType === "store" ? <FiBox /> : <FiShoppingBag />}
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      void toggleSaved(saved.itemType, saved.itemId)
                    }
                  >
                    <FiTrash2 />
                    Remove
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default Saved;
