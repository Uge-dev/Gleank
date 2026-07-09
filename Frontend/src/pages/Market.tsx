import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiArrowRight,
  FiClock,
  FiMapPin,
  FiPackage,
  FiSearch,
  FiShoppingBag,
  FiStar,
  FiTrendingUp,
  FiTruck,
  FiUsers,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import {
  LocalMarketCard,
  MarketProductCard,
  MarketStoreCard,
  UsedListingMarketCard,
} from "../components/MarketCards";
import { getMarketHub, type MarketHub } from "../services/market.service";

const marketplaceCards = [
  {
    title: "Used Market",
    description: "Fairly-used and pre-owned products with trust checks before buyers commit.",
    path: "/used-market",
    icon: <FiPackage />,
    cta: "Browse used listings",
    tone: "green",
  },
  {
    title: "Campus Market",
    description: "Products from campus sellers, student entrepreneurs, and verified campus stores.",
    path: "/market/campus",
    icon: <FiUsers />,
    cta: "Explore campus sellers",
    tone: "dark",
  },
  {
    title: "Local Markets",
    description: "Order from approved physical markets like Igbudu, Ugbomro, Jakpa, and more.",
    path: "/market/local",
    icon: <FiShoppingBag />,
    cta: "Choose a local market",
    tone: "orange",
  },
  {
    title: "Nearby Sellers",
    description: "Discover sellers close to your selected delivery location for faster fulfilment.",
    path: "/market/nearby",
    icon: <FiMapPin />,
    cta: "Find nearby sellers",
    tone: "blue",
  },
];

const smartSections = [
  {
    title: "Popular near you",
    description: "Fast-moving products around your selected location will appear here.",
    icon: <FiStar />,
  },
  {
    title: "Trending in Campus Market",
    description: "Campus products with strong saves, views, orders, and engagement.",
    icon: <FiTrendingUp />,
  },
  {
    title: "Fresh listings in Used Market",
    description: "Recently approved pre-owned items with ownership and seller checks.",
    icon: <FiPackage />,
  },
  {
    title: "Top sellers in Local Markets",
    description: "Market sellers ranked by completion rate, response speed, and availability.",
    icon: <FiShoppingBag />,
  },
  {
    title: "Fast delivery around you",
    description: "Nearby sellers and markets with active rider coverage for quick delivery.",
    icon: <FiTruck />,
  },
];

function MarketPreviewSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="market-live-section">
      <div className="market-section-head compact">
        <div>
          <span>Live section</span>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function Market() {
  const navigate = useNavigate();
  const [hub, setHub] = useState<MarketHub | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    getMarketHub()
      .then((response) => {
        if (alive) {
          setHub(response.hub);
          setError("");
        }
      })
      .catch((requestError) => {
        if (alive) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load the Market hub right now.",
          );
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const liveCards = useMemo(
    () =>
      marketplaceCards.map((card) => {
        const count =
          card.path === "/used-market"
            ? hub?.stats.usedListings
            : card.path === "/market/campus"
              ? hub?.stats.products
              : card.path === "/market/local"
                ? hub?.stats.localMarkets
                : hub?.stats.stores;

        return {
          ...card,
          count: count || 0,
        };
      }),
    [hub],
  );

  if (isLoading) {
    return (
      <section className="market-hub-page">
        <LoadingState
          title="Loading Market"
          message="Connecting campus products, used listings, local markets, and nearby sellers."
        />
      </section>
    );
  }

  return (
    <section className="market-hub-page">
      <header className="market-hub-hero">
        <div>
          <span className="market-hub-eyebrow">Gleenc marketplace hub</span>
          <h1>Market</h1>
          <p>
            Shop from campuses, local markets, nearby sellers, and fairly-used listings.
          </p>
        </div>

        <div className="market-hub-fast-card">
          <FiClock />
          <strong>Built for fast local commerce</strong>
          <span>
            {hub
              ? `${hub.stats.products} products • ${hub.stats.stores} active stores • ${hub.stats.usedListings} used listings`
              : "Campus-first today. Local-market ready for the next stage."}
          </span>
        </div>
      </header>

      {error && (
        <div className="market-inline-alert">
          <strong>Market API note</strong>
          <span>{error}</span>
        </div>
      )}

      <form
        className="market-hub-search"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const query = String(form.get("marketSearch") || "").trim();
          navigate(
            query
              ? `/market/search?q=${encodeURIComponent(query)}`
              : "/market/search",
          );
        }}
      >
        <FiSearch />
        <input
          name="marketSearch"
          placeholder="Search products, sellers, campuses, or markets"
          type="search"
        />
        <button type="submit">Search</button>
      </form>

      <div className="market-entry-grid">
        {liveCards.map((card) => (
          <Link
            className={`market-entry-card tone-${card.tone}`}
            key={card.title}
            to={card.path}
          >
            <div className="market-entry-icon">{card.icon}</div>
            <div>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
              <small className="market-card-count">{card.count.toLocaleString()} live now</small>
              <span>
                {card.cta}
                <FiArrowRight />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <section className="market-smart-section">
        <div className="market-section-head">
          <div>
            <span>Smart discovery</span>
            <h2>What the Market hub will surface</h2>
          </div>
          <p>
            These sections now read from the live Market API while staying ready for rider coverage,
            location, and deeper marketplace ranking logic.
          </p>
        </div>

        <div className="market-smart-grid">
          {smartSections.map((section) => (
            <article key={section.title} className="market-smart-card">
              <div>{section.icon}</div>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </article>
          ))}
        </div>
      </section>

      {hub && (
        <>
          <MarketPreviewSection
            title="Popular near you"
            description="Products ranked with campus priority and engagement signals."
          >
            {hub.popularNearYou.length ? (
              <div className="market-live-grid">
                {hub.popularNearYou.slice(0, 4).map((product) => (
                  <MarketProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="market-empty-state compact">
                <FiPackage />
                <h2>No products yet</h2>
                <p>Published products from active sellers will appear here.</p>
              </div>
            )}
          </MarketPreviewSection>

          <MarketPreviewSection
            title="Fresh listings in Used Market"
            description="Recently approved pre-owned products from the existing Used Market flow."
          >
            {hub.freshUsedListings.length ? (
              <div className="market-live-grid">
                {hub.freshUsedListings.slice(0, 4).map((listing) => (
                  <UsedListingMarketCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="market-empty-state compact">
                <FiPackage />
                <h2>No used listings yet</h2>
                <p>Approved Used Market listings will appear here.</p>
              </div>
            )}
          </MarketPreviewSection>

          <MarketPreviewSection
            title="Approved Local Markets"
            description="Admin-created markets only appear publicly when their status is active."
          >
            {hub.localMarkets.length ? (
              <div className="market-live-grid">
                {hub.localMarkets.slice(0, 4).map((market) => (
                  <LocalMarketCard key={market.id} market={market} />
                ))}
              </div>
            ) : (
              <div className="market-empty-state compact">
                <FiShoppingBag />
                <h2>No active local markets yet</h2>
                <p>Create and activate markets from admin when you are ready.</p>
              </div>
            )}
          </MarketPreviewSection>

          <MarketPreviewSection
            title="Nearby sellers"
            description="Currently campus-prioritized, ready for map-distance ranking later."
          >
            {hub.nearbySellers.length ? (
              <div className="market-live-grid">
                {hub.nearbySellers.slice(0, 4).map((store) => (
                  <MarketStoreCard key={store.id} store={store} />
                ))}
              </div>
            ) : (
              <div className="market-empty-state compact">
                <FiUsers />
                <h2>No active stores yet</h2>
                <p>Active seller stores will appear here.</p>
              </div>
            )}
          </MarketPreviewSection>
        </>
      )}
    </section>
  );
}

export default Market;
