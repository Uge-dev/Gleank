import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiPackage, FiSearch, FiShoppingBag, FiUsers } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import {
  LocalMarketCard,
  MarketProductCard,
  MarketStoreCard,
  UsedListingMarketCard,
} from "../components/MarketCards";
import {
  searchMarket,
  type MarketSearchResponse,
} from "../services/market.service";

const searchTabs = [
  { label: "All", value: "all", icon: <FiSearch /> },
  { label: "Products", value: "products", icon: <FiPackage /> },
  { label: "Stores", value: "stores", icon: <FiUsers /> },
  { label: "Used", value: "used", icon: <FiShoppingBag /> },
  { label: "Markets", value: "markets", icon: <FiMapPin /> },
];

function MarketSearchResults() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = params.get("q") || "";
  const type = params.get("type") || "all";
  const [data, setData] = useState<MarketSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setIsLoading(true);
    searchMarket({ q: query, type })
      .then((response) => {
        if (alive) {
          setData(response);
          setError("");
        }
      })
      .catch((requestError) => {
        if (alive) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not search the Market.",
          );
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [query, type]);

  const totalCount = useMemo(() => {
    if (!data) return 0;
    return (
      data.counts.products +
      data.counts.stores +
      data.counts.usedListings +
      data.counts.localMarkets
    );
  }, [data]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextQuery = String(form.get("marketSearch") || "").trim();
    const suffix = new URLSearchParams();

    if (nextQuery) suffix.set("q", nextQuery);
    if (type !== "all") suffix.set("type", type);

    navigate(`/market/search${suffix.toString() ? `?${suffix.toString()}` : ""}`);
  }

  function tabPath(value: string) {
    const suffix = new URLSearchParams();
    if (query) suffix.set("q", query);
    if (value !== "all") suffix.set("type", value);
    return `/market/search${suffix.toString() ? `?${suffix.toString()}` : ""}`;
  }

  return (
    <section className="market-shell-page">
      <Link to="/market" className="market-back-link">
        <FiArrowLeft /> Back to Market
      </Link>

      <header className="market-shell-hero">
        <span>Market Search</span>
        <h1>{query ? `Search results for “${query}”` : "Search the whole Market"}</h1>
        <p>
          Search products, active stores, Used Market listings, and admin-approved Local Markets.
          Seller services remain inside seller profile service tabs.
        </p>
      </header>

      <form className="market-hub-search compact" onSubmit={submitSearch}>
        <FiSearch />
        <input
          defaultValue={query}
          name="marketSearch"
          placeholder="Search products, sellers, used items, or markets"
          type="search"
        />
        <button type="submit">Search</button>
      </form>

      <div className="market-search-tabs">
        {searchTabs.map((tab) => (
          <Link
            className={type === tab.value ? "active" : ""}
            key={tab.value}
            to={tabPath(tab.value)}
          >
            {tab.icon}
            {tab.label}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <LoadingState
          title="Searching Market"
          message="Checking products, stores, used items, and local markets."
        />
      ) : error ? (
        <div className="market-empty-state">
          <FiSearch />
          <h2>Search could not load</h2>
          <p>{error}</p>
        </div>
      ) : data && totalCount > 0 ? (
        <>
          {(type === "all" || type === "products") && data.products.length > 0 && (
            <section className="market-live-section">
              <div className="market-section-head compact">
                <div>
                  <span>{data.counts.products}</span>
                  <h2>Products</h2>
                </div>
              </div>
              <div className="market-live-grid">
                {data.products.map((product) => (
                  <MarketProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {(type === "all" || type === "stores") && data.stores.length > 0 && (
            <section className="market-live-section">
              <div className="market-section-head compact">
                <div>
                  <span>{data.counts.stores}</span>
                  <h2>Stores</h2>
                </div>
              </div>
              <div className="market-live-grid">
                {data.stores.map((store) => (
                  <MarketStoreCard key={store.id} store={store} />
                ))}
              </div>
            </section>
          )}

          {(type === "all" || type === "used") && data.usedListings.length > 0 && (
            <section className="market-live-section">
              <div className="market-section-head compact">
                <div>
                  <span>{data.counts.usedListings}</span>
                  <h2>Used Market</h2>
                </div>
              </div>
              <div className="market-live-grid">
                {data.usedListings.map((listing) => (
                  <UsedListingMarketCard key={listing.id} listing={listing} />
                ))}
              </div>
            </section>
          )}

          {(type === "all" || type === "markets") && data.localMarkets.length > 0 && (
            <section className="market-live-section">
              <div className="market-section-head compact">
                <div>
                  <span>{data.counts.localMarkets}</span>
                  <h2>Local Markets</h2>
                </div>
              </div>
              <div className="market-live-grid">
                {data.localMarkets.map((market) => (
                  <LocalMarketCard key={market.id} market={market} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="market-empty-state">
          <FiSearch />
          <h2>No Market results yet</h2>
          <p>Try another product name, seller name, campus, market, or category.</p>
        </div>
      )}
    </section>
  );
}

export default MarketSearchResults;
