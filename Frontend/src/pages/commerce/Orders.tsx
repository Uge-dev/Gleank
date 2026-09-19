import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { commerce } from "../../services/commerce.service";
import type { GleencOrder } from "../../types/domain";
import "./Commerce.css";
export default function Orders() {
  const [data, setData] = useState<{
    purchases: GleencOrder[];
    sales: GleencOrder[];
  }>({ purchases: [], sales: [] });
  const [tab, setTab] = useState<"purchases" | "sales">("purchases");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    commerce
      .orders()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="commerce-page">
      <h1>Your orders</h1>
      <p>Purchases and sales, together in your account.</p>
      <div className="commerce-tabs">
        {(["purchases", "sales"] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "purchases" ? "Purchases" : "Sales"} ({data[t].length})
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="commerce-error">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading orders…</p>
      ) : data[tab].length === 0 ? (
        <div className="commerce-card">
          No {tab} yet. <Link to="/search">Explore products</Link>
        </div>
      ) : (
        data[tab].map((order) => (
          <Link
            className="commerce-card order-row"
            key={order.id}
            to={"/orders/" + order.id}
          >
            <strong>
              {order.orderCode} · {order.storeName}
            </strong>
            <p>
              {order.items
                .map((i) => `${i.quantity} × ${i.productName}`)
                .join(", ")}
            </p>
            <span className="commerce-status">
              {order.status.replaceAll("_", " ")} · {order.paymentStatus}
            </span>
            <p>
              ₦{order.total.toLocaleString()} · Settlement:{" "}
              {order.payoutStatus?.replaceAll("_", " ")}
            </p>
          </Link>
        ))
      )}
    </section>
  );
}
