import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiSearch } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import NetworkFailureState from "../components/NetworkFailureState";
import { LocalMarketCard } from "../components/MarketCards";
import {
  getLocalMarkets,
  type LocalMarket,
} from "../services/market.service";

function LocalMarkets() {
  const [markets, setMarkets] = useState<LocalMarket[]>([]);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
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
  }, [query, reloadKey]);

  return (
    <section className="market-shell-page">
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

      <Link to="/market" className="market-back-link">
        <FiArrowLeft /> Back to Market
      </Link>

      {isLoading ? (
        <LoadingState
          title="Loading Local Markets"
          message="Loading active local markets."
        />
      ) : error ? (
        <NetworkFailureState
          variant="card"
          message="Local Markets could not refresh. Please check your connection and try again."
          onRetry={() => setReloadKey((current) => current + 1)}
        />
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
        </div>
      )}
    </section>
  );
}

export default LocalMarkets;
