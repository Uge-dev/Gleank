import { Link } from "react-router-dom";
import {
  FiArrowRight,
  FiLock,
  FiMinus,
  FiPlus,
  FiShoppingCart,
  FiTrash2,
} from "react-icons/fi";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../context/AuthContext";
import { useCart, type CartItem } from "../context/CartContext";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function cartStockState(item: CartItem) {
  const stockLimit =
    item.stock !== undefined && Number.isFinite(Number(item.stock))
      ? Math.max(0, Number(item.stock))
      : undefined;

  return {
    stockLimit,
    overStock: stockLimit !== undefined && item.quantity > stockLimit,
  };
}

function Cart() {
  const { isAuthenticated } = useAuth();
  const {
    cartItems,
    cartSubtotal,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
  } = useCart();

  if (!isAuthenticated) {
    return (
      <main className="cart-page">
        <EmptyState
          icon={<FiLock />}
          eyebrow="Login required"
          title="Sign in to view your cart"
          message="Your cart is protected and tied to your Gleenc account so another user cannot see your selected products on this device."
          actionLabel="Login to Continue"
          onAction={() => {
            window.location.href = "/login";
          }}
        />
      </main>
    );
  }

  if (cartItems.length === 0) {
    return (
      <main className="cart-page">
        <EmptyState
          icon={<FiShoppingCart />}
          eyebrow="Your cart is empty"
          title="No items in your cart yet"
          message="When you add products from Gleenc stores, they will appear here before checkout."
          actionLabel="Start Shopping"
          onAction={() => {
            window.location.href = "/search";
          }}
        />
      </main>
    );
  }

  const serviceFee = 0;
  const deliveryFee = 0;
  const total = cartSubtotal + deliveryFee + serviceFee;

  return (
    <main className="cart-page">
      <section className="cart-hero">
        <div>
          <span className="eyebrow">Shopping Cart</span>
          <h1>Your cart</h1>
          <p>
            Review your selected products, update quantities, and continue to
            checkout when you are ready.
          </p>
        </div>

        <Link to="/search" className="ghost-button">
          Continue Shopping
        </Link>
      </section>

      <section className="cart-layout">
        <div className="cart-items-panel">
          {cartItems.map((item) => {
            const { stockLimit, overStock } = cartStockState(item);

            return (
              <article className="cart-item-card" key={item.id}>
              <img src={item.image} alt={item.name} />

              <div className="cart-item-info">
                <span>{item.campus || "Campus product"}</span>
                <h2>{item.name}</h2>
                <p>Sold by {item.sellerName}</p>
                {stockLimit !== undefined && (
                  <small className={overStock ? "cart-stock-note limit" : "cart-stock-note"}>
                    {stockLimit <= 0
                      ? "Out of stock"
                      : `${stockLimit} In stock${overStock ? " • reduce before checkout" : ""}`}
                  </small>
                )}
                <strong>{formatPrice(item.numericPrice)}</strong>
              </div>

              <div className="cart-item-actions">
                <div className="quantity-control">
                  <button
                    type="button"
                    onClick={() => decreaseQuantity(item.id)}
                    aria-label="Decrease quantity"
                  >
                    <FiMinus />
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    type="button"
                    onClick={() => increaseQuantity(item.id)}
                    aria-label="Increase quantity"
                    title="Increase quantity"
                  >
                    <FiPlus />
                  </button>
                </div>

                <strong>{formatPrice(item.numericPrice * item.quantity)}</strong>

                <button
                  type="button"
                  className="remove-cart-item"
                  onClick={() => removeFromCart(item.id)}
                >
                  <FiTrash2 />
                  Remove
                </button>
              </div>
            </article>
            );
          })}
        </div>

        <aside className="cart-summary-card">
          <span className="eyebrow">Order Summary</span>
          <h2>Checkout details</h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{formatPrice(cartSubtotal)}</strong>
          </div>

          <div className="summary-row">
            <span>Delivery fee</span>
            <strong>Calculated at checkout</strong>
          </div>

          <div className="summary-row">
            <span>Service fee</span>
            <strong>{formatPrice(serviceFee)}</strong>
          </div>

          <div className="summary-total">
            <span>Estimated total</span>
            <strong>{formatPrice(total)}</strong>
          </div>

          <Link to="/checkout" className="primary-button full-width">
            Proceed to Checkout
            <FiArrowRight />
          </Link>

          <p className="cart-summary-note">
            Delivery fee is calculated at checkout based on your selected campus
            delivery location.
          </p>
        </aside>
      </section>
    </main>
  );
}

export default Cart;
