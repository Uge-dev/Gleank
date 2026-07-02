import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL || "";

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Copy it from your Neon project connection modal.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("sslmode=require")
    ? undefined
    : { rejectUnauthorized: true },
  max: 1,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
});

try {
  const result = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      version() AS postgres_version,
      NOW() AS connected_at
  `);

  console.log("Neon connection OK");
  console.table(result.rows);
} catch (error) {
  console.error("Neon connection failed:");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
