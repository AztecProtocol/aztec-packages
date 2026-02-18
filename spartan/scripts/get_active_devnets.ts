#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Discover active devnet branches.
 *
 * Usage:
 *   get_active_devnets.ts [--dry-run]
 *
 * Outputs a JSON array of devnet namespaces (e.g. ["v4-devnet-1","v4-devnet-2"]).
 * Writes `devnets` to GITHUB_OUTPUT when running in CI.
 */

import { execSync } from "node:child_process";
import { parseArgs, writeGithubOutputs } from "./devnet_utils.ts";

const { dryRun } = parseArgs(process.argv);

// Discover active devnet branches (v4-devnet-1, v4-devnet-2, ...)
const lsRemote = execSync(
  'git ls-remote --heads origin "refs/heads/v*-devnet-*"',
  { encoding: "utf-8" },
);

const devnetPattern = /^v\d+-devnet-\d+$/;
const devnets: string[] = [];

for (const line of lsRemote.split("\n")) {
  if (!line.trim()) continue;
  const branch = line.split("/").pop()!;
  if (devnetPattern.test(branch)) {
    devnets.push(branch);
  }
}

devnets.sort();

if (dryRun) {
  console.log("[dry-run] Discovered devnets:");
  for (const d of devnets) {
    console.log(`  - ${d}`);
  }
} else {
  console.log(
    `Discovered ${devnets.length} active devnet(s): ${devnets.join(", ") || "(none)"}`,
  );
  writeGithubOutputs({ devnets: JSON.stringify(devnets) });
}
