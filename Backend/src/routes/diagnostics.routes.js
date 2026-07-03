import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import {
  getEmailConfigReport,
  sendDiagnosticEmail,
  verifyEmailTransport,
} from "../services/email.service.js";

export const diagnosticsRouter = Router();

const emailTestSchema = z.object({
  to: z.string().trim().email(),
});

function requireDiagnosticToken(req, _res, next) {
  if (!env.emailDiagnosticToken) {
    throw new HttpError(
      404,
      "Email diagnostics are disabled. Set EMAIL_DIAGNOSTIC_TOKEN on the backend to enable this endpoint.",
    );
  }

  const token =
    req.get("x-email-diagnostic-token") ||
    req.get("x-diagnostic-token") ||
    req.query.token ||
    "";

  if (String(token) !== env.emailDiagnosticToken) {
    throw new HttpError(403, "Invalid email diagnostics token.");
  }

  next();
}

diagnosticsRouter.use(requireDiagnosticToken);

diagnosticsRouter.get("/email/config", (_req, res) => {
  res.json({
    config: getEmailConfigReport(),
  });
});

diagnosticsRouter.post("/email/test", async (req, res) => {
  const parsed = emailTestSchema.safeParse(req.body || {});

  if (!parsed.success) {
    throw new HttpError(
      422,
      "Enter a valid recipient email address.",
      parsed.error.flatten(),
    );
  }

  const transport = await verifyEmailTransport();
  const delivery = await sendDiagnosticEmail({ to: parsed.data.to });

  res.json({
    ok: true,
    config: getEmailConfigReport(),
    transport,
    delivery,
  });
});
