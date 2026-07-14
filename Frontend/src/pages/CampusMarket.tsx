import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiSearch } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import NetworkFailureState from "../components/NetworkFailureState";
import {
  MarketProductCard,
  MarketStoreCard,
} from "../components/MarketCards";
import {
  getCampusMarket,
  type CampusMarketResponse,
} from "../services/market.service";

function CampusMarket() {
  const [data, setData] = useState<CampusMarketResponse | null>(null);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setIsLoading(true);
    getCampusMarket({ q: query })
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
              : "Could not load Campus Market.",
          );
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [query, reloadKey]);

  return (
    <section className="market-shell-page">
      <form
        className="market-hub-search compact"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setQuery(String(form.get("campusQuery") || "").trim());
        }}
      >
        <FiSearch />
        <input
          name="campusQuery"
          placeholder="Search campus products or sellers"
          type="search"
        />
        <button type="submit">Search</button>
      </form>

      <Link to="/market" className="market-back-link">
        <FiArrowLeft /> Back to Market
      </Link>

      {isLoading ? (
        <LoadingState
          title="Loading Campus Market"
          message="Loading campus products and stores."
        />
      ) : error ? (
        <NetworkFailureState
          variant="card"
          message="Campus Market could not refresh. Please check your connection and try again."
          onRetry={() => setReloadKey((current) => current + 1)}
        />
      ) : data && (data.products.length || data.stores.length) ? (
        <>
          <section className="market-live-section product-feed-only">
            <div className="market-live-grid">
              {data.products.map((product) => (
                <MarketProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>

          <section className="market-live-section product-feed-only">
            <div className="market-live-grid">
              {data.stores.map((store) => (
                <MarketStoreCard key={store.id} store={store} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="market-empty-state">
          <FiSearch />
          <h2>Campus Market feed is empty</h2>
          <Link to="/market/search">Search the full Market</Link>
        </div>
      )}
    </section>
  );
}

export default CampusMarket;
