import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import {
  addAccountCartItem,
  clearAccountCart,
  getAccountCart,
  mergeAccountCart,
  removeAccountCartItem,
  setAccountCartItemQuantity,
} from "../services/cart.service";

export type CartItem = {
  id: string;
  name: string;
  price: string;
  numericPrice: number;
  image: string;
  sellerName: string;
  sellerId: string;
  campus: string;
  category?: string;
  quantity: number;
};

type AddToCartItem = Omit<CartItem, "quantity"> & {
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
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const CART_STORAGE_KEY = "gleank-cart";

function getStoredCart(): CartItem[] {
  try {
    const storedCart = localStorage.getItem(CART_STORAGE_KEY);

    if (!storedCart) return [];

    const parsedCart = JSON.parse(storedCart);

    if (!Array.isArray(parsedCart)) return [];

    return parsedCart;
  } catch {
    return [];
  }
}

type CartProviderProps = {
  children: ReactNode;
};

export function CartProvider({ children }: CartProviderProps) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [hasHydratedCart, setHasHydratedCart] = useState(false);

  useEffect(() => {
    setCartItems(getStoredCart());
  }, []);

  useEffect(() => {
    if (!hasHydratedCart || isAuthenticated) return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems, hasHydratedCart, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    async function hydrateAccountCart() {
      if (!isAuthenticated || !user) {
        setCartItems(getStoredCart());
        setHasHydratedCart(true);
        return;
      }

      const localCart = getStoredCart();

      try {
        const nextCart = localCart.length
          ? await mergeAccountCart(localCart)
          : await getAccountCart();

        if (!active) return;

        localStorage.removeItem(CART_STORAGE_KEY);
        setCartItems(nextCart);
      } catch {
        if (!active) return;
        setCartItems(localCart);
      } finally {
        if (active) setHasHydratedCart(true);
      }
    }

    setHasHydratedCart(false);
    void hydrateAccountCart();

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, user?.id, user]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      return total + item.numericPrice * item.quantity;
    }, 0);
  }, [cartItems]);

  function openCartDrawer() {
    setCartDrawerOpen(true);
  }

  function closeCartDrawer() {
    setCartDrawerOpen(false);
  }

  function addToCart(item: AddToCartItem) {
    const quantity = item.quantity || 1;

    setCartItems((currentItems) => {
      const existingItem = currentItems.find(
        (cartItem) => cartItem.id === item.id
      );

      if (existingItem) {
        return currentItems.map((cartItem) => {
          if (cartItem.id !== item.id) return cartItem;

          return {
            ...cartItem,
            quantity: cartItem.quantity + quantity,
          };
        });
      }

      return [
        ...currentItems,
        {
          ...item,
          quantity,
        },
      ];
    });

    if (isAuthenticated) {
      void addAccountCartItem(item.id, quantity)
        .then(setCartItems)
        .catch(() => {
          // Keep optimistic cart visible if the network fails.
        });
    }

    setCartDrawerOpen(true);
  }

  function increaseQuantity(id: string) {
    let nextQuantity = 1;
    setCartItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) return item;

        nextQuantity = item.quantity + 1;
        return {
          ...item,
          quantity: nextQuantity,
        };
      })
    );

    if (isAuthenticated) {
      void setAccountCartItemQuantity(id, nextQuantity)
        .then(setCartItems)
        .catch(() => undefined);
    }
  }

  function decreaseQuantity(id: string) {
    let nextQuantity = 1;
    setCartItems((currentItems) =>
      currentItems
        .map((item) => {
          if (item.id !== id) return item;

          nextQuantity = Math.max(1, item.quantity - 1);
          return {
            ...item,
            quantity: nextQuantity,
          };
        })
        .filter((item) => item.quantity > 0)
    );

    if (isAuthenticated) {
      void setAccountCartItemQuantity(id, nextQuantity)
        .then(setCartItems)
        .catch(() => undefined);
    }
  }

  function removeFromCart(id: string) {
    setCartItems((currentItems) =>
      currentItems.filter((item) => item.id !== id)
    );

    if (isAuthenticated) {
      void removeAccountCartItem(id)
        .then(setCartItems)
        .catch(() => undefined);
    }
  }

  function clearCart() {
    setCartItems([]);
    if (isAuthenticated) {
      void clearAccountCart()
        .then(setCartItems)
        .catch(() => undefined);
    }
  }

  return (
    <CartContext.Provider
      value={{
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
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
