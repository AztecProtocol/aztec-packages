import { test } from "node:test";
import * as assert from "node:assert/strict";
import { FrameReader } from "./frame_reader.js";

function frame(payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

test("reassembles a frame split across chunks, including a split prefix", () => {
  const payload = Buffer.alloc(300_000);
  for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;
  const bytes = frame(payload);
  const reader = new FrameReader();
  const cuts = [1, 3, 9, 1000, 150_000, bytes.length];
  let start = 0;
  for (const cut of cuts) {
    assert.equal(reader.next(), undefined);
    reader.push(bytes.subarray(start, cut));
    start = cut;
  }
  assert.deepEqual(reader.next(), bytes);
  assert.equal(reader.next(), undefined);
});

test("yields several frames from one chunk and keeps the remainder", () => {
  const a = frame(Buffer.from([1, 2]));
  const b = frame(Buffer.from([]));
  const c = frame(Buffer.from([3, 4, 5]));
  const reader = new FrameReader();
  reader.push(Buffer.concat([a, b, c.subarray(0, 5)]));
  assert.deepEqual(reader.next(), a);
  assert.deepEqual(reader.next(), b);
  assert.equal(reader.next(), undefined);
  assert.equal(reader.peekLength(), 3);
  reader.push(c.subarray(5));
  assert.deepEqual(reader.next(), c);
});
