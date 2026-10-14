// Exercises the addon's read transaction protocol over the same msgpack wire format the kv-store client uses.
// Run after building the addon: `node --test test/read_tx.test.mjs` (AZTEC_KVDB_NAPI_PATH overrides the binary).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { Encoder } from "msgpackr";

import { findNapiBinary } from "../dest/index.js";

const MSG = {
  OPEN_DATABASE: 100,
  GET: 101,
  HAS: 102,
  START_CURSOR: 103,
  ADVANCE_CURSOR: 104,
  CLOSE_CURSOR: 106,
  BATCH: 107,
  CLOSE: 109,
  START_READ_TX: 111,
  CLOSE_READ_TX: 112,
};

const napiPath = findNapiBinary();
assert.ok(napiPath, "kvdb NAPI binary not found, build it first");
const { LMDBStore } = createRequire(import.meta.url)(napiPath);

const encoder = new Encoder({ useRecords: false, int64AsType: "bigint" });
const b = (s) => Buffer.from(s);
const str = (v) => Buffer.from(v).toString();
const values = (resp) =>
  resp.values.map((v) => (v == null ? null : v.map(str)));
const keysOf = (entries) => entries.map(([k]) => str(k));

let messageId = 1;
function openStore(dir, maxReaders) {
  const store = new LMDBStore(dir, 10 * 1024, maxReaders);
  const send = async (msgType, value) => {
    const msg = { msgType, header: { messageId: messageId++, requestId: 0 } };
    if (value !== undefined) {
      msg.value = value;
    }
    return encoder.unpack(await store.call(encoder.encode(msg))).value;
  };
  const batch = (data = [], index = []) =>
    send(MSG.BATCH, {
      batches: new Map([
        ["data", { addEntries: data, removeEntries: [] }],
        ["index", { addEntries: index, removeEntries: [] }],
      ]),
    });
  const startCursor = (key, txId, opts = {}) =>
    send(MSG.START_CURSOR, {
      key: b(key),
      reverse: false,
      count: 1,
      onePage: false,
      db: "data",
      ...opts,
      txId,
    });
  return { send, batch, startCursor };
}

async function drainCursor(send, start) {
  const keys = keysOf(start.entries);
  let cursor = start.cursor;
  while (cursor != null) {
    const next = await send(MSG.ADVANCE_CURSOR, { cursor, count: 1 });
    keys.push(...keysOf(next.entries));
    if (next.done) {
      await send(MSG.CLOSE_CURSOR, { cursor });
      cursor = null;
    }
  }
  return keys;
}

describe("kvdb read transactions", () => {
  let dir;
  let send;
  let batch;
  let startCursor;
  const maxReaders = 4;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "kvdb-read-tx-"));
    ({ send, batch, startCursor } = openStore(dir, maxReaders));
    await send(MSG.OPEN_DATABASE, { db: "data", uniqueKeys: true });
    await send(MSG.OPEN_DATABASE, { db: "index", uniqueKeys: false });
    await batch(
      [
        [b("a"), [b("a1")]],
        [b("b"), [b("b1")]],
        [b("c"), [b("c1")]],
      ],
      [[b("k"), [b("v1"), b("v2")]]],
    );
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("serves requests that omit txId or set it to null as before", async () => {
    assert.deepEqual(
      values(await send(MSG.GET, { keys: [b("a")], db: "data" })),
      [["a1"]],
    );
    assert.deepEqual(
      values(await send(MSG.GET, { keys: [b("a")], db: "data", txId: null })),
      [["a1"]],
    );
    const legacy = await send(MSG.START_CURSOR, {
      key: b("a"),
      reverse: false,
      count: null,
      onePage: null,
      db: "data",
    });
    assert.equal(legacy.cursor, null);
    assert.deepEqual(keysOf(legacy.entries), ["a", "b", "c"]);
  });

  it("reads and iterates a snapshot that later writes do not change", async () => {
    const { txId } = await send(MSG.START_READ_TX);
    const cursor = await startCursor("a", txId);
    assert.notEqual(cursor.cursor, null);

    await batch(
      [
        [b("a"), [b("a2")]],
        [b("d"), [b("d2")]],
      ],
      [[b("k"), [b("v3")]]],
    );

    assert.deepEqual(
      values(
        await send(MSG.GET, { keys: [b("a"), b("d")], db: "data", txId }),
      ),
      [["a1"], null],
    );
    assert.deepEqual(
      values(await send(MSG.GET, { keys: [b("k")], db: "index", txId })),
      [["v1", "v2"]],
    );
    assert.deepEqual(
      values(await send(MSG.GET, { keys: [b("a"), b("d")], db: "data" })),
      [["a2"], ["d2"]],
    );
    assert.deepEqual(
      values(await send(MSG.GET, { keys: [b("k")], db: "index" })),
      [["v1", "v2", "v3"]],
    );

    const entries = [
      [b("d"), null],
      [b("a"), [b("a1")]],
    ];
    assert.deepEqual(await send(MSG.HAS, { entries, db: "data", txId }), {
      exists: [false, true],
    });
    assert.deepEqual(await send(MSG.HAS, { entries, db: "data" }), {
      exists: [true, false],
    });
    assert.deepEqual(
      await send(MSG.HAS, {
        entries: [[b("k"), [b("v3")]]],
        db: "index",
        txId,
      }),
      { exists: [false] },
    );

    const reverse = await startCursor("z", txId, { reverse: true, count: 100 });
    assert.deepEqual(keysOf(reverse.entries), ["c", "b", "a"]);
    assert.deepEqual(await drainCursor(send, cursor), ["a", "b", "c"]);

    assert.deepEqual(await send(MSG.CLOSE_READ_TX, { txId }), { ok: true });
  });

  it("keeps cursors usable after their read transaction is closed", async () => {
    const { txId } = await send(MSG.START_READ_TX);
    const cursor = await startCursor("a", txId);
    await batch([[b("e"), [b("e3")]]]);

    assert.deepEqual(await send(MSG.CLOSE_READ_TX, { txId }), { ok: true });
    assert.deepEqual(await send(MSG.CLOSE_READ_TX, { txId }), { ok: false });
    assert.deepEqual(await drainCursor(send, cursor), ["a", "b", "c", "d"]);
  });

  it("rejects unknown and missing read transaction ids", async () => {
    const { txId } = await send(MSG.START_READ_TX);
    await send(MSG.CLOSE_READ_TX, { txId });
    await assert.rejects(
      send(MSG.GET, { keys: [b("a")], db: "data", txId }),
      /Read transaction .* not found/,
    );
    await assert.rejects(
      startCursor("a", 987654),
      /Read transaction 987654 not found/,
    );
    await assert.rejects(
      send(MSG.CLOSE_READ_TX, {}),
      /missing the read transaction id/,
    );
    assert.deepEqual(await send(MSG.CLOSE_READ_TX, { txId: 987654 }), {
      ok: false,
    });
  });

  it("serializes concurrent gets and cursor scans on one read transaction", async () => {
    const { txId } = await send(MSG.START_READ_TX);
    const expected = keysOf(
      (await startCursor("a", txId, { count: 100 })).entries,
    );
    const work = [];
    for (let i = 0; i < 200; i++) {
      if (i % 20 === 0) {
        work.push(batch([[b(`n${i}`), [b("x")]]], [[b("k"), [b(`z${i}`)]]]));
      }
      work.push(
        send(MSG.GET, { keys: [b("a"), b("k")], db: "data", txId }).then(
          (r) => assert.deepEqual(values(r), [["a2"], null]),
        ),
        send(MSG.GET, { keys: [b("k")], db: "index", txId }).then((r) =>
          assert.deepEqual(values(r), [["v1", "v2", "v3"]]),
        ),
        startCursor("a", txId)
          .then((start) => drainCursor(send, start))
          .then((keys) => assert.deepEqual(keys, expected)),
      );
    }
    await Promise.all(work);
    assert.deepEqual(await send(MSG.CLOSE_READ_TX, { txId }), { ok: true });
  });

  it("rejects new read transactions instead of waiting when reader slots run out", async () => {
    const held = [];
    // one slot always stays free for requests that open their own read transaction
    for (let i = 0; i < maxReaders - 1; i++) {
      held.push((await send(MSG.START_READ_TX)).txId);
    }
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => send(MSG.START_READ_TX)),
    );
    for (const attempt of attempts) {
      assert.equal(attempt.status, "rejected");
      assert.match(attempt.reason.message, /No reader slot available/);
    }
    assert.deepEqual(
      values(await send(MSG.GET, { keys: [b("a")], db: "data" })),
      [["a2"]],
    );

    assert.deepEqual(await send(MSG.CLOSE_READ_TX, { txId: held.pop() }), {
      ok: true,
    });
    held.push((await send(MSG.START_READ_TX)).txId);
    for (const txId of held) {
      assert.deepEqual(await send(MSG.CLOSE_READ_TX, { txId }), { ok: true });
    }
  });

  it("counts closed read transactions kept alive by cursors against the reader slots", async () => {
    const { txId } = await send(MSG.START_READ_TX);
    const cursor = await startCursor("a", txId);
    await send(MSG.CLOSE_READ_TX, { txId });

    const held = [];
    for (let i = 0; i < maxReaders - 2; i++) {
      held.push((await send(MSG.START_READ_TX)).txId);
    }
    await assert.rejects(send(MSG.START_READ_TX), /No reader slot available/);

    await send(MSG.CLOSE_CURSOR, { cursor: cursor.cursor });
    held.push((await send(MSG.START_READ_TX)).txId);
    for (const id of held) {
      await send(MSG.CLOSE_READ_TX, { txId: id });
    }
  });

  it("closes the store with live read transactions and cursors, releasing the environment", async () => {
    const { txId } = await send(MSG.START_READ_TX);
    const cursor = await startCursor("a", txId);
    assert.notEqual(cursor.cursor, null);

    assert.deepEqual(await send(MSG.CLOSE), { ok: true });
    await assert.rejects(
      send(MSG.GET, { keys: [b("a")], db: "data", txId }),
      /closed/,
    );

    const reopened = openStore(dir, maxReaders);
    await reopened.send(MSG.OPEN_DATABASE, { db: "data", uniqueKeys: true });
    const { txId: fresh } = await reopened.send(MSG.START_READ_TX);
    assert.deepEqual(
      values(
        await reopened.send(MSG.GET, {
          keys: [b("d")],
          db: "data",
          txId: fresh,
        }),
      ),
      [["d2"]],
    );
    assert.deepEqual(await reopened.send(MSG.CLOSE), { ok: true });
  });
});
