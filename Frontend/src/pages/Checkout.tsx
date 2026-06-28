import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiAlertCircle,
  FiCheckCircle,
  FiMapPin,
  FiPhone,
  FiShoppingCart,
  FiUser,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { createOrders } from "../services/order.service";
import { formatNaira } from "../utils/price";

function Checkout() {
  const { cartItems, cartSubtotal, clearCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [deliveryOption, setDeliveryOption] = useState<"Pickup" | "Delivery">(
    "Pickup",
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cartItems.length === 0 || isSubmitting) return;

    if (!isAuthenticated) {
      navigate("/login?redirect=/checkout");
      return;
    }

    const formData = new FormData(event.currentTarget);

    const buyerName = String(formData.get("buyerName") || "").trim();
    const buyerPhone = String(formData.get("buyerPhone") || "").trim();
    const campus = String(formData.get("campus") || "").trim();
    const deliveryAddress = String(formData.get("deliveryAddress") || "").trim();
    const pickupLocation = String(formData.get("pickupLocation") || "").trim();
    const note = String(formData.get("note") || "").trim();

    setError("");
    setIsSubmitting(true);

    try {
      const response = await createOrders({
        buyerName,
        buyerPhone,
        campus,
        deliveryOption,
        deliveryAddress,
        pickupLocation,
        note,
        items: cartItems.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
      });

      clearCart();

      const reference = response.orders.map((order) => order.orderCode).join(",");
      sessionStorage.setItem(
        "gleank_last_orders",
        JSON.stringify(response.orders),
      );

      navigate(`/order-success?ref=${encodeURIComponent(reference)}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Order could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (cartItems.length === 0) {
    return (
      <section className="checkout-page">
        <EmptyState
          icon={<FiShoppingCart />}
          eyebrow="Empty checkout"
          title="Your cart is empty"
          message="Add products to your cart before proceeding to checkout."
          actionLabel="Go to Search"
          onAction={() => {
            navigate("/search");
          }}
        />

        <Link to="/" className="checkout-back-link">
          <FiArrowLeft />
          Back to Feed
        </Link>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <Link to="/cart" className="checkout-back-link">
        <FiArrowLeft />
        Back to cart
      </Link>

      <div className="checkout-header">
        <span>Checkout</span>

        <h1>Confirm your order details</h1>

        <p>
          Gleank will create a real order in the backend. Payment will be
          connected in the next phase, so the order starts as pending payment.
        </p>
      </div>

      {error && (
        <div className="seller-workspace-message error" role="alert">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      <form className="checkout-layout" onSubmit={handleSubmit}>
        <div className="checkout-form-card">
          <div className="checkout-section-title">
            <FiUser />
            <div>
              <h2>Buyer information</h2>
              <p>Use your correct campus contact details.</p>
            </div>
          </div>

          <label>
            <span>Full name</span>
            <input
              name="buyerName"
              defaultValue={user?.name || ""}
              placeholder="Your full name"
              required
            />
          </label>

          <label>
            <span>Phone number</span>
            <input
              name="buyerPhone"
              defaultValue={user?.phone || ""}
              placeholder="080..."
              required
            />
          </label>

          <label>
            <span>Campus</span>
            <input
              name="campus"
              defaultValue={user?.campus || ""}
              placeholder="FUPRE"
              required
            />
          </label>

          <div className="checkout-section-title">
            <FiMapPin />
            <div>
              <h2>Delivery method</h2>
              <p>Choose pickup or campus delivery.</p>
            </div>
          </div>

          <div className="checkout-delivery-options">
            <label className={deliveryOption === "Pickup" ? "active" : ""}>
              <input
                type="radio"
                name="deliveryOption"
                value="Pickup"
                checked={deliveryOption === "Pickup"}
                onChange={() => setDeliveryOption("Pickup")}
              />
              <span>Pickup</span>
              <small>Meet seller at a pickup point.</small>
            </label>

            <label className={deliveryOption === "Delivery" ? "active" : ""}>
              <input
                type="radio"
                name="deliveryOption"
                value="Delivery"
                checked={deliveryOption === "Delivery"}
                onChange={() => setDeliveryOption("Delivery")}
              />
              <span>Delivery</span>
              <small>Send to hostel, class, or agreed location.</small>
            </label>
          </div>

          {deliveryOption === "Pickup" ? (
            <label>
              <span>Pickup location</span>
              <input
                name="pickupLocation"
                placeholder="Main gate, library, hostel block..."
                required
              />
            </label>
          ) : (
            <label>
              <span>Delivery address</span>
              <input
                name="deliveryAddress"
                placeholder="Hostel, department, class, or location"
                required
              />
            </label>
          )}

          <label>
            <span>Order note</span>
            <textarea
              name="note"
              rows={4}
              placeholder="Optional note to seller or rider."
            />
          </label>
        </div>

        <aside className="checkout-summary-card">
          <div className="checkout-section-title">
            <FiShoppingCart />
            <div>
              <h2>Order summary</h2>
              <p>{cartItems.length} cart item(s)</p>
            </div>
          </div>

          <div className="checkout-items-list">
            {cartItems.map((item) => (
              <div className="checkout-item-row" key={item.id}>
                <img src={item.image} alt={item.name} />

                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.sellerName} • Qty {item.quantity}
                  </span>
                </div>

                <b>{formatNaira(item.numericPrice * item.quantity)}</b>
              </div>
            ))}
          </div>

          <div className="checkout-total-box">
            <span>
              <small>Subtotal</small>
              <strong>{formatNaira(cartSubtotal)}</strong>
            </span>

            <span>
              <small>Delivery fee</small>
              <strong>{formatNaira(0)}</strong>
            </span>

            <span className="checkout-grand-total">
              <small>Total</small>
              <strong>{formatNaira(cartSubtotal)}</strong>
            </span>
          </div>

          <div className="checkout-safe-note">
            <FiCheckCircle />
            <p>
              This creates your order. Payment verification, escrow release, and
              delivery code come next.
            </p>
          </div>

          <button className="checkout-submit-btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              "Creating order..."
            ) : (
              <>
                <FiPhone />
                Create Order
              </>
            )}
          </button>
        </aside>
      </form>
    </section>
  );
}

export default Checkout;
