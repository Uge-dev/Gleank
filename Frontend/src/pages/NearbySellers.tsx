import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiSearch } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
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
  }, [query]);

  return (
    <section className="market-shell-page">
      <Link to="/market" className="market-back-link">
        <FiArrowLeft /> Back to Market
      </Link>

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

      {isLoading ? (
        <LoadingState
          title="Loading nearby sellers"
          message="Loading nearby products and stores."
        />
      ) : error ? (
        <div className="market-empty-state">
          <FiMapPin />
          <h2>Nearby discovery could not load</h2>
          <p>{error}</p>
          <Link to="/market/search">Search the Market</Link>
        </div>
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
