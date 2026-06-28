import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  activateSellerSubscriptionForDevelopment,
  ensureSellerSubscription,
  getSellerSubscription,
} from "../services/subscription.service.js";

export const subscriptionRouter = Router();

subscriptionRouter.use(requireAuth);

subscriptionRouter.get("/seller/me", requireRole("seller", "admin"), (req, res) => {
  if (req.auth.role === "admin") {
    res.json({ subscription: null });
    return;
  }

  ensureSellerSubscription(req.auth.user_id);
  res.json({ subscription: getSellerSubscription(req.auth.user_id) });
});

subscriptionRouter.post(
  "/seller/activate-development",
  requireRole("seller", "admin"),
  (req, res) => {
    res.json({ subscription: activateSellerSubscriptionForDevelopment(req.auth.user_id) });
  },
);
