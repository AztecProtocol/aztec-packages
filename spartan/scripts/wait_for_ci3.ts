#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Wait for a CI3 workflow run triggered by a tag, then watch it to completion.
 *
 * Usage:
 *   wait_for_ci3.ts <tag> [repo]
 *
 * Arguments:
 *   tag  - The git tag to wait for (e.g., v4.0.0-devnet.1-patch.0)
 *   repo - Optional GitHub repo (default: GITHUB_REPOSITORY or 'AztecProtocol/aztec-packages')
 *
 * The script:
 * 1. Resolves the tag's SHA via `gh api`
 * 2. Polls for up to 10 minutes for a CI3 run matching that SHA
 * 3. Uses `gh run watch` to stream the run to completion
 *
 * Writes run_id to GITHUB_OUTPUT when running in CI.
 */

import { execSync } from "node:child_process";
import { writeGithubOutputs } from "./devnet_utils.ts";

const positional = process.argv.slice(2);

const tag = positional[0];
if (!tag) {
  console.error("Usage: wait_for_ci3.ts <tag> [repo]");
  process.exit(1);
}

const repo =
  positional[1] ||
  process.env.GITHUB_REPOSITORY ||
  "AztecProtocol/aztec-packages";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  // 1. Resolve tag SHA
  const tagSha = execSync(
    `gh api repos/${repo}/git/ref/tags/${tag} --jq '.object.sha'`,
    {
      encoding: "utf-8",
    },
  ).trim();

  console.log(`Waiting for CI3 run for tag ${tag} (sha: ${tagSha})`);

  // 2. Poll for the CI3 run (up to 10 minutes, checking every 10s)
  const maxAttempts = 60;
  let runId = "";

  for (let i = 1; i <= maxAttempts; i++) {
    const result = execSync(
      `gh run list --repo ${repo} --workflow ci3.yml --json headSha,databaseId --jq '.[] | select(.headSha == "${tagSha}") | .databaseId'`,
      { encoding: "utf-8" },
    ).trim();

    // Take the first match
    const firstLine = result.split("\n")[0]?.trim();
    if (firstLine) {
      runId = firstLine;
      console.log(`Found CI3 run: ${runId}`);
      break;
    }

    console.log(
      `Attempt ${i}/${maxAttempts}: CI3 run not found yet, waiting 10s...`,
    );
    await sleep(10_000);
  }

  if (!runId) {
    console.error(`Error: CI3 run never appeared for tag ${tag}`);
    process.exit(1);
  }

  // 3. Write output for CI
  writeGithubOutputs({ run_id: runId });

  // 4. Watch the run to completion
  console.log(`Watching CI3 run ${runId}...`);
  execSync(`gh run watch ${runId} --repo ${repo} --exit-status`, {
    stdio: "inherit",
  });
}

main();
