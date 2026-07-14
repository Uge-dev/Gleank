import { Link, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiPhone,
  FiShoppingBag,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";

type OrderStatus = "Pending" | "Confirmed" | "Preparing" | "Delivered" | "Cancelled";

type OrderDetailsItem = {
  id: string;
  productName: string;
  seller: string;
  sellerUsername: string;
  sellerPhone: string;
  image: string;
  amount: number;
  quantity: number;
  status: OrderStatus;
  date: string;
  deliveryType: "Pickup" | "Delivery";
  location: string;
  buyerName: string;
  buyerPhone: string;
  note: string;
};

type LastOrderItem = {
  id: string;
  name: string;
  price: string;
  numericPrice: number;
  image: string;
  sellerName: string;
  sellerId: string;
  campus: string;
  quantity: number;
};

type LastOrder = {
  reference: string;
  items: LastOrderItem[];
  subtotal: number;
  total: number;
  delivery: string;
  status: string;
  createdAt: string;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatOrderDate(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return dateValue;

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getProgressLevel(status: OrderStatus) {
  if (status === "Pending") return 1;
  if (status === "Confirmed") return 2;
  if (status === "Preparing") return 3;
  if (status === "Delivered") return 4;

  return 0;
}

function getStatusIcon(status: OrderStatus) {
  if (status === "Pending") return <FiClock />;
  if (status === "Confirmed") return <FiCheckCircle />;
  if (status === "Preparing") return <FiPackage />;
  if (status === "Delivered") return <FiTruck />;

  return <FiXCircle />;
}

function getLastCheckoutOrder(): OrderDetailsItem | null {
  try {
    const savedOrder = localStorage.getItem("gleank_last_order");

    if (!savedOrder) return null;

    const parsedOrder = JSON.parse(savedOrder) as LastOrder;

    if (!parsedOrder.reference || !Array.isArray(parsedOrder.items)) {
      return null;
    }

    const firstItem = parsedOrder.items[0];

    if (!firstItem) return null;

    return {
      id: parsedOrder.reference,
      productName:
        parsedOrder.items.length > 1
          ? `${firstItem.name} + ${parsedOrder.items.length - 1} more`
          : firstItem.name,
      seller: firstItem.sellerName,
      sellerUsername: firstItem.sellerId,
      sellerPhone: "Not provided yet",
      image: firstItem.image,
      amount: parsedOrder.total || parsedOrder.subtotal,
      quantity: parsedOrder.items.reduce((total, item) => {
        return total + item.quantity;
      }, 0),
      status: "Pending",
      date: formatOrderDate(parsedOrder.createdAt),
      deliveryType: "Pickup",
      location: firstItem.campus || "Campus pickup",
      buyerName: "You",
      buyerPhone: "Provided during checkout",
      note: "Order request sent. Seller will confirm availability.",
    };
  } catch {
    return null;
  }
}

function Order() {
  const { id } = useParams();

  const lastCheckoutOrder = getLastCheckoutOrder();

  const orders = lastCheckoutOrder ? [lastCheckoutOrder] : [];

  const order = orders.find((item) => item.id === id);

  if (!order) {
    return (
      <section className="single-order-page">
        <EmptyState
          icon={<FiShoppingBag />}
          eyebrow="Order not found"
          title="We could not find this order"
          message="This order may no longer exist, or the order link may be incorrect."
          actionLabel="Back to Orders"
          onAction={() => {
            window.location.href = "/orders";
          }}
        />
      </section>
    );
  }

  const progress = getProgressLevel(order.status);

  return (
    <section className="single-order-page">
      <Link to="/orders" className="single-order-back">
        <FiArrowLeft />
        Back to Orders
      </Link>

      <div className="single-order-hero">
        <div>
          <span>Order Tracking</span>
          <h1>{order.id}</h1>
          <p>
            Track this order request, seller confirmation, preparation, pickup,
            or delivery progress.
          </p>
        </div>

        <div className={`single-order-status ${order.status.toLowerCase()}`}>
          {getStatusIcon(order.status)}
          {order.status}
        </div>
      </div>

      <div className="single-order-layout">
        <div className="single-order-main">
          <article className="single-order-product-card">
            <img src={order.image} alt={order.productName} />

            <div>
              <span>{order.seller}</span>
              <h2>{order.productName}</h2>
              <p>
                Qty {order.quantity} • {order.deliveryType} • {order.location}
              </p>
              <strong>{formatPrice(order.amount)}</strong>
            </div>
          </article>

          {order.status !== "Cancelled" ? (
            <div className="single-order-progress-card">
              <h2>Order Progress</h2>

              <div className="single-order-progress">
                <div className={progress >= 1 ? "done" : ""}>
                  <span>
                    <FiClock />
                  </span>
                  <strong>Pending</strong>
                  <p>Order request was sent to the seller.</p>
                </div>

                <div className={progress >= 2 ? "done" : ""}>
                  <span>
                    <FiCheckCircle />
                  </span>
                  <strong>Confirmed</strong>
                  <p>Seller confirms item availability.</p>
                </div>

                <div className={progress >= 3 ? "done" : ""}>
                  <span>
                    <FiPackage />
                  </span>
                  <strong>Preparing</strong>
                  <p>Seller prepares the product or service.</p>
                </div>

                <div className={progress >= 4 ? "done" : ""}>
                  <span>
                    <FiTruck />
                  </span>
                  <strong>Delivered</strong>
                  <p>Order has been delivered or picked up.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="single-order-cancelled">
              <FiXCircle />
              This order has been cancelled.
            </div>
          )}
        </div>

        <aside className="single-order-side">
          <section>
            <h2>Delivery Details</h2>

            <div className="single-order-info-row">
              <FiMapPin />
              <div>
                <span>Location</span>
                <strong>{order.location}</strong>
              </div>
            </div>

            <div className="single-order-info-row">
              <FiTruck />
              <div>
                <span>Type</span>
                <strong>{order.deliveryType}</strong>
              </div>
            </div>

            <div className="single-order-info-row">
              <FiClock />
              <div>
                <span>Placed</span>
                <strong>{order.date}</strong>
              </div>
            </div>
          </section>

          <section>
            <h2>Seller</h2>

            <div className="single-order-info-row">
              <FiShoppingBag />
              <div>
                <span>Store</span>
                <strong>{order.seller}</strong>
              </div>
            </div>

            <div className="single-order-info-row">
              <FiPhone />
              <div>
                <span>Contact</span>
                <strong>{order.sellerPhone}</strong>
              </div>
            </div>

            <Link to="/messages" className="single-order-message">
              <FiMessageCircle />
              Message Seller
            </Link>
          </section>

          <section>
            <h2>Order Note</h2>
            <p>{order.note}</p>
          </section>
        </aside>
      </div>
    </section>
  );
}

export default Order;
