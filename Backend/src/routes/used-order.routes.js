import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import { fileUrl, upload } from "../middleware/upload.js";
import {
  createUsedOrder,
  getUsedOrder,
  listUsedOrders,
  markUsedOrderPaid,
  submitUsedDeliveryProof,
  updateUsedOrderStatus,
} from "../services/used-order.service.js";

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

usedOrderRouter.post("/:id/pay", (req, res) => {
  res.json({ order: markUsedOrderPaid(req.auth.user_id, req.params.id) });
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
