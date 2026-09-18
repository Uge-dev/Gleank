import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { commerce, type Quote } from "../services/commerce.service";
import { createOrders } from "../services/order.service";
import { initializePayment } from "../services/payment.service";
import type { GleencOrder } from "../types/domain";
import "./commerce/Commerce.css";
export default function Checkout() {
  const { cartItems } = useCart();
  const { user } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orders, setOrders] = useState<GleencOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const items = cartItems.filter((i) => i.itemType !== "used_listing");
  const signature = JSON.stringify(
    items.map((i) => ({ productId: i.id, quantity: i.quantity })),
  );
  useEffect(() => {
    let active = true;
    setQuote(null);
    if (signature === "[]") return;
    commerce
      .quote(JSON.parse(signature))
      .then((q) => {
        if (active) setQuote(q);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [signature]);
  return (
    <section className="commerce-page">
      <span className="commerce-eyebrow">Protected checkout</span>
      <h1>Checkout</h1>
      <p>
        Pay securely now. Gleenc holds payment until you confirm receipt using
        the package QR or delivery code.
      </p>
      {error && (
        <p role="alert" className="commerce-error">
          {error}
        </p>
      )}
      {!items.length && !orders.length ? (
        <p>
          Your cart is empty. <Link to="/search">Find products</Link>
        </p>
      ) : orders.length ? (
        <>
          <h2>Complete your payment</h2>
          <p>
            Each seller’s order is paid separately. Only paid orders can be
            dispatched.
          </p>
          {orders.map((order) => (
            <div className="commerce-card" key={order.id}>
              <h2>{order.storeName}</h2>
              <p>₦{order.total.toLocaleString()}</p>
              <Link to={"/orders/" + order.id}>View order</Link>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await initializePayment({
                      purpose: "store_order",
                      targetId: order.id,
                    });
                    window.location.assign(r.payment.authorizationUrl);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Payment could not start.",
                    );
                    setBusy(false);
                  }
                }}
              >
                Pay for this order
              </button>
            </div>
          ))}
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!quote) return;
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const result = await createOrders({
                buyerName: String(data.get("name")),
                buyerPhone: String(data.get("phone")),
                campus: String(data.get("area")),
                deliveryOption: "Delivery",
                deliveryAddress: String(data.get("address")),
                paymentMethod: "pay_now",
                pickupLocation: "",
                items: items.map((i) => ({
                  productId: i.id,
                  quantity: i.quantity,
                  selectedSize: i.selectedSize || "",
                })),
                note: String(data.get("note") || ""),
              });
              setOrders(result.orders);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Checkout failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="commerce-grid">
            <div className="commerce-card">
              <h2>Delivery details</h2>
              <label>
                Recipient name
                <input name="name" required defaultValue={user?.name} />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  required
                  minLength={7}
                  maxLength={30}
                  defaultValue={user?.phone}
                />
              </label>
              <label>
                City / state
                <input
                  name="area"
                  required
                  defaultValue={[user?.city, user?.state]
                    .filter(Boolean)
                    .join(", ")}
                />
              </label>
              <label>
                Full delivery address
                <textarea
                  name="address"
                  required
                  minLength={5}
                  maxLength={240}
                />
              </label>
              <label>
                Delivery instructions (optional)
                <textarea name="note" maxLength={1000} />
              </label>
            </div>
            <div className="commerce-card">
              <h2>Order summary</h2>
              {quote ? (
                quote.sellers.map((s) => (
                  <div key={s.storeId}>
                    <h2>{s.storeName}</h2>
                    <p>
                      Products: ₦{(s.subtotalKobo / 100).toLocaleString()}
                      <br />
                      Delivery: ₦{(s.deliveryFeeKobo / 100).toLocaleString()}
                    </p>
                    <p>
                      Serves: {s.coverage}
                      <br />
                      Estimated delivery: {s.deliveryDays} days
                    </p>
                  </div>
                ))
              ) : (
                <p>Checking prices and delivery…</p>
              )}
              <h2>
                Total: ₦{((quote?.totalKobo || 0) / 100).toLocaleString()}
              </h2>
              <label className="check-label">
                <input required type="checkbox" />
                My delivery address is within each seller’s stated coverage.
              </label>
              <p className="commerce-note">
                Payment on delivery is not available. Sellers arrange
                fulfillment; confirm only after receiving your package.
              </p>
              <button className="primary" disabled={busy || !quote}>
                {busy ? "Preparing checkout…" : "Continue to payment"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
