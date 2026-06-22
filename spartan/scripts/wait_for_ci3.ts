#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Wait for the `ci` job of the CI3 workflow run triggered by a tag, and gate
 * the deploy on that single job succeeding.
 *
 * Usage:
 *   wait_for_ci3.ts <tag> [repo]
 *
 * Arguments:
 *   tag  - The git tag to wait for (e.g., v4.0.0-devnet.1-patch.0)
 *   repo - Optional GitHub repo (default: GITHUB_REPOSITORY or 'AztecProtocol/aztec-packages')
 *
 * The script resolves the tag's commit, finds the ci3.yml run for it, then
 * polls that run's `ci` job and exits 0 as soon as it completes successfully.
 * The `ci` job runs the whole release flow (`ci.sh release`, which builds and
 * publishes on amd64 + arm64 via `parallel --halt now,fail=1`), so its success
 * already implies the release jobs succeeded. We gate on it alone rather than
 * the overall run, which also bundles network benches and other jobs that
 * should not block the deploy.
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

const gh = (args: string): string =>
  execSync(`gh ${args}`, { encoding: "utf-8" }).trim();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  // Resolve the tag's commit (dereference annotated tags to the underlying commit).
  const ref = JSON.parse(gh(`api repos/${repo}/git/ref/tags/${tag}`));
  let commitSha: string = ref.object.sha;
  if (ref.object.type === "tag") {
    commitSha = JSON.parse(
      gh(`api repos/${repo}/git/tags/${ref.object.sha}`),
    ).object.sha;
  }

  console.log(`Waiting for CI3 run for tag ${tag} (commit: ${commitSha})`);

  // Find the CI3 run for that commit (poll up to 10 minutes). Query filtered
  // server-side by head_sha so we find the run no matter how far down the
  // history it has aged.
  let runId = "";
  for (let i = 1; i <= 60; i++) {
    runId = gh(
      `api "repos/${repo}/actions/workflows/ci3.yml/runs?head_sha=${commitSha}" --jq '.workflow_runs[0].id // empty'`,
    );
    if (runId) {
      console.log(`Found CI3 run: ${runId}`);
      break;
    }
    console.log(`Attempt ${i}/60: CI3 run not found yet, waiting 10s...`);
    await sleep(10_000);
  }

  if (!runId) {
    console.error(`Error: CI3 run never appeared for tag ${tag}`);
    process.exit(1);
  }

  writeGithubOutputs({ run_id: runId });

  // Poll the run's `ci` job until it completes, then gate on its conclusion.
  console.log(`Waiting for the ci job of run ${runId}...`);
  while (true) {
    const job = JSON.parse(
      gh(
        `api repos/${repo}/actions/runs/${runId}/jobs --paginate --jq '[.jobs[] | select(.name == "ci")][0] // empty'`,
      ) || "null",
    );

    if (job?.status === "completed") {
      console.log(`ci job ${job.id} completed: ${job.conclusion} (${job.html_url})`);
      if (job.conclusion !== "success") {
        console.error(`Error: ci job did not succeed (${job.conclusion}).`);
        process.exit(1);
      }
      console.log("ci job succeeded.");
      return;
    }

    console.log(
      `ci job ${job ? `${job.id} is ${job.status}` : "not found yet"}, waiting 10s...`,
    );
    await sleep(10_000);
  }
}

main();
