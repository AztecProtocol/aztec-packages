import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { SpawnedProcessBackend } from "./spawned_backend.js";

const scratch = mkdtempSync(join(tmpdir(), "process-host-calls-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// Frames are [u32 len][u64 id][payload], len counting id + payload, both ways.
const FRAMING = `
const net = require('node:net');
function frame(id, payload) {
  const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32LE(payload.length + 8, 0);
  out.writeBigUInt64LE(id, 4);
  payload.copy(out, 12);
  return out;
}
function onFrames(conn, onFrame) {
  let buf = Buffer.alloc(0);
  conn.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
      const len = buf.readUInt32LE(0);
      onFrame(buf.readBigUInt64LE(4), Buffer.from(buf.subarray(12, 4 + len)));
      buf = buf.subarray(4 + len);
    }
  });
}
`;

// Answers each request with its own pid, so a test can tell which process answered.
const PID_SERVER = join(scratch, "pid_server.cjs");
writeFileSync(
  PID_SERVER,
  `${FRAMING}
net.createServer(conn => onFrames(conn, id => conn.write(frame(id, Buffer.from(String(process.pid)))))).listen(process.argv[2]);
`,
);

// A server whose every request names one of its host-call targets: it calls that target with
// "ping" over the target's path, as the generated --host-call router does, and answers with the
// target's response.
const CALLING_SERVER = join(scratch, "calling_server.cjs");
writeFileSync(
  CALLING_SERVER,
  `${FRAMING}
const targets = {};
const args = process.argv.slice(3);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host-call') {
    const [name, path] = args[++i].split('=');
    targets[name] = path;
  }
}
function hostCall(name, request) {
  return new Promise((resolve, reject) => {
    const conn = net.connect(targets[name]);
    conn.on('error', reject);
    onFrames(conn, (_id, payload) => { conn.end(); resolve(payload); });
    conn.write(frame(1n, request));
  });
}
net.createServer(conn => onFrames(conn, async (id, payload) => {
  const response = await hostCall(payload.toString(), Buffer.from('ping'));
  conn.write(frame(id, response));
})).listen(process.argv[2]);
`,
);

function spawnNodeServer(script: string, extra: object = {}) {
  return SpawnedProcessBackend.spawn({
    binaryPath: process.execPath,
    binaryName: script,
    instancePrefix: "host-calls-test",
    ipcPathArgs: [script, "{path}"],
    ...extra,
  });
}

async function call(backend: SpawnedProcessBackend, target: string) {
  return Buffer.from(await backend.call(Buffer.from(target))).toString();
}

test("a process's host calls reach a function, another process and a path", async () => {
  const other = await spawnNodeServer(PID_SERVER);
  const atPath = await spawnNodeServer(PID_SERVER);
  const pidOf = async (backend: SpawnedProcessBackend) =>
    Buffer.from(await backend.call(Uint8Array.from([0]))).toString();
  const backend = await spawnNodeServer(CALLING_SERVER, {
    hostCall: {
      upper: (request: Uint8Array) =>
        Buffer.from(Buffer.from(request).toString().toUpperCase()),
      other,
      atPath: atPath.getIpcPath(),
    },
  });
  try {
    assert.equal(await call(backend, "upper"), "PING");
    // Reached at their own sockets: the answer is the other process's, with no hop through this one.
    assert.equal(await call(backend, "other"), await pidOf(other));
    assert.equal(await call(backend, "atPath"), await pidOf(atPath));
  } finally {
    await backend.destroy();
    await other.destroy();
    await atPath.destroy();
  }
});

test("destroying the backend stops the sockets it served for its host calls", async () => {
  const relays = () =>
    readdirSync(tmpdir()).filter(
      (f) =>
        f.startsWith(`host-calls-test-${process.pid}-`) &&
        f.endsWith("-upper.sock"),
    );
  const backend = await spawnNodeServer(CALLING_SERVER, {
    hostCall: { upper: (request: Uint8Array) => request },
  });
  assert.equal(await call(backend, "upper"), "ping");
  assert.equal(relays().length, 1);
  await backend.destroy();
  assert.deepEqual(relays(), []);
});
