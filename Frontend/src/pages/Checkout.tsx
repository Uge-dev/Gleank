import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiMapPin,
  FiNavigation,
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
import {
  getCheckoutGroupingPreview,
  type CheckoutGroupingPreview,
} from "../services/logistics.service";
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
  const [pickupLocation, setPickupLocation] = useState("");
  const [zones, setZones] = useState<DeliveryZone[]>(fallbackZones);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [groupingPreview, setGroupingPreview] = useState<CheckoutGroupingPreview | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isGrouping, setIsGrouping] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [error, setError] = useState("");
  const [stockNotice, setStockNotice] = useState("");
  const [stockNoticeSellerSlug, setStockNoticeSellerSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedLocation = deliveryOption === "Delivery" ? deliveryZone : pickupLocation;
  const deliveryFee = groupingPreview?.totalDeliveryFee || deliveryQuote?.fee || 0;
  const grandTotal = cartSubtotal + deliveryFee;
  const payAtDeliveryDisabledReason =
    user && !user.emailVerified
      ? "Verify your email before using Pay at Delivery, or choose Pay Now."
      : "";

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
    if (!campus.trim() || !selectedLocation) {
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
      destination: selectedLocation,
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
  }, [campus, deliveryOption, selectedLocation]);

  useEffect(() => {
    if (!isAuthenticated || cartItems.length === 0) {
      setGroupingPreview(null);
      return;
    }

    let active = true;
    setIsGrouping(true);

    void getCheckoutGroupingPreview({
      items: cartItems.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    })
      .then((preview) => {
        if (active) setGroupingPreview(preview);
      })
      .catch(() => {
        if (active) setGroupingPreview(null);
      })
      .finally(() => {
        if (active) setIsGrouping(false);
      });

    return () => {
      active = false;
    };
  }, [cartItems, isAuthenticated]);

  function isInventoryError(message: string) {
    return /out of stock|stock|cart is no longer available|no longer available|only \d+ item/i.test(message);
  }

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
    const selectedPickupLocation = String(formData.get("pickupLocation") || "").trim();
    const note = String(formData.get("note") || "").trim();

    if (deliveryOption === "Delivery" && !deliveryZone) {
      setError("Select a door step delivery zone before payment.");
      return;
    }

    if (deliveryOption === "Pickup" && !selectedPickupLocation) {
      setError("Select a pickup location before payment.");
      return;
    }

    if (quoteError) {
      setError(quoteError);
      return;
    }

    const overstockItem = cartItems.find((item) => {
      return (
        item.stock !== undefined &&
        Number.isFinite(Number(item.stock)) &&
        item.quantity > Math.max(0, Number(item.stock))
      );
    });

    if (overstockItem) {
      const available = Math.max(0, Number(overstockItem.stock || 0));
      setError("");
      setStockNoticeSellerSlug(overstockItem.sellerId);
      setStockNotice(
        available <= 0
          ? `${overstockItem.name} is out of stock right now. Remove it from your cart or message the seller before checkout.`
          : `${overstockItem.name} has only ${available} item(s) in stock, but your cart has ${overstockItem.quantity}. Reduce the quantity in your cart or message the seller for more availability.`,
      );
      return;
    }

    setError("");
    setStockNotice("");
    setStockNoticeSellerSlug("");
    setIsSubmitting(true);

    try {
      const selectedZone = zones.find((zone) => zone.id === deliveryZone)?.label || deliveryZone;
      const selectedPickup =
        zones.find((zone) => zone.id === selectedPickupLocation)?.label ||
        selectedPickupLocation;
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
        pickupLocation: deliveryOption === "Pickup" ? selectedPickup : "",
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
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Checkout could not be completed.";

      setError(message);
      if (isInventoryError(message)) {
        setStockNotice(message);
        setStockNoticeSellerSlug("");
      }
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

      {error && (
        <div className="checkout-alert" role="alert">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      {stockNotice && (
        <div className="checkout-stock-modal-backdrop" role="presentation">
          <div
            className="checkout-stock-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-stock-title"
          >
            <div className="checkout-stock-icon">
              <FiAlertCircle />
            </div>
            <span>Stock changed</span>
            <h2 id="checkout-stock-title">Product not available</h2>
            <p>{stockNotice}</p>
            <div className="checkout-stock-actions">
              <button type="button" onClick={() => navigate("/cart")}>
                Review cart
              </button>
              {stockNoticeSellerSlug && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/messages?seller=${encodeURIComponent(stockNoticeSellerSlug)}`,
                    )
                  }
                >
                  Message seller
                </button>
              )}
              <button type="button" onClick={() => setStockNotice("")}>
                Close
              </button>
            </div>
          </div>
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
                <p>Pickup uses approved campus points. Door step delivery allows exact location and costs more.</p>
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
                <span>Select a fixed pickup point from the campus list.</span>
              </button>

              <button
                type="button"
                className={deliveryOption === "Delivery" ? "selected" : ""}
                onClick={() => setDeliveryOption("Delivery")}
              >
                <FiTruck />
                <strong>Door step delivery</strong>
                <span>Send to your exact room, lodge, office, or landmark.</span>
              </button>
            </div>

            {deliveryOption === "Pickup" ? (
              <div className="delivery-zone-card">
                <label>
                  <span>Pickup location</span>
                  <select
                    name="pickupLocation"
                    value={pickupLocation}
                    onChange={(event) => setPickupLocation(event.target.value)}
                    required
                  >
                    <option value="">Select an approved pickup point</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="delivery-quote-box">
                  <FiNavigation />
                  <div>
                    <strong>
                      {isQuoting
                        ? "Calculating pickup fee..."
                        : deliveryQuote
                          ? `${deliveryQuote.label} • ${formatNaira(deliveryQuote.fee)}`
                          : "Select a pickup location"}
                    </strong>
                    <p>
                      {quoteError ||
                        (deliveryQuote?.distanceKm
                          ? `Estimated distance: ${deliveryQuote.distanceKm}km from dispatch point.`
                          : "Pickup uses approved points only, so riders can verify handoff safely.")}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="delivery-zone-card">
                <label>
                  <span>Door step delivery zone</span>
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
                  <span>Exact door step details</span>
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
                          : "Select a door step delivery zone"}
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
                <p>
                  Pay now for protected payment, or use Pay at Delivery through
                  Gleenc/Paystack when the rider reaches you. No cash handoff.
                </p>
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
                disabled={Boolean(payAtDeliveryDisabledReason)}
                onClick={() => {
                  if (!payAtDeliveryDisabledReason) setPaymentMethod("pay_on_delivery");
                }}
                title={payAtDeliveryDisabledReason || "Pay securely at delivery through Gleenc"}
              >
                <FiTruck />
                <strong>Pay at Delivery</strong>
                <span>
                  {payAtDeliveryDisabledReason ||
                    "Seller confirms, rider comes, you pay securely through Gleenc/Paystack when your rider arrives. No cash or direct transfer is allowed."}
                </span>
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
                  {item.deliveryReadinessLabel && (
                    <small>{item.deliveryReadinessLabel}</small>
                  )}
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

          <div className="checkout-batch-preview">
            <div>
              <strong>Automated delivery grouping</strong>
              <p>
                {isGrouping
                  ? "Checking package compatibility and rider requirements..."
                  : groupingPreview?.groups.length
                    ? `${groupingPreview.groups.length} delivery batch(es) planned for ${sellerCount} seller(s).`
                    : "Gleenc will group compatible seller pickups after checkout."}
              </p>
            </div>

            {groupingPreview?.groups.map((group, index) => (
              <article key={group.id}>
                <span>Delivery {index + 1}</span>
                <strong>{group.batchType.replaceAll("_", " ")} • {formatNaira(group.deliveryFee)}</strong>
                <p>
                  {group.itemCount} item(s), {group.sellerCount} seller(s), {group.packageSizeSummary} /
                  {" "}{group.weightClassSummary}, {group.fragilitySummary.replaceAll("_", " ")}
                </p>
                <small>
                  {group.requiresGps ? "GPS rider required" : "Zone-based rider allowed"} •
                  {" "}{group.requiresPhotoProof ? "Photo proof required" : "OTP proof required"}
                </small>
              </article>
            ))}
          </div>

          <div className="checkout-safe-note">
            <FiCheckCircle />
            <p>
              {paymentMethod === "pay_now"
                ? "Your order is created first, then payment is verified before sellers process it."
                : "Your order goes to the seller first. The delivery code unlocks only after Gleenc/Paystack verifies payment."}
            </p>
          </div>

          <button className="checkout-submit-btn" type="submit" disabled={isSubmitting || isQuoting || isGrouping}>
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
