// In-process UDS transport tests: UdsIpcServer + UdsIpcClient round-trips,
// zero-length responses, disconnect handling and oversized-frame rejection.
// Run via `yarn test` (node --test against the compiled dest/ output).

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { UdsIpcClient } from "./uds_client.js";
import { UdsIpcServer } from "./uds_server.js";

function tmpSocketPath(tag: string): string {
  return path.join(os.tmpdir(), `ipc_ts_test_${tag}_${process.pid}.sock`);
}

test("echo round-trip", async () => {
  const socketPath = tmpSocketPath("echo");
  const server = await UdsIpcServer.listen(socketPath, (_id, req) => req);
  const client = await UdsIpcClient.connect(socketPath);
  try {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const resp = await client.call(payload);
    assert.deepEqual(resp, payload);

    // Pipelined calls resolve FIFO.
    const [a, b] = await Promise.all([
      client.call(new Uint8Array([7])),
      client.call(new Uint8Array([8, 9])),
    ]);
    assert.deepEqual(a, new Uint8Array([7]));
    assert.deepEqual(b, new Uint8Array([8, 9]));
  } finally {
    await client.destroy();
    await server.close();
  }
  assert.equal(fs.existsSync(socketPath), false, "socket unlinked on close");
});

test("socket file is chmod 0600", async () => {
  const socketPath = tmpSocketPath("chmod");
  const server = await UdsIpcServer.listen(socketPath, (_id, req) => req);
  try {
    const mode = fs.statSync(socketPath).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    await server.close();
  }
});

test("zero-length response resolves (not a hang/error)", async () => {
  const socketPath = tmpSocketPath("zlen");
  const server = await UdsIpcServer.listen(socketPath, () => new Uint8Array(0));
  const client = await UdsIpcClient.connect(socketPath);
  try {
    const resp = await client.call(new Uint8Array([42]));
    assert.equal(resp.length, 0);
  } finally {
    await client.destroy();
    await server.close();
  }
});

test("disconnect rejects pending calls and fails fast afterwards", async () => {
  const socketPath = tmpSocketPath("disc");
  // Raw server that accepts, reads, then kills the connection without
  // responding.
  const rawServer = net.createServer((conn) => {
    conn.once("data", () => conn.destroy());
  });
  await new Promise<void>((resolve) =>
    rawServer.listen(socketPath, () => resolve()),
  );

  const client = await UdsIpcClient.connect(socketPath);
  try {
    await assert.rejects(client.call(new Uint8Array([1])));
    // Socket is dead — further calls fail fast instead of queueing.
    await assert.rejects(client.call(new Uint8Array([2])), /closed/);
  } finally {
    await client.destroy();
    rawServer.close();
    fs.rmSync(socketPath, { force: true });
  }
});

test("client rejects oversized frame from server", async () => {
  const socketPath = tmpSocketPath("oversize_cli");
  // Raw server that answers any request with a corrupt 0xFFFFFFFF length
  // prefix.
  const rawServer = net.createServer((conn) => {
    conn.once("data", () => {
      const bogus = Buffer.allocUnsafe(4);
      bogus.writeUInt32LE(0xffffffff, 0);
      conn.write(bogus);
    });
  });
  await new Promise<void>((resolve) =>
    rawServer.listen(socketPath, () => resolve()),
  );

  const client = await UdsIpcClient.connect(socketPath);
  try {
    await assert.rejects(client.call(new Uint8Array([1])), /oversized frame/);
  } finally {
    await client.destroy();
    rawServer.close();
    fs.rmSync(socketPath, { force: true });
  }
});

test("server drops connection on oversized frame", async () => {
  const socketPath = tmpSocketPath("oversize_srv");
  const server = await UdsIpcServer.listen(socketPath, (_id, req) => req);
  const conn = net.createConnection(socketPath);
  try {
    await new Promise<void>((resolve, reject) => {
      conn.once("connect", () => resolve());
      conn.once("error", reject);
    });
    const bogus = Buffer.allocUnsafe(4);
    bogus.writeUInt32LE(0xffffffff, 0);
    conn.write(bogus);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("server did not close the connection")),
        5000,
      );
      conn.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      conn.once("error", () => {
        /* RST is fine — close follows */
      });
    });
  } finally {
    conn.destroy();
    await server.close();
  }
});

test("connect times out against a bound-but-unresponsive path", async () => {
  const socketPath = tmpSocketPath("noaccept");
  fs.rmSync(socketPath, { force: true });
  await assert.rejects(
    UdsIpcClient.connect(socketPath, { connectTimeoutMs: 300 }),
    /timed out/,
  );
});
