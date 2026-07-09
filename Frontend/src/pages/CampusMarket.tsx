import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiSearch, FiShoppingBag, FiUsers } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
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
  }, [query]);

  return (
    <section className="market-shell-page">
      <Link to="/market" className="market-back-link">
        <FiArrowLeft /> Back to Market
      </Link>

      <header className="market-shell-hero">
        <span>Campus Market</span>
        <h1>Campus sellers around your selected campus.</h1>
        <p>
          This space keeps the campus commerce advantage alive: student sellers, campus stores,
          safer local discovery, and products ranked by campus relevance.
        </p>
      </header>

      <div className="market-shell-grid">
        <article className="market-shell-card">
          <FiUsers />
          <h2>Campus-first discovery</h2>
          <p>{data?.stores.length || 0} active campus sellers are currently available.</p>
        </article>
        <article className="market-shell-card">
          <FiShoppingBag />
          <h2>Existing store logic stays</h2>
          <p>{data?.products.length || 0} live products are connected to seller profiles.</p>
        </article>
        <article className="market-shell-card">
          <FiMapPin />
          <h2>Location ready</h2>
          <p>Future APIs can rank campus sellers by selected campus and nearby delivery zones.</p>
        </article>
      </div>

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

      {isLoading ? (
        <LoadingState
          title="Loading Campus Market"
          message="Bringing together campus sellers and active products."
        />
      ) : error ? (
        <div className="market-empty-state">
          <FiSearch />
          <h2>Campus Market could not load</h2>
          <p>{error}</p>
          <Link to="/market/search">Try Market search</Link>
        </div>
      ) : data && (data.products.length || data.stores.length) ? (
        <>
          <section className="market-live-section">
            <div className="market-section-head compact">
              <div>
                <span>Campus products</span>
                <h2>Products from active campus sellers</h2>
              </div>
              <p>Services stay inside seller profiles; public feed focuses on products.</p>
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
                <span>Campus stores</span>
                <h2>Active seller profiles</h2>
              </div>
              <p>Follow, message, highlights, products, services, favourites and about remain on seller profile pages.</p>
            </div>
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
          <p>Campus sellers around your selected campus will appear here.</p>
          <Link to="/market/search">Search the full Market</Link>
        </div>
      )}
    </section>
  );
}

export default CampusMarket;
