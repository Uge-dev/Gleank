import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  initializePayment,
  verifyPayment,
} from "../services/payment.service.js";

export const paymentRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

paymentRouter.use(requireAuth, requireEmailVerified);

paymentRouter.post(
  "/initialize",
  asyncRoute(async (req, res) => {
    const payment = await initializePayment(req.auth.user_id, req.body);
    res.status(201).json({ payment });
  }),
);

paymentRouter.post(
  "/verify",
  asyncRoute(async (req, res) => {
    const payment = await verifyPayment(
      req.auth.user_id,
      String(req.body?.reference || ""),
    );

    res.json({ payment });
  }),
);

paymentRouter.get(
  "/verify/:reference",
  asyncRoute(async (req, res) => {
    const payment = await verifyPayment(req.auth.user_id, req.params.reference);
    res.json({ payment });
  }),
);
