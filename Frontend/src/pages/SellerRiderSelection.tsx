import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiMapPin,
  FiPhone,
  FiSearch,
  FiTruck,
  FiUser,
  FiX,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import {
  getAvailableDeliveryRiders,
  getSellerOrders,
  getSellerPickupTasks,
  sendDeliveryOfferToRider,
  startAutomaticDispatchForBatch,
} from "../services/seller.service";
import type {
  AvailableDeliveryRider,
  SellerPickupTask,
} from "../services/seller.service";
import type { GleencOrder } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const exclusionLabels: Record<string, string> = {
  already_contacted_for_this_batch: "This rider already has the current offer",
  package_size_too_large: "Package is larger than this rider's capacity",
  package_too_heavy: "Package is above this rider's weight capacity",
  very_fragile_not_supported: "Very fragile handling is not supported",
  fragile_not_supported: "Fragile handling is not supported",
  vehicle_not_supported: "Vehicle does not match this package",
  outside_service_zone:
    "Rider serves a different area; confirm the pickup location first",
  no_service_zone:
    "Rider has not selected a service area; confirm the pickup location first",
  WORKLOAD_LIMIT: "Rider is currently handling another delivery",
  DELIVERY_LIMIT: "Order value is above this rider's verification limit",
  CAPACITY_MISSING:
    "Package capacity is incomplete; confirm suitability with the rider",
  SERVICE_ZONE_MISSING: "Rider service area is incomplete",
  rider_busy: "Rider is currently busy but can receive this manual offer",
  rider_offline: "Rider is offline and must come online before accepting",
};

function activityLabel(rider: AvailableDeliveryRider) {
  if (rider.isOnline) return "Online now";
  if (!rider.lastActiveAt) return "Last active unavailable";

  const time = new Date(rider.lastActiveAt).getTime();
  if (!Number.isFinite(time)) return "Offline";

  const minutes = Math.max(1, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 60) return `Active ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Active ${days} day${days === 1 ? "" : "s"} ago`;
}

function vehicleLabel(rider: AvailableDeliveryRider) {
  return String(rider.vehicleType || rider.transportType || "Vehicle not listed")
    .replaceAll("_", " ");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function SellerRiderSelection() {
  const { orderId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get("mode") === "automatic" ? "automatic" : "manual";
  const [order, setOrder] = useState<GleencOrder | null>(null);
  const [task, setTask] = useState<SellerPickupTask | null>(null);
  const [riders, setRiders] = useState<AvailableDeliveryRider[]>([]);
  const [selectedRider, setSelectedRider] =
    useState<AvailableDeliveryRider | null>(null);
  const [search, setSearch] = useState("");
  const [vehicle, setVehicle] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ordersResponse, tasksResponse] = await Promise.all([
        getSellerOrders(),
        getSellerPickupTasks(),
      ]);
      const nextOrder =
        (ordersResponse.orders || []).find((item) => item.id === orderId) || null;
      const nextTask =
        (tasksResponse.pickupTasks || []).find(
          (item) => item.orderId === orderId,
        ) || null;

      setOrder(nextOrder);
      setTask(nextTask);

      if (!nextOrder) {
        setError("This seller order could not be found.");
        setRiders([]);
        return;
      }
      if (!nextTask) {
        setError(
          "The dispatch record is still being prepared. Return to the order and confirm it again.",
        );
        setRiders([]);
        return;
      }
      if (!nextTask.sellerMarkedReady) {
        setError(
          "Mark the package ready and confirm its size, weight and handling before choosing a rider.",
        );
        setRiders([]);
        return;
      }

      const candidates = await getAvailableDeliveryRiders(
        nextTask.deliveryBatchId,
        mode,
      );
      setRiders(candidates.riders || []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The rider-selection page could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [mode, orderId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const vehicleOptions = useMemo(
    () =>
      Array.from(
        new Set(
          riders
            .map((rider) => rider.vehicleType || rider.transportType || "")
            .filter(Boolean),
        ),
      ).sort(),
    [riders],
  );

  const filteredRiders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return riders.filter((rider) => {
      const searchable = [
        rider.displayName,
        rider.name,
        rider.coverageArea,
        ...(rider.serviceAreas || []),
        rider.vehicleType,
        rider.transportType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesVehicle =
        vehicle === "all" ||
        rider.vehicleType === vehicle ||
        rider.transportType === vehicle;
      const matchesAvailability =
        availability === "all" ||
        (availability === "online" && rider.isOnline) ||
        (availability === "offline" && !rider.isOnline);
      return matchesSearch && matchesVehicle && matchesAvailability;
    });
  }, [availability, riders, search, vehicle]);

  const nearestCompatible = useMemo(
    () => riders.find((rider) => rider.eligibleForThisOrder !== false) || null,
    [riders],
  );

  async function startAutomaticSelection() {
    if (!task) return;
    setAction("automatic");
    setError("");
    setNotice("");
    try {
      const response = await startAutomaticDispatchForBatch(task.deliveryBatchId);
      setNotice(
        response.sellerManualAssignmentRequired
          ? "No active rider could receive the automatic offer. Switch to manual selection to choose an offline or less-near rider in this service area."
          : "The nearest compatible active rider has received this order. The seller order will update immediately after the rider accepts.",
      );
      await loadPage();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Automatic rider selection could not start.",
      );
    } finally {
      setAction("");
    }
  }

  async function assignSelectedRider(rider: AvailableDeliveryRider) {
    if (!task || rider.eligibleForThisOrder === false) return;
    setAction(rider.id);
    setError("");
    setNotice("");
    try {
      await sendDeliveryOfferToRider({
        batchId: task.deliveryBatchId,
        riderId: rider.id,
      });
      setSelectedRider(null);
      setNotice(
        `${rider.displayName || rider.name} received the delivery offer. It stays reserved for that rider until accepted, rejected or genuinely expired.`,
      );
      await loadPage();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The delivery offer could not be sent.",
      );
    } finally {
      setAction("");
    }
  }

  if (loading) {
    return <LoadingState message="Loading riders and service-area matches..." />;
  }

  return (
    <section className="page-shell seller-rider-page">
      <button
        type="button"
        className="seller-rider-back"
        onClick={() => navigate("/orders")}
      >
        <FiArrowLeft /> Back to seller orders
      </button>

      <header className="seller-rider-header">
        <div>
          <span>Rider assignment</span>
          <h1>{order?.orderCode || "Seller order"}</h1>
          <p>
            {order?.items.map((item) => `${item.quantity}× ${item.productName}`).join(", ")}
          </p>
        </div>
        <div className="seller-rider-order-state">
          <FiTruck />
          <span>Package ready</span>
          <strong>{task?.pickupLandmark || order?.campus || "Pickup area"}</strong>
        </div>
      </header>

      {(error || notice) && (
        <div
          className={`seller-rider-feedback ${error ? "error" : "success"}`}
          role={error ? "alert" : "status"}
        >
          {error ? <FiX /> : <FiCheckCircle />}
          <span>{error || notice}</span>
        </div>
      )}

      <nav className="seller-rider-mode-tabs" aria-label="Rider selection mode">
        <button
          type="button"
          className={mode === "manual" ? "active" : ""}
          onClick={() => setSearchParams({ mode: "manual" })}
        >
          Select rider manually
        </button>
        <button
          type="button"
          className={mode === "automatic" ? "active" : ""}
          onClick={() => setSearchParams({ mode: "automatic" })}
        >
          Automatic nearest rider
        </button>
      </nav>

      {mode === "automatic" && (
        <section className="seller-rider-auto-panel">
          <div>
            <span>Recommended rider</span>
            <h2>
              {nearestCompatible
                ? nearestCompatible.displayName || nearestCompatible.name
                : "No active compatible rider found"}
            </h2>
            <p>
              {nearestCompatible
                ? `${vehicleLabel(nearestCompatible)} · ${
                    nearestCompatible.distanceToPickupKm == null
                      ? nearestCompatible.coverageArea || "service-area match"
                      : `${nearestCompatible.distanceToPickupKm.toFixed(1)} km from pickup`
                  }`
                : "Use manual selection to view verified offline riders and riders serving other locations."}
            </p>
          </div>
          <button
            type="button"
            disabled={!nearestCompatible || action === "automatic"}
            onClick={() => void startAutomaticSelection()}
          >
            <FiTruck />
            {action === "automatic"
              ? "Sending offer..."
              : "Send to nearest compatible rider"}
          </button>
        </section>
      )}

      <section className="seller-rider-controls">
        <label>
          <FiSearch />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, location or service area"
          />
        </label>
        <select
          value={vehicle}
          onChange={(event) => setVehicle(event.target.value)}
          aria-label="Filter riders by vehicle"
        >
          <option value="all">All vehicles</option>
          {vehicleOptions.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={availability}
          onChange={(event) => setAvailability(event.target.value)}
          aria-label="Filter riders by availability"
        >
          <option value="all">Online and offline</option>
          <option value="online">Online now</option>
          <option value="offline">Offline / last active</option>
        </select>
      </section>

      <div className="seller-rider-list-heading">
        <div>
          <span>Verified riders</span>
          <h2>{filteredRiders.length} rider(s)</h2>
        </div>
        <p>
          {mode === "manual"
            ? "Every active Stage 1-approved rider is listed, including busy and offline riders. Use location and vehicle filters, then review any compatibility warning before assigning."
            : "Only online, location-ready riders who match the package can receive automatic offers. Nearest compatible riders appear first."}
        </p>
      </div>

      {filteredRiders.length ? (
        <div className="seller-rider-grid">
          {filteredRiders.map((rider, index) => {
            const name = rider.displayName || rider.name || "Verified rider";
            const eligible = rider.eligibleForThisOrder !== false;
            const imageUrl = rider.profileImageUrl
              ? resolveMediaUrl(rider.profileImageUrl, "")
              : "";
            return (
              <article
                className={`seller-rider-card ${eligible ? "" : "not-eligible"}`}
                key={rider.id}
              >
                <div className="seller-rider-avatar">
                  {imageUrl ? <img src={imageUrl} alt={name} /> : <span>{initials(name)}</span>}
                  <i className={rider.isOnline ? "online" : "offline"} />
                </div>
                <div className="seller-rider-card-main">
                  <div>
                    <small>
                      {mode === "automatic" && eligible
                        ? `Nearest match #${index + 1}`
                        : eligible
                          ? "Matches this order"
                          : "Viewable rider"}
                    </small>
                    <h3>{name}</h3>
                    <p>{activityLabel(rider)}</p>
                  </div>
                  <dl>
                    <div>
                      <dt><FiTruck /> Vehicle</dt>
                      <dd>{vehicleLabel(rider)}</dd>
                    </div>
                    <div>
                      <dt><FiMapPin /> Service area</dt>
                      <dd>{rider.coverageArea || "Not specified"}</dd>
                    </div>
                    <div>
                      <dt><FiClock /> Distance</dt>
                      <dd>
                        {rider.distanceToPickupKm == null
                          ? "No live distance"
                          : `${rider.distanceToPickupKm.toFixed(1)} km`}
                      </dd>
                    </div>
                  </dl>
                  {!eligible && (
                    <p className="seller-rider-ineligible-reason">
                      {exclusionLabels[rider.exclusionReasons?.[0] || ""] ||
                        "This rider cannot safely receive this specific package."}
                    </p>
                  )}
                  {eligible &&
                    mode === "manual" &&
                    Boolean(rider.compatibilityWarnings?.length) && (
                      <p className="seller-rider-ineligible-reason">
                        {exclusionLabels[
                          rider.compatibilityWarnings?.[0] || ""
                        ] ||
                          "Review this rider's availability and package fit before assigning."}
                      </p>
                    )}
                  <button type="button" onClick={() => setSelectedRider(rider)}>
                    View full rider details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<FiUser />}
          title="No riders match these filters"
          message="Clear the location, vehicle or availability filters to see all verified riders."
        />
      )}

      <Link className="seller-rider-return-link" to="/orders">
        Return to the order
      </Link>

      {selectedRider && (
        <div
          className="seller-rider-modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedRider(null)}
        >
          <section
            className="seller-rider-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Rider details"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="seller-rider-modal-close"
              onClick={() => setSelectedRider(null)}
              aria-label="Close rider details"
            >
              <FiX />
            </button>
            <div className="seller-rider-modal-profile">
              {selectedRider.profileImageUrl ? (
                <img
                  src={resolveMediaUrl(selectedRider.profileImageUrl, "")}
                  alt={selectedRider.displayName || selectedRider.name}
                />
              ) : (
                <span>
                  {initials(
                    selectedRider.displayName ||
                      selectedRider.name ||
                      "Verified rider",
                  )}
                </span>
              )}
              <div>
                <small>{activityLabel(selectedRider)}</small>
                <h2>{selectedRider.displayName || selectedRider.name}</h2>
                <p>{vehicleLabel(selectedRider)}</p>
              </div>
            </div>
            <dl className="seller-rider-modal-details">
              <div>
                <dt>Phone number</dt>
                <dd>
                  {selectedRider.phone ? (
                    <a href={`tel:${selectedRider.phone}`}>
                      <FiPhone /> {selectedRider.phone}
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </dd>
              </div>
              <div>
                <dt>Location served</dt>
                <dd>
                  {(selectedRider.serviceAreas || [
                    selectedRider.coverageArea || "Not specified",
                  ]).join(", ")}
                </dd>
              </div>
              <div>
                <dt>Successful deliveries</dt>
                <dd>{selectedRider.successfulDeliveries || 0}</dd>
              </div>
              <div>
                <dt>Rider rating</dt>
                <dd>{Number(selectedRider.ratingAverage || 0).toFixed(1)} / 5</dd>
              </div>
              <div>
                <dt>Package capacity</dt>
                <dd>
                  {[
                    selectedRider.profile?.maxPackageSize,
                    selectedRider.profile?.maxWeightClass,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Standard verified capacity"}
                </dd>
              </div>
              <div>
                <dt>Pickup distance</dt>
                <dd>
                  {selectedRider.distanceToPickupKm == null
                    ? "Live distance unavailable"
                    : `${selectedRider.distanceToPickupKm.toFixed(1)} km`}
                </dd>
              </div>
            </dl>
            {selectedRider.eligibleForThisOrder === false ? (
              <div className="seller-rider-modal-warning">
                <FiX />
                <span>
                  {exclusionLabels[
                    selectedRider.exclusionReasons?.[0] || ""
                  ] ||
                    "This rider does not match this order's location, vehicle or package requirements."}
                </span>
              </div>
            ) : (
              <>
                {mode === "manual" &&
                Boolean(selectedRider.compatibilityWarnings?.length) ? (
                  <div className="seller-rider-modal-warning">
                    <FiClock />
                    <span>
                      {exclusionLabels[
                        selectedRider.compatibilityWarnings?.[0] || ""
                      ] ||
                        "Confirm this rider's availability and package fit before assigning."}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="seller-rider-assign-button"
                  disabled={action === selectedRider.id}
                  onClick={() => void assignSelectedRider(selectedRider)}
                >
                  <FiCheckCircle />
                  {action === selectedRider.id
                    ? "Sending assignment..."
                    : `Assign order to ${
                        selectedRider.displayName || selectedRider.name
                      }`}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
