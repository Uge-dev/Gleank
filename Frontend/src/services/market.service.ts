import { apiRequest } from "../lib/api";
import type {
  SearchStore,
  SellerProduct,
  StoreInteraction,
  UsedListing,
} from "../types/domain";

export type MarketCategory = {
  key: string;
  name: string;
  marketCount: number;
  productCount: number;
  listingCount: number;
  sources: string[];
};

export type LocalMarket = {
  id: string;
  name: string;
  slug: string;
  description: string;
  state: string;
  city: string;
  area: string;
  address: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  status: "pending" | "active" | "disabled";
  allowedCategories: string[];
  coverUrl: string | null;
  iconUrl: string | null;
  deliveryNote: string;
  counts: {
    sellers: number;
    products: number;
    services: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type MarketProduct = SellerProduct & {
  distanceKm?: number | null;
  storeName: string;
  storeSlug: string;
  storeCampus: string;
  store?: {
    id: string;
    slug: string;
    name: string;
    campus: string;
    category: string;
    logoUrl: string | null;
    coverUrl: string | null;
    verified: boolean;
    sellerType?: "used_market" | "campus" | "local_market";
    marketId?: string | null;
  };
  interaction?: {
    likeCount: number;
    commentCount: number;
    saveCount: number;
    shareCount: number;
    viewCount: number;
    liked: boolean;
  };
  metrics?: {
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    views: number;
  };
};

export type MarketStore = SearchStore & {
  distanceKm?: number | null;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  counts?: {
    products: number;
    services: number;
  };
  marketProfile?: {
    id: string;
    marketId: string;
    stallNumber: string;
    addressNote: string;
    shopSection?: string;
    marketLandmark?: string;
    pickupPoint?: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  interaction: StoreInteraction;
};

export type MarketHub = {
  stats: {
    products: number;
    stores: number;
    usedListings: number;
    localMarkets: number;
  };
  localMarkets: LocalMarket[];
  categories: MarketCategory[];
  popularNearYou: MarketProduct[];
  trendingCampusProducts: MarketProduct[];
  freshUsedListings: UsedListing[];
  nearbySellers: MarketStore[];
  fastDeliveryProducts: MarketProduct[];
};

export type CampusMarketResponse = {
  campus: string;
  stores: MarketStore[];
  products: MarketProduct[];
  categories: MarketCategory[];
};

export type LocalMarketDetailsResponse = {
  market: LocalMarket;
  sellers: MarketStore[];
  products: MarketProduct[];
  categories: MarketCategory[];
};

export type NearbySellersResponse = {
  locationMode: string;
  selectedCampus: string;
  note: string;
  originCapturedAt?: string | null;
  sellers: MarketStore[];
  products: MarketProduct[];
};

export type MarketSearchResponse = {
  query: string;
  type: string;
  products: MarketProduct[];
  stores: MarketStore[];
  usedListings: UsedListing[];
  localMarkets: LocalMarket[];
  counts: {
    products: number;
    stores: number;
    usedListings: number;
    localMarkets: number;
  };
};

function queryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const cleaned = String(value || "").trim();
    if (cleaned) search.set(key, cleaned);
  });

  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

export function getMarketHub(campus?: string) {
  return apiRequest<{ hub: MarketHub }>(
    `/market/hub${queryString({ campus })}`,
  );
}

export function getUsedMarket(params: { q?: string; category?: string } = {}) {
  return apiRequest<{
    listings: UsedListing[];
    categories: MarketCategory[];
  }>(`/market/used${queryString(params)}`);
}

export function getCampusMarket(params: { q?: string; campus?: string } = {}) {
  return apiRequest<CampusMarketResponse>(
    `/market/campus${queryString(params)}`,
  );
}

export function getLocalMarkets(params: { q?: string } = {}) {
  return apiRequest<{ markets: LocalMarket[] }>(
    `/market/local${queryString(params)}`,
  );
}

export function getLocalMarketById(marketId: string) {
  return apiRequest<LocalMarketDetailsResponse>(
    `/market/local/${encodeURIComponent(marketId)}`,
  );
}

export function getNearbySellers(params: { q?: string; campus?: string } = {}) {
  return apiRequest<NearbySellersResponse>(
    `/market/nearby${queryString(params)}`,
  );
}

export function searchMarket(params: {
  q?: string;
  type?: string;
  campus?: string;
} = {}) {
  return apiRequest<MarketSearchResponse>(
    `/market/search${queryString(params)}`,
  );
}

export function getMarketCategories() {
  return apiRequest<{ categories: MarketCategory[] }>("/market/categories");
}
