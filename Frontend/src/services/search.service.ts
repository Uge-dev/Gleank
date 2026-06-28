import { apiRequest } from "../lib/api";
import type { SearchResults } from "../types/domain";

export function searchMarketplace(query: string) {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set("q", query.trim());
  }

  const suffix = params.size ? `?${params.toString()}` : "";
  return apiRequest<SearchResults>(`/stores${suffix}`);
}
