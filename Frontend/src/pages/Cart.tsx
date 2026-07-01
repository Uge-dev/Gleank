import { Link } from "react-router-dom";
import {
  FiArrowRight,
  FiMinus,
  FiPlus,
  FiShoppingCart,
  FiTrash2,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useCart } from "../context/CartContext";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function Cart() {
  const {
    cartItems,
    cartSubtotal,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
  } = useCart();

  const deliveryFee = cartItems.length > 0 ? 1000 : 0;
  const serviceFee = cartItems.length > 0 ? 500 : 0;
  const total = cartSubtotal + deliveryFee + serviceFee;

  if (cartItems.length === 0) {
    return (
      <section className="cart-page">
        <EmptyState
          icon={<FiShoppingCart />}
          eyebrow="Your cart is empty"
          title="No items in your cart yet"
          message="When you add products from Gleank stores, they will appear here before checkout."
          actionLabel="Start Shopping"
          onAction={() => {
            window.location.href = "/search";
          }}
        />
      </section>
    );
  }

  return (
    <section className="cart-page">
      <div className="cart-page-header">
        <div>
          <span>Shopping Cart</span>
          <h1>Your cart</h1>
          <p>
            Review your selected products, update quantities, and continue to
            checkout when you are ready.
          </p>
        </div>

        <Link to="/search">
          Continue Shopping
          <FiArrowRight />
        </Link>
      </div>

      <div className="cart-layout">
        <div className="cart-items-list">
          {cartItems.map((item) => (
            <article className="cart-item-card" key={item.id}>
              <img src={item.image} alt={item.name} />

              <div className="cart-item-info">
                <span>{item.category || "Product"}</span>
                <h2>{item.name}</h2>
                <p>Sold by {item.sellerName}</p>
                <strong>{formatPrice(item.numericPrice)}</strong>
              </div>

              <div className="cart-item-controls">
                <div className="cart-quantity-control">
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
                  >
                    <FiPlus />
                  </button>
                </div>

                <small>{formatPrice(item.numericPrice * item.quantity)}</small>

                <button
                  type="button"
                  className="cart-remove-btn"
                  onClick={() => removeFromCart(item.id)}
                >
                  <FiTrash2 />
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="cart-summary-card">
          <span>Order Summary</span>

          <h2>Checkout details</h2>

          <div className="cart-summary-list">
            <div>
              <p>Subtotal</p>
              <strong>{formatPrice(cartSubtotal)}</strong>
            </div>

            <div>
              <p>Delivery fee</p>
              <strong>{formatPrice(deliveryFee)}</strong>
            </div>

            <div>
              <p>Service fee</p>
              <strong>{formatPrice(serviceFee)}</strong>
            </div>
          </div>

          <div className="cart-total-row">
            <p>Total</p>
            <strong>{formatPrice(total)}</strong>
          </div>

          <Link to="/checkout" className="cart-checkout-btn">
            Proceed to Checkout
            <FiArrowRight />
          </Link>

          <p className="cart-summary-note">
            Your payment will be protected. Delivery and pickup options will be
            confirmed at checkout.
          </p>
        </aside>
      </div>
    </section>
  );
}

export default Cart;
