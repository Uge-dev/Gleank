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
    const payment = await initializePayment(req.auth.user_id, req.body);
    res.status(201).json({
      success: true,
      message: "Payment checkout is ready.",
      data: { payment },
      payment,
    });
  }),
);

paymentRouter.post(
  "/pay-at-delivery/initialize",
  asyncRoute(async (req, res) => {
    const payment = await initializePayAtDeliveryPayment(
      req.auth.user_id,
      String(req.body?.orderId || req.body?.targetId || ""),
    );
    res.status(201).json({
      success: true,
      message: "Pay at Delivery payment checkout is ready.",
      data: { payment },
      payment,
    });
  }),
);

paymentRouter.post(
  "/verify",
  asyncRoute(async (req, res) => {
    const payment = await verifyPayment(
      req.auth.user_id,
      String(req.body?.reference || ""),
    );
    res.json({
      success: true,
      message: payment.status === "paid" ? "Payment verified successfully." : "Payment verification checked.",
      data: { payment },
      payment,
    });
  }),
);

paymentRouter.get(
  "/verify/:reference",
  asyncRoute(async (req, res) => {
    const payment = await verifyPayment(req.auth.user_id, req.params.reference);
    res.json({
      success: true,
      message: payment.status === "paid" ? "Payment verified successfully." : "Payment verification checked.",
      data: { payment },
      payment,
    });
  }),
);
