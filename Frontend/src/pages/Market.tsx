import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiMapPin,
  FiPackage,
  FiSearch,
  FiShoppingBag,
  FiUsers,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import NetworkFailureState from "../components/NetworkFailureState";
import {
  MarketProductCard,
  UsedListingMarketCard,
} from "../components/MarketCards";
import { getMarketHub, type MarketHub } from "../services/market.service";

const marketplaceCards = [
  {
    title: "Used Market",
    path: "/used-market",
    icon: <FiPackage />,
    tone: "green",
  },
  {
    title: "Campus Market",
    path: "/market/campus",
    icon: <FiUsers />,
    tone: "dark",
  },
  {
    title: "Local Markets",
    path: "/market/local",
    icon: <FiShoppingBag />,
    tone: "orange",
  },
  {
    title: "Nearby Sellers",
    path: "/market/nearby",
    icon: <FiMapPin />,
    tone: "blue",
  },
];

function Market() {
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);
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
  }, [reloadKey]);

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
  const mixedFeed = useMemo(() => {
    if (!hub) return [];
    const seen = new Set<string>();
    const rows: Array<
      | { kind: "product"; id: string; product: NonNullable<MarketHub["popularNearYou"]>[number] }
      | { kind: "used"; id: string; listing: NonNullable<MarketHub["freshUsedListings"]>[number] }
    > = [];

    const pushProduct = (product: MarketHub["popularNearYou"][number]) => {
      const key = `product-${product.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ kind: "product", id: key, product });
    };

    const pushUsed = (listing: MarketHub["freshUsedListings"][number]) => {
      const key = `used-${listing.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ kind: "used", id: key, listing });
    };

    hub.popularNearYou.forEach(pushProduct);
    hub.trendingCampusProducts.forEach(pushProduct);
    hub.fastDeliveryProducts.forEach(pushProduct);
    hub.freshUsedListings.forEach(pushUsed);

    return rows;
  }, [hub]);
  const discoveryTags = useMemo(() => {
    if (!hub) return [];
    const tags = new Set<string>();
    hub.localMarkets.forEach((market) => tags.add(market.name));
    hub.nearbySellers.forEach((store) => {
      if (store.nearestCampus) tags.add(store.nearestCampus);
      if (store.nearestMarketplace) tags.add(store.nearestMarketplace);
    });
    return [...tags].filter(Boolean).slice(0, 16);
  }, [hub]);

  if (isLoading) {
    return (
      <section className="market-hub-page">
        <LoadingState
          title="Loading Market"
          message="Loading products and listings."
        />
      </section>
    );
  }

  return (
    <section className="market-hub-page">
      <div className="market-sticky-tools">
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

        <div className="market-entry-grid compact">
          {liveCards.map((card) => (
            <Link
              className={`market-entry-card tone-${card.tone}`}
              key={card.title}
              to={card.path}
            >
              <div className="market-entry-icon">{card.icon}</div>
              <div>
                <h2>{card.title}</h2>
                <small className="market-card-count">{card.count.toLocaleString()}</small>
              </div>
            </Link>
          ))}
        </div>

        {discoveryTags.length > 0 ? (
          <div className="market-discovery-tags" aria-label="Popular campuses and marketplaces">
            {discoveryTags.map((tag) => (
              <Link key={tag} to={`/market/search?q=${encodeURIComponent(tag)}`}>
                <FiMapPin /> {tag}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {error && !hub ? (
        <NetworkFailureState
          variant="card"
          message="The Market feed could not refresh. Please check your connection and try again."
          onRetry={() => setReloadKey((current) => current + 1)}
        />
      ) : hub ? (
        <section className="market-live-section product-feed-only">
          {mixedFeed.length ? (
            <div className="market-live-grid">
              {mixedFeed.map((item) =>
                item.kind === "product" ? (
                  <MarketProductCard key={item.id} product={item.product} />
                ) : (
                  <UsedListingMarketCard key={item.id} listing={item.listing} />
                ),
              )}
            </div>
          ) : (
            <div className="market-empty-state compact">
              <FiPackage />
              <h2>No products yet</h2>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

export default Market;
