import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { IpcProcessExitedError, IpcSpawnError } from "./errors.js";
import { SpawnedProcessBackend } from "./spawned_backend.js";

const scratch = mkdtempSync(join(tmpdir(), "spawned-backend-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// A minimal length-prefixed echo server speaking the UdsIpcClient wire format.
// Replies to each request with its own pid as a decimal string, so tests can
// tell process incarnations apart.
const PID_ECHO_SERVER = join(scratch, "pid_echo_server.cjs");
writeFileSync(
  PID_ECHO_SERVER,
  `
const net = require('node:net');
const server = net.createServer(conn => {
  let buf = Buffer.alloc(0);
  conn.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) return;
      const requestId = buf.readBigUInt64LE(4); // frame = [len][8B id][payload]
      buf = buf.subarray(4 + len);
      const payload = Buffer.from(String(process.pid));
      const out = Buffer.alloc(12 + payload.length);
      out.writeUInt32LE(payload.length + 8, 0);
      out.writeBigUInt64LE(requestId, 4);
      payload.copy(out, 12);
      conn.write(out);
    }
  });
});
server.listen(process.argv[2]);
`,
);

function shellScript(name: string, body: string): string {
  const path = join(scratch, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function spawnPidEcho(
  opts: { respawn?: boolean; connectTimeoutMs?: number } = {},
) {
  return SpawnedProcessBackend.spawn({
    binaryPath: process.execPath,
    binaryName: "pid_echo_server",
    instancePrefix: "pid-echo-test",
    ipcPathArgs: [PID_ECHO_SERVER, "{path}"],
    transport: "uds",
    ...opts,
  });
}

async function callPid(backend: SpawnedProcessBackend): Promise<string> {
  return Buffer.from(await backend.call(Uint8Array.from([1]))).toString();
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return cond();
}

test("spawns, round-trips calls, and destroys cleanly", async () => {
  const backend = await spawnPidEcho();
  const pid = await callPid(backend);
  assert.match(pid, /^\d+$/);
  await backend.destroy();
  assert.equal(processAlive(parseInt(pid, 10)), false);
});

test("without respawn, death rejects in-flight and later calls with a retryable exit error", async () => {
  const backend = await spawnPidEcho();
  const pid = parseInt(await callPid(backend), 10);

  process.kill(pid, "SIGKILL");
  await waitFor(() => !processAlive(pid), 2_000);

  const err = await callPid(backend).then(
    () => undefined,
    (e: Error) => e,
  );
  assert.ok(
    err instanceof IpcProcessExitedError,
    `expected IpcProcessExitedError, got ${err}`,
  );
  assert.equal((err as IpcProcessExitedError).retry, true);
  assert.equal((err as IpcProcessExitedError).signal, "SIGKILL");

  // Still down: same classified error, no zombie respawn.
  await assert.rejects(callPid(backend), IpcProcessExitedError);
  await backend.destroy();
});

test("with respawn, the next call after a death transparently gets a fresh process", async () => {
  const backend = await spawnPidEcho({ respawn: true });
  const firstPid = parseInt(await callPid(backend), 10);

  process.kill(firstPid, "SIGKILL");
  await waitFor(() => !processAlive(firstPid), 2_000);

  // The first call after the death may race the exit event; it is allowed to
  // fail (with a retryable error) or succeed against the respawned process.
  let secondPid: number | undefined;
  try {
    secondPid = parseInt(await callPid(backend), 10);
  } catch (err) {
    assert.equal((err as { retry?: boolean }).retry, true);
    secondPid = parseInt(await callPid(backend), 10);
  }
  assert.notEqual(secondPid, firstPid);
  assert.equal(processAlive(secondPid!), true);

  // getIpcPath is stable across incarnations.
  const path = backend.getIpcPath();
  await backend.destroy();
  assert.equal(processAlive(secondPid!), false);
  assert.equal(backend.getIpcPath(), path);
});

test("a missing binary fails with retry=false", async () => {
  const err = await SpawnedProcessBackend.spawn({
    binaryPath: join(scratch, "does_not_exist"),
    binaryName: "ghost",
    instancePrefix: "ghost-test",
    ipcPathArgs: ["{path}"],
    transport: "uds",
  }).then(
    () => undefined,
    (e: Error) => e,
  );
  assert.ok(err instanceof IpcSpawnError, `expected IpcSpawnError, got ${err}`);
  assert.equal((err as IpcSpawnError).retry, false);
});

test("a server dying before listen fails promptly with retry=true and the exit code", async () => {
  const dying = shellScript("dying_server.sh", "exit 7");
  const started = Date.now();
  const err = await SpawnedProcessBackend.spawn({
    binaryPath: dying,
    binaryName: "dying_server",
    instancePrefix: "dying-test",
    ipcPathArgs: ["{path}"],
    transport: "uds",
  }).then(
    () => undefined,
    (e: Error) => e,
  );
  assert.ok(err instanceof IpcSpawnError, `expected IpcSpawnError, got ${err}`);
  assert.equal((err as IpcSpawnError).retry, true);
  assert.match((err as IpcSpawnError).message, /code=7/);
  assert.ok(Date.now() - started < 5_000, "failed before the connect backstop");
});

test("a wedged server is killed when the connect backstop fires", async () => {
  const pidFile = join(scratch, "wedged.pid");
  const wedged = shellScript(
    "wedged_server.sh",
    `echo $$ > "${pidFile}"\nexec sleep 600`,
  );
  const err = await SpawnedProcessBackend.spawn({
    binaryPath: wedged,
    binaryName: "wedged_server",
    instancePrefix: "wedged-test",
    ipcPathArgs: ["{path}"],
    transport: "uds",
    connectTimeoutMs: 1_000,
  }).then(
    () => undefined,
    (e: Error) => e,
  );
  assert.ok(err instanceof IpcSpawnError, `expected IpcSpawnError, got ${err}`);
  assert.equal((err as IpcSpawnError).retry, true);
  const { readFileSync } = await import("node:fs");
  const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
  assert.equal(
    await waitFor(() => !processAlive(pid), 5_000),
    true,
    "wedged process was reaped",
  );
});

test("destroy during a pending respawn does not leak the fresh process", async () => {
  const backend = await spawnPidEcho({ respawn: true });
  const firstPid = parseInt(await callPid(backend), 10);
  process.kill(firstPid, "SIGKILL");
  await waitFor(() => !processAlive(firstPid), 2_000);

  // Trigger the lazy respawn, then destroy while it may still be in flight.
  const pending = callPid(backend).catch(() => undefined);
  await backend.destroy();
  const result = await pending;

  if (result !== undefined) {
    // The respawn won the race and served the call; destroy() must still have
    // reaped the fresh process afterwards.
    assert.equal(
      await waitFor(() => !processAlive(parseInt(result, 10)), 2_000),
      true,
    );
  }
});
