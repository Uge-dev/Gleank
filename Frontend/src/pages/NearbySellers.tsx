import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCompass, FiMapPin, FiNavigation, FiSearch, FiTruck } from "react-icons/fi";
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

      <header className="market-shell-hero nearby">
        <span>Nearby Sellers</span>
        <h1>Products close to the buyer’s selected location.</h1>
        <p>
          Nearby Sellers is prepared for location-based discovery, faster delivery,
          and ranking sellers by distance, availability, and fulfilment quality.
        </p>
      </header>

      <div className="market-shell-grid">
        <article className="market-shell-card">
          <FiNavigation />
          <h2>Selected location</h2>
          <p>{data?.selectedCampus ? `${data.selectedCampus} is prioritized now.` : "Campus/location selection is ready for map APIs."}</p>
        </article>
        <article className="market-shell-card">
          <FiTruck />
          <h2>Fast delivery logic</h2>
          <p>Products can be ranked by active rider coverage and estimated delivery time.</p>
        </article>
        <article className="market-shell-card">
          <FiCompass />
          <h2>Campus + market balance</h2>
          <p>Nearby results can include campus stores, local-market sellers, and independent sellers.</p>
        </article>
      </div>

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
          message="Prioritizing campus and active store data."
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
          <div className="market-inline-alert soft">
            <strong>{data.locationMode === "campus" ? "Campus-prioritized" : "Platform-wide"}</strong>
            <span>{data.note}</span>
          </div>

          <section className="market-live-section">
            <div className="market-section-head compact">
              <div>
                <span>Nearby products</span>
                <h2>Products close to your market context</h2>
              </div>
            </div>
            <div className="market-live-grid">
              {data.products.map((product) => (
                <MarketProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>

          <section className="market-live-section">
            <div className="market-section-head compact">
              <div>
                <span>Nearby sellers</span>
                <h2>Active stores</h2>
              </div>
            </div>
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
          <p>Nearby sellers will appear here based on your selected delivery location.</p>
          <Link to="/market/search">Search the full Market</Link>
        </div>
      )}
    </section>
  );
}

export default NearbySellers;
