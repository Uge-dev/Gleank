import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import crypto from "node:crypto";
import path from "node:path";
import { env } from "./config/env.js";
import { cleanExpiredSessions } from "./db/database.js";
import { runStage3Migrations } from "./db/stage3-migrations.js";
import { optionalAuth } from "./middleware/auth.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.js";
import { authRouter } from "./routes/auth.routes.js";
import { productRouter } from "./routes/product.routes.js";
import { orderRouter } from "./routes/order.routes.js";
import { savedRouter } from "./routes/saved.routes.js";
import { sellerRouter } from "./routes/seller.routes.js";
import { storeRouter } from "./routes/store.routes.js";
import { marketRouter } from "./routes/market.routes.js";
import { usedMarketRouter } from "./routes/used-market.routes.js";
import { usedOrderRouter } from "./routes/used-order.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import { trustRouter } from "./routes/trust.routes.js";
import { securityRouter } from "./routes/security.routes.js";
import { subscriptionRouter } from "./routes/subscription.routes.js";
import { sellerVerificationRouter } from "./routes/seller-verification.routes.js";
import { paymentRouter } from "./routes/payment.routes.js";
import { cartRouter } from "./routes/cart.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { diagnosticsRouter } from "./routes/diagnostics.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { deliveryRouter } from "./routes/delivery.routes.js";
import { riderRouter } from "./routes/rider.routes.js";
import { logisticsRouter } from "./routes/logistics.routes.js";
import { kycRouter } from "./routes/kyc.routes.js";
import { locationRouter } from "./routes/location.routes.js";
import { buyerRouter } from "./routes/buyer.routes.js";
import { webhookRouter } from "./routes/webhook.routes.js";
import { verificationRouter } from "./routes/verification.routes.js";

export const app = express();

cleanExpiredSessions();
runStage3Migrations();

function normalizeCorsOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const allowedCorsOrigins = new Set(
  (env.corsOrigins || [env.frontendUrl])
    .map(normalizeCorsOrigin)
    .filter(Boolean),
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedCorsOrigins.has(normalizeCorsOrigin(origin))) {
      callback(null, true);
      return;
    }

    const error = new Error(`CORS origin is not allowed: ${origin}`);
    error.status = 403;
    callback(error);
  },
  credentials: true,
  optionsSuccessStatus: 204,
};

app.set("trust proxy", 1);
app.use((req, res, next) => {
  const existingId = req.get("x-request-id");
  const requestId =
    existingId && /^[A-Za-z0-9._:-]{8,100}$/.test(existingId)
      ? existingId
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors(corsOptions),
);
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(env.uploadsPath)));
app.use(optionalAuth);

app.get("/", (_req, res) => {
  res.json({
    message: "Gleenc backend is running",
    service: "gleank-api",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "gleank-api",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api", logisticsRouter);
app.use("/api/products", productRouter);
app.use("/api/orders", orderRouter);
app.use("/api/delivery", deliveryRouter);
app.use("/api/saved", savedRouter);
app.use("/api/users", userRouter);
app.use("/api/buyer", buyerRouter);
app.use("/api/stores", storeRouter);
app.use("/api/market", marketRouter);
app.use("/api/seller", sellerRouter);
app.use("/api/used-market", usedMarketRouter);
app.use("/api/used-orders", usedOrderRouter);
app.use("/api/messages", messageRouter);
app.use("/api/trust", trustRouter);
app.use("/api/kyc", kycRouter);
app.use("/api/location", locationRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/security", securityRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/seller-verification", sellerVerificationRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/cart", cartRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/diagnostics", diagnosticsRouter);
app.use("/api/admin", adminRoutes);

app.use("/api/rider", riderRouter);
app.use(notFoundHandler);
app.use(errorHandler);
