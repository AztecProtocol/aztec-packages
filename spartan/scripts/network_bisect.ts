#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Network Bisect: finds the commit that broke network tests via binary search.
 *
 * Usage:
 *   network_bisect.ts step <good> <bad> <namespace> [--state=file]  # One iteration
 *   network_bisect.ts test                                          # Run tests
 */
import { execSync, spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

interface State { good: string; bad: string; step: number; }

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const commits = (good: string, bad: string) => git(`rev-list --ancestry-path "${good}".."${bad}"`).split("\n").filter(Boolean).reverse();

function bisectStep(state: State, namespace: string, test: (ns: string) => boolean): { state: State; culprit?: string } {
  const list = commits(state.good, state.bad);
  if (list.length === 0) throw new Error("No commits between good and bad");
  if (list.length === 1) return { state, culprit: list[0] };

  const mid = list[Math.floor((list.length - 1) / 2)];
  console.log(`[${state.step}/5] Testing ${mid.slice(0, 7)} (${list.length} commits)`);

  git(`checkout -q ${mid}`);
  const passed = test(namespace);
  console.log(passed ? "PASS" : "FAIL");

  return {
    state: { good: passed ? mid : state.good, bad: passed ? state.bad : mid, step: state.step + 1 },
    culprit: undefined,
  };
}

function networkTest(namespace: string): boolean {
  const deploy = spawnSync("./.github/ci3.sh", ["network-deploy", "next-scenario", namespace], { stdio: "inherit" });
  spawnSync("./.github/ci3.sh", ["network-teardown", "next-scenario", namespace], { stdio: "inherit" });
  return deploy.status === 0;
}

function runTests(): boolean {
  const cases = [[5, 2], [10, 5], [17, 8]] as const;
  let passed = 0;

  for (const [n, badIdx] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "bisect-"));
    execSync(`git init && git config user.email t@t && git config user.name T`, { cwd: dir, stdio: "pipe" });

    const shas: string[] = [];
    for (let i = 0; i < n; i++) {
      writeFileSync(join(dir, "f"), String(i));
      execSync(`git add -A && git commit -m "C${i}"`, { cwd: dir, stdio: "pipe" });
      shas.push(execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf-8" }).trim());
    }

    const oracle = () => Number(git("log -1 --format=%s").slice(1)) < badIdx;
    let state: State = { good: shas[0], bad: shas[n - 1], step: 1 };
    let culprit: string | undefined;

    process.chdir(dir);
    while (state.step <= 5 && !culprit) {
      ({ state, culprit } = bisectStep(state, "test", oracle));
    }
    process.chdir("/");
    rmSync(dir, { recursive: true, force: true });

    if (culprit === shas[badIdx]) { console.log(`PASS: ${n} commits, bad@${badIdx}`); passed++; }
    else { console.log(`FAIL: ${n} commits, bad@${badIdx}`); }
  }

  console.log(`\n${passed}/${cases.length} passed`);
  return passed === cases.length;
}

// CLI
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "test") process.exit(runTests() ? 0 : 1);

if (cmd === "step") {
  const [good, bad, namespace] = args;
  const stateFile = args.find(a => a.startsWith("--state="))?.slice(8);

  if (!good || !bad || !namespace) {
    console.error("Usage: network_bisect.ts step <good> <bad> <namespace> [--state=file]");
    process.exit(1);
  }

  let state: State = existsSync(stateFile ?? "")
    ? JSON.parse(readFileSync(stateFile!, "utf-8"))
    : { good, bad, step: 1 };

  if (state.step > 5) { console.log("done=true"); process.exit(0); }

  const { state: newState, culprit } = bisectStep(state, namespace, networkTest);

  if (culprit) {
    console.log(`\nCULPRIT: ${culprit}`);
    console.log(git(`log -1 --oneline ${culprit}`));
    console.log(`culprit=${culprit}`);
    console.log("done=true");
  } else {
    if (stateFile) writeFileSync(stateFile, JSON.stringify(newState));
    console.log("done=false");
  }
} else {
  console.log("Usage: network_bisect.ts step <good> <bad> <namespace> [--state=file]");
  console.log("       network_bisect.ts test");
  process.exit(1);
}
