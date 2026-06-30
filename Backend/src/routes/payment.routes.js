import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  initializePayment,
  verifyPayment,
} from "../services/payment.service.js";

export const paymentRouter = Router();

paymentRouter.use(requireAuth, requireEmailVerified);

paymentRouter.post("/initialize", (req, res) => {
  res.status(201).json({
    payment: initializePayment(req.auth.user_id, req.body),
  });
});

paymentRouter.post("/verify", (req, res) => {
  res.json({
    payment: verifyPayment(req.auth.user_id, String(req.body?.reference || "")),
  });
});
