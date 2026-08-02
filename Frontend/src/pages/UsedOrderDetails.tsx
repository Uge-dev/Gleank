import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiLock,
  FiMessageCircle,
  FiPackage,
  FiUpload,
  FiShield,
  FiTruck,
} from "react-icons/fi";

import ErrorState from "../components/ErrorState";
import { useAuth } from "../context/AuthContext";
import LoadingState from "../components/LoadingState";
import { createConversation } from "../services/message.service";
import {
  getUsedOrder,
  chooseUsedOrderFulfillment,
  getUsedOrderAvailableRiders,
  assignUsedOrderRider,
  submitUsedDeliveryProof,
  updateUsedOrderStatus,
} from "../services/used-order.service";
import type { AvailableDeliveryRider } from "../services/seller.service";

import { initializeUsedOrderPayment } from "../services/payment.service";
import type { UsedMarketOrder, UsedMarketOrderStatus } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function UsedOrderDetails() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<UsedMarketOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [riders, setRiders] = useState<AvailableDeliveryRider[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [deliveryProof, setDeliveryProof] = useState<File | null>(null);

  function loadOrder() {
    setIsLoading(true);
    setError("");

    void getUsedOrder(id)
      .then((response) => setOrder(response.order))
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Used order could not be loaded.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(loadOrder, [id]);

  async function handlePay() {
  if (!order) return;

  setIsWorking(true);
  setError("");

  try {
    const response = await initializeUsedOrderPayment(order.id);
    window.location.href = response.payment.authorizationUrl;
  } catch (requestError) {
    setError(
      requestError instanceof Error
        ? requestError.message
        : "Payment could not be initialized.",
    );
  } finally {
    setIsWorking(false);
  }
}

  async function handleStatus(status: UsedMarketOrderStatus, note = "") {
    if (!order) return;
    setIsWorking(true);
    setError("");
    try {
      const response = await updateUsedOrderStatus(order.id, status, note);
      setOrder(response.order);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Order status could not be updated.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleFulfillment(method: "gleenc_rider" | "external_delivery") {
    if (!order) return;
    setIsWorking(true);
    setError("");
    try {
      const response = await chooseUsedOrderFulfillment(order.id, method);
      setOrder(response.order);
      if (method === "gleenc_rider") {
        const riderResponse = await getUsedOrderAvailableRiders(order.id);
        setRiders(riderResponse.riders || []);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Delivery method could not be saved.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleAssignRider() {
    if (!order || !selectedRiderId) return;
    setIsWorking(true);
    setError("");
    try {
      await assignUsedOrderRider(order.id, selectedRiderId);
      loadOrder();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The rider could not be assigned.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleExternalProof() {
    if (!order || !deliveryProof) return;
    setIsWorking(true);
    setError("");
    try {
      const form = new FormData();
      form.append("proofImage", deliveryProof);
      form.append("note", "Seller submitted proof for external delivery.");
      const response = await submitUsedDeliveryProof(order.id, form);
      setOrder(response.order);
      setDeliveryProof(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Delivery proof could not be submitted.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleOpenMessages() {
    if (!order) return;
    setIsWorking(true);
    try {
      const response = await createConversation({
        contextType: "used_order",
        contextId: order.id,
      });
      navigate(`/messages?conversation=${response.conversation.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Conversation could not be opened.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoading) {
    return (
      <section className="used-order-page">
        <LoadingState
          title="Loading protected used order"
          message="Loading escrow status, timeline and message link."
        />
      </section>
    );
  }

  if (error && !order) {
    return (
      <section className="used-order-page">
        <ErrorState title="Order unavailable" message={error} onRetry={loadOrder} />
      </section>
    );
  }

  if (!order) return null;

  const isBuyer = user?.id === order.buyerId;
  const isSeller = user?.id === order.sellerId;

  return (
    <section className="used-order-page">
      <Link to="/used-market/dashboard" className="secure-used-back">
        <FiArrowLeft />
        Used Market dashboard
      </Link>

      <div className="used-order-hero">
        <span>
          <FiShield />
          {order.statusLabel}
        </span>
        <h1>{order.orderCode}</h1>
        <p>
          Protected order for <strong>{order.listingName}</strong>. Use messages for coordination and only confirm received after inspection.
        </p>
      </div>

      {error && <p className="used-inline-error">{error}</p>}

      <div className="used-order-layout">
        <main className="used-order-main">
          <section className="used-order-card used-order-item-card">
            <img src={resolveMediaUrl(order.listingImageUrl, usedFallback)} alt={order.listingName} />
            <div>
              <h2>{order.listingName}</h2>
              <p>{order.listingCategory} • {order.listingCondition}</p>
              <strong>{formatPrice(order.total)}</strong>
            </div>
          </section>

          <section className="used-order-card">
            <div className="used-form-section-title">
              <FiClock />
              <div>
                <h2>Order timeline</h2>
                <p>Status history for this protected used-market transaction.</p>
              </div>
            </div>

            <div className="used-order-timeline">
              {order.events.map((event) => (
                <div className="used-timeline-item" key={event.id}>
                  <span />
                  <div>
                    <strong>{event.label}</strong>
                    <p>{event.note || event.status}</p>
                    <small>{new Date(event.createdAt).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="used-order-card">
            <div className="used-form-section-title">
              <FiPackage />
              <div>
                <h2>Pickup / delivery information</h2>
                <p>Use this information with the built-in messages.</p>
              </div>
            </div>
            <div className="used-order-info-grid">
              <div><span>Buyer</span><strong>{order.buyerName}</strong></div>
              {order.buyerPhone ? (
                <div><span>Phone</span><strong>{order.buyerPhone}</strong></div>
              ) : null}
              <div><span>Campus</span><strong>{order.campus}</strong></div>
              <div><span>Option</span><strong>{order.deliveryOption}</strong></div>
              <div><span>Return policy</span><strong>{order.returnDays === 0 ? "No returns" : `${order.returnDays || 0} day(s)`}</strong></div>
              <div><span>Pickup</span><strong>{order.pickupLocation || "Not set"}</strong></div>
              <div><span>Delivery address</span><strong>{order.deliveryAddress || "Not required"}</strong></div>
            </div>
          </section>
        </main>

        <aside className="used-order-side">
          <section className="used-order-card">
            <div className="used-protected-status-icon">
              <FiLock />
            </div>
            <h2>Buyer protection</h2>
            <p>
              {isSeller ? "Seller pickup code" : "Verification code"}: {" "}
              <strong>{isSeller ? order.sellerPickupCode || "Locks until a rider is assigned" : order.verificationCode}</strong>
            </p>
            <p className="used-small-note">
              {isSeller
                ? "Share this only with the assigned rider at the physical pickup."
                : "Share this only when the item has been inspected and accepted."}
            </p>
          </section>

          <section className="used-order-card">
            <div className="used-summary-lines">
              <div><span>Item price</span><strong>{formatPrice(order.itemPrice)}</strong></div>
              <div><span>Protection fee</span><strong>{formatPrice(order.protectionFee)}</strong></div>
              <div><span>Delivery fee</span><strong>{formatPrice(order.deliveryFee)}</strong></div>
              <div className="total"><span>Total</span><strong>{formatPrice(order.total)}</strong></div>
            </div>
          </section>

          <section className="used-order-card used-action-stack">
            {isBuyer && order.status === "pending_payment" && (
              <button type="button" onClick={() => void handlePay()} disabled={isWorking}>
                <FiCreditCard />
                Pay with Gleenc protection
              </button>
            )}

            {isSeller && order.paymentStatus === "paid" && order.fulfillmentMethod === "undecided" && (
              <div className="delivery-code-action">
                <strong>Choose how this item will be delivered</strong>
                <button type="button" onClick={() => void handleFulfillment("gleenc_rider")} disabled={isWorking}>
                  <FiTruck /> Use a Gleenc rider
                </button>
                <button type="button" className="secondary" onClick={() => void handleFulfillment("external_delivery")} disabled={isWorking}>
                  External delivery
                </button>
              </div>
            )}

            {isSeller && order.fulfillmentMethod === "gleenc_rider" && order.fulfillmentStatus === "awaiting_rider_assignment" && (
              <div className="delivery-code-action">
                <label>
                  Available rider
                  <select value={selectedRiderId} onChange={(event) => setSelectedRiderId(event.target.value)}>
                    <option value="">Select an online rider</option>
                    {riders.map((rider) => (
                      <option key={rider.id} value={rider.id}>{rider.name} · {rider.vehicleType || rider.transportType || "Rider"}</option>
                    ))}
                  </select>
                </label>
                {!riders.length ? (
                  <button type="button" className="secondary" onClick={() => void getUsedOrderAvailableRiders(order.id).then((response) => setRiders(response.riders || [])).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Riders could not be loaded."))}>
                    Refresh available riders
                  </button>
                ) : null}
                <button type="button" onClick={() => void handleAssignRider()} disabled={isWorking || !selectedRiderId}>
                  <FiTruck /> Assign selected rider
                </button>
              </div>
            )}

            {isSeller && order.fulfillmentMethod === "external_delivery" && !["delivered", "completed"].includes(order.status) && (
              <div className="delivery-code-action">
                <label>
                  External delivery proof
                  <input type="file" accept="image/*" onChange={(event) => setDeliveryProof(event.target.files?.[0] || null)} />
                </label>
                <button type="button" onClick={() => void handleExternalProof()} disabled={isWorking || !deliveryProof}>
                  <FiUpload /> Submit proof and mark delivered
                </button>
              </div>
            )}

            {isBuyer && order.status === "delivered" && (
              <button type="button" onClick={() => void handleStatus("completed", "Buyer confirmed item received and accepted.")} disabled={isWorking}>
                <FiCheckCircle />
                Confirm received
              </button>
            )}

            {isBuyer && order.status === "pending_payment" && (
              <button type="button" className="secondary" onClick={() => void handleStatus("cancelled", "Buyer cancelled before payment.")} disabled={isWorking}>
                Cancel order
              </button>
            )}

            {(isBuyer || isSeller) && !["completed", "cancelled", "disputed"].includes(order.status) && (
              <button type="button" className="danger" onClick={() => void handleStatus("disputed", "Issue reported for Gleenc review.")} disabled={isWorking}>
                <FiAlertTriangle />
                Report issue
              </button>
            )}

            <button type="button" className="secondary" onClick={() => void handleOpenMessages()} disabled={isWorking}>
              <FiMessageCircle />
              Message buyer/seller
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}

export default UsedOrderDetails;
