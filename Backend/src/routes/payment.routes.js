import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  handlePaystackWebhook,
  initializePayAtDeliveryPayment,
  initializePayment,
  verifyPayment,
} from "../services/payment.service.js";

export const paymentRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

paymentRouter.post(
  "/webhook",
  asyncRoute(async (req, res) => {
    await handlePaystackWebhook({
      rawBody: req.rawBody,
      body: req.body,
      signature: req.get("x-paystack-signature") || "",
    });
    res.status(200).json({ received: true });
  }),
);

paymentRouter.use(requireAuth, requireEmailVerified);

paymentRouter.post(
  "/initialize",
  asyncRoute(async (req, res) => {
    res.status(201).json({
      payment: await initializePayment(req.auth.user_id, req.body),
    });
  }),
);

paymentRouter.post(
  "/pay-at-delivery/initialize",
  asyncRoute(async (req, res) => {
    res.status(201).json({
      payment: await initializePayAtDeliveryPayment(
        req.auth.user_id,
        String(req.body?.orderId || req.body?.targetId || ""),
      ),
    });
  }),
);

paymentRouter.post(
  "/verify",
  asyncRoute(async (req, res) => {
    res.json({
      payment: await verifyPayment(
        req.auth.user_id,
        String(req.body?.reference || ""),
      ),
    });
  }),
);

paymentRouter.get(
  "/verify/:reference",
  asyncRoute(async (req, res) => {
    res.json({
      payment: await verifyPayment(req.auth.user_id, req.params.reference),
    });
  }),
);
