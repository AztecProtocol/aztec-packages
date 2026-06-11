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
 * 4. Gates the deploy on the two release jobs (`ci/x-release`, `ci/a-release`)
 *    succeeding, rather than on the overall run conclusion
 *
 * The overall CI3 nightly conclusion does NOT gate the deploy: it bundles many
 * jobs and an unrelated red job would otherwise block release. We only care
 * that the release-build jobs (`./bootstrap.sh ci-release` on amd64 + arm64,
 * reported as commit statuses on the tag's commit) succeeded.
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
  // 1. Resolve tag SHA (dereference annotated tags to the underlying commit)
  const ref = JSON.parse(
    execSync(
      `gh api repos/${repo}/git/ref/tags/${tag}`,
      { encoding: "utf-8" },
    ),
  );

  let commitSha: string = ref.object.sha;
  if (ref.object.type === "tag") {
    // Annotated tag — resolve the tag object to its commit
    const tagObj = JSON.parse(
      execSync(
        `gh api repos/${repo}/git/tags/${ref.object.sha}`,
        { encoding: "utf-8" },
      ),
    );
    commitSha = tagObj.object.sha;
  }

  console.log(`Waiting for CI3 run for tag ${tag} (commit: ${commitSha})`);

  // 2. Poll for the CI3 run (up to 10 minutes, checking every 10s)
  const maxAttempts = 60;
  let runId = "";

  for (let i = 1; i <= maxAttempts; i++) {
    // Query the workflow's runs filtered server-side by head_sha. This finds
    // the run no matter how far down the run history it has aged — unlike
    // `gh run list` (which only returns ~20 newest and would miss an older
    // nightly run that has since been pushed off the first page).
    const result = execSync(
      `gh api "repos/${repo}/actions/workflows/ci3.yml/runs?head_sha=${commitSha}" --jq '.workflow_runs[].id'`,
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

  // 4. Watch the run to completion.
  //
  // Deliberately omit `--exit-status`: we don't gate on the overall run
  // conclusion. The CI3 nightly bundles many jobs, and an unrelated red job
  // (e.g. a flaky nightly test) would otherwise fail this step and block the
  // deploy. `gh run watch` (without the flag) exits 0 once the run reaches a
  // completed status; we gate on the specific release jobs below instead.
  console.log(`Watching CI3 run ${runId}...`);
  execSync(`gh run watch ${runId} --repo ${repo}`, {
    stdio: "inherit",
  });

  // 5. Gate the deploy on the two release jobs.
  //
  // The release flow (ci.sh `release`) runs `./bootstrap.sh ci-release` on an
  // amd64 (x-release) and an arm64 (a-release) EC2 instance. Each posts a
  // GitHub commit status `ci/<job-id>` on the tag's commit (see
  // ci3/bootstrap_ec2 -> post_github_status). We require both to be `success`;
  // those are the jobs that actually build and publish the release artifacts.
  const requiredContexts = ["ci/x-release", "ci/a-release"];
  await gateOnCommitStatuses(commitSha, requiredContexts);
}

/**
 * Wait for the given commit-status contexts to reach a terminal state on the
 * commit, then fail (exit 1) unless all of them are `success`. Polls briefly
 * because the runner posts these statuses asynchronously, so they may land a
 * moment after the workflow run completes.
 */
async function gateOnCommitStatuses(
  commitSha: string,
  requiredContexts: string[],
): Promise<void> {
  const terminal = new Set(["success", "failure", "error"]);
  const maxAttempts = 30; // up to ~5 minutes at 10s intervals
  let states: Record<string, string> = {};

  for (let i = 1; i <= maxAttempts; i++) {
    // The combined endpoint returns the latest status per context.
    const statuses: Array<{ context: string; state: string }> = JSON.parse(
      execSync(
        `gh api repos/${repo}/commits/${commitSha}/status --jq '[.statuses[] | {context, state}]'`,
        { encoding: "utf-8" },
      ),
    );

    states = {};
    for (const { context, state } of statuses) {
      states[context] = state;
    }

    const allTerminal = requiredContexts.every((c) =>
      terminal.has(states[c]),
    );
    if (allTerminal) {
      break;
    }

    const missing = requiredContexts.filter((c) => !terminal.has(states[c]));
    console.log(
      `Attempt ${i}/${maxAttempts}: waiting on release statuses ${missing.join(", ")} (current: ${missing.map((c) => `${c}=${states[c] ?? "absent"}`).join(", ")})...`,
    );
    await sleep(10_000);
  }

  const failed = requiredContexts.filter((c) => states[c] !== "success");
  for (const context of requiredContexts) {
    console.log(`Release status ${context}: ${states[context] ?? "absent"}`);
  }

  if (failed.length > 0) {
    console.error(
      `Error: release job(s) did not succeed: ${failed.map((c) => `${c}=${states[c] ?? "absent"}`).join(", ")}`,
    );
    process.exit(1);
  }

  console.log("All release jobs succeeded.");
}

main();
