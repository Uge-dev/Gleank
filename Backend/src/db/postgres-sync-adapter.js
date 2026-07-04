import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const workerPath = fileURLToPath(
  new URL("./postgres-sync-worker.js", import.meta.url),
);

function stripPragmas(sql) {
  return String(sql || "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^PRAGMA\b/i.test(statement))
    .join(";\n");
}

function normalizeExecSql(sql) {
  const trimmed = String(sql || "").trim();

  if (/^BEGIN\s+IMMEDIATE$/i.test(trimmed)) return "BEGIN";

  return stripPragmas(trimmed)
    .replace(/\bCOLLATE\s+NOCASE\b/gi, "")
    .replace(/\)\s+STRICT\s*;/gi, ");")
    .replace(/\)\s+STRICT\s*$/gi, ")");
}

function convertPlaceholders(sql) {
  let index = 0;
  let output = "";
  let inSingleQuote = false;

  for (let cursor = 0; cursor < sql.length; cursor += 1) {
    const char = sql[cursor];
    const next = sql[cursor + 1];

    if (char === "'") {
      output += char;

      if (inSingleQuote && next === "'") {
        output += next;
        cursor += 1;
        continue;
      }

      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === "?" && !inSingleQuote) {
      index += 1;
      output += `$${index}`;
      continue;
    }

    output += char;
  }

  return output;
}

function replaceKeywordOutsideQuotes(sql, keyword, replacement) {
  let output = "";
  let inSingleQuote = false;
  const upperKeyword = keyword.toUpperCase();

  for (let cursor = 0; cursor < sql.length; cursor += 1) {
    const char = sql[cursor];
    const next = sql[cursor + 1];

    if (char === "'") {
      output += char;

      if (inSingleQuote && next === "'") {
        output += next;
        cursor += 1;
        continue;
      }

      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote) {
      const candidate = sql.slice(cursor, cursor + keyword.length);
      const previous = sql[cursor - 1] || "";
      const following = sql[cursor + keyword.length] || "";
      const isWordBefore = /[A-Za-z0-9_]/.test(previous);
      const isWordAfter = /[A-Za-z0-9_]/.test(following);

      if (
        candidate.toUpperCase() === upperKeyword &&
        !isWordBefore &&
        !isWordAfter
      ) {
        output += replacement;
        cursor += keyword.length - 1;
        continue;
      }
    }

    output += char;
  }

  return output;
}

function replaceSqliteAggregates(sql) {
  return sql.replace(
    /GROUP_CONCAT\s*\(\s*([A-Za-z0-9_."`]+)\s*,\s*'([^']*)'\s*\)/gi,
    (_match, column, separator) => `STRING_AGG(${column}, '${separator}')`,
  );
}

function normalizeQuerySql(sql) {
  const trimmed = normalizeExecSql(sql);
  const postgresSearchSql = replaceKeywordOutsideQuotes(trimmed, "LIKE", "ILIKE");
  const postgresAggregateSql = replaceSqliteAggregates(postgresSearchSql);
  return convertPlaceholders(postgresAggregateSql);
}

function pragmaTableInfoQuery(sql) {
  const match = String(sql || "").match(/^\s*PRAGMA\s+table_info\(([^)]+)\)\s*$/i);
  if (!match) return null;

  return String(match[1] || "").replace(/['"`]/g, "").trim();
}

class PostgresStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.pragmaTable = pragmaTableInfoQuery(sql);
  }

  get(...params) {
    const rows = this.all(...params);
    return rows[0];
  }

  all(...params) {
    if (this.pragmaTable) {
      const result = this.database.query(
        `
          SELECT column_name AS name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
          ORDER BY ordinal_position ASC
        `,
        [this.pragmaTable],
        { alreadyConverted: true },
      );

      return result.rows;
    }

    const result = this.database.query(this.sql, params);
    return result.rows;
  }

  run(...params) {
    const result = this.database.query(this.sql, params);

    return {
      changes: result.rowCount || 0,
      lastInsertRowid: undefined,
    };
  }
}

export class PostgresSyncDatabase {
  constructor() {
    if (!env.databaseUrl) {
      throw new Error("DATABASE_URL is required when DATABASE_PROVIDER=postgres.");
    }

    this.requestId = 0;
    this.timeoutMs = Number(process.env.POSTGRES_SYNC_TIMEOUT_MS || 30000);
    this.worker = new Worker(workerPath, {
      workerData: {
        databaseUrl: env.databaseUrl,
      },
    });
  }

  call(payload) {
    this.requestId += 1;

    const signal = new SharedArrayBuffer(4);
    const view = new Int32Array(signal);
    const responsePath = path.join(
      os.tmpdir(),
      `gleenc-pg-${process.pid}-${this.requestId}-${Date.now()}.json`,
    );

    this.worker.postMessage({
      ...payload,
      responsePath,
      signal,
    });

    const waitResult = Atomics.wait(view, 0, 0, this.timeoutMs);

    if (waitResult === "timed-out") {
      throw new Error(
        `Postgres query timed out after ${this.timeoutMs}ms: ${payload.sql}`,
      );
    }

    const raw = fs.readFileSync(responsePath, "utf8");
    fs.rmSync(responsePath, { force: true });

    const response = JSON.parse(raw);

    if (!response.ok) {
      const error = new Error(response.error?.message || "Postgres query failed.");
      error.code = response.error?.code;
      error.detail = response.error?.detail;
      error.stack = response.error?.stack || error.stack;
      throw error;
    }

    return response.result;
  }

  exec(sql) {
    const normalized = normalizeExecSql(sql);
    if (!normalized) return;

    this.call({
      type: "exec",
      sql: normalized,
    });
  }

  prepare(sql) {
    return new PostgresStatement(this, sql);
  }

  query(sql, params = [], options = {}) {
    const normalized = options.alreadyConverted ? sql : normalizeQuerySql(sql);

    return this.call({
      type: "query",
      sql: normalized,
      params,
    });
  }

  transaction(callback) {
    return (...args) => {
      this.exec("BEGIN");

      try {
        const result = callback(...args);
        this.exec("COMMIT");
        return result;
      } catch (error) {
        this.exec("ROLLBACK");
        throw error;
      }
    };
  }

  async close() {
    await this.worker.terminate();
  }
}
