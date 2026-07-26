import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  handlePaystackWebhook,
  initializePayAtDeliveryPayment,
  initializePayment,
  verifyPublicPayment,
  verifyPayment,
} from "../services/payment.service.js";

export const paymentRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const paystackWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const paymentInitializeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const paymentVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

paymentRouter.post(
  "/webhook",
  paystackWebhookLimiter,
  asyncRoute(async (req, res) => {
    await handlePaystackWebhook({
      rawBody: req.rawBody,
      body: req.body,
      signature: req.get("x-paystack-signature") || "",
    });
    res.status(200).json({ received: true });
  }),
);

paymentRouter.post(
  "/public/verify",
  paymentVerifyLimiter,
  asyncRoute(async (req, res) => {
    const payment = await verifyPublicPayment(
      String(req.body?.reference || ""),
      req.auth?.user_id || "",
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
  "/public/:reference",
  paymentVerifyLimiter,
  asyncRoute(async (req, res) => {
    const payment = await verifyPublicPayment(
      req.params.reference,
      req.auth?.user_id || "",
    );
    res.json({
      success: true,
      message: payment.status === "paid" ? "Payment verified successfully." : "Payment verification checked.",
      data: { payment },
      payment,
    });
  }),
);

paymentRouter.use(requireAuth, requireEmailVerified);

paymentRouter.post(
  "/initialize",
  paymentInitializeLimiter,
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
  paymentInitializeLimiter,
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
  paymentVerifyLimiter,
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
  paymentVerifyLimiter,
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
