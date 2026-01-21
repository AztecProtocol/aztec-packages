#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Network Bisect Script
 *
 * Finds the commit that broke network tests using binary search.
 * Builds and tests each candidate commit until the culprit is found.
 *
 * Usage:
 *   ./network_bisect.ts <good_commit> <bad_commit> [--env-file=next-scenario] [--dry-run]
 *   ./network_bisect.ts test  # Run unit tests
 */

import { execSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const MAX_STEPS = 5;

// ============================================================================
// Core bisect logic
// ============================================================================

function getCommitsBetween(good: string, bad: string): string[] {
  try {
    const output = execSync(`git rev-list --ancestry-path "${good}".."${bad}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().split("\n").filter(Boolean).reverse();
  } catch {
    return [];
  }
}

function getCommitInfo(sha: string): { short: string; subject: string; author: string } {
  try {
    const subject = execSync(`git log -1 --format="%s" "${sha}"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const author = execSync(`git log -1 --format="%an" "${sha}"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    return { short: sha.substring(0, 7), subject, author };
  } catch {
    return { short: sha.substring(0, 7), subject: "(unknown)", author: "(unknown)" };
  }
}

interface BisectResult {
  culprit: string | null;
  steps: number;
  log: Array<{ commit: string; result: "pass" | "fail" }>;
  error?: string;
}

function bisect(
  good: string,
  bad: string,
  test: (commit: string) => boolean
): BisectResult {
  const log: BisectResult["log"] = [];
  let step = 0;

  while (step < MAX_STEPS) {
    const commits = getCommitsBetween(good, bad);

    if (commits.length === 0) {
      return { culprit: null, steps: step, log, error: "No commits between good and bad" };
    }

    if (commits.length === 1) {
      return { culprit: commits[0], steps: step, log };
    }

    // Test midpoint
    const mid = Math.floor((commits.length - 1) / 2);
    const testCommit = commits[mid];
    const info = getCommitInfo(testCommit);

    console.log(`\n[Step ${step + 1}] Testing ${info.short}: ${info.subject}`);
    console.log(`  ${commits.length} commits remaining`);

    const passed = test(testCommit);
    log.push({ commit: testCommit, result: passed ? "pass" : "fail" });

    console.log(`  Result: ${passed ? "PASS" : "FAIL"}`);

    if (passed) {
      good = testCommit;
    } else {
      bad = testCommit;
    }
    step++;
  }

  return { culprit: null, steps: step, log, error: "Max steps exceeded" };
}

// ============================================================================
// Network test runner
// ============================================================================

function runNetworkTest(commit: string, envFile: string, dryRun: boolean): boolean {
  const short = commit.substring(0, 7);
  const namespace = `bisect-${short}`;

  console.log(`  Checking out ${short}...`);
  if (!dryRun) {
    execSync(`git checkout ${commit}`, { stdio: "inherit" });
  }

  console.log(`  Building and deploying...`);
  if (!dryRun) {
    // Build and push image, then deploy
    const deployResult = spawnSync("./.github/ci3.sh", ["network-deploy", envFile, namespace], {
      stdio: "inherit",
      env: { ...process.env, NAMESPACE: namespace },
    });

    // Always teardown
    console.log(`  Tearing down...`);
    spawnSync("./.github/ci3.sh", ["network-teardown", envFile, namespace], { stdio: "inherit" });

    return deployResult.status === 0;
  }

  // Dry run - simulate random result
  return Math.random() > 0.5;
}

// ============================================================================
// Test suite
// ============================================================================

function createTestRepo(numCommits: number): { path: string; commits: string[]; cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), "bisect-test-"));
  execSync("git init && git config user.email test@test.com && git config user.name Test", { cwd: path, stdio: "pipe" });

  const commits: string[] = [];
  for (let i = 0; i < numCommits; i++) {
    writeFileSync(join(path, "f.txt"), `${i}`);
    execSync(`git add . && git commit -m "Commit ${i}"`, { cwd: path, stdio: "pipe" });
    commits.push(execSync("git rev-parse HEAD", { cwd: path, encoding: "utf-8" }).trim());
  }

  return { path, commits, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

function runTests(): boolean {
  console.log("Running tests...\n");
  let passed = 0, failed = 0;

  const testCases = [
    { commits: 3, badIdx: 1 },
    { commits: 3, badIdx: 2 },
    { commits: 5, badIdx: 1 },
    { commits: 5, badIdx: 3 },
    { commits: 10, badIdx: 5 },
    { commits: 17, badIdx: 8 },
  ];

  for (const tc of testCases) {
    const { path, commits, cleanup } = createTestRepo(tc.commits);
    const origDir = process.cwd();
    process.chdir(path);

    try {
      const oracle = (c: string) => commits.indexOf(c) < tc.badIdx;
      const result = bisect(commits[0], commits[commits.length - 1], oracle);
      const expected = commits[tc.badIdx];

      if (result.culprit === expected) {
        console.log(`PASS: ${tc.commits} commits, bad@${tc.badIdx} -> found in ${result.steps} steps`);
        passed++;
      } else {
        console.log(`FAIL: ${tc.commits} commits, bad@${tc.badIdx} -> expected ${expected?.substring(0,7)}, got ${result.culprit?.substring(0,7)}`);
        failed++;
      }
    } finally {
      process.chdir(origDir);
      cleanup();
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ============================================================================
// CLI
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  if (args[0] === "test") {
    process.exit(runTests() ? 0 : 1);
  }

  if (args.length < 2) {
    console.log(`Usage: network_bisect.ts <good_commit> <bad_commit> [--env-file=next-scenario] [--dry-run]
       network_bisect.ts test`);
    process.exit(1);
  }

  const good = args[0];
  const bad = args[1];
  const envFile = args.find(a => a.startsWith("--env-file="))?.split("=")[1] ?? "next-scenario";
  const dryRun = args.includes("--dry-run");

  console.log(`Network Bisect: ${good.substring(0, 7)}..${bad.substring(0, 7)}`);
  console.log(`Environment: ${envFile}${dryRun ? " (dry-run)" : ""}`);

  const result = bisect(good, bad, (commit) => runNetworkTest(commit, envFile, dryRun));

  console.log("\n" + "=".repeat(50));
  if (result.culprit) {
    const info = getCommitInfo(result.culprit);
    console.log(`CULPRIT FOUND: ${info.short}`);
    console.log(`  Subject: ${info.subject}`);
    console.log(`  Author: ${info.author}`);
    console.log(`  Steps: ${result.steps}`);
  } else {
    console.log(`BISECT FAILED: ${result.error}`);
  }

  // Output for CI to parse
  if (result.culprit) {
    console.log(`\n::set-output name=culprit::${result.culprit}`);
  }

  process.exit(result.culprit ? 0 : 1);
}

main();
