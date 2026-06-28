import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { env } from "./config/env.js";
import { cleanExpiredSessions } from "./db/database.js";
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
import { usedMarketRouter } from "./routes/used-market.routes.js";
import { usedOrderRouter } from "./routes/used-order.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import { trustRouter } from "./routes/trust.routes.js";
import { securityRouter } from "./routes/security.routes.js";
import { subscriptionRouter } from "./routes/subscription.routes.js";
import { sellerVerificationRouter } from "./routes/seller-verification.routes.js";
import { userRouter } from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";

export const app = express();

cleanExpiredSessions();

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(env.uploadsPath)));
app.use(optionalAuth);

app.get("/", (_req, res) => {
  res.json({
    message: "Gleank backend is running",
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
app.use("/api/products", productRouter);
app.use("/api/orders", orderRouter);
app.use("/api/saved", savedRouter);
app.use("/api/users", userRouter);
app.use("/api/stores", storeRouter);
app.use("/api/seller", sellerRouter);
app.use("/api/used-market", usedMarketRouter);
app.use("/api/used-orders", usedOrderRouter);
app.use("/api/messages", messageRouter);
app.use("/api/trust", trustRouter);
app.use("/api/security", securityRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/seller-verification", sellerVerificationRouter);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
