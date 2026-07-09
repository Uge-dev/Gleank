import { Link } from "react-router-dom";
import { FiArrowRight, FiMapPin, FiPackage, FiShoppingBag, FiUsers } from "react-icons/fi";
import { apiUrl } from "../lib/api";
import type {
  LocalMarket,
  MarketProduct,
  MarketStore,
} from "../services/market.service";
import type { UsedListing } from "../types/domain";

function formatNaira(value: number | undefined) {
  return `₦${Number(value || 0).toLocaleString("en-NG")}`;
}

function firstImage(images?: string[] | null) {
  const image = images?.find(Boolean);
  return image ? apiUrl(image) : "";
}

function initials(value: string) {
  return String(value || "G")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function MarketProductCard({ product }: { product: MarketProduct }) {
  const image = firstImage(product.imageUrls);

  return (
    <Link to={`/products/${product.id}`} className="market-live-card product">
      <div className="market-live-image">
        {image ? <img src={image} alt={product.name} /> : <FiPackage />}
        <span>{product.category}</span>
      </div>

      <div className="market-live-body">
        <h3>{product.name}</h3>
        <p>
          {product.storeName || product.store?.name || "Seller"} •{" "}
          {product.storeCampus || product.store?.campus || "Gleenc"}
        </p>
        <div className="market-live-meta">
          <strong>{formatNaira(product.price)}</strong>
          <small>{product.metrics?.views || product.interaction?.viewCount || 0} views</small>
        </div>
      </div>
    </Link>
  );
}

export function MarketStoreCard({ store }: { store: MarketStore }) {
  const cover = store.coverUrl ? apiUrl(store.coverUrl) : "";
  const logo = store.logoUrl ? apiUrl(store.logoUrl) : "";

  return (
    <Link to={`/stores/${store.slug || store.id}`} className="market-live-card store">
      <div className="market-live-store-cover">
        {cover ? <img src={cover} alt={store.name} /> : <FiShoppingBag />}
      </div>

      <div className="market-live-store-row">
        <div className="market-live-avatar">
          {logo ? <img src={logo} alt={store.name} /> : initials(store.name)}
        </div>
        <div>
          <h3>{store.name}</h3>
          <p>
            {store.category} • {store.campus || "Gleenc"}
          </p>
        </div>
      </div>

      <div className="market-live-meta">
        <span>
          <FiUsers /> {store.interaction?.followerCount || 0}
        </span>
        <span>
          <FiPackage /> {store.counts?.products || 0}
        </span>
      </div>
    </Link>
  );
}

export function LocalMarketCard({ market }: { market: LocalMarket }) {
  const image = market.coverUrl ? apiUrl(market.coverUrl) : "";

  return (
    <Link to={`/market/local/${market.slug || market.id}`} className="market-live-card local-market">
      <div className="market-live-image">
        {image ? <img src={image} alt={market.name} /> : <FiMapPin />}
        <span>{market.status}</span>
      </div>

      <div className="market-live-body">
        <h3>{market.name}</h3>
        <p>
          {[market.area, market.city, market.state].filter(Boolean).join(", ") ||
            market.address ||
            "Approved local market"}
        </p>
        <div className="market-live-meta">
          <span>{market.counts.sellers} sellers</span>
          <span>{market.counts.products} products</span>
        </div>
      </div>
    </Link>
  );
}

export function UsedListingMarketCard({ listing }: { listing: UsedListing }) {
  const image = firstImage(listing.imageUrls);

  return (
    <Link to={`/used-market/${listing.id}`} className="market-live-card used">
      <div className="market-live-image">
        {image ? <img src={image} alt={listing.name} /> : <FiPackage />}
        <span>{listing.condition}</span>
      </div>

      <div className="market-live-body">
        <h3>{listing.name}</h3>
        <p>
          {listing.category} • {listing.campus || listing.pickupLocation || "Used Market"}
        </p>
        <div className="market-live-meta">
          <strong>{formatNaira(listing.price)}</strong>
          <small>
            View <FiArrowRight />
          </small>
        </div>
      </div>
    </Link>
  );
}
