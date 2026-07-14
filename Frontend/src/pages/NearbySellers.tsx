import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiSearch } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import NetworkFailureState from "../components/NetworkFailureState";
import {
  MarketProductCard,
  MarketStoreCard,
} from "../components/MarketCards";
import {
  getNearbySellers,
  type NearbySellersResponse,
} from "../services/market.service";

function NearbySellers() {
  const [data, setData] = useState<NearbySellersResponse | null>(null);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setIsLoading(true);
    getNearbySellers({ q: query })
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
              : "Could not load nearby sellers.",
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
          setQuery(String(form.get("nearbyQuery") || "").trim());
        }}
      >
        <FiSearch />
        <input
          name="nearbyQuery"
          placeholder="Search nearby products or sellers"
          type="search"
        />
        <button type="submit">Search</button>
      </form>

      <Link to="/market" className="market-back-link">
        <FiArrowLeft /> Back to Market
      </Link>

      {isLoading ? (
        <LoadingState
          title="Loading nearby sellers"
          message="Loading nearby products and stores."
        />
      ) : error ? (
        <NetworkFailureState
          variant="card"
          message="Nearby sellers could not refresh. Please check your connection and try again."
          onRetry={() => setReloadKey((current) => current + 1)}
        />
      ) : data && (data.sellers.length || data.products.length) ? (
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
              {data.sellers.map((store) => (
                <MarketStoreCard key={store.id} store={store} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="market-empty-state">
          <FiMapPin />
          <h2>No nearby sellers yet</h2>
          <Link to="/market/search">Search the full Market</Link>
        </div>
      )}
    </section>
  );
}

export default NearbySellers;
