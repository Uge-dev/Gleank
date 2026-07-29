import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiTruck,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import {
  confirmSellerOrderItemAvailability,
  getAvailableDeliveryRiders,
  getSellerOrders,
  getSellerPickupTasks,
  markSellerPickupTaskReady,
  rejectSellerOrderItemAvailability,
  sendDeliveryOfferToRider,
  startAutomaticDispatchForBatch,
} from "../services/seller.service";
import type {
  AvailableDeliveryRider,
  SellerPickupTask,
} from "../services/seller.service";
import type { GleencOrder } from "../types/domain";
import { formatNaira } from "../utils/price";
import { resolveMediaUrl } from "../utils/media";
import { SellerOrderReadinessPanel } from "./Dashboard";

const orderImageFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=600&q=80";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SellerOrders() {
  const [orders, setOrders] = useState<GleencOrder[]>([]);
  const [pickupTasks, setPickupTasks] = useState<SellerPickupTask[]>([]);
  const [availableRidersByBatch, setAvailableRidersByBatch] = useState<
    Record<string, AvailableDeliveryRider[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingRiders, setIsLoadingRiders] = useState(false);
  const [taskActionId, setTaskActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    const response = await getSellerOrders();
    setOrders(response.orders || []);
  }, []);

  const loadPickupTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const response = await getSellerPickupTasks();
      setPickupTasks(response.pickupTasks || []);
    } finally {
      setIsLoadingTasks(false);
    }
  }, []);

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      await Promise.all([loadOrders(), loadPickupTasks()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Buyer orders could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadOrders, loadPickupTasks]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const summary = useMemo(
    () => ({
      total: orders.length,
      needsAction: orders.filter((order) =>
        ["paid", "seller_confirmed", "processing", "ready_for_delivery"].includes(
          order.status,
        ),
      ).length,
      inDelivery: orders.filter((order) => order.status === "out_for_delivery").length,
      completed: orders.filter((order) =>
        ["delivered", "completed"].includes(order.status),
      ).length,
    }),
    [orders],
  );

  const loadAvailableRiders = useCallback(async (batchId: string) => {
    if (!batchId) return;
    setIsLoadingRiders(true);
    try {
      const response = await getAvailableDeliveryRiders(batchId);
      setAvailableRidersByBatch((current) => ({
        ...current,
        [batchId]: response.riders || [],
      }));
    } catch (requestError) {
      setAvailableRidersByBatch((current) => ({ ...current, [batchId]: [] }));
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Available riders could not be loaded.",
      );
    } finally {
      setIsLoadingRiders(false);
    }
  }, []);

  async function handleConfirmPickupTask(task: SellerPickupTask) {
    if (!task.orderItems.length) {
      setError("This pickup task has no order items to confirm.");
      return;
    }

    setError("");
    setNotice("");
    setTaskActionId(`confirm-${task.id}`);

    try {
      for (const item of task.orderItems) {
        await confirmSellerOrderItemAvailability(
          item.id,
          "Seller confirmed item availability from Buyer Orders.",
        );
      }
      setNotice("Availability confirmed. Mark the package ready after packing it.");
      await Promise.all([loadOrders(), loadPickupTasks()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Availability could not be confirmed.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  async function handleRejectPickupTask(task: SellerPickupTask) {
    if (!task.orderItems.length) {
      setError("This pickup task has no order items to reject.");
      return;
    }

    const reason = window.prompt(
      "Why is this item unavailable? The buyer and admin will see this reason.",
      task.sellerRejectionNote || "",
    );

    if (reason === null) return;

    setError("");
    setNotice("");
    setTaskActionId(`reject-${task.id}`);

    try {
      for (const item of task.orderItems) {
        await rejectSellerOrderItemAvailability(
          item.id,
          reason || "Seller marked item unavailable.",
        );
      }
      setNotice("The buyer and admin have been notified.");
      await Promise.all([loadOrders(), loadPickupTasks()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The item could not be rejected.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  async function handleMarkPickupReady(task: SellerPickupTask) {
    setError("");
    setNotice("");
    setTaskActionId(`ready-${task.id}`);

    try {
      await markSellerPickupTaskReady(task.id, {
        packageSize: String(
          task.packageProfileSnapshot?.packageSize || task.packageSize || "",
        ),
        packageWeightClass: String(
          task.packageProfileSnapshot?.packageWeightClass ||
            task.packageWeightClass ||
            "",
        ),
        handlingClass: String(
          task.packageProfileSnapshot?.fragilityLevel ||
            task.handlingClass ||
            "normal_handling",
        ),
        pickupPointConfirmed: true,
        note: "Seller marked package ready from Buyer Orders.",
      });
      setNotice("Package marked ready. Gleenc can now match a Stage 1 approved rider.");
      await Promise.all([loadOrders(), loadPickupTasks()]);
      await loadAvailableRiders(task.deliveryBatchId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Package could not be marked ready.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  async function handleAssignManualRider(task: SellerPickupTask, riderId: string) {
    setError("");
    setNotice("");
    setTaskActionId(`assign-${task.id}-${riderId}`);

    try {
      await sendDeliveryOfferToRider({
        batchId: task.deliveryBatchId,
        riderId,
      });
      setNotice("Delivery offer sent. The rider must accept it before assignment.");
      await loadPickupTasks();
      await loadAvailableRiders(task.deliveryBatchId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Delivery offer could not be sent.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  async function handleStartAutomaticDispatch(task: SellerPickupTask) {
    setError("");
    setNotice("");
    setTaskActionId(`auto-${task.id}`);

    try {
      const response = await startAutomaticDispatchForBatch(task.deliveryBatchId);
      setNotice(
        response.sellerManualAssignmentRequired
          ? "No rider accepted automatically. Refresh the Stage 1 approved riders and send an offer."
          : "Gleenc is offering this delivery to the best compatible rider.",
      );
      await loadPickupTasks();
      await loadAvailableRiders(task.deliveryBatchId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Automatic dispatch could not start.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading buyer orders and dispatch readiness..." />;
  }

  return (
    <section className="page-shell seller-orders-page">
      {(error || notice) && (
        <div
          className={`seller-workspace-message ${error ? "error" : "success"}`}
          role={error ? "alert" : "status"}
        >
          {error ? <FiAlertCircle /> : <FiCheckCircle />}
          <span>{error || notice}</span>
        </div>
      )}

      <div className="seller-orders-summary">
        <article><FiShoppingBag /><span>Buyer orders</span><strong>{summary.total}</strong></article>
        <article><FiClock /><span>Needs action</span><strong>{summary.needsAction}</strong></article>
        <article><FiTruck /><span>In delivery</span><strong>{summary.inDelivery}</strong></article>
        <article><FiCheckCircle /><span>Completed</span><strong>{summary.completed}</strong></article>
      </div>

      <section className="seller-orders-list-section">
        <div className="seller-orders-section-title">
          <div>
            <span>Orders placed on your products</span>
            <h1>All buyer orders</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadPage()}
            aria-label="Refresh buyer orders"
            title="Refresh buyer orders"
          >
            ↻
          </button>
        </div>

        {orders.length ? (
          <div className="seller-orders-list">
            {orders.map((order) => {
              const firstItem = order.items[0];
              const pickupTask = pickupTasks.find(
                (task) => task.orderId === order.id,
              );
              const image = resolveMediaUrl(
                firstItem?.productImageUrl,
                orderImageFallback,
              );

              return (
              <article key={order.id}>
                <div className="seller-order-card-image">
                  <img
                    src={image}
                    alt={firstItem?.productName || "Buyer order"}
                  />
                  <span>{order.statusLabel}</span>
                </div>
                <div className="seller-order-card-content">
                  <small>{order.orderCode}</small>
                  <h3>{order.buyerName || "Gleenc buyer"}</h3>
                  <p>
                    {order.items
                      .map(
                        (item) =>
                          `${item.quantity}× ${item.productName}`,
                      )
                      .join(", ")}
                  </p>
                </div>
                <div className="seller-orders-list-meta">
                  <strong>{formatNaira(order.total)}</strong>
                  <small>{formatDate(order.createdAt)}</small>
                  {pickupTask &&
                  !pickupTask.sellerConfirmedAvailability &&
                  pickupTask.status !== "seller_rejected" ? (
                    <button
                      type="button"
                      className="seller-order-confirm-card-action"
                      disabled={taskActionId === `confirm-${pickupTask.id}`}
                      onClick={() => void handleConfirmPickupTask(pickupTask)}
                    >
                      <FiCheckCircle />
                      {taskActionId === `confirm-${pickupTask.id}`
                        ? "Confirming..."
                        : "Confirm availability"}
                    </button>
                  ) : pickupTask?.sellerConfirmedAvailability ? (
                    <span className="seller-order-confirmed-card-label">
                      <FiCheckCircle /> Seller confirmed
                    </span>
                  ) : null}
                  <Link to={`/messages?order=${order.id}`}>
                    <FiMessageCircle /> Message buyer
                  </Link>
                  <Link to={`/orders/${order.id}`}>Open order</Link>
                </div>
              </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<FiPackage />}
            title="No buyer orders yet"
            message="Paid and Pay at Delivery orders placed on your products will appear here."
          />
        )}
      </section>

      <SellerOrderReadinessPanel
        tasks={pickupTasks}
        loading={isLoadingTasks}
        actionId={taskActionId}
        availableRidersByBatch={availableRidersByBatch}
        ridersLoading={isLoadingRiders}
        onRefresh={loadPickupTasks}
        onRefreshRiders={(task) => loadAvailableRiders(task.deliveryBatchId)}
        onConfirm={handleConfirmPickupTask}
        onReject={handleRejectPickupTask}
        onMarkReady={handleMarkPickupReady}
        onStartAutoDispatch={handleStartAutomaticDispatch}
        onAssignRider={handleAssignManualRider}
      />
    </section>
  );
}

export default SellerOrders;
