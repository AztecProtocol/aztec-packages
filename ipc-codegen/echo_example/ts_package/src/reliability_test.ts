/**
 * Startup/teardown reliability tests for the generated spawn/connect path,
 * driven through the generated package with real and fake server binaries:
 *
 *   1. Server is slow to create its socket — spawn must wait, not fail.
 *   2. Server dies before listening — spawn must fail promptly with the exit
 *      code (retry=true), not burn the whole connect backstop.
 *   3. Server is alive but never listens — spawn must fail once the backstop
 *      expires AND must kill the wedged process rather than orphan it.
 *   4. A missing binary fails with retry=false (configuration, not weather).
 *   5. Without respawn, a killed server fails later calls with retry=true.
 *   6. With respawn, the next call after a kill gets a fresh process.
 *
 * Usage: node dest/reliability_test.js
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EchoService } from "./index.js";
import { findEchoBinary } from "./platform.js";

const scratch = mkdtempSync(join(tmpdir(), "echo-reliability-"));
const cleanups: Array<() => void> = [
  () => rmSync(scratch, { recursive: true, force: true }),
];

function fakeBinary(name: string, script: string): string {
  const path = join(scratch, name);
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}

function assert(cond: boolean, label: string): void {
  if (!cond) {
    throw new Error(`assertion failed: ${label}`);
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForDeath(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !processAlive(pid);
}

// 1. Slow startup: the server takes several seconds to create its socket
// (simulating a loaded machine or a server doing init before listen). The
// connect loop must keep waiting rather than give up early.
async function testSlowStartup(): Promise<void> {
  const realBinary = findEchoBinary();
  assert(realBinary !== null, "echo_server binary present");
  const slow = fakeBinary(
    "slow_echo_server",
    `#!/bin/sh\nsleep 2\nexec "${realBinary}" "$@"\n`,
  );
  const service = await EchoService.spawn({
    binaryPath: slow,
    transport: "uds",
  });
  try {
    const data = Uint8Array.from([1, 2, 3]);
    const resp = await service.bytes({ data });
    assert(resp.data.length === 3, "slow startup echo roundtrip");
  } finally {
    await service.destroy();
  }
  console.error("reliability: slow startup OK");
}

// 2. Death before listen: spawn must reject with the real exit code, well
// before the connect backstop, and must not leave the socket path behind.
async function testDiesBeforeListen(): Promise<void> {
  const dying = fakeBinary("dying_echo_server", "#!/bin/sh\nexit 7\n");
  const started = Date.now();
  let failure: Error | undefined;
  try {
    await EchoService.spawn({ binaryPath: dying, transport: "uds" });
  } catch (err) {
    failure = err as Error;
  }
  const elapsed = Date.now() - started;
  assert(failure !== undefined, "spawn rejected for dying server");
  assert(
    failure!.message.includes("code=7"),
    `error carries exit code (got: ${failure!.message})`,
  );
  assert(
    elapsed < 5_000,
    `failed promptly, not after the backstop (took ${elapsed}ms)`,
  );
  console.error("reliability: death before listen OK");
}

// 3. Wedged server: alive but never listens. With a short backstop, spawn
// must reject AND the child must be dead afterwards — a failed spawn that
// orphans the process leaks sockets, memory, and (for wsdb) LMDB locks.
async function testWedgedServerIsKilled(): Promise<void> {
  const pidFile = join(scratch, "wedged.pid");
  const wedged = fakeBinary(
    "wedged_echo_server",
    `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 600\n`,
  );
  let failure: Error | undefined;
  try {
    await EchoService.spawn({
      binaryPath: wedged,
      transport: "uds",
      connectTimeoutMs: 1_000,
    });
  } catch (err) {
    failure = err as Error;
  }
  assert(failure !== undefined, "spawn rejected for wedged server");
  const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
  assert(Number.isInteger(pid) && pid > 0, "wedged server wrote its pid");
  const died = await waitForDeath(pid, 5_000);
  if (!died) {
    // Don't leave the orphan behind even when the assertion fails.
    cleanups.push(() => spawnSync("kill", ["-9", String(pid)]));
  }
  assert(died, "wedged server was killed after connect backstop expired");
  console.error("reliability: wedged server killed OK");
}

// 4. Missing binary: a configuration error, flagged non-retryable.
async function testMissingBinaryNotRetryable(): Promise<void> {
  let failure: (Error & { retry?: boolean }) | undefined;
  try {
    await EchoService.spawn({
      binaryPath: join(scratch, "no_such_binary"),
      transport: "uds",
    });
  } catch (err) {
    failure = err as Error;
  }
  assert(failure !== undefined, "spawn rejected for missing binary");
  assert(
    failure!.retry === false,
    `missing binary carries retry=false (got: ${failure!.retry})`,
  );
  console.error("reliability: missing binary not retryable OK");
}

// 5. Death without respawn: later calls fail with a retryable error — the
// process is gone, but a caller holding no server-side state may retry
// against a fresh service.
async function testDeathWithoutRespawnIsRetryable(): Promise<void> {
  const realBinary = findEchoBinary()!;
  const service = await EchoService.spawn({
    binaryPath: realBinary,
    transport: "uds",
  });
  try {
    await service.bytes({ data: Uint8Array.from([1]) });
    service.sendProcessSignal("SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 300));

    let failure: (Error & { retry?: boolean }) | undefined;
    try {
      await service.bytes({ data: Uint8Array.from([2]) });
    } catch (err) {
      failure = err as Error;
    }
    assert(failure !== undefined, "call rejected after server death");
    assert(
      failure!.retry === true,
      `death carries retry=true (got: ${failure!.retry})`,
    );
  } finally {
    await service.destroy();
  }
  console.error("reliability: death without respawn retryable OK");
}

// 6. Respawn: the backend transparently recreates the process; the call
// surface never sees process lifecycle.
async function testRespawnRecreatesProcess(): Promise<void> {
  const realBinary = findEchoBinary()!;
  const service = await EchoService.spawn({
    binaryPath: realBinary,
    transport: "uds",
    respawn: true,
  });
  try {
    const data = Uint8Array.from([1, 2, 3]);
    const before = await service.bytes({ data });
    assert(before.data.length === 3, "roundtrip before kill");

    service.sendProcessSignal("SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The first call after the death may race exit attribution and fail
    // retryably; the retry must land on a fresh process.
    let after;
    try {
      after = await service.bytes({ data });
    } catch (err) {
      assert(
        (err as { retry?: boolean }).retry === true,
        "raced failure is retryable",
      );
      after = await service.bytes({ data });
    }
    assert(after.data.length === 3, "roundtrip after respawn");
  } finally {
    await service.destroy();
  }
  console.error("reliability: respawn recreates process OK");
}

try {
  await testSlowStartup();
  await testDiesBeforeListen();
  await testWedgedServerIsKilled();
  await testMissingBinaryNotRetryable();
  await testDeathWithoutRespawnIsRetryable();
  await testRespawnRecreatesProcess();
  console.error("echo ts package: reliability OK");
} finally {
  for (const cleanup of cleanups.reverse()) {
    cleanup();
  }
}
