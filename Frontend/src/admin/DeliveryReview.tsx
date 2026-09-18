import { useEffect, useState } from "react";
import {
  fetchAdminDeliveryPackages,
  type AdminDeliveryPackage,
} from "./adminApi";
import { apiUrl } from "../lib/api";
export default function DeliveryReview({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const [packages, setPackages] = useState<AdminDeliveryPackage[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchAdminDeliveryPackages(orderId)
      .then((r) => {
        if (active) setPackages(r.packages);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId]);
  return (
    <section className="admin-market-create-card">
      <button onClick={onClose}>Close delivery review</button>
      <h2>Delivery evidence · {orderId}</h2>
      <p>
        Transport receipts prove shipment. Only the buyer can confirm package
        receipt.
      </p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Loading evidence…</p>
      ) : !packages.length ? (
        <p>No package labels have been generated.</p>
      ) : (
        packages.map((p) => (
          <article key={p.id}>
            <h3>
              {p.quantity} × {p.product_name}
            </h3>
            <p>
              {p.status} · {p.method} · {p.transport_name}{" "}
              {p.tracking_reference}
            </p>
            <p>
              Expected: {p.expected_arrival || "Not dispatched"} · Buyer
              confirmed: {p.confirmed_at || "Not yet"}
            </p>
            {Boolean(p.has_receipt) && (
              <a
                href={apiUrl(`/admin/commerce/packages/${p.id}/receipt`)}
                target="_blank"
                rel="noreferrer"
              >
                View transport receipt
              </a>
            )}
          </article>
        ))
      )}
    </section>
  );
}
