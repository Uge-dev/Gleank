import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  createOrders,
  getOrder,
  getPendingBuyerOrderCount,
  getOrderPaymentState,
  listOrders,
  listReturnsForOrder,
  markOrderPaidLocally,
  openOrderDispute,
  openOrderReturn,
  replyToOrderReturn,
  sellerConfirmOrder,
  sellerRejectOrder,
  submitStoreReview,
  updateOrderStatus,
  verifyOrderDelivery,
} from "../services/order.service.js";

export const orderRouter = Router();

orderRouter.use(requireAuth, requireEmailVerified);

orderRouter.get("/", (req, res) => {
  res.json({ orders: listOrders(req.auth.user_id) });
});

orderRouter.get("/pending-count", (req, res) => {
  res.json({ count: getPendingBuyerOrderCount(req.auth.user_id) });
});

orderRouter.post("/", (req, res) => {
  const orders = createOrders(req.auth.user_id, req.body);
  res.status(201).json({ orders });
});

orderRouter.get("/:id", (req, res) => {
  res.json({ order: getOrder(req.auth.user_id, req.params.id) });
});

orderRouter.get("/:id/payment-status", (req, res) => {
  res.json({
    payment: getOrderPaymentState(req.auth.user_id, req.params.id),
  });
});

orderRouter.post("/:id/pay", (req, res) => {
  res.json({
    order: markOrderPaidLocally(
      req.auth.user_id,
      req.params.id,
      String(req.body?.reference || ""),
    ),
  });
});

orderRouter.post("/:id/seller-confirm", (req, res) => {
  res.json({
    order: sellerConfirmOrder(
      req.auth,
      req.params.id,
      req.body || {},
    ),
  });
});

orderRouter.post("/:id/seller-reject", (req, res) => {
  res.json({
    order: sellerRejectOrder(
      req.auth,
      req.params.id,
      String(req.body?.note || ""),
    ),
  });
});

orderRouter.patch("/:id/status", (req, res) => {
  res.json({
    order: updateOrderStatus(
      req.auth,
      req.params.id,
      req.body?.status,
      req.body?.note,
    ),
  });
});

orderRouter.get("/:id/returns", (req, res) => {
  res.json({ returns: listReturnsForOrder(req.auth, req.params.id) });
});

orderRouter.post("/:id/returns", (req, res) => {
  res.status(201).json({
    returnRequest: openOrderReturn(req.auth, req.params.id, req.body || {}),
  });
});

orderRouter.post("/returns/:returnId/respond", (req, res) => {
  res.json({
    returnRequest: replyToOrderReturn(req.auth, req.params.returnId, req.body || {}),
  });
});

orderRouter.post("/:id/disputes", (req, res) => {
  res.status(201).json({
    dispute: openOrderDispute(req.auth, req.params.id, req.body || {}),
  });
});

orderRouter.post("/:id/verify-delivery", (req, res) => {
  res.json({
    order: verifyOrderDelivery(
      req.auth,
      req.params.id,
      String(req.body?.verificationCode || ""),
      String(req.body?.note || ""),
    ),
  });
});

orderRouter.post("/:id/review", (req, res) => {
  res.status(201).json({ review: submitStoreReview(req.auth, req.params.id, req.body || {}) });
});
