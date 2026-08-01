import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheck,
  FiClock,
  FiCreditCard,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiPhone,
  FiShoppingBag,
  FiTruck,
} from "react-icons/fi";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getOrder,
  sellerConfirmOrder as confirmSellerOrder,
} from "../services/order.service";
import {
  getSellerPickupTasks,
  type SellerPickupTask,
} from "../services/seller.service";
import {
  initializeOrdersPayment,
  initializePayAtDeliveryPayment,
} from "../services/payment.service";
import type { GleencOrder, OrderStatus } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { formatNaira } from "../utils/price";
import "./OrderDetails.css";

const timelineStatuses: OrderStatus[] = [
  "pending_payment",
  "paid",
  "seller_confirmed",
  "processing",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "completed",
];

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function timelineStageReached(order: GleencOrder, status: OrderStatus) {
  if (status === "pending_payment") return true;
  if (status === "paid") return order.paymentStatus === "paid";
  if (status === "seller_confirmed") {
    return (
      Boolean(order.sellerConfirmedAt) ||
      ["processing", "ready_for_delivery", "out_for_delivery", "delivered", "completed"].includes(
        order.status,
      )
    );
  }

  const currentIndex = timelineStatuses.indexOf(order.status);
  const stageIndex = timelineStatuses.indexOf(status);
  return currentIndex >= stageIndex && currentIndex >= 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function canContinuePayment(order: GleencOrder) {
  if (
    order.paymentStatus !== "unpaid" ||
    ["delivered", "completed", "cancelled", "disputed"].includes(order.status)
  ) {
    return false;
  }
  if (order.paymentMethod === "pay_now") return true;
  return ["seller_confirmed", "ready_for_delivery", "out_for_delivery"].includes(order.status);
}

function OrderDetails() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const paymentNotice =
    typeof location.state === "object" &&
    location.state &&
    "paymentNotice" in location.state
      ? String(location.state.paymentNotice || "")
      : "";
  const requestedOrderView =
    typeof location.state === "object" &&
    location.state &&
    "orderView" in location.state
      ? String(location.state.orderView || "")
      : "";
  const [order, setOrder] = useState<GleencOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOpeningPayment, setIsOpeningPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [sellerActionError, setSellerActionError] = useState("");
  const [sellerActionNotice, setSellerActionNotice] = useState("");
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [sellerPickupTask, setSellerPickupTask] =
    useState<SellerPickupTask | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void getOrder(id)
      .then((response) => {
        if (active) setOrder(response.order);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Order could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!order || user?.id !== order.sellerId) {
      setSellerPickupTask(null);
      return;
    }

    let active = true;

    void getSellerPickupTasks()
      .then((response) => {
        if (!active) return;
        setSellerPickupTask(
          response.pickupTasks.find((task) => task.orderId === order.id) ||
            null,
        );
      })
      .catch(() => {
        if (active) setSellerPickupTask(null);
      });

    return () => {
      active = false;
    };
  }, [order, user?.id]);

  async function handleContinuePayment() {
    if (!order || !canContinuePayment(order) || isOpeningPayment) return;

    setPaymentError("");
    setIsOpeningPayment(true);

    try {
      const response =
        order.paymentMethod === "pay_on_delivery"
          ? await initializePayAtDeliveryPayment(order.id)
          : await initializeOrdersPayment([order.id]);
      sessionStorage.setItem("gleank_pending_payment_reference", response.payment.reference);
      window.location.href = response.payment.authorizationUrl;
    } catch (requestError) {
      setPaymentError(
        requestError instanceof Error
          ? requestError.message
          : "Payment could not be reopened.",
      );
      setIsOpeningPayment(false);
    }
  }

  async function handleSellerConfirmOrder() {
    if (!order || isConfirmingOrder) return;

    setSellerActionError("");
    setSellerActionNotice("");
    setIsConfirmingOrder(true);

    try {
      const response = await confirmSellerOrder(
        order.id,
        "Seller confirmed product availability from the order details page.",
      );
      setOrder(response.order);
      setSellerActionNotice(
        "Order confirmed. Continue to package preparation and rider assignment.",
      );
    } catch (requestError) {
      setSellerActionError(
        requestError instanceof Error
          ? requestError.message
          : "The order could not be confirmed.",
      );
    } finally {
      setIsConfirmingOrder(false);
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading order details..." />;
  }

  if (!order) {
    const missingOrderBackPath =
      user?.role === "seller" && requestedOrderView !== "sales"
        ? "/purchases"
        : "/orders";
    return (
      <section className="page-shell order-details-page">
        <Link className="back-link" to={missingOrderBackPath}>
          <FiArrowLeft /> Back to orders
        </Link>
        <h1>Order not found</h1>
        <p>{error || "This order may have been removed or does not exist."}</p>
      </section>
    );
  }

  const isSellerOfOrder = user?.id === order.sellerId;
  const isBuyerOfOrder = user?.id === order.buyerId;
  const backPath =
    isSellerOfOrder
      ? "/orders"
      : user?.role === "seller" || user?.role === "admin"
        ? "/purchases"
        : "/orders";
  const backLabel = isSellerOfOrder ? "Back to Orders" : "Back to Your Orders";
  const showContinuePayment = isBuyerOfOrder && canContinuePayment(order);
  const sellerConfirmed = Boolean(order.sellerConfirmedAt);
  const sellerCanConfirm =
    isSellerOfOrder &&
    !sellerConfirmed &&
    !["cancelled", "disputed", "delivered", "completed"].includes(order.status) &&
    (order.paymentStatus === "paid" ||
      order.paymentMethod === "pay_on_delivery" ||
      Boolean(order.sellerConfirmationRequired));

  return (
    <section className="page-shell order-details-page order-details-upgraded-page">
      <Link className="back-link" to={backPath}>
        <FiArrowLeft /> {backLabel}
      </Link>

      <div className="order-details-hero">
        <div>
          <span className="eyebrow">Order Status</span>
          <h1>{order.orderCode}</h1>
          <p>
            {isSellerOfOrder
              ? `${order.buyerName || "A customer"} ordered from your store.`
              : `Your order from ${order.storeName} is currently ${order.statusLabel}.`}
          </p>
        </div>
        <div className="order-details-status-pill">{order.statusLabel}</div>
      </div>

      {paymentNotice && <div className="order-details-payment-notice">{paymentNotice}</div>}
      {paymentError && <div className="order-details-payment-error">{paymentError}</div>}
      {sellerActionNotice && (
        <div className="order-details-payment-notice">{sellerActionNotice}</div>
      )}
      {sellerActionError && (
        <div className="order-details-payment-error">{sellerActionError}</div>
      )}

      <div className="order-details-grid">
        <main className="order-details-main-card">
          <div className="delivery-info-strip">
            <span><FiMapPin /> {order.deliveryOption}</span>
            <strong>
              {order.deliveryOption === "Delivery" ? order.deliveryAddress : order.pickupLocation}
            </strong>
          </div>

          <section>
            <div className="checkout-section-title">
              <FiClock />
              <div>
                <h2>Order Timeline</h2>
                <p>Follow the order from payment to completion.</p>
              </div>
            </div>

            <div className="order-timeline">
              {timelineStatuses.map((status) => {
                const reached = timelineStageReached(order, status);
                return (
                  <div className="timeline-row" key={status}>
                    <span className={reached ? "done" : ""}>
                      {reached ? <FiCheck /> : <FiClock />}
                    </span>
                    <div>
                      <h3>
                        {status
                          .replaceAll("_", " ")
                          .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                      </h3>
                      <p>
                        {reached
                          ? "This stage has been reached."
                          : "Waiting for this stage."}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="checkout-section-title">
              <FiShoppingBag />
              <div>
                <h2>Order Items</h2>
                <p>{order.items.length} item(s) in this seller order.</p>
              </div>
            </div>

            <div className="order-detail-items">
              {order.items.map((item) => {
                const image = resolveMediaUrl(item.productImageUrl, productFallback);

                return (
                  <article key={item.id}>
                    <img src={image} alt={item.productName} />
                    <div>
                      <h3>{item.productName}</h3>
                      <p>Qty {item.quantity} • {formatNaira(item.unitPrice)}</p>
                    </div>
                    <strong>{formatNaira(item.total)}</strong>
                  </article>
                );
              })}
            </div>
          </section>

          <section>
            <div className="checkout-section-title">
              <FiPackage />
              <div>
                <h2>Order Events</h2>
                <p>Every important action is recorded here.</p>
              </div>
            </div>

            <div className="order-events-list">
              {order.events.map((event) => (
                <article key={event.id}>
                  <h3>{event.label}</h3>
                  <p>{event.note || event.status} • {formatDate(event.createdAt)}</p>
                </article>
              ))}
            </div>
          </section>
        </main>

        <aside className="order-details-side-card">
          <section>
            <h2>Delivery Details</h2>
            <p><strong>{order.deliveryOption}</strong></p>
            <p>{order.deliveryOption === "Delivery" ? order.deliveryAddress : order.pickupLocation}</p>
            {order.buyerPhone ? <p><FiPhone /> Buyer phone: {order.buyerPhone}</p> : null}
            <p><FiShoppingBag /> Seller: {order.storeName}</p>
          </section>

          <section className="delivery-code-panel">
            <span>{isSellerOfOrder ? "Seller Pickup Code" : "Delivery Code"}</span>
            <strong>
              {isSellerOfOrder
                ? sellerPickupTask?.sellerPickupCode || "Preparing"
                : order.verificationCode || "Locked"}
            </strong>
            <p>
              {isSellerOfOrder
                ? sellerPickupTask?.sellerPickupCode
                  ? "Keep this code private. Share it only with the assigned rider when the package is collected."
                  : "The seller pickup code is created with the dispatch record after order confirmation."
                : order.verificationCode
                  ? "Keep this private. Share it only after receiving the correct item."
                  : "Your delivery code unlocks only after Gleenc verifies payment."}
            </p>
          </section>

          <section>
            <h2>Payment Summary</h2>
            <div className="payment-summary-line">
              <span>Subtotal</span>
              <strong>{formatNaira(order.subtotal)}</strong>
            </div>
            <div className="payment-summary-line">
              <span>Delivery fee</span>
              <strong>{formatNaira(order.deliveryFee)}</strong>
            </div>
            <div className="payment-summary-line total">
              <span>Total</span>
              <strong>{formatNaira(order.total)}</strong>
            </div>
            <p className="payment-status-note">Payment status: {order.paymentStatus}</p>
            <p className="payment-status-note">
              Method:{" "}
              {order.paymentMethod === "pay_on_delivery"
                ? "Pay at Delivery through Gleenc/Paystack"
                : "Pay Now through Gleenc/Paystack"}
            </p>
            {order.payoutStatus && (
              <p className="payment-status-note">Seller payout: {order.payoutStatus}</p>
            )}

            {showContinuePayment && (
              <button
                className="continue-payment-btn detail-payment-btn"
                type="button"
                disabled={isOpeningPayment}
                onClick={() => void handleContinuePayment()}
              >
                <FiCreditCard />
                {isOpeningPayment ? "Opening payment..." : "Continue Payment"}
              </button>
            )}
          </section>

          {isSellerOfOrder && (
            <section className="seller-order-detail-actions">
              <h2>Seller fulfilment</h2>
              {sellerCanConfirm ? (
                <>
                  <p>
                    Confirm that the ordered products are available before package
                    preparation and rider dispatch can continue.
                  </p>
                  <button
                    type="button"
                    disabled={isConfirmingOrder}
                    onClick={() => void handleSellerConfirmOrder()}
                  >
                    <FiCheck />
                    {isConfirmingOrder ? "Confirming..." : "Confirm order"}
                  </button>
                </>
              ) : sellerConfirmed ? (
                <>
                  <p className="seller-order-detail-confirmed">
                    <FiCheck /> Seller confirmed
                  </p>
                  {sellerPickupTask ? (
                    <div className="seller-order-detail-dispatch-summary">
                      <p>
                        Package:{" "}
                        <strong>
                          {sellerPickupTask.sellerMarkedReady
                            ? "Ready for rider selection"
                            : "Waiting for package details"}
                        </strong>
                      </p>
                      <p>
                        Dispatch:{" "}
                        <strong>
                          {sellerPickupTask.assignedRiderId
                            ? "Rider assigned"
                            : (
                                sellerPickupTask.dispatchStatus ||
                                "Not started"
                              ).replaceAll("_", " ")}
                        </strong>
                      </p>
                      <p>
                        Pickup point:{" "}
                        <strong>
                          {sellerPickupTask.pickupLandmark ||
                            sellerPickupTask.pickupZoneId ||
                            "Store pickup location"}
                        </strong>
                      </p>
                    </div>
                  ) : null}
                  <Link to="/orders">
                    <FiTruck /> Prepare package / assign rider
                  </Link>
                </>
              ) : (
                <p>
                  {order.paymentMethod === "pay_now" &&
                  order.paymentStatus !== "paid"
                    ? "Waiting for the buyer's payment confirmation."
                    : "No seller action is available for this order status."}
                </p>
              )}
            </section>
          )}

          <Link className="order-message-link" to={`/messages?order=${order.id}`}>
            <FiMessageCircle /> {isSellerOfOrder ? "Message buyer" : "Message seller"}
          </Link>
        </aside>
      </div>
    </section>
  );
}

export default OrderDetails;
