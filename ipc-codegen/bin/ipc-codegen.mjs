#!/usr/bin/env node
// Runs the generator straight from its TypeScript sources: ipc-codegen is written in the
// erasable subset of TypeScript so Node's type stripping is all it needs, no build step.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generate = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "generate.ts");
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", generate, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
