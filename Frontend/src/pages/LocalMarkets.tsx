import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiMap, FiMapPin, FiSearch, FiShoppingBag, FiTruck } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { LocalMarketCard } from "../components/MarketCards";
import {
  getLocalMarkets,
  type LocalMarket,
} from "../services/market.service";

function LocalMarkets() {
  const [markets, setMarkets] = useState<LocalMarket[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setIsLoading(true);
    getLocalMarkets({ q: query })
      .then((response) => {
        if (alive) {
          setMarkets(response.markets);
          setError("");
        }
      })
      .catch((requestError) => {
        if (alive) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load Local Markets.",
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

      <header className="market-shell-hero local">
        <span>Local Markets</span>
        <h1>Physical markets, seller pickups, and rider delivery.</h1>
        <p>
          Local Markets will support approved physical markets, verified market sellers,
          rider pickup instructions, and logistics pricing with platform margin included.
        </p>
      </header>

      <form
        className="market-hub-search compact"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setQuery(String(form.get("localMarketQuery") || "").trim());
        }}
      >
        <FiSearch />
        <input
          name="localMarketQuery"
          placeholder="Search approved local markets"
          type="search"
        />
        <button type="submit">Search</button>
      </form>

      {isLoading ? (
        <LoadingState
          title="Loading Local Markets"
          message="Checking admin-approved markets and connected sellers."
        />
      ) : error ? (
        <div className="market-empty-state">
          <FiMapPin />
          <h2>Local Markets could not load</h2>
          <p>{error}</p>
        </div>
      ) : markets.length ? (
        <div className="market-live-grid">
          {markets.map((market) => (
            <LocalMarketCard key={market.id} market={market} />
          ))}
        </div>
      ) : (
        <div className="market-empty-state">
          <FiMapPin />
          <h2>No approved local markets yet</h2>
          <p>Local markets will appear here after admin creates and activates them.</p>
        </div>
      )}

      <div className="market-shell-grid">
        <article className="market-shell-card">
          <FiShoppingBag />
          <h2>Approved sellers</h2>
          <p>Sellers can later attach to approved markets by address, stall/shop number, and admin review.</p>
        </article>
        <article className="market-shell-card">
          <FiTruck />
          <h2>Rider pickup ready</h2>
          <p>Orders can later flow into rider pickup queues after seller availability confirmation.</p>
        </article>
        <article className="market-shell-card">
          <FiMap />
          <h2>Map-based expansion</h2>
          <p>New market clusters can be created from location data and approved by admin later.</p>
        </article>
      </div>
    </section>
  );
}

export default LocalMarkets;
