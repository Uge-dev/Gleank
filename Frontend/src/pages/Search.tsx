import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type React from "react";
import {
  FiAlertCircle,
  FiBookmark,
  FiBox,
  FiGrid,
  FiRefreshCw,
  FiSearch,
  FiShoppingBag,
  FiStar,
  FiUser,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import AuthModal from "../components/AuthModal";
import { useAuth } from "../context/AuthContext";
import { useSaved } from "../context/SavedContext";
import { searchMarketplace } from "../services/search.service";
import type { SavedItemType, SearchResults } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type SearchTab = "all" | "products" | "sellers" | "services" | "used";

const searchTabs: {
  label: string;
  value: SearchTab;
  icon: React.ReactNode;
}[] = [
  { label: "All", value: "all", icon: <FiGrid /> },
  { label: "Products", value: "products", icon: <FiShoppingBag /> },
  { label: "Sellers", value: "sellers", icon: <FiUser /> },
  { label: "Services", value: "services", icon: <FiBox /> },
  { label: "Used Market", value: "used", icon: <FiRefreshCw /> },
];

const emptyResults: SearchResults = {
  stores: [],
  products: [],
  services: [],
  usedListings: [],
};

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";
const storeFallback =
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80";
const serviceFallback =
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=900&q=80";
const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function Search() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { isSaved, toggleSaved } = useSaved();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);

  async function handleToggleSave(itemType: SavedItemType, itemId: string) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    await toggleSaved(itemType, itemId);
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");

      try {
        const nextResults = await searchMarketplace(query);
        if (!controller.signal.aborted) setResults(nextResults);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Search could not be loaded.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const totalResults =
    results.products.length +
    results.stores.length +
    results.services.length +
    results.usedListings.length;

  if (isLoading && totalResults === 0) {
    return (
      <section className="search-page">
        <LoadingState
          title="Searching Gleank"
          message="Loading current products, sellers, and services from Gleank."
        />
      </section>
    );
  }

  if (error && totalResults === 0) {
    return (
      <section className="search-page">
        <ErrorState
          title="Search failed"
          message={error}
          onRetry={() => window.location.reload()}
        />
      </section>
    );
  }

  return (
    <>
    <section className="search-page">
      <div className="search-sticky-top">
        <div className="search-input-shell">
          <FiSearch />
          <input
            type="search"
            placeholder="Search products, sellers, and services..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")}>
              Clear
            </button>
          )}
        </div>

        <div className="search-tabs-row">
          {searchTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={activeTab === tab.value ? "active" : ""}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="search-page-header">
        <span>Live marketplace search</span>
        <h1>{query ? `Results for “${query}”` : "Find anything around campus"}</h1>
        <p>
          These results come directly from active Gleank stores, products, and
          services in the shared database.
        </p>
        <div className="search-result-count">
          <FiAlertCircle />
          {isLoading
            ? "Updating results..."
            : `${totalResults} result${totalResults === 1 ? "" : "s"} found`}
        </div>
      </div>

      {error && (
        <div className="auth-inline-message error" role="alert">
          <FiAlertCircle />
          {error}
        </div>
      )}

      {totalResults === 0 ? (
        <EmptyState
          icon={<FiSearch />}
          eyebrow="No results found"
          title="Nothing matches your search"
          message="Try another keyword, or make sure the seller store and its listings are set to active."
          actionLabel="Clear Search"
          onAction={() => {
            setQuery("");
            setActiveTab("all");
          }}
        />
      ) : (
        <div className="search-results-stack">
          {(activeTab === "all" || activeTab === "products") && (
            <section className="search-section">
              <div className="search-section-heading">
                <div>
                  <span>Products</span>
                  <h2>Products you can buy</h2>
                </div>
                <small>{results.products.length}</small>
              </div>

              {results.products.length === 0 ? (
                <EmptyState
                  icon={<FiShoppingBag />}
                  eyebrow="No products"
                  title="No product result"
                  message="Published products matching your search will appear here."
                  variant="card"
                />
              ) : (
                <div className="search-grid">
                  {results.products.map((product) => (
                    <article className="search-product-card" key={product.id}>
                      <Link to={`/products/${product.id}`}>
                        <img
                          src={resolveMediaUrl(product.imageUrls[0], productFallback)}
                          alt={product.name}
                        />
                      </Link>
                      <div className="search-product-content">
                        <span>{product.category}</span>
                        <h3>{product.name}</h3>
                        <p>{product.storeName}</p>
                        <div className="search-product-meta">
                          <strong>{formatPrice(product.price)}</strong>
                          <small>
                            <FiStar />
                            {product.status === "out_of_stock"
                              ? "Out of stock"
                              : `${product.stock} available`}
                          </small>
                        </div>
                        <div className="search-product-actions">
                          <Link to={`/products/${product.id}`}>View product</Link>
                          <button
                            type="button"
                            className="market-save-button"
                            onClick={() =>
                              void handleToggleSave("product", product.id)
                            }
                            aria-label="Save product"
                          >
                            <FiBookmark
                              fill={
                                isSaved("product", product.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {(activeTab === "all" || activeTab === "sellers") && (
            <section className="search-section">
              <div className="search-section-heading">
                <div>
                  <span>Sellers</span>
                  <h2>Campus sellers and stores</h2>
                </div>
                <small>{results.stores.length}</small>
              </div>

              {results.stores.length === 0 ? (
                <EmptyState
                  icon={<FiUser />}
                  eyebrow="No sellers"
                  title="No seller result"
                  message="Active stores matching your search will appear here."
                  variant="card"
                />
              ) : (
                <div className="search-seller-grid">
                  {results.stores.map((store) => (
                    <article
                      className="search-seller-card"
                      key={store.id}
                    >
                      <Link to={`/stores/${store.slug}`}>
                        <img
                          src={resolveMediaUrl(
                            store.logoUrl || store.coverUrl,
                            storeFallback,
                          )}
                          alt={store.name}
                        />
                        <div>
                          <span>{store.category}</span>
                          <h3>{store.name}</h3>
                          <p>{store.campus || "Campus not specified"}</p>
                          <small>
                            <FiStar />
                            {store.verified ? "Verified" : "Active store"}
                          </small>
                        </div>
                      </Link>
                      <button
                        type="button"
                        className="market-save-button"
                        onClick={() => void handleToggleSave("store", store.id)}
                        aria-label="Save store"
                      >
                        <FiBookmark
                          fill={
                            isSaved("store", store.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {(activeTab === "all" || activeTab === "services") && (
            <section className="search-section">
              <div className="search-section-heading">
                <div>
                  <span>Services</span>
                  <h2>Services around campus</h2>
                </div>
                <small>{results.services.length}</small>
              </div>

              {results.services.length === 0 ? (
                <EmptyState
                  icon={<FiBox />}
                  eyebrow="No services"
                  title="No service result"
                  message="Published services matching your search will appear here."
                  variant="card"
                />
              ) : (
                <div className="search-grid">
                  {results.services.map((service) => (
                    <article className="search-service-card" key={service.id}>
                      <img
                        src={resolveMediaUrl(service.imageUrls[0], serviceFallback)}
                        alt={service.name}
                      />
                      <div className="search-service-content">
                        <span>{service.category}</span>
                        <h3>{service.name}</h3>
                        <p>{service.storeName}</p>
                        <strong>From {formatPrice(service.price)}</strong>
                        <div className="search-service-actions">
                          <Link to={`/stores/${service.storeSlug}`}>View store</Link>
                          <Link to="/messages">Message</Link>
                          <button
                            type="button"
                            className="market-save-button"
                            onClick={() =>
                              void handleToggleSave("service", service.id)
                            }
                            aria-label="Save service"
                          >
                            <FiBookmark
                              fill={
                                isSaved("service", service.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {(activeTab === "all" || activeTab === "used") && (
            <section className="search-section">
              <div className="search-section-heading">
                <div>
                  <span>Used Market</span>
                  <h2>Pre-owned deals around campus</h2>
                </div>
                <small>{results.usedListings.length}</small>
              </div>

              {results.usedListings.length === 0 ? (
                <EmptyState
                  icon={<FiRefreshCw />}
                  eyebrow="No used items"
                  title="No Used Market result"
                  message="Active used listings matching your search will appear here."
                  variant="card"
                />
              ) : (
                <div className="search-grid">
                  {results.usedListings.map((listing) => (
                    <article className="search-service-card" key={listing.id}>
                      <img
                        src={resolveMediaUrl(
                          listing.imageUrls[0],
                          usedFallback,
                        )}
                        alt={listing.name}
                      />
                      <div className="search-service-content">
                        <span>
                          {listing.category} • {listing.condition}
                        </span>
                        <h3>{listing.name}</h3>
                        <p>{listing.sellerName}</p>
                        <strong>{formatPrice(listing.price)}</strong>
                        <div className="search-service-actions">
                          <Link to={`/used-market/${listing.id}`}>
                            View item
                          </Link>
                          <button
                            type="button"
                            className="market-save-button"
                            onClick={() =>
                              void handleToggleSave(
                                "used_listing",
                                listing.id,
                              )
                            }
                            aria-label="Save used item"
                          >
                            <FiBookmark
                              fill={
                                isSaved("used_listing", listing.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </section>
    <AuthModal
      isOpen={authModalOpen}
      onClose={() => setAuthModalOpen(false)}
    />
    </>
  );
}

export default Search;
