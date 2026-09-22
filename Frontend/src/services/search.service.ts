import { apiRequest } from "../lib/api";
import type { SearchResults } from "../types/domain";

export function searchMarketplace(query: string, sort?: 'latest') {
  const params = new URLSearchParams();
  if(sort) params.set('sort',sort);

  if (query.trim()) {
    params.set("q", query.trim());
  }

  const suffix = params.size ? `?${params.toString()}` : "";
  return apiRequest<SearchResults>(`/stores${suffix}`);
}
