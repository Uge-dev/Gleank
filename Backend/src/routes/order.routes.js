import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  createOrders,
  getOrder,
  listOrders,
  updateOrderStatus,
} from "../services/order.service.js";

export const orderRouter = Router();

orderRouter.use(requireAuth, requireEmailVerified);

orderRouter.get("/", (req, res) => {
  res.json({ orders: listOrders(req.auth.user_id) });
});

orderRouter.post("/", (req, res) => {
  const orders = createOrders(req.auth.user_id, req.body);
  res.status(201).json({ orders });
});

orderRouter.get("/:id", (req, res) => {
  res.json({ order: getOrder(req.auth.user_id, req.params.id) });
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
