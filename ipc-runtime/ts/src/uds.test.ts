// In-process UDS transport tests: UdsIpcServer + UdsIpcClient round-trips,
// zero-length responses, disconnect handling and truncated/oversized frames.
// Run via `yarn test` (node --test against the compiled dest/ output).

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { IpcError, IpcTransportError } from "./errors.js";
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

test("client fails pending calls when the server closes mid-frame", async () => {
  const socketPath = tmpSocketPath("midframe_cli");
  // Raw server that claims a ~4 GiB response, sends a few bytes of it and
  // hangs up.
  const rawServer = net.createServer((conn) => {
    conn.once("data", () => {
      const partial = Buffer.alloc(12 + 16);
      partial.writeUInt32LE(0xffffffff, 0);
      conn.end(partial);
    });
  });
  await new Promise<void>((resolve) =>
    rawServer.listen(socketPath, () => resolve()),
  );

  const client = await UdsIpcClient.connect(socketPath);
  try {
    await assert.rejects(client.call(new Uint8Array([1])), IpcTransportError);
  } finally {
    await client.destroy();
    rawServer.close();
    fs.rmSync(socketPath, { force: true });
  }
});

test("a request too large for the frame header rejects without breaking the connection", async () => {
  const socketPath = tmpSocketPath("too_large");
  const server = await UdsIpcServer.listen(socketPath, (_id, req) => req);
  const client = await UdsIpcClient.connect(socketPath);
  try {
    // Only the length is consulted before the request is refused, so a stand-in
    // avoids allocating 4 GiB.
    const tooLarge = { length: 2 ** 32 } as unknown as Uint8Array;
    await assert.rejects(client.call(tooLarge), (err: unknown) => {
      assert.ok(err instanceof IpcError);
      assert.ok(!(err instanceof IpcTransportError));
      assert.equal(err.retry, false);
      return true;
    });
    const payload = new Uint8Array([4, 5, 6]);
    assert.deepEqual(await client.call(payload), payload);
  } finally {
    await client.destroy();
    await server.close();
  }
});

test("client fails all pending calls on a response with an unknown request id", async () => {
  const socketPath = tmpSocketPath("unknown_id");
  // Raw server that answers with a well-formed frame whose request id matches
  // nothing the client sent — the correlation-desync case.
  const rawServer = net.createServer((conn) => {
    conn.once("data", () => {
      const frame = Buffer.allocUnsafe(12 + 1);
      frame.writeUInt32LE(1 + 8, 0);
      frame.writeBigUInt64LE(0xdeadbeefn, 4);
      frame.writeUInt8(42, 12);
      conn.write(frame);
    });
  });
  await new Promise<void>((resolve) =>
    rawServer.listen(socketPath, () => resolve()),
  );

  const client = await UdsIpcClient.connect(socketPath);
  try {
    await assert.rejects(
      client.call(new Uint8Array([1])),
      /unknown request id/,
    );
  } finally {
    await client.destroy();
    rawServer.close();
    fs.rmSync(socketPath, { force: true });
  }
});

test("client fails loudly on an id-less (old-protocol) frame", async () => {
  const socketPath = tmpSocketPath("idless");
  // Raw server speaking the pre-envelope-id protocol: [4B len][payload] with
  // len < 8.
  const rawServer = net.createServer((conn) => {
    conn.once("data", () => {
      const frame = Buffer.allocUnsafe(4 + 1);
      frame.writeUInt32LE(1, 0);
      frame.writeUInt8(42, 4);
      conn.write(frame);
    });
  });
  await new Promise<void>((resolve) =>
    rawServer.listen(socketPath, () => resolve()),
  );

  const client = await UdsIpcClient.connect(socketPath);
  try {
    await assert.rejects(client.call(new Uint8Array([1])), /protocol mismatch/);
  } finally {
    await client.destroy();
    rawServer.close();
    fs.rmSync(socketPath, { force: true });
  }
});

test("server keeps serving after a client closes mid-frame", async () => {
  const socketPath = tmpSocketPath("midframe_srv");
  const server = await UdsIpcServer.listen(socketPath, (_id, req) => req);
  const conn = net.createConnection(socketPath);
  const client = await (async () => {
    await new Promise<void>((resolve, reject) => {
      conn.once("connect", () => resolve());
      conn.once("error", reject);
    });
    const partial = Buffer.alloc(12 + 16);
    partial.writeUInt32LE(0xffffffff, 0);
    conn.end(partial);
    return UdsIpcClient.connect(socketPath);
  })();
  try {
    const payload = new Uint8Array([1, 2, 3]);
    assert.deepEqual(await client.call(payload), payload);
  } finally {
    conn.destroy();
    await client.destroy();
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
