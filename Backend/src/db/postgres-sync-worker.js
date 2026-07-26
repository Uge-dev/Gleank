import fs from "node:fs/promises";
import pg from "pg";
import { parentPort, workerData } from "node:worker_threads";

const { Client } = pg;

let client = null;

function sslConfig(databaseUrl) {
  if (/sslmode=disable/i.test(databaseUrl)) return false;

  return {
    rejectUnauthorized:
      String(process.env.PGSSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !==
      "false",
  };
}

function normalizeDatabaseUrl(databaseUrl) {
  return String(databaseUrl || "").replace(
    /sslmode=(prefer|require|verify-ca)(?=&|$)/i,
    "sslmode=verify-full",
  );
}

async function getClient() {
  if (client) return client;

  client = new Client({
    connectionString: normalizeDatabaseUrl(workerData.databaseUrl),
    ssl: sslConfig(workerData.databaseUrl),
    connectionTimeoutMillis: Number(
      process.env.POSTGRES_CONNECTION_TIMEOUT_MS || 15000,
    ),
  });

  await client.connect();
  return client;
}

function normalizeRow(row) {
  const normalized = {};

  for (const [key, value] of Object.entries(row || {})) {
    if (
      typeof value === "string" &&
      /^-?\d+$/.test(value) &&
      (key === "count" ||
        key === "value" ||
        key.endsWith("_count") ||
        key.endsWith("_total"))
    ) {
      normalized[key] = Number(value);
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

async function execute(message) {
  const db = await getClient();

  if (message.type === "exec") {
    await db.query(message.sql);
    return { rowCount: 0, rows: [] };
  }

  const result = await db.query(message.sql, message.params || []);

  return {
    rowCount: result.rowCount || 0,
    rows: (result.rows || []).map(normalizeRow),
  };
}

parentPort.on("message", async (message) => {
  try {
    const result = await execute(message);

    await fs.writeFile(
      message.responsePath,
      JSON.stringify({ ok: true, result }),
      "utf8",
    );
    Atomics.store(new Int32Array(message.signal), 0, 1);
    Atomics.notify(new Int32Array(message.signal), 0);
  } catch (error) {
    await fs.writeFile(
      message.responsePath,
      JSON.stringify({
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : "",
          code: error?.code || "",
          detail: error?.detail || "",
        },
      }),
      "utf8",
    );
    Atomics.store(new Int32Array(message.signal), 0, 2);
    Atomics.notify(new Int32Array(message.signal), 0);
  }
});
