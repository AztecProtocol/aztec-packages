#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Create a devnet patch tag from a devnet branch.
 *
 * Usage:
 *   create_devnet_tag.ts [branch] [--dry-run]
 *
 * If no branch argument is given, uses GITHUB_REF_NAME or the current git branch.
 *
 * The script:
 * 1. Validates the branch matches v<N>-devnet-<M>
 * 2. Finds the latest patch tag for this devnet
 * 3. Creates and pushes the next patch tag
 *
 * Writes tag/semver/namespace/ref to GITHUB_OUTPUT when running in CI.
 */

import { execSync } from "node:child_process";
import {
  parseArgs,
  configureGitIdentityInCI,
  writeGithubOutputs,
} from "./devnet_utils.ts";

const { dryRun, positional } = parseArgs(process.argv);

// Resolve branch name
let branch = positional[0];
if (!branch) {
  branch =
    process.env.GITHUB_REF_NAME ||
    execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
}

console.log(`Branch: ${branch}`);

// 1. Validate branch pattern
const match = branch.match(/^v(\d+)-devnet-(\d+)$/);
if (!match) {
  console.error(
    `Error: Branch name '${branch}' does not match expected pattern v<N>-devnet-<M>`,
  );
  process.exit(1);
}

const major = match[1];
const iteration = match[2];
console.log(`Major: ${major}, Iteration: ${iteration}`);

// 2. Configure git identity in CI
configureGitIdentityInCI();

// 3. Find the latest patch number for this devnet
const tagPattern = `v${major}.0.0-devnet.${iteration}-patch.`;
const existingTags = execSync(`git tag -l "${tagPattern}*"`, {
  encoding: "utf-8",
});

let latestPatch = -1;
for (const tag of existingTags.split("\n")) {
  if (!tag.trim()) continue;
  const patchStr = tag.split("-patch.").pop()!;
  const patch = parseInt(patchStr, 10);
  if (!isNaN(patch) && patch > latestPatch) {
    latestPatch = patch;
  }
}

const nextPatch = latestPatch + 1;
const tag = `v${major}.0.0-devnet.${iteration}-patch.${nextPatch}`;
const semver = tag.slice(1); // strip leading 'v'
const namespace = `v${major}-devnet-${iteration}`;

console.log(`Creating tag: ${tag}`);

if (dryRun) {
  console.log(`[dry-run] Would create tag: ${tag}`);
  console.log(`[dry-run] Would push tag to origin`);
} else {
  // 4. Create and push the tag
  execSync(`git tag -a "${tag}" -m "Devnet patch release ${tag}"`);
  execSync(`git push origin "${tag}"`);

  console.log(`Tag ${tag} created and pushed.`);

  // 5. Write outputs for CI
  writeGithubOutputs({ tag, semver, namespace, ref: branch });
}
