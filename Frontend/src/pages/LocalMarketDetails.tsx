import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiPackage, FiUsers } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import NetworkFailureState from "../components/NetworkFailureState";
import {
  MarketProductCard,
  MarketStoreCard,
} from "../components/MarketCards";
import {
  getLocalMarketById,
  type LocalMarketDetailsResponse,
} from "../services/market.service";

function LocalMarketDetails() {
  const { marketId = "" } = useParams();
  const [data, setData] = useState<LocalMarketDetailsResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setIsLoading(true);
    getLocalMarketById(marketId)
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
              : "Could not load this local market.",
          );
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [marketId, reloadKey]);

  if (isLoading) {
    return (
      <section className="market-shell-page">
        <LoadingState
          title="Loading local market"
          message="Loading products and sellers."
        />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="market-shell-page">
        <Link to="/market/local" className="market-back-link">
          <FiArrowLeft /> Back to Local Markets
        </Link>
        {error ? (
          <NetworkFailureState
            variant="card"
            message="This local market could not refresh. Please check your connection and try again."
            onRetry={() => setReloadKey((current) => current + 1)}
          />
        ) : (
          <div className="market-empty-state">
            <FiMapPin />
            <h2>Local market not found</h2>
            <Link to="/market/local">View markets</Link>
          </div>
        )}
      </section>
    );
  }

  const { market, products, sellers } = data;

  return (
    <section className="market-shell-page">
      <Link to="/market/local" className="market-back-link">
        <FiArrowLeft /> Back to Local Markets
      </Link>

      <h1 className="market-feed-title">{market.name}</h1>

      <section className="market-live-section product-feed-only">
        {products.length ? (
          <div className="market-live-grid">
            {products.map((product) => (
              <MarketProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="market-empty-state compact">
            <FiPackage />
            <h2>No products yet</h2>
          </div>
        )}
      </section>

      <section className="market-live-section product-feed-only">
        {sellers.length ? (
          <div className="market-live-grid">
            {sellers.map((store) => (
              <MarketStoreCard key={store.id} store={store} />
            ))}
          </div>
        ) : (
          <div className="market-empty-state compact">
            <FiUsers />
            <h2>No sellers connected yet</h2>
          </div>
        )}
      </section>
    </section>
  );
}

export default LocalMarketDetails;
