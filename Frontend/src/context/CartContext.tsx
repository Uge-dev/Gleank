import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export type CartItem = {
  id: string;
  itemType: "product" | "used_listing";
  name: string;
  price: string;
  numericPrice: number;
  image: string;
  sellerName: string;
  sellerId: string;
  campus: string;
  category?: string;
  availableSizes?: string[];
  selectedSize?: string;
  deliveryReadinessLabel?: string;
  stock?: number;
  quantity: number;
  detailsPath?: string;
};

type AddToCartItem = Omit<CartItem, "quantity" | "itemType"> & {
  itemType?: "product" | "used_listing";
  quantity?: number;
};

type CartContextValue = {
  cartItems: CartItem[];
  cartCount: number;
  cartSubtotal: number;
  cartDrawerOpen: boolean;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
  addToCart: (item: AddToCartItem) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  removeFromCart: (id: string) => void;
  removeCartProducts: (ids: string[]) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const LEGACY_USER_KEY = "gleank_user";
const OLD_GLOBAL_CART_KEY = "gleank-cart";
const CART_KEY_PREFIX = "gleank-cart";

function readCurrentUserId() {
  try {
    const storedUser = localStorage.getItem(LEGACY_USER_KEY);
    if (!storedUser) return "";

    const user = JSON.parse(storedUser) as { id?: string; isLoggedIn?: boolean };
    if (!user?.id || user.isLoggedIn === false) return "";

    return String(user.id);
  } catch {
    return "";
  }
}

function cartStorageKey(userId: string) {
  return `${CART_KEY_PREFIX}:${userId}`;
}

function parseCart(value: string | null): CartItem[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object" && item.itemType !== "used_listing")
      .map((item) => ({
        id: String(item.id || ""),
        itemType:
          item.itemType === "used_listing"
            ? ("used_listing" as const)
            : ("product" as const),
        name: String(item.name || ""),
        price: String(item.price || ""),
        numericPrice: Number(item.numericPrice || 0),
        image: String(item.image || ""),
        sellerName: String(item.sellerName || ""),
        sellerId: String(item.sellerId || ""),
        campus: String(item.campus || ""),
        category: item.category ? String(item.category) : undefined,
        availableSizes: Array.isArray(item.availableSizes)
          ? item.availableSizes.map((size: unknown) => String(size || "")).filter(Boolean)
          : undefined,
        selectedSize: item.selectedSize ? String(item.selectedSize) : undefined,
        deliveryReadinessLabel: item.deliveryReadinessLabel
          ? String(item.deliveryReadinessLabel)
          : undefined,
        stock:
          Number.isFinite(Number(item.stock)) && Number(item.stock) >= 0
            ? Number(item.stock)
            : undefined,
        quantity: Math.max(1, Number(item.quantity || 1)),
        detailsPath: item.detailsPath ? String(item.detailsPath) : undefined,
      }))
      .filter((item) => item.id && item.name && item.sellerId);
  } catch {
    return [];
  }
}

function loadCartForUser(userId: string) {
  if (!userId) return [];
  return parseCart(localStorage.getItem(cartStorageKey(userId)));
}

type CartProviderProps = {
  children: ReactNode;
};

export function CartProvider({ children }: CartProviderProps) {
  const [currentUserId, setCurrentUserId] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const hasHydratedRef = useRef(false);

  const hydrateCart = useCallback(() => {
    const userId = readCurrentUserId();

    setCurrentUserId(userId);
    setCartItems(loadCartForUser(userId));

    if (!userId) {
      setCartDrawerOpen(false);
      localStorage.removeItem(OLD_GLOBAL_CART_KEY);
    }
  }, []);

  useEffect(() => {
    hydrateCart();
    hasHydratedRef.current = true;

    function handleStorage(event: StorageEvent) {
      if (
        event.key === LEGACY_USER_KEY ||
        event.key === OLD_GLOBAL_CART_KEY ||
        (event.key || "").startsWith(`${CART_KEY_PREFIX}:`)
      ) {
        hydrateCart();
      }
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("gleank-auth-change", hydrateCart);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("gleank-auth-change", hydrateCart);
    };
  }, [hydrateCart]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;

    if (!currentUserId) {
      localStorage.removeItem(OLD_GLOBAL_CART_KEY);
      return;
    }

    localStorage.setItem(cartStorageKey(currentUserId), JSON.stringify(cartItems));
  }, [cartItems, currentUserId]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      return total + item.numericPrice * item.quantity;
    }, 0);
  }, [cartItems]);

  function openCartDrawer() {
    if (!currentUserId) {
      setCartDrawerOpen(false);
      return;
    }

    setCartDrawerOpen(true);
  }

  function closeCartDrawer() {
    setCartDrawerOpen(false);
  }

  function addToCart(item: AddToCartItem) {
    if (item.itemType === "used_listing") return;
    if (!currentUserId) {
      window.dispatchEvent(new Event("gleank-cart-auth-required"));
      return;
    }

    setCartItems((currentItems) => {
      const incomingItemType =
        item.itemType === "used_listing" ? "used_listing" : "product";
      const incomingStock =
        item.stock !== undefined && Number.isFinite(Number(item.stock))
          ? Math.max(0, Number(item.stock))
          : undefined;
      const incomingQuantity = Math.max(1, Number(item.quantity || 1));

      if (incomingStock !== undefined && incomingStock <= 0) {
        return currentItems;
      }

      const existingItem = currentItems.find(
        (cartItem) =>
          cartItem.id === item.id &&
          cartItem.itemType === incomingItemType,
      );

      if (existingItem) {
        return currentItems.map((cartItem) => {
          if (
            cartItem.id !== item.id ||
            cartItem.itemType !== incomingItemType
          ) {
            return cartItem;
          }

          return {
            ...cartItem,
            stock: incomingStock ?? cartItem.stock,
            deliveryReadinessLabel:
              item.deliveryReadinessLabel || cartItem.deliveryReadinessLabel,
            availableSizes: item.availableSizes ?? cartItem.availableSizes,
            selectedSize: item.selectedSize || cartItem.selectedSize,
            quantity: cartItem.quantity + incomingQuantity,
          };
        });
      }

      return [
        ...currentItems,
        {
          ...item,
          itemType: incomingItemType,
          stock: incomingStock,
          quantity: incomingQuantity,
        },
      ];
    });

    setCartDrawerOpen(true);
  }

  function increaseQuantity(id: string) {
    if (!currentUserId) return;

    setCartItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) return item;

        return {
          ...item,
          quantity: item.quantity + 1,
        };
      }),
    );
  }

  function decreaseQuantity(id: string) {
    if (!currentUserId) return;

    setCartItems((currentItems) =>
      currentItems
        .map((item) => {
          if (item.id !== id) return item;

          return {
            ...item,
            quantity: Math.max(1, item.quantity - 1),
          };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function removeFromCart(id: string) {
    if (!currentUserId) return;

    setCartItems((currentItems) =>
      currentItems.filter((item) => item.id !== id),
    );
  }

  function removeCartProducts(ids: string[]) {
    if (!currentUserId) return;

    const productIds = new Set(
      ids.map((id) => String(id || "").trim()).filter(Boolean),
    );

    if (!productIds.size) return;

    setCartItems((currentItems) =>
      currentItems.filter((item) => !productIds.has(item.id)),
    );
  }

  function clearCart() {
    setCartItems([]);

    if (currentUserId) {
      localStorage.removeItem(cartStorageKey(currentUserId));
    }

    localStorage.removeItem(OLD_GLOBAL_CART_KEY);
  }

  const value = {
    cartItems,
    cartCount,
    cartSubtotal,
    cartDrawerOpen,
    openCartDrawer,
    closeCartDrawer,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    removeCartProducts,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
