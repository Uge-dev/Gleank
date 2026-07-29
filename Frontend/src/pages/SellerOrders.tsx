import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiTruck,
  FiX,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import {
  getAvailableDeliveryRiders,
  getSellerOrders,
  getSellerPickupTasks,
  markSellerPickupTaskReady,
  sendDeliveryOfferToRider,
  startAutomaticDispatchForBatch,
} from "../services/seller.service";
import type {
  AvailableDeliveryRider,
  SellerPickupTask,
} from "../services/seller.service";
import {
  sellerConfirmOrder,
  sellerRejectOrder,
} from "../services/order.service";
import type { GleencOrder } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";
import { formatNaira } from "../utils/price";

const orderImageFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=600&q=80";

type PackageDraft = {
  packageSize: string;
  packageWeightClass: string;
  handlingClass: string;
  pickupPointConfirmed: boolean;
  note: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function activityLabel(rider: AvailableDeliveryRider) {
  if (rider.isOnline) return "Online now";
  if (!rider.lastActiveAt) return "Offline · last activity unavailable";

  const time = new Date(rider.lastActiveAt).getTime();
  if (!Number.isFinite(time)) return "Offline";

  const minutes = Math.max(1, Math.round((Date.now() - time) / 60_000));
  if (minutes < 60) return `Active ${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `Active ${days} day${days === 1 ? "" : "s"} ago`;
}

function packageDraftForTask(task: SellerPickupTask): PackageDraft {
  const profile = task.packageProfileSnapshot || {};

  return {
    packageSize: String(
      task.packageSize || profile.packageSize || "",
    ),
    packageWeightClass: String(
      task.packageWeightClass || profile.packageWeightClass || "",
    ),
    handlingClass: String(
      task.handlingClass || profile.fragilityLevel || "",
    ),
    pickupPointConfirmed: Boolean(
      task.pickupPointConfirmed || task.pickupLandmark || task.pickupZoneId,
    ),
    note: task.packageReadyNote || "",
  };
}

function SellerOrders() {
  const [orders, setOrders] = useState<GleencOrder[]>([]);
  const [pickupTasks, setPickupTasks] = useState<SellerPickupTask[]>([]);
  const [availableRidersByBatch, setAvailableRidersByBatch] = useState<
    Record<string, AvailableDeliveryRider[]>
  >({});
  const [packageDrafts, setPackageDrafts] = useState<
    Record<string, PackageDraft>
  >({});
  const [preparationOrderId, setPreparationOrderId] = useState("");
  const [manualDispatchBatchId, setManualDispatchBatchId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRiders, setIsLoadingRiders] = useState(false);
  const [taskActionId, setTaskActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    const response = await getSellerOrders();
    setOrders(response.orders || []);
  }, []);

  const loadPickupTasks = useCallback(async () => {
    const response = await getSellerPickupTasks();
    setPickupTasks(response.pickupTasks || []);
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
      inDelivery: orders.filter((order) =>
        ["out_for_delivery", "rider_assigned"].includes(
          order.deliveryStatus || order.status,
        ),
      ).length,
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
      setAvailableRidersByBatch((current) => ({
        ...current,
        [batchId]: [],
      }));
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Riders in this service area could not be loaded.",
      );
    } finally {
      setIsLoadingRiders(false);
    }
  }, []);

  async function handleConfirmOrder(order: GleencOrder) {
    setError("");
    setNotice("");
    setTaskActionId(`confirm-${order.id}`);

    try {
      await sellerConfirmOrder(
        order.id,
        "Seller confirmed product availability from Buyer Orders.",
      );
      setNotice(
        "Order confirmed. Pack the item, then confirm its package details.",
      );
      await Promise.all([loadOrders(), loadPickupTasks()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The order could not be confirmed.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  async function handleRejectOrder(order: GleencOrder) {
    const reason = window.prompt(
      "Why is this order unavailable? The buyer and admin will see this reason.",
      "",
    );

    if (reason === null) return;

    setError("");
    setNotice("");
    setTaskActionId(`reject-${order.id}`);

    try {
      await sellerRejectOrder(
        order.id,
        reason.trim() || "Seller marked this order unavailable.",
      );
      setNotice("The buyer and admin have been notified.");
      await Promise.all([loadOrders(), loadPickupTasks()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The order could not be rejected.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  function openPackagePreparation(order: GleencOrder, task: SellerPickupTask) {
    setError("");
    setNotice("");
    setPreparationOrderId(order.id);
    setPackageDrafts((current) => ({
      ...current,
      [task.id]: current[task.id] || packageDraftForTask(task),
    }));
  }

  function updatePackageDraft(
    taskId: string,
    patch: Partial<PackageDraft>,
    task: SellerPickupTask,
  ) {
    setPackageDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] || packageDraftForTask(task)),
        ...patch,
      },
    }));
  }

  async function handleMarkPackageReady(
    order: GleencOrder,
    task: SellerPickupTask,
  ) {
    const draft = packageDrafts[task.id] || packageDraftForTask(task);

    if (
      !draft.packageSize ||
      !draft.packageWeightClass ||
      !draft.handlingClass
    ) {
      setError(
        "Select the package size, weight class, and handling requirement.",
      );
      return;
    }

    if (!draft.pickupPointConfirmed) {
      setError("Confirm the seller pickup point before continuing.");
      return;
    }

    setError("");
    setNotice("");
    setTaskActionId(`ready-${task.id}`);

    try {
      await markSellerPickupTaskReady(task.id, draft);
      setPreparationOrderId("");
      setManualDispatchBatchId("");
      setNotice(
        "Package is ready. Choose automatic rider selection or select a rider manually.",
      );
      await Promise.all([loadOrders(), loadPickupTasks()]);
      window.requestAnimationFrame(() => {
        document
          .getElementById(`seller-order-${order.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Package readiness could not be saved.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  async function handleAutomaticDispatch(task: SellerPickupTask) {
    setError("");
    setNotice("");
    setManualDispatchBatchId("");
    setTaskActionId(`auto-${task.id}`);

    try {
      const response = await startAutomaticDispatchForBatch(
        task.deliveryBatchId,
      );
      setNotice(
        response.sellerManualAssignmentRequired
          ? "No online rider matched automatically. Select a rider manually from the service-area list."
          : "Gleenc sent the order to the best active rider. The rider must accept the offer.",
      );
      await loadPickupTasks();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Automatic rider selection could not start.",
      );
    } finally {
      setTaskActionId("");
    }
  }

  async function handleOpenManualDispatch(task: SellerPickupTask) {
    setError("");
    setNotice("");
    setManualDispatchBatchId(task.deliveryBatchId);
    await loadAvailableRiders(task.deliveryBatchId);
  }

  async function handleAssignManualRider(
    task: SellerPickupTask,
    riderId: string,
  ) {
    setError("");
    setNotice("");
    setTaskActionId(`assign-${task.id}-${riderId}`);

    try {
      await sendDeliveryOfferToRider({
        batchId: task.deliveryBatchId,
        riderId,
      });
      setNotice(
        "Delivery offer sent. The rider will receive it and must go online to accept if currently inactive.",
      );
      setManualDispatchBatchId("");
      await loadPickupTasks();
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
        <article>
          <FiShoppingBag />
          <span>Buyer orders</span>
          <strong>{summary.total}</strong>
        </article>
        <article>
          <FiClock />
          <span>Needs action</span>
          <strong>{summary.needsAction}</strong>
        </article>
        <article>
          <FiTruck />
          <span>In delivery</span>
          <strong>{summary.inDelivery}</strong>
        </article>
        <article>
          <FiCheckCircle />
          <span>Completed</span>
          <strong>{summary.completed}</strong>
        </article>
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
              const sellerConfirmed =
                Boolean(order.sellerConfirmedAt) ||
                Boolean(pickupTask?.sellerConfirmedAvailability);
              const orderClosed = [
                "cancelled",
                "disputed",
                "delivered",
                "completed",
              ].includes(order.status);
              const canConfirmOrder =
                !orderClosed &&
                !sellerConfirmed &&
                (order.paymentStatus === "paid" ||
                  order.paymentMethod === "pay_on_delivery" ||
                  Boolean(order.sellerConfirmationRequired));
              const offerPending = [
                "offer_pending",
                "rider_offered",
                "rider_accepted",
              ].includes(pickupTask?.dispatchStatus || "");
              const availableRiders = pickupTask
                ? availableRidersByBatch[pickupTask.deliveryBatchId] || []
                : [];
              const packageDraft = pickupTask
                ? packageDrafts[pickupTask.id] ||
                  packageDraftForTask(pickupTask)
                : null;
              const image = resolveMediaUrl(
                firstItem?.productImageUrl,
                orderImageFallback,
              );

              return (
                <article
                  className="seller-order-unified-card"
                  id={`seller-order-${order.id}`}
                  key={order.id}
                >
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
                          (item) => `${item.quantity}× ${item.productName}`,
                        )
                        .join(", ")}
                    </p>
                  </div>

                  <div className="seller-order-essential-meta">
                    <span>
                      <FiPackage /> {order.items.length} item(s)
                    </span>
                    <span>
                      <FiMapPin /> {order.campus || "Delivery area"}
                    </span>
                    <span>
                      <FiClock />{" "}
                      {order.paymentMethod === "pay_on_delivery"
                        ? "Pay on delivery"
                        : order.paymentStatus === "paid"
                          ? "Paid"
                          : "Payment pending"}
                    </span>
                  </div>

                  {order.paymentMethod === "pay_on_delivery" &&
                  order.paymentStatus !== "paid" ? (
                    <div className="seller-order-pod-note">
                      <FiAlertCircle />
                      <span>
                        This protected Payment on Delivery order can be prepared
                        and assigned now. The rider cannot complete handover until
                        Paystack confirms payment.
                      </span>
                    </div>
                  ) : null}

                  <div className="seller-order-compact-items">
                    {order.items.map((item) => (
                      <div key={item.id}>
                        <img
                          src={resolveMediaUrl(
                            item.productImageUrl,
                            orderImageFallback,
                          )}
                          alt=""
                        />
                        <span>
                          <strong>{item.productName}</strong>
                          <small>
                            Qty {item.quantity} · {formatNaira(item.total)}
                          </small>
                        </span>
                      </div>
                    ))}
                  </div>

                  {pickupTask?.sellerPickupCode ? (
                    <div className="seller-order-pickup-code">
                      <span>Seller pickup code</span>
                      <strong>{pickupTask.sellerPickupCode}</strong>
                      <small>Share only with the assigned rider at pickup.</small>
                    </div>
                  ) : null}

                  <div className="seller-orders-list-meta">
                    <strong>{formatNaira(order.total)}</strong>
                    <small>{formatDate(order.createdAt)}</small>

                    {canConfirmOrder ? (
                      <button
                        type="button"
                        className="seller-order-confirm-card-action"
                        disabled={taskActionId === `confirm-${order.id}`}
                        onClick={() => void handleConfirmOrder(order)}
                      >
                        <FiCheckCircle />
                        {taskActionId === `confirm-${order.id}`
                          ? "Confirming..."
                          : "Seller confirm order"}
                      </button>
                    ) : sellerConfirmed && !orderClosed ? (
                      <span className="seller-order-confirmed-card-label">
                        <FiCheckCircle /> Seller confirmed
                      </span>
                    ) : !orderClosed &&
                      order.paymentMethod === "pay_now" &&
                      order.paymentStatus !== "paid" ? (
                      <span className="seller-order-payment-waiting-card-label">
                        <FiClock /> Waiting for payment
                      </span>
                    ) : null}

                    {sellerConfirmed &&
                    pickupTask &&
                    !pickupTask.sellerMarkedReady &&
                    !pickupTask.assignedRiderId &&
                    !orderClosed ? (
                      <button
                        type="button"
                        className="seller-order-card-secondary-action"
                        onClick={() =>
                          openPackagePreparation(order, pickupTask)
                        }
                      >
                        <FiPackage /> Mark package ready
                      </button>
                    ) : null}

                    {sellerConfirmed &&
                    !pickupTask &&
                    !orderClosed ? (
                      <span className="seller-order-setup-pending">
                        <FiClock /> Preparing dispatch record…
                      </span>
                    ) : null}

                    {pickupTask?.sellerMarkedReady &&
                    !pickupTask.assignedRiderId &&
                    !orderClosed &&
                    !offerPending ? (
                      <div className="seller-order-dispatch-choice">
                        <strong>How should Gleenc select the rider?</strong>
                        <button
                          type="button"
                          disabled={taskActionId === `auto-${pickupTask.id}`}
                          onClick={() =>
                            void handleAutomaticDispatch(pickupTask)
                          }
                        >
                          <FiTruck />
                          {taskActionId === `auto-${pickupTask.id}`
                            ? "Finding rider..."
                            : "Allow automatic rider selection"}
                        </button>
                        <button
                          type="button"
                          disabled={isLoadingRiders}
                          onClick={() =>
                            void handleOpenManualDispatch(pickupTask)
                          }
                        >
                          <FiShoppingBag />
                          {isLoadingRiders &&
                          manualDispatchBatchId ===
                            pickupTask.deliveryBatchId
                            ? "Loading riders..."
                            : "Select rider manually"}
                        </button>
                      </div>
                    ) : null}

                    {offerPending && !pickupTask?.assignedRiderId ? (
                      <span className="seller-order-rider-offer-label">
                        <FiClock /> Waiting for rider acceptance
                      </span>
                    ) : null}

                    {pickupTask?.assignedRiderId && !orderClosed ? (
                      <span className="seller-order-rider-assigned-card-label">
                        <FiTruck /> Rider assigned
                      </span>
                    ) : null}

                    {pickupTask &&
                    manualDispatchBatchId === pickupTask.deliveryBatchId &&
                    pickupTask.sellerMarkedReady &&
                    !pickupTask.assignedRiderId ? (
                      <div className="seller-order-manual-riders">
                        <div>
                          <strong>Riders in this service area</strong>
                          <small>
                            Online riders appear first. Offline riders still
                            receive the offer and must go online before accepting.
                          </small>
                        </div>
                        {availableRiders.length ? (
                          availableRiders.map((rider) => (
                            <button
                              type="button"
                              key={rider.id}
                              disabled={taskActionId.startsWith(
                                `assign-${pickupTask.id}-`,
                              )}
                              onClick={() =>
                                void handleAssignManualRider(
                                  pickupTask,
                                  rider.id,
                                )
                              }
                            >
                              <span>
                                <strong>
                                  {rider.displayName ||
                                    rider.name ||
                                    "Verified rider"}
                                </strong>
                                <small
                                  className={
                                    rider.isOnline ? "online" : "offline"
                                  }
                                >
                                  {activityLabel(rider)}
                                </small>
                              </span>
                              <em>
                                {rider.matchSummary ||
                                  "Stage 1 approved · service-area match"}
                              </em>
                              <b>
                                {taskActionId ===
                                `assign-${pickupTask.id}-${rider.id}`
                                  ? "Sending..."
                                  : "Send offer"}
                              </b>
                            </button>
                          ))
                        ) : (
                          <p>
                            {isLoadingRiders
                              ? "Loading matching riders..."
                              : "No Stage 1 approved rider currently covers this service area and package capacity."}
                          </p>
                        )}
                      </div>
                    ) : null}

                    {!orderClosed &&
                    !pickupTask?.sellerMarkedReady &&
                    (sellerConfirmed || canConfirmOrder) ? (
                      <button
                        type="button"
                        className="seller-order-reject-action"
                        disabled={taskActionId === `reject-${order.id}`}
                        onClick={() => void handleRejectOrder(order)}
                      >
                        <FiX />
                        {taskActionId === `reject-${order.id}`
                          ? "Updating..."
                          : "Item unavailable"}
                      </button>
                    ) : null}

                    <Link to={`/messages?order=${order.id}`}>
                      <FiMessageCircle /> Message buyer
                    </Link>
                    <Link to={`/orders/${order.id}`}>Open order</Link>
                  </div>

                  {pickupTask &&
                  packageDraft &&
                  preparationOrderId === order.id &&
                  !pickupTask.sellerMarkedReady ? (
                    <div className="seller-order-package-form">
                      <div>
                        <strong>Confirm package details</strong>
                        <button
                          type="button"
                          aria-label="Close package form"
                          onClick={() => setPreparationOrderId("")}
                        >
                          <FiX />
                        </button>
                      </div>
                      <p>
                        These details determine which riders and vehicles can
                        safely receive this order.
                      </p>
                      <label>
                        <span>Package size</span>
                        <select
                          value={packageDraft.packageSize}
                          onChange={(event) =>
                            updatePackageDraft(
                              pickupTask.id,
                              { packageSize: event.target.value },
                              pickupTask,
                            )
                          }
                        >
                          <option value="">Select size</option>
                          <option value="small">Small</option>
                          <option value="medium">Medium</option>
                          <option value="large">Large</option>
                          <option value="extra_large">Extra large</option>
                        </select>
                      </label>
                      <label>
                        <span>Weight class</span>
                        <select
                          value={packageDraft.packageWeightClass}
                          onChange={(event) =>
                            updatePackageDraft(
                              pickupTask.id,
                              { packageWeightClass: event.target.value },
                              pickupTask,
                            )
                          }
                        >
                          <option value="">Select weight</option>
                          <option value="very_light">Very light</option>
                          <option value="light">Light</option>
                          <option value="medium">Medium</option>
                          <option value="heavy">Heavy</option>
                          <option value="very_heavy">Very heavy</option>
                        </select>
                      </label>
                      <label>
                        <span>Handling</span>
                        <select
                          value={packageDraft.handlingClass}
                          onChange={(event) =>
                            updatePackageDraft(
                              pickupTask.id,
                              { handlingClass: event.target.value },
                              pickupTask,
                            )
                          }
                        >
                          <option value="">Select handling</option>
                          <option value="not_fragile">Normal handling</option>
                          <option value="fragile">Fragile</option>
                          <option value="very_fragile">Very fragile</option>
                        </select>
                      </label>
                      <label className="seller-order-package-note">
                        <span>Rider note (optional)</span>
                        <textarea
                          rows={2}
                          value={packageDraft.note}
                          placeholder="Example: Keep upright; collect at front counter."
                          onChange={(event) =>
                            updatePackageDraft(
                              pickupTask.id,
                              { note: event.target.value },
                              pickupTask,
                            )
                          }
                        />
                      </label>
                      <label className="seller-order-pickup-confirm">
                        <input
                          type="checkbox"
                          checked={packageDraft.pickupPointConfirmed}
                          onChange={(event) =>
                            updatePackageDraft(
                              pickupTask.id,
                              {
                                pickupPointConfirmed: event.target.checked,
                              },
                              pickupTask,
                            )
                          }
                        />
                        <span>
                          Pickup point is correct:{" "}
                          {pickupTask.pickupLandmark ||
                            pickupTask.pickupZoneId ||
                            "store pickup location"}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="seller-order-package-submit"
                        disabled={taskActionId === `ready-${pickupTask.id}`}
                        onClick={() =>
                          void handleMarkPackageReady(order, pickupTask)
                        }
                      >
                        <FiCheckCircle />
                        {taskActionId === `ready-${pickupTask.id}`
                          ? "Saving package..."
                          : "Confirm package is ready"}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<FiPackage />}
            title="No buyer orders yet"
            message="Paid and protected Payment on Delivery orders placed on your products will appear here."
          />
        )}
      </section>
    </section>
  );
}

export default SellerOrders;
