import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import {
  getSavedItems,
  removeSavedItem,
  saveItem,
} from "../services/saved.service";
import type { SavedItem, SavedItemType } from "../types/domain";

type SavedContextValue = {
  savedItems: SavedItem[];
  isLoading: boolean;
  error: string;
  isSaved: (itemType: SavedItemType, itemId: string) => boolean;
  toggleSaved: (
    itemType: SavedItemType,
    itemId: string,
  ) => Promise<boolean>;
  refreshSaved: () => Promise<void>;
};

const SavedContext = createContext<SavedContextValue | null>(null);

function itemKey(itemType: SavedItemType, itemId: string) {
  return `${itemType}:${itemId}`;
}

export function SavedProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshSaved = useCallback(async () => {
    if (!isAuthenticated) {
      setSavedItems([]);
      setError("");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await getSavedItems();
      setSavedItems(response.savedItems);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Saved items could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading) void refreshSaved();
  }, [authLoading, refreshSaved]);

  const savedKeys = useMemo(
    () =>
      new Set(
        savedItems.map((item) => itemKey(item.itemType, item.itemId)),
      ),
    [savedItems],
  );

  const value = useMemo<SavedContextValue>(
    () => ({
      savedItems,
      isLoading,
      error,
      isSaved(itemType, itemId) {
        return savedKeys.has(itemKey(itemType, itemId));
      },
      async toggleSaved(itemType, itemId) {
        const key = itemKey(itemType, itemId);
        const currentlySaved = savedKeys.has(key);
        setError("");

        try {
          if (currentlySaved) {
            await removeSavedItem(itemType, itemId);
            setSavedItems((current) =>
              current.filter(
                (item) =>
                  itemKey(item.itemType, item.itemId) !== key,
              ),
            );
            return false;
          }

          const response = await saveItem(itemType, itemId);
          setSavedItems((current) => [
            response.savedItem,
            ...current.filter(
              (item) => itemKey(item.itemType, item.itemId) !== key,
            ),
          ]);
          return true;
        } catch (requestError) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The saved item could not be updated.",
          );
          throw requestError;
        }
      },
      refreshSaved,
    }),
    [error, isLoading, refreshSaved, savedItems, savedKeys],
  );

  return (
    <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
  );
}

export function useSaved() {
  const context = useContext(SavedContext);
  if (!context) {
    throw new Error("useSaved must be used inside SavedProvider");
  }
  return context;
}
