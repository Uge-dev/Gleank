import { apiRequest } from "../lib/api";
import type { CartItem } from "../context/CartContext";
import { resolveMediaUrl } from "../utils/media";

const cartFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function normalizeCartItems(items: CartItem[]) {
  return items.map((item) => ({
    ...item,
    image: resolveMediaUrl(item.image, cartFallback),
  }));
}

export async function getAccountCart() {
  const response = await apiRequest<{ cartItems: CartItem[] }>("/cart");
  return normalizeCartItems(response.cartItems);
}

export async function addAccountCartItem(productId: string, quantity = 1) {
  const response = await apiRequest<{ cartItems: CartItem[] }>("/cart/items", {
    method: "POST",
    body: JSON.stringify({ productId, quantity }),
  });
  return normalizeCartItems(response.cartItems);
}

export async function setAccountCartItemQuantity(productId: string, quantity: number) {
  const response = await apiRequest<{ cartItems: CartItem[] }>(
    `/cart/items/${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    },
  );
  return normalizeCartItems(response.cartItems);
}

export async function removeAccountCartItem(productId: string) {
  const response = await apiRequest<{ cartItems: CartItem[] }>(
    `/cart/items/${encodeURIComponent(productId)}`,
    { method: "DELETE" },
  );
  return normalizeCartItems(response.cartItems);
}

export async function clearAccountCart() {
  const response = await apiRequest<{ cartItems: CartItem[] }>("/cart", {
    method: "DELETE",
  });
  return normalizeCartItems(response.cartItems);
}

export async function mergeAccountCart(items: CartItem[]) {
  const response = await apiRequest<{ cartItems: CartItem[] }>("/cart/merge", {
    method: "POST",
    body: JSON.stringify({
      items: items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    }),
  });
  return normalizeCartItems(response.cartItems);
}
