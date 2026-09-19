import { startSettlementWorker } from './services/settlement.service.js';
import { app } from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.port, () => {
  console.log(`Gleenc API running at http://localhost:${env.port}`);
});
const stopSettlementWorker = startSettlementWorker();

function shutdown(signal) {
  console.log(`\n${signal} received. Closing Gleenc API...`);
  stopSettlementWorker();

  server.close(() => {
    console.log("Gleenc API closed successfully.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
