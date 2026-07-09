import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiPackage, FiShoppingBag, FiUsers } from "react-icons/fi";
import LoadingState from "../components/LoadingState";
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
  }, [marketId]);

  if (isLoading) {
    return (
      <section className="market-shell-page">
        <LoadingState
          title="Loading local market"
          message="Checking approved sellers and active products."
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
        <div className="market-empty-state">
          <FiMapPin />
          <h2>Local market not found</h2>
          <p>{error || "This market is not active or does not exist."}</p>
          <Link to="/market/local">View approved markets</Link>
        </div>
      </section>
    );
  }

  const { market, products, sellers, categories } = data;

  return (
    <section className="market-shell-page">
      <Link to="/market/local" className="market-back-link">
        <FiArrowLeft /> Back to Local Markets
      </Link>

      <header className="market-shell-hero local">
        <span>Local Market</span>
        <h1>{market.name}</h1>
        <p>
          {market.description ||
            "Approved physical market with seller pickup and rider-delivery readiness."}
        </p>
        <small>
          {[market.area, market.city, market.state].filter(Boolean).join(", ") ||
            market.address ||
            "Gleenc local market"}
        </small>
      </header>

      <div className="market-shell-grid">
        <article className="market-shell-card">
          <FiUsers />
          <h2>{market.counts.sellers} sellers</h2>
          <p>Only approved seller-market connections appear publicly here.</p>
        </article>
        <article className="market-shell-card">
          <FiPackage />
          <h2>{market.counts.products} products</h2>
          <p>Products reuse the same seller/store inventory logic.</p>
        </article>
        <article className="market-shell-card">
          <FiShoppingBag />
          <h2>{categories.length} categories</h2>
          <p>{market.deliveryNote || "Delivery/rider note can be managed by admin later."}</p>
        </article>
      </div>

      {market.allowedCategories.length > 0 && (
        <div className="market-category-pills">
          {market.allowedCategories.map((category) => (
            <span key={category}>{category}</span>
          ))}
        </div>
      )}

      <section className="market-live-section">
        <div className="market-section-head compact">
          <div>
            <span>Products</span>
            <h2>Active products in {market.name}</h2>
          </div>
        </div>
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
            <p>Products will appear after sellers are attached and approved for this market.</p>
          </div>
        )}
      </section>

      <section className="market-live-section">
        <div className="market-section-head compact">
          <div>
            <span>Sellers</span>
            <h2>Approved sellers in this market</h2>
          </div>
        </div>
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
            <p>Admin can connect sellers to this market in a later management flow.</p>
          </div>
        )}
      </section>
    </section>
  );
}

export default LocalMarketDetails;
