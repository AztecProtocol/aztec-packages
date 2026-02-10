#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Create a devnet branch from a nightly tag.
 *
 * Usage:
 *   create_devnet.ts <nightly-tag> [--dry-run]
 *
 * The script:
 * 1. Validates the nightly tag format (vX.Y.Z-nightly.YYYYMMDD)
 * 2. Reads the major version from .release-please-manifest.json
 * 3. Finds the next devnet iteration number
 * 4. Creates a branch with a .devnet-version file
 * 5. Pushes the branch
 *
 * Writes branch/namespace/major/iteration to GITHUB_OUTPUT when running in CI.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  parseArgs,
  configureGitIdentityInCI,
  writeGithubOutputs,
} from "./devnet_utils.ts";

const { dryRun, positional } = parseArgs(process.argv);

const nightlyTag = positional[0];
if (!nightlyTag) {
  console.error("Usage: create_devnet.ts <nightly-tag> [--dry-run]");
  process.exit(1);
}

// 1. Validate nightly tag format
if (!/^v\d+\.\d+\.\d+-nightly\.\d{8}$/.test(nightlyTag)) {
  console.error(`Error: Invalid nightly tag format '${nightlyTag}'`);
  console.error(
    "Expected format: vX.Y.Z-nightly.YYYYMMDD (e.g., v4.0.0-nightly.20260209)",
  );
  process.exit(1);
}

// 2. Configure git identity in CI
configureGitIdentityInCI();

// 3. Read major version from manifest
const manifest = JSON.parse(
  readFileSync(".release-please-manifest.json", "utf-8"),
);
const version: string = manifest["."];
const majorVersion = version.split(".")[0];
console.log(`Major version: ${majorVersion}`);

// 4. Find existing devnet branches to determine next iteration
const devnetBranchPrefix = `v${majorVersion}-devnet-`;
const lsRemote = execSync(
  `git ls-remote --heads origin "refs/heads/${devnetBranchPrefix}*"`,
  { encoding: "utf-8" },
);

// Scan remote branches to find the highest existing iteration number
let maxIteration = 0;
for (const line of lsRemote.split("\n")) {
  if (!line.trim()) continue;
  // Extract branch name from ls-remote output (format: <sha>\trefs/heads/<branch>)
  const branch = line.split("/").pop()!;
  const iterStr = branch.slice(devnetBranchPrefix.length);
  const iter = parseInt(iterStr, 10);
  if (!isNaN(iter) && iter > maxIteration) {
    maxIteration = iter;
  }
}

const iteration = maxIteration + 1;
const branch = `v${majorVersion}-devnet-${iteration}`;
const namespace = branch;

console.log(`Branch: ${branch}`);
console.log(`Namespace: ${namespace}`);

// 5. Safety check: branch must not already exist
const existsCheck = execSync(
  `git ls-remote --heads origin "refs/heads/${branch}"`,
  { encoding: "utf-8" },
);
if (existsCheck.includes(branch)) {
  console.error(`Error: Branch ${branch} already exists`);
  process.exit(1);
}

const created = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const devnetVersion =
  [
    `branch: ${branch}`,
    `namespace: ${namespace}`,
    `source: ${nightlyTag}`,
    `created: ${created}`,
  ].join("\n") + "\n";

if (dryRun) {
  console.log(`[dry-run] Would create branch: ${branch}`);
  console.log(`[dry-run] Would commit .devnet-version and push:`);
  console.log(devnetVersion);
} else {
  // 6. Create branch and .devnet-version file
  execSync(`git checkout -b "${branch}"`);

  writeFileSync(".devnet-version", devnetVersion);
  execSync("git add .devnet-version");
  execSync(
    `git commit -m "chore: initialize devnet ${branch} from ${nightlyTag}"`,
  );

  // 7. Push
  execSync(`git push origin "${branch}"`);

  console.log(`Devnet branch ${branch} created and pushed.`);

  // 8. Write outputs for CI
  writeGithubOutputs({
    branch,
    namespace,
    major: majorVersion,
    iteration: String(iteration),
  });
}
