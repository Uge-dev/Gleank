import { Router } from "express";
import { requireAuth, requireEmailVerified, requireRole } from "../middleware/auth.js";
import {
  acceptSubstitution,
  addTaskProof,
  adminCancelBatch,
  adminHoldBatch,
  adminReassignBatch,
  adminSplitBatch,
  applyProductPackageProfile,
  checkoutGroupingPreview,
  createBatchesForOrder,
  deleteZone,
  getBatchesForOrder,
  getDeliveryBatch,
  getOwnReliability,
  getRiderCapacity,
  listAdminDispatches,
  listInterventionQueue,
  listPackageRules,
  listReliabilityScores,
  listRiderCandidatesForBatch,
  listRiderDispatches,
  listSellerReadinessTasks,
  listSubstitutionOptions,
  listZones,
  markPickupTaskReady,
  offerNextRiderForBatch,
  removeUnavailableItem,
  riderAcceptDispatch,
  riderRejectDispatch,
  riderTimeoutDispatch,
  savePackageRule,
  saveZone,
  sellerConfirmAvailability,
  sellerRejectAvailability,
  sendDeliveryOfferToRider,
  startDispatchForBatch,
  suggestPackageProfile,
  updateRiderCapacity,
  updateRiderCurrentZone,
  updateRiderLocationPermission,
  updateRiderServiceZones,
  updateSellerProductStock,
  verifyDeliveryTask,
  verifyPickupTask,
} from "../services/logistics.service.js";

export const logisticsRouter = Router();

function requireAdminAccess(req, res, next) {
  if (req.auth?.role === "admin") {
    next();
    return;
  }

  res.status(401).json({ message: "Admin authorization is required" });
}

logisticsRouter.get("/zones", (_req, res) => {
  res.json({ zones: listZones() });
});

logisticsRouter.post("/admin/zones", requireAdminAccess, (req, res) => {
  res.status(201).json({ zone: saveZone(req.body || {}) });
});

logisticsRouter.patch("/admin/zones/:zoneId", requireAdminAccess, (req, res) => {
  res.json({ zone: saveZone(req.body || {}, req.params.zoneId) });
});

logisticsRouter.delete("/admin/zones/:zoneId", requireAdminAccess, (req, res) => {
  res.json({ zone: deleteZone(req.params.zoneId) });
});

logisticsRouter.get("/package-rules", (_req, res) => {
  res.json({ rules: listPackageRules() });
});

logisticsRouter.post("/package-rules/suggest", (req, res) => {
  res.json(suggestPackageProfile(req.body || {}));
});

logisticsRouter.post("/admin/package-rules", requireAdminAccess, (req, res) => {
  res.status(201).json({ rule: savePackageRule(req.body || {}) });
});

logisticsRouter.patch("/admin/package-rules/:ruleId", requireAdminAccess, (req, res) => {
  res.json({ rule: savePackageRule(req.body || {}, req.params.ruleId) });
});

logisticsRouter.patch("/products/:productId/package-profile", requireAuth, requireEmailVerified, (req, res) => {
  res.json({
    packageProfile: applyProductPackageProfile(req.params.productId, req.body || {}, {
      actorId: req.auth.user_id,
      adminVerified: req.auth.role === "admin",
    }),
  });
});

logisticsRouter.post("/seller/products/:productId/package-profile", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({
    packageProfile: applyProductPackageProfile(req.params.productId, req.body || {}, {
      actorId: req.auth.user_id,
      adminVerified: req.auth.role === "admin",
    }),
  });
});

logisticsRouter.get("/rider/capacity-profile", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json({ capacityProfile: getRiderCapacity(req.auth) });
});

logisticsRouter.patch("/rider/capacity-profile", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json({ capacityProfile: updateRiderCapacity(req.auth, req.body || {}) });
});

logisticsRouter.patch("/rider/service-zones", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json({ capacityProfile: updateRiderServiceZones(req.auth, req.body?.zoneIds || req.body?.serviceZoneIds || []) });
});

logisticsRouter.patch("/rider/current-zone", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json({ capacityProfile: updateRiderCurrentZone(req.auth, req.body || {}) });
});

logisticsRouter.patch("/rider/location-permission-status", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json({ capacityProfile: updateRiderLocationPermission(req.auth, req.body || {}) });
});

logisticsRouter.post("/orders/grouping-preview", requireAuth, requireEmailVerified, (req, res) => {
  res.json(checkoutGroupingPreview(req.body || {}));
});

logisticsRouter.post("/orders/:orderId/create-batches", requireAuth, requireEmailVerified, (req, res) => {
  res.status(201).json({ parentOrder: createBatchesForOrder(req.auth, req.params.orderId) });
});

logisticsRouter.get("/orders/:orderId/batches", requireAuth, requireEmailVerified, (req, res) => {
  res.json(getBatchesForOrder(req.auth, req.params.orderId));
});

logisticsRouter.get("/delivery-batches/:batchId", requireAuth, requireEmailVerified, (req, res) => {
  res.json({ batch: getDeliveryBatch(req.auth, req.params.batchId) });
});

logisticsRouter.post("/dispatch/batches/:batchId/start", requireAuth, requireEmailVerified, requireRole("admin", "seller"), (req, res) => {
  res.json(startDispatchForBatch(req.auth, req.params.batchId));
});

logisticsRouter.get("/dispatch/batches/:batchId/rider-candidates", requireAuth, requireEmailVerified, requireRole("admin", "seller"), (req, res) => {
  res.json(listRiderCandidatesForBatch(req.auth, req.params.batchId, {
    assignmentMode: String(req.query?.mode || "manual"),
  }));
});

logisticsRouter.post("/dispatch/batches/:batchId/offers", requireAuth, requireEmailVerified, requireRole("admin", "seller"), (req, res) => {
  res.status(201).json(sendDeliveryOfferToRider(req.auth, req.params.batchId, req.body || {}));
});

logisticsRouter.post("/dispatch/batches/:batchId/offer-next-rider", requireAuth, requireEmailVerified, requireRole("admin", "seller"), (req, res) => {
  if (req.auth.role === "seller") {
    res.json(startDispatchForBatch(req.auth, req.params.batchId));
    return;
  }
  res.json(offerNextRiderForBatch(req.params.batchId));
});

logisticsRouter.post("/rider/dispatch/:dispatchId/accept", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json(riderAcceptDispatch(req.auth, req.params.dispatchId, req.body || {}));
});

logisticsRouter.post("/rider/dispatch/:dispatchId/reject", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json(riderRejectDispatch(req.auth, req.params.dispatchId, req.body?.reason || ""));
});

logisticsRouter.post("/rider/dispatch/:dispatchId/timeout", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json(riderTimeoutDispatch(req.auth, req.params.dispatchId));
});

logisticsRouter.get("/rider/dispatches/active", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json({ dispatches: listRiderDispatches(req.auth) });
});

logisticsRouter.get("/admin/dispatches", requireAdminAccess, (_req, res) => {
  res.json(listAdminDispatches());
});

logisticsRouter.post("/rider/pickups/:pickupTaskId/verify", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json(verifyPickupTask(req.auth, req.params.pickupTaskId, req.body || {}));
});

logisticsRouter.post("/rider/deliveries/:deliveryTaskId/verify", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json(verifyDeliveryTask(req.auth, req.params.deliveryTaskId, req.body || {}));
});

logisticsRouter.post("/rider/pickups/:pickupTaskId/proof", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.status(201).json(addTaskProof(req.auth, "pickup", req.params.pickupTaskId, req.body || {}));
});

logisticsRouter.post("/rider/deliveries/:deliveryTaskId/proof", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.status(201).json(addTaskProof(req.auth, "delivery", req.params.deliveryTaskId, req.body || {}));
});

logisticsRouter.get("/seller/pickup-tasks", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({ pickupTasks: listSellerReadinessTasks(req.auth) });
});

logisticsRouter.post("/seller/order-items/:orderItemId/confirm-availability", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({ pickupTask: sellerConfirmAvailability(req.auth, req.params.orderItemId, req.body?.note || "") });
});

logisticsRouter.post("/seller/order-items/:orderItemId/reject-availability", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({ pickupTask: sellerRejectAvailability(req.auth, req.params.orderItemId, req.body?.note || "") });
});

logisticsRouter.post("/seller/pickup-tasks/:pickupTaskId/mark-ready", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({ pickupTask: markPickupTaskReady(req.auth, req.params.pickupTaskId, req.body || {}) });
});

logisticsRouter.patch("/seller/products/:productId/stock-status", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({ product: updateSellerProductStock(req.auth, req.params.productId, { stockStatus: req.body?.stockStatus, note: req.body?.note }) });
});

logisticsRouter.patch("/seller/products/:productId/quantity", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({ product: updateSellerProductStock(req.auth, req.params.productId, { quantity: req.body?.quantity, note: req.body?.note }) });
});

logisticsRouter.get("/orders/:orderId/substitution-options", requireAuth, requireEmailVerified, (req, res) => {
  res.json({ options: listSubstitutionOptions(req.auth, req.params.orderId) });
});

logisticsRouter.post("/orders/:orderId/accept-substitution", requireAuth, requireEmailVerified, (req, res) => {
  res.json(acceptSubstitution(req.auth, req.params.orderId, req.body || {}));
});

logisticsRouter.post("/orders/:orderId/remove-unavailable-item", requireAuth, requireEmailVerified, (req, res) => {
  res.json(removeUnavailableItem(req.auth, req.params.orderId, req.body || {}));
});

logisticsRouter.get("/admin/live-dispatch", requireAdminAccess, (_req, res) => {
  res.json(listAdminDispatches());
});

logisticsRouter.get("/admin/intervention-queue", requireAdminAccess, (req, res) => {
  res.json({ queue: listInterventionQueue({ status: String(req.query.status || "open") }) });
});

logisticsRouter.patch("/admin/delivery-batches/:batchId/reassign", requireAdminAccess, (req, res) => {
  res.json(adminReassignBatch(req.auth, req.params.batchId, req.body || {}));
});

logisticsRouter.patch("/admin/delivery-batches/:batchId/split", requireAdminAccess, (req, res) => {
  res.json({ batch: adminSplitBatch(req.auth, req.params.batchId) });
});

logisticsRouter.patch("/admin/delivery-batches/:batchId/hold", requireAdminAccess, (req, res) => {
  res.json({ batch: adminHoldBatch(req.auth, req.params.batchId, req.body?.reason || "") });
});

logisticsRouter.patch("/admin/delivery-batches/:batchId/cancel", requireAdminAccess, (req, res) => {
  res.json({ batch: adminCancelBatch(req.auth, req.params.batchId, req.body?.reason || "") });
});

logisticsRouter.patch("/admin/payouts/:payoutId/hold", requireAdminAccess, (req, res) => {
  res.json({ ok: true, payoutId: req.params.payoutId, status: "on_hold", reason: req.body?.reason || "" });
});

logisticsRouter.patch("/admin/payouts/:payoutId/release", requireAdminAccess, (req, res) => {
  res.json({ ok: true, payoutId: req.params.payoutId, status: "released" });
});

logisticsRouter.get("/admin/reliability/users", requireAdminAccess, (req, res) => {
  res.json({ scores: listReliabilityScores(String(req.query.role || "")) });
});

logisticsRouter.get("/seller/reliability", requireAuth, requireEmailVerified, requireRole("seller", "admin"), (req, res) => {
  res.json({ reliability: getOwnReliability(req.auth) });
});

logisticsRouter.get("/rider/reliability", requireAuth, requireEmailVerified, requireRole("rider"), (req, res) => {
  res.json({ reliability: getOwnReliability(req.auth) });
});

logisticsRouter.post("/internal/reliability/recalculate", requireAdminAccess, (_req, res) => {
  res.json({ scores: listReliabilityScores() });
});
