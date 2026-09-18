import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import type { SellerPayout } from "../../services/seller.service";
import "./Commerce.css";
type Bank = { name: string; code: string };
export default function Earnings() {
  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [account, setAccount] = useState<{
    accountName: string;
    last4: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest<{ payouts: SellerPayout[] }>("/commerce/earnings")
      .then((r) => setPayouts(r.payouts))
      .catch((e) => setError(e.message));
    apiRequest<{ account: typeof account }>("/commerce/payout/account")
      .then((r) => setAccount(r.account))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="commerce-page">
      <h1>Earnings</h1>
      <p>
        Payments remain held until verified completion. “Eligible” means ready
        for payout checks; “released” means a successful provider transfer was
        verified.
      </p>
      {error && (
        <p role="alert" className="commerce-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="commerce-grid">
        {["on_hold", "eligible", "released"].map((status) => (
          <div className="commerce-card" key={status}>
            <span className="commerce-status">
              {status.replaceAll("_", " ")}
            </span>
            <h2>
              ₦
              {payouts
                .filter((p) => p.status === status)
                .reduce((sum, p) => sum + p.sellerAmount, 0)
                .toLocaleString()}
            </h2>
          </div>
        ))}
      </div>
      <div className="commerce-card">
        <h2>Payout account</h2>
        {account && (
          <p>
            {account.accountName} · ending {account.last4}
          </p>
        )}
        <button
          onClick={() => {
            setError("");
            apiRequest<{ banks: Bank[] }>("/commerce/payout/banks")
              .then((r) => setBanks(r.banks))
              .catch((e) => setError(e.message));
          }}
        >
          Set up / change bank account
        </button>
        {banks.length > 0 && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              const form = e.currentTarget;
              try {
                const r = await apiRequest<{ account: typeof account }>(
                  "/commerce/payout/account",
                  {
                    method: "PUT",
                    body: JSON.stringify(Object.fromEntries(f)),
                  },
                );
                setAccount(r.account);
                form.reset();
                setMessage("Payout account saved.");
                setBanks([]);
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not save account.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Bank
              <select name="bankCode" required>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Account number
              <input
                name="accountNumber"
                inputMode="numeric"
                pattern="[0-9]{10}"
                required
                maxLength={10}
              />
            </label>
            <label>
              Confirm your current password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button className="primary" disabled={busy}>
              Verify and save account
            </button>
          </form>
        )}
      </div>
      {payouts.map((p) => (
        <div className="commerce-card" key={p.id} style={{ marginTop: 16 }}>
          <p>Order {p.orderId}</p>
          <p>
            Platform revenue: ₦{p.platformFee.toLocaleString()} · Delivery
            collected: ₦{p.deliveryFee.toLocaleString()}
          </p>
          <strong>
            Your proceeds: ₦{p.sellerAmount.toLocaleString()} ·{" "}
            {p.status.replaceAll("_", " ")}
          </strong>
          <p>{p.holdReason}</p>
        </div>
      ))}
    </section>
  );
}
