import { Link, useNavigate } from "react-router-dom";
import {
  FiMinus,
  FiPlus,
  FiShoppingBag,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useState } from "react";

import AuthModal from "./AuthModal";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { formatNaira } from "../utils/price";

function CartDrawer() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);

  const {
    cartItems,
    cartCount,
    cartSubtotal,
    cartDrawerOpen,
    closeCartDrawer,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
  } = useCart();

  function handleProtectedCartAction(path: string) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    closeCartDrawer();
    navigate(path);
  }

  if (!cartDrawerOpen) return null;

  return (
    <>
      <div className="cart-drawer-backdrop" onClick={closeCartDrawer}>
        <aside
          className="cart-drawer"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="cart-drawer-header">
            <div>
              <span>Your Cart</span>
              <h2>
                {cartCount} item{cartCount === 1 ? "" : "s"}
              </h2>
            </div>

            <button
              type="button"
              onClick={closeCartDrawer}
              aria-label="Close cart"
            >
              <FiX />
            </button>
          </div>

          {cartItems.length === 0 ? (
            <div className="cart-empty-state">
              <div>
                <FiShoppingBag />
              </div>

              <h3>Your cart is empty</h3>

              <p>
                Start exploring campus products and add items you want to order.
              </p>

              <Link to="/search" onClick={closeCartDrawer}>
                Explore Products
              </Link>
            </div>
          ) : (
            <>
              <div className="cart-drawer-list">
                {cartItems.map((item) => (
                  <article className="cart-drawer-item" key={item.id}>
                    <img src={item.image} alt={item.name} />

                    <div className="cart-item-info">
                      <Link
                        to={`/products/${item.id}`}
                        onClick={closeCartDrawer}
                      >
                        {item.name}
                      </Link>

                      <p>
                        {item.sellerName} • {item.campus}
                      </p>

                      <strong>{item.price}</strong>

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

                        <button
                          type="button"
                          className="cart-remove-btn"
                          onClick={() => removeFromCart(item.id)}
                          aria-label="Remove item"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="cart-drawer-footer">
                <div className="cart-total-row">
                  <span>Subtotal</span>
                  <strong>{formatNaira(cartSubtotal)}</strong>
                </div>

                <p>
                  Delivery, pickup, and service charges will be confirmed at
                  checkout.
                </p>

                <button
                  type="button"
                  className="cart-checkout-btn"
                  onClick={() => handleProtectedCartAction("/checkout")}
                >
                  Proceed to Checkout
                </button>

                <button
                  type="button"
                  className="cart-view-btn"
                  onClick={() => handleProtectedCartAction("/cart")}
                >
                  View Full Cart
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default CartDrawer;
