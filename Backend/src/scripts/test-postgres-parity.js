// Isolated embedded-PostgreSQL check. Never connects to production or changes the source tree.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url),
  pglite = require.resolve("@electric-sql/pglite");
const scratch = await fs.mkdtemp(
    path.join(os.tmpdir(), "gleenc-postgres-parity-"),
  ),
  copy = path.join(scratch, "backend");
try {
  await fs.cp(root, copy, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(root, source).split(path.sep);
      return (
        !["node_modules", "data", "uploads", ".git"].includes(relative[0]) &&
        !relative.at(-1).startsWith(".env")
      );
    },
  });
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(copy, "node_modules"),
    "dir",
  );
  await fs.writeFile(
    path.join(copy, "src/db/postgres-sync-worker.js"),
    `import fs from 'node:fs/promises';
import {parentPort} from 'node:worker_threads';
import {PGlite} from ${JSON.stringify(pglite)};
const database=new PGlite();await database.waitReady;let queue=Promise.resolve();
parentPort.on('message',message=>{queue=queue.then(async()=>{try{let result;if(message.type==='exec'){await database.exec(message.sql);result={rowCount:0,rows:[]};}else{const r=await database.query(message.sql,message.params||[]);result={rowCount:r.affectedRows||0,rows:r.rows||[]};}await fs.writeFile(message.responsePath,JSON.stringify({ok:true,result}));Atomics.store(new Int32Array(message.signal),0,1);}catch(error){await fs.writeFile(message.responsePath,JSON.stringify({ok:false,error:{message:error.message,code:error.code,detail:error.detail}}));Atomics.store(new Int32Array(message.signal),0,2);}Atomics.notify(new Int32Array(message.signal),0);});});`,
  );
  const testFile = path.join(copy, "test/shared.test.js");
  let source = await fs.readFile(testFile, "utf8");
  source = source.replace(
    /DATABASE_PROVIDER:\s*["']sqlite["']/,
    "DATABASE_PROVIDER:'postgres',DATABASE_URL:'postgresql://test:test@localhost:5432/gleenc?sslmode=disable'",
  );
  source += "\ntest.after(async()=>{await db.close();});\n";
  await fs.writeFile(testFile, source);
  console.log(
    "Testing with embedded PostgreSQL. Network, Neon TLS and multi-process concurrency need a staging check.",
  );
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-isolation=process", "test/shared.test.js"],
      { cwd: copy, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
  process.exitCode = exitCode || 0;
} finally {
  await fs.rm(scratch, { recursive: true, force: true });
}
