import { spawn } from "node:child_process";

const vitestArgs = [
  "node_modules/vitest/vitest.mjs",
  "run",
  "packages/core/src/tap-live.test.ts",
  ...process.argv.slice(2),
];

const child = spawn(process.execPath, vitestArgs, {
  env: { ...process.env, STARFETCH_LIVE_TAP: "1" },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
