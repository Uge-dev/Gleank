import { Router } from "express";
import rateLimit from "express-rate-limit";
import { handleDojahWebhook } from "../services/kyc.service.js";

export const webhookRouter = Router();

const dojahWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

webhookRouter.post("/dojah", dojahWebhookLimiter, (req, res) => {
  res.json(handleDojahWebhook({
    rawBody: req.rawBody,
    signature: req.get("x-dojah-signature") || req.get("x-signature") || "",
    timestamp: req.get("x-dojah-timestamp") || req.get("x-timestamp") || "",
    eventId: req.get("x-dojah-event-id") || req.get("x-event-id") || "",
    payload: req.body || {},
  }));
});
