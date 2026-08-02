import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiMapPin,
  FiMessageCircle,
  FiNavigation,
  FiPackage,
  FiPhone,
  FiShoppingBag,
  FiTruck,
  FiX,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import {
  getSellerOrders,
  getSellerPickupTasks,
  getAssignedOrderRider,
  cancelAssignedOrderRider,
  markSellerPickupTaskReady,
} from "../services/seller.service";
import type { AssignedOrderRider, SellerPickupTask } from "../services/seller.service";
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
  const navigate = useNavigate();
  const [activeOrders, setActiveOrders] = useState<GleencOrder[]>([]);
  const [successfulOrders, setSuccessfulOrders] = useState<GleencOrder[]>([]);
  const [orderView, setOrderView] = useState<"active" | "successful">("active");
  const [pickupTasks, setPickupTasks] = useState<SellerPickupTask[]>([]);
  const [packageDrafts, setPackageDrafts] = useState<
    Record<string, PackageDraft>
  >({});
  const [preparationOrderId, setPreparationOrderId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [taskActionId, setTaskActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [riderOrderId, setRiderOrderId] = useState("");
  const [assignedRider, setAssignedRider] = useState<AssignedOrderRider | null>(null);
  const [riderDetailsLoading, setRiderDetailsLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    const [activeResponse, successfulResponse] = await Promise.all([
      getSellerOrders("active"),
      getSellerOrders("successful"),
    ]);
    setActiveOrders(activeResponse.orders || []);
    setSuccessfulOrders(successfulResponse.orders || []);
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

  const loadAssignedRider = useCallback(async (orderId: string, silent = false) => {
    if (!silent) setRiderDetailsLoading(true);
    try {
      const response = await getAssignedOrderRider(orderId);
      setAssignedRider(response.assignedRider);
      setError("");
    } catch (requestError) {
      if (!silent) {
        setError(requestError instanceof Error ? requestError.message : "Rider details could not be loaded.");
        setRiderOrderId("");
      }
    } finally {
      if (!silent) setRiderDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!riderOrderId) return undefined;
    const interval = window.setInterval(() => {
      void loadAssignedRider(riderOrderId, true);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [loadAssignedRider, riderOrderId]);

  async function openAssignedRider(orderId: string) {
    setRiderOrderId(orderId);
    setAssignedRider(null);
    await loadAssignedRider(orderId);
  }

  async function cancelRiderAssignment() {
    if (!riderOrderId || !assignedRider?.canCancel) return;
    const reason = window.prompt("Why are you cancelling this rider assignment?", "Assigning another rider.");
    if (reason === null) return;
    setTaskActionId(`cancel-rider-${riderOrderId}`);
    try {
      await cancelAssignedOrderRider(riderOrderId, reason);
      setRiderOrderId("");
      setAssignedRider(null);
      setNotice("Rider assignment cancelled. You can now select another available rider.");
      await Promise.all([loadOrders(), loadPickupTasks()]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The rider assignment could not be cancelled.");
    } finally {
      setTaskActionId("");
    }
  }

  const summary = useMemo(
    () => ({
      total: activeOrders.length + successfulOrders.length,
      needsAction: activeOrders.filter((order) =>
        ["paid", "seller_confirmed", "processing", "ready_for_delivery"].includes(
          order.status,
        ),
      ).length,
      inDelivery: activeOrders.filter((order) =>
        ["out_for_delivery", "rider_assigned"].includes(
          order.deliveryStatus || order.status,
        ),
      ).length,
      completed: successfulOrders.length,
    }),
    [activeOrders, successfulOrders],
  );
  const visibleOrders =
    orderView === "successful" ? successfulOrders : activeOrders;

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

  if (isLoading) {
    return <LoadingState message="Loading buyer orders and dispatch readiness..." />;
  }

  return (
    <section className="page-shell seller-orders-page">
      <div className="orders-page-heading">
        <span>Sales from your store</span>
        <h1>Orders</h1>
        <p>Confirm products, prepare packages and assign riders.</p>
      </div>

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
          <span>Orders received</span>
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
            <span>Products purchased from you</span>
            <h1>
              {orderView === "successful"
                ? "Successful orders"
                : "Active orders"}
            </h1>
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

        <div className="seller-orders-view-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={orderView === "active"}
            className={orderView === "active" ? "active" : ""}
            onClick={() => setOrderView("active")}
          >
            Active orders <span>{activeOrders.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={orderView === "successful"}
            className={orderView === "successful" ? "active" : ""}
            onClick={() => setOrderView("successful")}
          >
            Successful orders <span>{successfulOrders.length}</span>
          </button>
        </div>

        {visibleOrders.length ? (
          <div className="seller-orders-list">
            {visibleOrders.map((order) => {
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
                  order.paymentMethod === "pay_on_delivery");
              const offerPending = [
                "offer_pending",
                "rider_offered",
                "rider_accepted",
              ].includes(pickupTask?.dispatchStatus || "");
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
                          onClick={() =>
                            navigate(
                              `/seller/orders/${order.id}/riders?mode=automatic`,
                            )
                          }
                        >
                          <FiTruck />
                          Allow automatic rider selection
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/seller/orders/${order.id}/riders?mode=manual`,
                            )
                          }
                        >
                          <FiShoppingBag />
                          Select rider manually
                        </button>
                      </div>
                    ) : null}

                    {offerPending && !pickupTask?.assignedRiderId ? (
                      <button
                        type="button"
                        className="seller-order-rider-offer-label"
                        onClick={() => void openAssignedRider(order.id)}
                      >
                        <FiClock /> Waiting for rider acceptance
                      </button>
                    ) : null}

                    {pickupTask?.assignedRiderId && !orderClosed ? (
                      <button
                        type="button"
                        className="seller-order-rider-assigned-card-label"
                        onClick={() => void openAssignedRider(order.id)}
                      >
                        <FiTruck /> Rider assigned
                      </button>
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
                    <Link
                      to={`/orders/${order.id}`}
                      state={{ orderView: "sales" }}
                    >
                      Open order
                    </Link>
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
            title={
              orderView === "successful"
                ? "No successful deliveries yet"
                : "No active buyer orders"
            }
            message={
              orderView === "successful"
                ? "Orders move here automatically after the rider completes delivery."
                : "Paid and protected Payment on Delivery orders stay here until delivery is completed."
            }
          />
        )}
      </section>

      {riderOrderId ? (
        <div className="seller-rider-modal-backdrop" role="presentation" onMouseDown={() => setRiderOrderId("")}>
          <section
            className="seller-rider-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Assigned rider details"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" className="seller-rider-modal-close" aria-label="Close" onClick={() => setRiderOrderId("")}>
              <FiX />
            </button>
            {riderDetailsLoading || !assignedRider ? (
              <LoadingState message="Loading assigned rider..." />
            ) : (
              <>
                <div className="seller-rider-modal-profile">
                  {assignedRider.rider.profileImageUrl ? (
                    <img src={resolveMediaUrl(assignedRider.rider.profileImageUrl, "")} alt={assignedRider.rider.name} />
                  ) : (
                    <span>{assignedRider.rider.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <div>
                    <small>{assignedRider.accepted ? "Accepted delivery" : "Offer awaiting acceptance"}</small>
                    <h2>{assignedRider.rider.name}</h2>
                    <p>{assignedRider.rider.username} · {assignedRider.rider.vehicleType}</p>
                  </div>
                  <strong className={assignedRider.rider.isOnline ? "online" : ""}>
                    {assignedRider.rider.isOnline
                      ? "Active now"
                      : assignedRider.rider.lastActiveAt
                        ? `Active ${formatDate(assignedRider.rider.lastActiveAt)}`
                        : "Offline"}
                  </strong>
                </div>

                <div className="seller-rider-modal-metrics">
                  <span><FiNavigation /> {assignedRider.rider.distanceToSellerKm == null ? "Distance unavailable" : `${assignedRider.rider.distanceToSellerKm} km from you`}</span>
                  <span><FiTruck /> {assignedRider.status.replace(/_/g, " ")}</span>
                </div>

                <div className="seller-rider-modal-actions">
                  {assignedRider.chatPath ? (
                    <Link to={assignedRider.chatPath}><FiMessageCircle /> In-app chat</Link>
                  ) : (
                    <span><FiMessageCircle /> Chat opens after acceptance</span>
                  )}
                  {assignedRider.rider.phone ? (
                    <a href={`tel:${assignedRider.rider.phone}`}><FiPhone /> {assignedRider.rider.phone}</a>
                  ) : null}
                </div>

                {assignedRider.canCancel ? (
                  <button
                    type="button"
                    className="seller-rider-cancel-assignment"
                    disabled={taskActionId === `cancel-rider-${riderOrderId}`}
                    onClick={() => void cancelRiderAssignment()}
                  >
                    <FiX /> {taskActionId === `cancel-rider-${riderOrderId}` ? "Cancelling..." : "Cancel assignment and choose another rider"}
                  </button>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default SellerOrders;
