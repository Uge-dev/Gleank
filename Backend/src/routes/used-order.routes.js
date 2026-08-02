import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import { fileUrl, upload } from "../middleware/upload.js";
import {
  createUsedOrder,
  chooseUsedOrderFulfillment,
  getUsedOrder,
  listUsedOrders,
  listReturnsForUsedOrder,
  markUsedOrderPaid,
  openUsedOrderDispute,
  openUsedOrderReturn,
  replyToUsedOrderReturn,
  submitUsedDeliveryProof,
  updateUsedOrderStatus,
  verifyUsedOrderDelivery,
} from "../services/used-order.service.js";
import { createRiderAssignment, listAvailableRiders } from "../services/rider.service.js";
import { HttpError } from "../lib/http-error.js";

export const usedOrderRouter = Router();

usedOrderRouter.use(requireAuth, requireEmailVerified);

usedOrderRouter.get("/", (req, res) => {
  res.json({ orders: listUsedOrders(req.auth.user_id) });
});

usedOrderRouter.post("/", (req, res) => {
  res.status(201).json({ order: createUsedOrder(req.auth.user_id, req.body) });
});

usedOrderRouter.get("/:id", (req, res) => {
  res.json({ order: getUsedOrder(req.auth.user_id, req.params.id) });
});

usedOrderRouter.patch("/:id/fulfillment", (req, res) => {
  res.json({
    order: chooseUsedOrderFulfillment(
      req.auth,
      req.params.id,
      String(req.body?.method || ""),
    ),
  });
});

usedOrderRouter.get("/:id/available-riders", (req, res) => {
  const order = getUsedOrder(req.auth.user_id, req.params.id);
  if (order.sellerId !== req.auth.user_id && req.auth.role !== "admin") {
    throw new HttpError(403, "Only this order's seller can select a rider.");
  }
  res.json({ riders: listAvailableRiders(req.auth, { allowUsedMarketSeller: true }) });
});

usedOrderRouter.post("/:id/assign-rider", (req, res) => {
  res.status(201).json(createRiderAssignment(req.auth, {
    ...(req.body || {}),
    orderType: "used_order",
    orderId: req.params.id,
  }));
});

usedOrderRouter.post("/:id/pay", (req, res) => {
  res.json({
    order: markUsedOrderPaid(
      req.auth.user_id,
      req.params.id,
      String(req.body?.reference || ""),
    ),
  });
});

usedOrderRouter.post("/:id/verify-delivery", (req, res) => {
  res.json({
    order: verifyUsedOrderDelivery(
      req.auth,
      req.params.id,
      String(req.body?.verificationCode || req.body?.code || ""),
      String(req.body?.note || ""),
    ),
  });
});

usedOrderRouter.patch("/:id/status", (req, res) => {
  res.json({
    order: updateUsedOrderStatus(
      req.auth,
      req.params.id,
      String(req.body?.status || ""),
      String(req.body?.note || ""),
    ),
  });
});

usedOrderRouter.post(
  "/:id/delivery-proof",
  upload.single("proofImage"),
  (req, res) => {
    res.status(201).json(
      submitUsedDeliveryProof(
        req.auth,
        req.params.id,
        req.file ? fileUrl(req, req.file) : null,
        req.body?.note,
      ),
    );
  },
);

usedOrderRouter.get("/:id/returns", (req, res) => {
  res.json({ returns: listReturnsForUsedOrder(req.auth, req.params.id) });
});

usedOrderRouter.post("/:id/returns", (req, res) => {
  res.status(201).json({
    returnRequest: openUsedOrderReturn(req.auth, req.params.id, req.body || {}),
  });
});

usedOrderRouter.post("/returns/:returnId/respond", (req, res) => {
  res.json({
    returnRequest: replyToUsedOrderReturn(req.auth, req.params.returnId, req.body || {}),
  });
});

usedOrderRouter.post("/:id/disputes", (req, res) => {
  res.status(201).json({
    dispute: openUsedOrderDispute(req.auth, req.params.id, req.body || {}),
  });
});
