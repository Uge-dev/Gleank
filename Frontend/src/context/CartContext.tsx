import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type CartItem = {
  id: string;
  name: string;
  price: string;
  numericPrice: number;
  image: string;
  sellerName: string;
  sellerId: string;
  campus: string;
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
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  useEffect(() => {
    setCartItems(getStoredCart());
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

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
    setCartItems((currentItems) => {
      const existingItem = currentItems.find(
        (cartItem) => cartItem.id === item.id
      );

      if (existingItem) {
        return currentItems.map((cartItem) => {
          if (cartItem.id !== item.id) return cartItem;

          return {
            ...cartItem,
            quantity: cartItem.quantity + (item.quantity || 1),
          };
        });
      }

      return [
        ...currentItems,
        {
          ...item,
          quantity: item.quantity || 1,
        },
      ];
    });

    setCartDrawerOpen(true);
  }

  function increaseQuantity(id: string) {
    setCartItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) return item;

        return {
          ...item,
          quantity: item.quantity + 1,
        };
      })
    );
  }

  function decreaseQuantity(id: string) {
    setCartItems((currentItems) =>
      currentItems
        .map((item) => {
          if (item.id !== id) return item;

          return {
            ...item,
            quantity: Math.max(1, item.quantity - 1),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(id: string) {
    setCartItems((currentItems) =>
      currentItems.filter((item) => item.id !== id)
    );
  }

  function clearCart() {
    setCartItems([]);
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