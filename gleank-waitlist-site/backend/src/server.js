import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { adminRouter } from "./routes/admin.routes.js";
import { waitlistRouter } from "./routes/waitlist.routes.js";

const app = express();

app.use(helmet());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ message: "Gleank Waitlist API is running" });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "gleank-waitlist-api" });
});

app.use("/api/waitlist", waitlistRouter);
app.use("/api/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  console.error("API error:", error);
  res.status(error.status || 500).json({
    message: error.message || "Something went wrong.",
  });
});

async function startServer() {
  await connectDB();

  app.listen(env.port, () => {
    console.log(`Gleank Waitlist API running on http://localhost:${env.port}`);
    console.log(`Allowed CORS origins: ${env.corsOrigins.join(", ")}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
