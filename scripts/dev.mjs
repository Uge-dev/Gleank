import { spawn } from "node:child_process";

const processes = [
  spawn("npm", ["--prefix", "Backend", "run", "dev"], {
    stdio: "inherit",
    shell: false,
  }),
  spawn("npm", ["--prefix", "Frontend", "run", "dev"], {
    stdio: "inherit",
    shell: false,
  }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  for (const child of processes) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(exitCode), 250);
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (!stopping && (code !== 0 || signal)) {
      stop(code || 1);
    }
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
