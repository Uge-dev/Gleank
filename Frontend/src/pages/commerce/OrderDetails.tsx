import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrder, openOrderDispute } from "../../services/order.service";
import { initializePayment } from "../../services/payment.service";
import {
  commerce,
  type DeliveryPackage,
} from "../../services/commerce.service";
import type { GleencOrder } from "../../types/domain";
import "./Commerce.css";
import { apiUrl } from "../../lib/api";
function Label({ order, pkg }: { order: GleencOrder; pkg: DeliveryPackage }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    const url = `${window.location.origin}/orders/${order.id}#package=${encodeURIComponent(pkg.id)}&code=${encodeURIComponent(pkg.code || "")}`;
    QRCode.toDataURL(url, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then(setQr);
  }, [order.id, pkg.id, pkg.code]);
  const item = order.items.find((i) => i.id === pkg.orderItemId);
  return (
    <div className="package-label commerce-card">
      <strong>Gleenc · {order.orderCode}</strong>
      <p>
        {item?.quantity} × {item?.productName}
      </p>
      {qr && <img src={qr} alt="Delivery confirmation QR code" />}
      <p className="commerce-code">{pkg.code?.match(/.{1,4}/g)?.join("-")}</p>
      <small>
        Buyer: scan this label or enter the code in your order. Confirm only
        after checking and receiving this package.
      </small>
    </div>
  );
}
export default function OrderDetails() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<GleencOrder | null>(null);
  const [packages, setPackages] = useState<DeliveryPackage[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [methods, setMethods] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const [o, p] = await Promise.all([getOrder(id), commerce.packages(id)]);
    setOrder(o.order);
    setPackages(p.packages);
  }, [id]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("package") && hash.get("code")) {
      setCodes({ [hash.get("package")!]: hash.get("code")! });
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [load]);
  async function act(fn: () => Promise<unknown>, success = "Saved.") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  const seller = order?.sellerId === user?.id;
  return (
    <section className="commerce-page">
      {seller &&
        order &&
        createPortal(
          <div className="gleenc-print-labels">
            {packages.map((pkg) => (
              <Label key={pkg.id} order={order} pkg={pkg} />
            ))}
          </div>,
          document.body,
        )}
      <Link to="/orders">← All orders</Link>
      <h1>{order?.orderCode || "Order details"}</h1>
      {error && (
        <p role="alert" className="commerce-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="commerce-note">
          {message}
        </p>
      )}
      {order && (
        <>
          <div className="commerce-card">
            <h2>{order.storeName}</h2>
            {order.items.map((i) => (
              <p key={i.id}>
                {i.quantity} × {i.productName} · ₦{i.total.toLocaleString()}
              </p>
            ))}
            <p>
              Total: ₦{order.total.toLocaleString()} · Delivery: ₦
              {order.deliveryFee.toLocaleString()}
            </p>
            <p className="commerce-status">
              {order.status.replaceAll("_", " ")} · Payment{" "}
              {order.paymentStatus}
            </p>
            <p>
              Deliver to: {order.buyerName} · {order.deliveryAddress}
              {seller && order.buyerPhone && <> · {order.buyerPhone}</>}
            </p>
            <p>
              Settlement: {order.payoutStatus?.replaceAll("_", " ")}. Payment
              remains held until all packages are confirmed and settlement
              checks pass.
            </p>
            {!seller && order.paymentStatus !== "paid" && (
              <button
                disabled={busy}
                className="primary"
                onClick={() =>
                  void act(async () => {
                    const r = await initializePayment({
                      purpose: "store_order",
                      targetId: id,
                    });
                    window.location.assign(r.payment.authorizationUrl);
                  }, "Opening checkout…")
                }
              >
                Pay securely
              </button>
            )}
          </div>
          {seller && order.paymentStatus === "paid" && (
            <div className="commerce-actions">
              <button
                disabled={busy}
                className="primary"
                onClick={() =>
                  void act(
                    () => commerce.prepare(id),
                    "Labels are ready. Print and attach each label before dispatch.",
                  )
                }
              >
                Generate delivery labels
              </button>
              {packages.length > 0 && (
                <button onClick={() => window.print()}>Print labels</button>
              )}
            </div>
          )}
          {!packages.length && (
            <p>
              Delivery labels become available to the product owner after
              payment.
            </p>
          )}
          {packages.map((pkg) => (
            <article
              className="commerce-card"
              key={pkg.id}
              style={{ marginTop: 20 }}
            >
              <h2>
                {order.items.find((i) => i.id === pkg.orderItemId)?.productName}
              </h2>
              <p className="commerce-status">{pkg.status}</p>
              {seller && <Label order={order} pkg={pkg} />}
              {pkg.dispatchedAt && (
                <p>
                  {pkg.method === "transport"
                    ? `${pkg.transportName} · ${pkg.trackingReference}`
                    : "Personal delivery"}{" "}
                  · Expected {pkg.expectedArrival}
                </p>
              )}
              {pkg.hasReceipt && (
                <a
                  href={apiUrl(
                    `/commerce/orders/${id}/packages/${pkg.id}/receipt`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transport receipt (shipment evidence)
                </a>
              )}
              {seller && pkg.status === "prepared" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = new FormData(e.currentTarget);
                    void act(
                      () => commerce.dispatch(id, pkg.id, body),
                      "Dispatch recorded. The buyer must confirm at handover.",
                    );
                  }}
                >
                  <label>
                    Delivery method
                    <select
                      name="method"
                      value={methods[pkg.id] || "personal"}
                      onChange={(e) =>
                        setMethods({ ...methods, [pkg.id]: e.target.value })
                      }
                    >
                      <option value="personal">Deliver in person</option>
                      <option value="transport">Use a transport company</option>
                    </select>
                  </label>
                  {methods[pkg.id] === "transport" && (
                    <>
                      <label>
                        Transport company
                        <input name="transportName" required maxLength={120} />
                      </label>
                      <label>
                        Shipment / receipt reference
                        <input
                          name="trackingReference"
                          required
                          maxLength={120}
                        />
                      </label>
                      <label>
                        Transport receipt image
                        <input
                          type="file"
                          name="receipt"
                          accept="image/jpeg,image/png,image/webp"
                          required
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Expected arrival
                    <input type="date" name="expectedArrival" required />
                  </label>
                  <p>
                    Attach the printed label. Instruct the transporter to let
                    the buyer inspect the package and confirm receipt at
                    handover.
                  </p>
                  <button disabled={busy} className="primary">
                    Mark dispatched
                  </button>
                </form>
              )}
              {seller && pkg.status === "dispatched" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () => commerce.remind(id, pkg.id),
                      "Reminder sent to the buyer.",
                    )
                  }
                >
                  Request delivery confirmation
                </button>
              )}
              {!seller && pkg.status === "dispatched" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(
                      () => commerce.confirm(id, pkg.id, codes[pkg.id] || ""),
                      "Receipt confirmed. Thank you.",
                    );
                  }}
                >
                  <label>
                    Delivery code from the package
                    <input
                      autoComplete="off"
                      required
                      maxLength={40}
                      value={codes[pkg.id] || ""}
                      onChange={(e) =>
                        setCodes({ ...codes, [pkg.id]: e.target.value })
                      }
                    />
                  </label>
                  <small>
                    You can also use your phone’s camera to scan the printed QR
                    code. It opens this order and fills the code.
                  </small>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      required
                      checked={Boolean(checked[pkg.id])}
                      onChange={(e) =>
                        setChecked({ ...checked, [pkg.id]: e.target.checked })
                      }
                    />
                    I have checked and received this package. I understand
                    confirmation makes its payment eligible for settlement once
                    the full order is complete.
                  </label>
                  <button
                    disabled={busy || !checked[pkg.id]}
                    className="primary"
                  >
                    Confirm received
                  </button>
                </form>
              )}
              {pkg.confirmedAt && (
                <p>
                  Receipt confirmed on{" "}
                  {new Date(pkg.confirmedAt).toLocaleString()}.
                </p>
              )}
            </article>
          ))}
          {!seller && order.paymentStatus === "paid" && (
            <form
              className="commerce-card"
              style={{ marginTop: 24 }}
              onSubmit={(e) => {
                e.preventDefault();
                const reason = String(
                  new FormData(e.currentTarget).get("reason"),
                );
                void act(
                  () => openOrderDispute(id, { reason }),
                  "Your issue has been submitted for review.",
                );
              }}
            >
              <h2>Something wrong?</h2>
              <p>
                If the package has not arrived or there is a problem, report it
                instead of confirming receipt.
              </p>
              <label>
                Describe the issue
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                />
              </label>
              <button disabled={busy}>Report delivery problem</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
