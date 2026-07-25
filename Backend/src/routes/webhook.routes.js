import { Router } from "express";
import { handleDojahWebhook } from "../services/kyc.service.js";

export const webhookRouter = Router();

webhookRouter.post("/dojah", (req, res) => {
  res.json(handleDojahWebhook({
    rawBody: req.rawBody,
    signature: req.get("x-dojah-signature") || req.get("x-signature") || "",
    payload: req.body || {},
  }));
});
