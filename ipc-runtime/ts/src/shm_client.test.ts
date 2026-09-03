import assert from "node:assert/strict";
import { test } from "node:test";
import { NapiShmAsyncClient, NapiMsgpackClientAsync } from "./shm_client.js";

/**
 * Drives NapiShmAsyncClient through a mock addon, so the id-pairing logic is
 * testable without the native module or a live server.
 */
class MockAddon implements NapiMsgpackClientAsync {
  public deliver!: (requestId: bigint, response: Buffer) => void;
  public sent: Array<{ requestId: bigint; input: Buffer }> = [];
  public acquires = 0;
  public releases = 0;
  public closed = false;

  setResponseCallback(cb: (requestId: bigint, response: Buffer) => void): void {
    this.deliver = cb;
  }
  call(requestId: bigint, input: Buffer): void {
    this.sent.push({ requestId, input });
  }
  acquire(): void {
    this.acquires++;
  }
  release(): void {
    this.releases++;
  }
  close(): void {
    this.closed = true;
  }
}

test("shm async client discards a stale frame and still resolves the live call", async () => {
  const addon = new MockAddon();
  const client = new NapiShmAsyncClient(addon);

  const pending = client.call(new Uint8Array([1, 2, 3]));
  assert.equal(addon.sent.length, 1);
  const liveId = addon.sent[0].requestId;

  // A leftover frame from a ring's previous occupant: unknown id. Must be
  // discarded — not resolve the live call, not reject anything.
  addon.deliver(liveId ^ 0xdeadbeefn, Buffer.from([0xba, 0xad]));

  // The real response still pairs and resolves.
  addon.deliver(liveId, Buffer.from([9, 9]));
  assert.deepEqual(await pending, new Uint8Array([9, 9]));

  // Refcount stayed balanced: one acquire for the call, one release when the
  // live response drained the map (the stale frame must not release).
  assert.equal(addon.acquires, 1);
  assert.equal(addon.releases, 1);

  await client.destroy();
});

test("shm async client pairs out-of-order responses to the right callers", async () => {
  const addon = new MockAddon();
  const client = new NapiShmAsyncClient(addon);

  const a = client.call(new Uint8Array([0xaa]));
  const b = client.call(new Uint8Array([0xbb]));
  const [idA, idB] = addon.sent.map((s) => s.requestId);

  // Complete in reverse order; each caller must get its own payload.
  addon.deliver(idB, Buffer.from([2]));
  addon.deliver(idA, Buffer.from([1]));
  assert.deepEqual(await b, new Uint8Array([2]));
  assert.deepEqual(await a, new Uint8Array([1]));

  await client.destroy();
});
