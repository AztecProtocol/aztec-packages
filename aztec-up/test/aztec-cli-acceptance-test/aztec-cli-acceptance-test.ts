// Test for the installed Aztec toolchain. Exercises the full developer onboarding path end-to-end:
//   1. aztec init           - scaffold a workspace with a Counter contract and test crate
//   2. aztec compile        - compile the scaffolded contract
//   3. aztec test           - run the TXE tests from the scaffold's test crate
//   4. aztec start          - start a local sandbox (anvil + aztec node)
//   5. aztec codegen        - generate TypeScript bindings from the compiled artifact
//   6. TS end-to-end test   - run a node:test suite (counter.test.ts) inside the scaffolded
//                             workspace that deploys Counter via codegen'd bindings, increments
//                             it, and reads the value back through the `get_counter` utility
//
// Invoked by run-test.sh, which handles installation and PATH setup before executing this file.
//
// Every phase is wrapped in step(name, ...). The script always emits a `TEST_RESULT=pass|fail ...` line for CI
// parsing; on failure it also prints a banner identifying the step that failed.

import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const NODE_PORT = 8080;
const LOCAL_NETWORK_READY_TIMEOUT_MS = 600_000; // 10 minutes
const POLL_INTERVAL_MS = 2000; // 2 seconds

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const COUNTER_TEST_TEMPLATE = join(SCRIPT_DIR, "counter.test.ts");

// Defaults to ~/.aztec/current (the symlink aztec-up maintains); fails if no package.json is found there.
const AZTEC_INSTALL_DIR =
  process.env.AZTEC_INSTALL_DIR ??
  join(process.env.HOME ?? "", ".aztec/current");
if (!existsSync(join(AZTEC_INSTALL_DIR, "package.json"))) {
  console.error(
    `FATAL: AZTEC_INSTALL_DIR does not point at an installed aztec: ${AZTEC_INSTALL_DIR}`,
  );
  process.exit(2);
}

// Prefer RUNNER_TEMP so the GitHub Actions upload-artifact step can find the diagnostic
// tree on failure under a predictable parent path. Falls back to the system tmpdir locally.
const TMP_DIR_PARENT = process.env.RUNNER_TEMP ?? tmpdir();
const TMP_DIR = mkdtempSync(join(TMP_DIR_PARENT, "aztec-cli-acceptance-test-"));
const WORKSPACE_DIR = join(TMP_DIR, "my_workspace");

// Exit codes follow the Unix 128+signal convention for signal terminations.
process.on("SIGINT", () => {
  leaveTmpDirForInspection();
  process.exit(130);
});
process.on("SIGTERM", () => {
  leaveTmpDirForInspection();
  process.exit(143);
});

type RunResult =
  | { ok: true; aztecVersion: string }
  | { ok: false; stepName: string; aztecVersion: string; error: unknown };

const totalStart = Date.now();
const result = await main();
if (result.ok) {
  log(`All steps PASSED (${msToSecs(Date.now() - totalStart)}s total)`);
  console.log(`TEST_RESULT=pass version=${result.aztecVersion}`);
  rmSync(TMP_DIR, { recursive: true, force: true });
  // Explicit exit fires the 'exit' handler registered in startLocalNetwork(), which SIGTERMs the
  // long-running `aztec start --local-network` child. Without this, the child keeps Node's event
  // loop alive — the handler never fires and the process hangs until the CI timeout cancels it.
  process.exit(0);
} else {
  reportFailure(result.stepName, result.aztecVersion, result.error);
  leaveTmpDirForInspection();
  process.exit(1);
}

async function main(): Promise<RunResult> {
  log(`Working in ${TMP_DIR}`);
  let stepName = "<startup>";
  let aztecVersion = "unknown";

  async function step<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    stepName = name;
    const start = Date.now();
    log(`[step] ${name}`);
    const out = await fn();
    log(`    done (${msToSecs(Date.now() - start)}s)`);
    return out;
  }

  try {
    aztecVersion = await step("Checking installed tool versions", logVersions);
    await step("Scaffolding new workspace (aztec init)", scaffoldWorkspace);
    await step("Verifying scaffold structure", assertScaffold);
    await step("Compiling contract (aztec compile)", () =>
      run("aztec", ["compile"], WORKSPACE_DIR),
    );

    const artifactPath = await step(
      "Locating compiled artifact",
      locateArtifact,
    );
    log(`    artifact at ${artifactPath}`);

    await step("Running TXE tests (aztec test)", () =>
      run("aztec", ["test"], WORKSPACE_DIR),
    );

    await step(
      "Starting local sandbox (aztec start --local-network)",
      startLocalNetwork,
    );

    await step("Generating TypeScript bindings (aztec codegen)", () =>
      codegen(artifactPath),
    );

    await step(
      "Running TypeScript end-to-end test (node --test)",
      runTsEndToEndTest,
    );
    return { ok: true, aztecVersion };
  } catch (error) {
    return { ok: false, stepName, aztecVersion, error };
  }
}

function scaffoldWorkspace() {
  // aztec init scaffolds in pwd and uses the directory name as the package name; create the dir first.
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  run("aztec", ["init"], WORKSPACE_DIR);
}

function logVersions(): string {
  log("Tool versions:");
  let aztecVersion = "unknown";
  for (const cmd of ["aztec", "aztec-nargo", "aztec-bb", "aztec-wallet"]) {
    const version = execFileSync(cmd, ["--version"], { encoding: "utf8" })
      .trim()
      .split("\n")[0];
    console.log(`  ${cmd}: ${version}`);
    if (cmd === "aztec") {
      aztecVersion = version;
    }
  }
  return aztecVersion;
}

function assertScaffold() {
  // aztec init scaffolds a workspace with `<name>_contract/` (Counter) and `<name>_test/` crates.
  const packageName = "my_workspace";
  const required = [
    "Nargo.toml",
    `${packageName}_contract/Nargo.toml`,
    `${packageName}_contract/src/main.nr`,
    `${packageName}_test/Nargo.toml`,
    `${packageName}_test/src/lib.nr`,
  ];
  for (const rel of required) {
    const abs = join(WORKSPACE_DIR, rel);
    if (!existsSync(abs)) {
      fail(`expected scaffold file missing: ${rel}`);
    }
  }
}

function locateArtifact(): string {
  const matches = globSync("**/target/*-Counter.json", { cwd: WORKSPACE_DIR });
  if (matches.length === 0) {
    fail("compiled Counter artifact not found under target/");
  }
  if (matches.length > 1) {
    fail(
      `expected one Counter artifact, found ${matches.length}: ${matches.join(", ")}`,
    );
  }
  return resolve(WORKSPACE_DIR, matches[0]);
}

async function startLocalNetwork(): Promise<void> {
  const logPath = join(TMP_DIR, "local_network.log");
  const logFd = openSync(logPath, "a");
  // LOG_LEVEL defaults to "debug" so failed CI runs leave useful traces in local_network.log;
  // override with LOCAL_NETWORK_LOG_LEVEL=silent when running locally and the volume is noisy.
  const logLevel = process.env.LOCAL_NETWORK_LOG_LEVEL ?? "debug";
  const reportDir = join(TMP_DIR, "node-reports");
  mkdirSync(reportDir, { recursive: true });
  const nodeOptions = [
    process.env.NODE_OPTIONS,
    `--report-on-signal`,
    `--report-directory=${reportDir}`,
  ]
    .filter(Boolean)
    .join(" ");
  const proc = spawn("aztec", ["start", "--local-network"], {
    cwd: TMP_DIR,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      LOG_LEVEL: logLevel,
      PXE_PROVER: "none",
      NODE_OPTIONS: nodeOptions,
    },
  });
  closeSync(logFd);
  log(
    `    local-network pid=${proc.pid}, log=${logPath}, LOG_LEVEL=${logLevel}`,
  );

  // Kill the network on process exit (including SIGINT/SIGTERM via the signal handlers).
  process.on("exit", () => {
    if (proc.exitCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  });

  const deadline = Date.now() + LOCAL_NETWORK_READY_TIMEOUT_MS;
  while (true) {
    if (proc.exitCode !== null) {
      dumpTail(logPath);
      fail(
        `local-network exited early with code ${proc.exitCode} (see ${logPath})`,
      );
    }
    if (Date.now() > deadline) {
      try {
        process.kill(proc.pid!, "SIGUSR2");
        await delay(2000);
      } catch {}
      dumpTail(logPath);
      fail(
        `timed out after ${msToSecs(LOCAL_NETWORK_READY_TIMEOUT_MS)}s waiting for local-network /status (see ${logPath})`,
      );
    }
    try {
      const res = await fetch(`http://localhost:${NODE_PORT}/status`);
      if (res.ok) {
        log("    local-network ready");
        return;
      }
    } catch {
      // not ready yet
    }
    await delay(POLL_INTERVAL_MS);
  }
}

function codegen(artifactPath: string) {
  const artifactsOutDir = join(WORKSPACE_DIR, "artifacts");
  mkdirSync(artifactsOutDir, { recursive: true });
  const targetDir = resolve(artifactPath, "..");
  run("aztec", ["codegen", targetDir, "-o", artifactsOutDir], WORKSPACE_DIR);
  const codegenTs = join(artifactsOutDir, "Counter.ts");
  if (!existsSync(codegenTs)) {
    fail(`codegen did not emit Counter.ts (wrote to ${artifactsOutDir})`);
  }
}

function runTsEndToEndTest() {
  // Point the workspace at the installed node_modules so @aztec/* imports (and transitive deps
  // of the codegen'd Counter.ts) resolve to the same bundle a real user would have.
  const modulesLink = join(WORKSPACE_DIR, "node_modules");
  if (!existsSync(modulesLink)) {
    symlinkSync(join(AZTEC_INSTALL_DIR, "node_modules"), modulesLink, "dir");
  }
  const testDest = join(WORKSPACE_DIR, "counter.test.ts");
  copyFileSync(COUNTER_TEST_TEMPLATE, testDest);

  run("node", ["--no-warnings", "--test", testDest], WORKSPACE_DIR);
}

function reportFailure(stepName: string, aztecVersion: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const childExit =
    typeof (err as { status?: unknown })?.status === "number"
      ? (err as { status: number }).status
      : undefined;
  const banner = "=".repeat(72);

  console.error(`\n${banner}`);
  console.error("AZTEC CLI ACCEPTANCE TEST FAILED");
  console.error(banner);
  console.error(`Step:        ${stepName}`);
  console.error(`Version:     ${aztecVersion}`);
  if (childExit !== undefined) {
    console.error(`Child exit:  ${childExit}`);
  }
  console.error(`Tmp dir:     ${TMP_DIR}`);
  console.error(`Error:       ${message}`);
  if (err instanceof Error && err.stack) {
    console.error("");
    console.error(err.stack);
  }
  console.error(banner);
  const safeStep = stepName.replace(/\s+/g, "_");
  const safeError = message.replace(/[\r\n]+/g, " ").slice(0, 240);
  console.log(
    `TEST_RESULT=fail step=${safeStep} version=${aztecVersion} error="${safeError}"`,
  );
}

function msToSecs(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function run(cmd: string, args: string[], cwd: string) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

function log(msg: string) {
  console.log(`>>> ${msg}`);
}

function fail(msg: string): never {
  throw new Error(msg);
}

function leaveTmpDirForInspection() {
  console.error(`>>> Left tmp dir at ${TMP_DIR} for inspection`);
}

function dumpTail(path: string, lines = 400) {
  if (!existsSync(path)) {
    return;
  }
  console.error(`--- last ${lines} lines of ${path} ---`);
  try {
    console.error(
      readFileSync(path, "utf8").split("\n").slice(-lines).join("\n"),
    );
  } catch {
    console.error(`(failed to read ${path})`);
  }
  console.error(`--- end of ${path} ---`);
}
