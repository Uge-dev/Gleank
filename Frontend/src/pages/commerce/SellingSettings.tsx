import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  commerce,
  type FulfillmentSettings,
} from "../../services/commerce.service";
import "./Commerce.css";
export default function SellingSettings() {
  const { user, refreshSession } = useAuth();
  const [form, setForm] = useState<FulfillmentSettings>({
    name: user?.profile?.displayName || user?.name || "",
    coverage: "",
    deliveryFee: 0,
    deliveryDays: 3,
    dispatchAddress: "",
    phone: user?.phone || "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    commerce
      .settings()
      .then((r) => {
        if (r.settings) setForm(r.settings);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <section className="commerce-page">
      <h1>Selling settings</h1>
      <p>
        You arrange delivery personally or through a transport company. Every
        package needs a printed label and buyer confirmation.
      </p>
      <form
        className="commerce-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await commerce.saveSettings(form);
            await refreshSession();
            setMessage(
              "Settings saved. You can manage your products from this account.",
            );
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {(["name", "phone", "dispatchAddress", "coverage"] as const).map(
          (k) => (
            <label key={k}>
              {
                {
                  name: "Business / display name",
                  phone: "Fulfillment phone",
                  dispatchAddress: "Dispatch address (private)",
                  coverage:
                    "Delivery coverage — list the areas or states you serve",
                }[k]
              }
              <input
                required
                maxLength={k === "phone" ? 30 : 300}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ),
        )}
        <label>
          Delivery charge per order (₦)
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={form.deliveryFee}
            onChange={(e) =>
              setForm({ ...form, deliveryFee: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Estimated delivery days
          <input
            type="number"
            min={1}
            max={60}
            required
            value={form.deliveryDays}
            onChange={(e) =>
              setForm({ ...form, deliveryDays: Number(e.target.value) })
            }
          />
        </label>
        <p className="commerce-note">
          Your delivery charge is collected at checkout and included in your
          settlement after verified delivery. Product publication remains
          subject to verification.
        </p>
        {message && <p role="status">{message}</p>}
        <div className="commerce-actions">
          <button disabled={busy} className="primary">
            {busy ? "Saving…" : "Save settings"}
          </button>
          <Link to="/my-products">My products</Link>
        </div>
      </form>
    </section>
  );
}
