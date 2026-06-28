import { apiRequest } from "../lib/api";
import type { SavedItem, SavedItemType } from "../types/domain";

export function getSavedItems() {
  return apiRequest<{ savedItems: SavedItem[] }>("/saved");
}

export function saveItem(itemType: SavedItemType, itemId: string) {
  return apiRequest<{ savedItem: SavedItem }>("/saved", {
    method: "POST",
    body: JSON.stringify({ itemType, itemId }),
  });
}

export function removeSavedItem(itemType: SavedItemType, itemId: string) {
  return apiRequest<void>(
    `/saved/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
}
