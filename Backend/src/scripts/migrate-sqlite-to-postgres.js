import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import pg from "pg";

const { Client } = pg;

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const tableOrder = [
  "users",
  "account_location_presence",
  "sessions",
  "notifications",
  "password_reset_tokens",
  "stores",
  "markets",
  "market_categories",
  "seller_market_profiles",
  "store_highlights",
  "products",
  "services",
  "used_listings",
  "user_trust_profiles",
  "user_payout_accounts",
  "used_listing_reviews",
  "used_listing_reports",
  "saved_items",
  "store_follows",
  "product_likes",
  "product_comments",
  "product_comment_likes",
  "used_listing_likes",
  "used_listing_comments",
  "used_listing_comment_likes",
  "used_listing_shares",
  "used_listing_views",
  "cart_items",
  "product_shares",
  "product_views",
  "orders",
  "order_items",
  "order_events",
  "conversations",
  "messages",
  "used_market_orders",
  "used_market_order_events",
  "used_market_delivery_proofs",
  "email_verification_tokens",
  "login_attempts",
  "user_security_events",
  "seller_verification_profiles",
  "seller_subscriptions",
  "seller_subscription_events",
  "platform_fee_rules",
  "payment_transactions",
  "verification_cases",
  "verification_requirements",
  "verification_submissions",
  "verification_reviews",
  "verification_level_requests",
  "verification_resubmission_requests",
  "verification_audit_events",
];

function resolveSqlitePath() {
  const configuredPath =
    process.env.SQLITE_MIGRATION_SOURCE ||
    process.env.DATABASE_PATH ||
    "./data/gleank.sqlite";

  return path.resolve(backendRoot, configuredPath);
}

function sslConfig(databaseUrl) {
  if (/sslmode=disable/i.test(databaseUrl)) return false;

  return {
    rejectUnauthorized:
      String(process.env.PGSSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !==
      "false",
  };
}

function normalizeDatabaseUrl(value) {
  return String(value || "").replace(
    /sslmode=(prefer|require|verify-ca)(?=&|$)/i,
    "sslmode=verify-full",
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqliteTableExists(sqlite, table) {
  return Boolean(
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}

async function postgresColumns(client, table) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [table],
  );

  return new Set(result.rows.map((row) => row.column_name));
}

function buildUpsertSql(table, columns) {
  const columnSql = columns.map(quoteIdentifier).join(", ");
  const placeholderSql = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updateColumns = columns.filter((column) => column !== "id");

  if (!columns.includes("id") || updateColumns.length === 0) {
    return `
      INSERT INTO ${quoteIdentifier(table)} (${columnSql})
      VALUES (${placeholderSql})
      ON CONFLICT DO NOTHING
    `;
  }

  const updateSql = updateColumns
    .map(
      (column) =>
        `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`,
    )
    .join(", ");

  return `
    INSERT INTO ${quoteIdentifier(table)} (${columnSql})
    VALUES (${placeholderSql})
    ON CONFLICT (${quoteIdentifier("id")}) DO UPDATE SET ${updateSql}
  `;
}

async function initializePostgresSchema() {
  process.env.DATABASE_PROVIDER = "postgres";

  const { db } = await import("../db/database.js");
  await db.close?.();
}

async function migrateTable({ sqlite, postgres, table }) {
  if (!sqliteTableExists(sqlite, table)) {
    return { table, count: 0, skipped: true };
  }

  const rows = sqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
  if (!rows.length) return { table, count: 0, skipped: false };

  const targetColumns = await postgresColumns(postgres, table);
  const columns = Object.keys(rows[0]).filter((column) =>
    targetColumns.has(column),
  );

  if (!columns.length) return { table, count: 0, skipped: true };

  const sql = buildUpsertSql(table, columns);

  for (const row of rows) {
    await postgres.query(
      sql,
      columns.map((column) => row[column] ?? null),
    );
  }

  return { table, count: rows.length, skipped: false };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Set it to your Neon connection string.");
  }

  const sqlitePath = resolveSqlitePath();
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source database was not found: ${sqlitePath}`);
  }

  console.log(`Initializing Neon schema from ${sqlitePath}`);
  await initializePostgresSchema();

  const sqlite = new Database(sqlitePath, { readonly: true });
  const postgres = new Client({
    connectionString: normalizeDatabaseUrl(databaseUrl),
    ssl: sslConfig(databaseUrl),
    connectionTimeoutMillis: Number(
      process.env.POSTGRES_CONNECTION_TIMEOUT_MS || 15000,
    ),
  });

  await postgres.connect();

  try {
    await postgres.query("BEGIN");

    let totalRows = 0;
    for (const table of tableOrder) {
      const result = await migrateTable({ sqlite, postgres, table });
      totalRows += result.count;

      const suffix = result.skipped ? "skipped" : `${result.count} rows`;
      console.log(`${table}: ${suffix}`);
    }

    await postgres.query("COMMIT");
    console.log(`Neon migration complete. ${totalRows} rows copied/upserted.`);
  } catch (error) {
    await postgres.query("ROLLBACK");
    throw error;
  } finally {
    sqlite.close();
    await postgres.end();
  }
}

main().catch((error) => {
  console.error("Neon migration failed:");
  console.error(error);
  process.exit(1);
});
