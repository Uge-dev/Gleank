import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendEnv = path.join(root, "Backend/.env");
const frontendEnv = path.join(root, "Frontend/.env.local");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

if (!fs.existsSync(backendEnv)) {
  fs.writeFileSync(
    backendEnv,
    [
      "NODE_ENV=development",
      "PORT=4000",
      "FRONTEND_URL=http://localhost:5173",
      "DATABASE_PATH=./data/gleank.sqlite",
      "UPLOADS_PATH=./uploads",
      `JWT_SECRET=${crypto.randomBytes(48).toString("hex")}`,
      "SESSION_DAYS=7",
      "PASSWORD_RESET_MINUTES=30",
      "AUTO_APPROVE_USED_LISTINGS=true",
      "MAX_UPLOAD_MB=5",
      "",
    ].join("\n"),
  );
  console.log("Created Backend/.env with a random local session secret.");
}

if (!fs.existsSync(frontendEnv)) {
  fs.writeFileSync(frontendEnv, "VITE_API_URL=/api\n");
  console.log("Created Frontend/.env.local.");
}

await run("npm", ["install"], path.join(root, "Backend"));
await run("npm", ["install"], path.join(root, "Frontend"));
await run("npm", ["run", "seed"], path.join(root, "Backend"));

console.log("\nGleank local setup is complete.");
console.log("Run: npm run dev");
