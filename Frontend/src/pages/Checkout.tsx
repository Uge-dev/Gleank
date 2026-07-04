import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiLock,
  FiMapPin,
  FiNavigation,
  FiShield,
  FiShoppingCart,
  FiTruck,
  FiUser,
} from "react-icons/fi";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { createOrders } from "../services/order.service";
import { quoteDeliveryFee, getDeliveryZones } from "../services/delivery.service";
import type { DeliveryQuote, DeliveryZone } from "../services/delivery.service";
import { initializeOrdersPayment } from "../services/payment.service";
import { formatNaira } from "../utils/price";
import "./Checkout.css";

const fallbackZones: DeliveryZone[] = [
  { id: "main-gate", label: "Main Gate" },
  { id: "campus-market", label: "Campus Market" },
  { id: "student-hostel", label: "Student Hostel Area" },
  { id: "faculty-area", label: "Faculty Area" },
  { id: "library", label: "Library / Academic Core" },
  { id: "admin-block", label: "Admin Block" },
  { id: "cafeteria", label: "Cafeteria / Food Court" },
  { id: "sports-complex", label: "Sports Complex" },
];

function Checkout() {
  const { cartItems, cartSubtotal, clearCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [deliveryOption, setDeliveryOption] = useState<"Pickup" | "Delivery">("Pickup");
  const [paymentMethod, setPaymentMethod] = useState<"pay_now" | "pay_on_delivery">("pay_now");
  const [campus, setCampus] = useState(user?.campus || "FUPRE");
  const [deliveryZone, setDeliveryZone] = useState("");
  const [zones, setZones] = useState<DeliveryZone[]>(fallbackZones);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deliveryFee = deliveryOption === "Delivery" ? deliveryQuote?.fee || 0 : 0;
  const grandTotal = cartSubtotal + deliveryFee;

  const sellerCount = useMemo(() => {
    return new Set(cartItems.map((item) => item.sellerId)).size;
  }, [cartItems]);

  useEffect(() => {
    if (!campus.trim()) return;

    let active = true;

    void getDeliveryZones(campus)
      .then((response) => {
        if (!active) return;
        if (response.zones.length > 0) {
          setZones(response.zones);
        }
      })
      .catch(() => {
        if (active) setZones(fallbackZones);
      });

    return () => {
      active = false;
    };
  }, [campus]);

  useEffect(() => {
    if (deliveryOption !== "Delivery") {
      setDeliveryQuote(null);
      setQuoteError("");
      return;
    }

    if (!campus.trim() || !deliveryZone) {
      setDeliveryQuote(null);
      setQuoteError("");
      return;
    }

    let active = true;
    setIsQuoting(true);
    setQuoteError("");

    void quoteDeliveryFee({
      campus,
      deliveryOption,
      destination: deliveryZone,
    })
      .then((response) => {
        if (!active) return;
        setDeliveryQuote(response.quote);
      })
      .catch((requestError) => {
        if (!active) return;
        setDeliveryQuote(null);
        setQuoteError(
          requestError instanceof Error
            ? requestError.message
            : "Delivery fee could not be calculated.",
        );
      })
      .finally(() => {
        if (active) setIsQuoting(false);
      });

    return () => {
      active = false;
    };
  }, [campus, deliveryOption, deliveryZone]);

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
    const preciseDeliveryAddress = String(formData.get("deliveryAddress") || "").trim();
    const pickupLocation = String(formData.get("pickupLocation") || "").trim();
    const note = String(formData.get("note") || "").trim();

    if (deliveryOption === "Delivery" && !deliveryZone) {
      setError("Select a campus delivery zone before payment.");
      return;
    }

    if (deliveryOption === "Delivery" && quoteError) {
      setError(quoteError);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const selectedZone = zones.find((zone) => zone.id === deliveryZone)?.label || deliveryZone;
      const deliveryAddress =
        deliveryOption === "Delivery"
          ? [selectedZone, preciseDeliveryAddress].filter(Boolean).join(" - ")
          : "";

      const response = await createOrders({
        buyerName,
        buyerPhone,
        campus,
        deliveryOption,
        deliveryAddress,
        pickupLocation,
        note,
        paymentMethod,
        items: cartItems.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
      });

      sessionStorage.setItem(
        "gleank_last_orders",
        JSON.stringify(response.orders),
      );

      if (paymentMethod === "pay_on_delivery") {
        clearCart();
        navigate(`/orders/${response.orders[0]?.id || ""}`);
        return;
      }

      const paymentResponse = await initializeOrdersPayment(
  response.orders.map((order) => order.id),
);

sessionStorage.setItem(
  "gleank_pending_payment_reference",
  paymentResponse.payment.reference,
);

window.location.href = paymentResponse.payment.authorizationUrl;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Checkout could not be completed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (cartItems.length === 0) {
    return (
      <section className="page-shell checkout-page">
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
        <Link className="back-link" to="/search">
          <FiArrowLeft /> Back to Feed
        </Link>
      </section>
    );
  }

  return (
    <section className="page-shell checkout-page checkout-pro-page">
      <Link className="back-link" to="/cart">
        <FiArrowLeft /> Back to cart
      </Link>

      <div className="checkout-pro-hero">
        <div>
          <span className="eyebrow">Secure campus checkout</span>
          <h1>Complete your Gleenc order</h1>
          <p>
            Confirm your details, choose pickup or campus delivery, then pay securely.
            Your cart will only clear after payment is verified.
          </p>
        </div>
        <div className="checkout-trust-strip">
          <span><FiShield /> Buyer protection</span>
          <span><FiLock /> Secure payment</span>
          <span><FiTruck /> Campus delivery</span>
        </div>
      </div>

      {error && (
        <div className="checkout-alert" role="alert">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      <form className="checkout-pro-grid" onSubmit={handleSubmit}>
        <div className="checkout-flow-card">
        

          <section className="checkout-block">
            <div className="checkout-section-title">
              <FiUser />
              <div>
                <h2>Buyer information</h2>
                <p>Use the contact details the seller/rider can reach quickly.</p>
              </div>
            </div>

            <div className="checkout-field-grid">
              <label>
                <span>Full name</span>
                <input name="buyerName" defaultValue={user?.name || ""} required />
              </label>
              <label>
                <span>Phone number</span>
                <input name="buyerPhone" defaultValue={user?.phone || ""} required />
              </label>
              <label className="span-2">
                <span>Campus</span>
                <input
                  name="campus"
                  value={campus}
                  onChange={(event) => setCampus(event.target.value)}
                  required
                />
              </label>
            </div>
          </section>

          <section className="checkout-block">
            <div className="checkout-section-title">
              <FiMapPin />
              <div>
                <h2>Delivery method</h2>
                <p>Pickup is free. Delivery fee changes by campus distance.</p>
              </div>
            </div>

            <div className="delivery-choice-grid">
              <button
                type="button"
                className={deliveryOption === "Pickup" ? "selected" : ""}
                onClick={() => setDeliveryOption("Pickup")}
              >
                <FiShoppingCart />
                <strong>Pickup</strong>
                <span>Meet the seller at an agreed point.</span>
              </button>

              <button
                type="button"
                className={deliveryOption === "Delivery" ? "selected" : ""}
                onClick={() => setDeliveryOption("Delivery")}
              >
                <FiTruck />
                <strong>Campus delivery</strong>
                <span>Pay a fair fee based on campus distance.</span>
              </button>
            </div>

            {deliveryOption === "Pickup" ? (
              <label className="checkout-full-field">
                <span>Pickup location</span>
                <input
                  name="pickupLocation"
                  placeholder="Example: Main Gate, Campus Market, Faculty entrance"
                  required
                />
              </label>
            ) : (
              <div className="delivery-zone-card">
                <label>
                  <span>Delivery zone</span>
                  <select
                    value={deliveryZone}
                    onChange={(event) => setDeliveryZone(event.target.value)}
                    required
                  >
                    <option value="">Select a campus zone</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Exact delivery details</span>
                  <input
                    name="deliveryAddress"
                    placeholder="Example: Hostel B, Room 204 / beside library stairs"
                    required
                  />
                </label>

                <div className="delivery-quote-box">
                  <FiNavigation />
                  <div>
                    <strong>
                      {isQuoting
                        ? "Calculating delivery fee..."
                        : deliveryQuote
                          ? `${deliveryQuote.label} • ${formatNaira(deliveryQuote.fee)}`
                          : "Select a delivery zone"}
                    </strong>
                    <p>
                      {quoteError ||
                        (deliveryQuote?.distanceKm
                          ? `Estimated distance: ${deliveryQuote.distanceKm}km from dispatch point.`
                          : "The final fee is calculated again on the backend before payment.")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <label className="checkout-full-field">
              <span>Order note</span>
              <textarea
                name="note"
                rows={4}
                placeholder="Optional note for the seller or delivery rider"
              />
            </label>
          </section>

          <section className="checkout-block">
            <div className="checkout-section-title">
              <FiCreditCard />
              <div>
                <h2>Payment option</h2>
                <p>Pay online now, or let the seller collect payment when the order is delivered or picked up.</p>
              </div>
            </div>

            <div className="payment-choice-grid">
              <button
                type="button"
                className={paymentMethod === "pay_now" ? "selected" : ""}
                onClick={() => setPaymentMethod("pay_now")}
              >
                <FiCreditCard />
                <strong>Pay now</strong>
                <span>Use Paystack checkout. Seller processes after payment is confirmed.</span>
              </button>

              <button
                type="button"
                className={paymentMethod === "pay_on_delivery" ? "selected" : ""}
                onClick={() => setPaymentMethod("pay_on_delivery")}
              >
                <FiTruck />
                <strong>Pay on delivery</strong>
                <span>Send the order to the seller and pay when you receive or pick up.</span>
              </button>
            </div>
          </section>
        </div>

        <aside className="checkout-summary-card checkout-pro-summary">
          <div className="checkout-section-title">
            <FiShoppingCart />
            <div>
              <h2>Order summary</h2>
              <p>
                {cartItems.length} item(s) from {sellerCount} seller(s)
              </p>
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
              <strong>{formatNaira(deliveryFee)}</strong>
            </span>
            <span className="checkout-grand-total">
              <small>Total</small>
              <strong>{formatNaira(grandTotal)}</strong>
            </span>
          </div>

          <div className="checkout-safe-note">
            <FiCheckCircle />
            <p>
              {paymentMethod === "pay_now"
                ? "Your order is created first, then payment is verified before sellers process it."
                : "Your order will go straight to the seller as pay on delivery. Keep your verification code private until delivery."}
            </p>
          </div>

          <button className="checkout-submit-btn" type="submit" disabled={isSubmitting || isQuoting}>
            {isSubmitting ? (
              paymentMethod === "pay_now" ? "Opening secure payment..." : "Creating order..."
            ) : (
              <>
                {paymentMethod === "pay_now" ? <FiCreditCard /> : <FiTruck />}
                {paymentMethod === "pay_now" ? "Pay now" : "Place order"}
              </>
            )}
          </button>
        </aside>
      </form>
    </section>
  );
}

export default Checkout;
