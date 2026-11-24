// Tests of the generated @aztec-labs/kv-sqlite package, from its build: the same commands give the same answers
// through the spawned kv-sqlite binary and an instance of its library (napi), and a database one writes, encrypted or
// not, opens in the other.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { KvService, KvServiceSync } from "@aztec-labs/kv-sqlite";
import { handleRequestSync } from "@aztec-labs/kv-sqlite/server";

const dir = mkdtempSync(join(tmpdir(), "kv-sqlite-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));
let nextFile = 0;
const freshPath = () => join(dir, `store-${nextFile++}.sqlite`);

/** Opens a store at `path` (in memory without one) through `backend`, as `KvService` or `KvServiceSync`. */
async function open(backend, init) {
  switch (backend) {
    case "process":
      return KvService.create({ backend, init });
    case "napi":
      return KvService.create({ backend, init });
    case "napi-sync":
      return KvServiceSync.create({ backend: "napi", init });
  }
  throw new Error(backend);
}
const BACKENDS = ["process", "napi", "napi-sync"];

const bytes = (s) => new TextEncoder().encode(s);
const text = (b) => new TextDecoder().decode(b);

/** Every kind of container's commands, and what they answer. */
async function scenario(kv) {
  const out = {};
  await kv.put({ container: "map:m", key: bytes("b"), value: bytes("2") });
  await kv.putMany({
    container: "map:m",
    entries: ["a", "c", "d"].map((k, i) => ({
      key: bytes(k),
      value: bytes(String(i)),
    })),
  });
  out.get = (
    await kv.get({ container: "map:m", keys: [bytes("a"), bytes("x")] })
  ).values.map((v) => v.value && text(v.value));
  out.forward = (
    await kv.range({
      container: "map:m",
      start: bytes("b"),
      end: bytes("d"),
      reverse: false,
    })
  ).entries.map((e) => text(e.key));
  out.reverse = (
    await kv.range({ container: "map:m", reverse: true, limit: 2 })
  ).entries.map((e) => text(e.key));
  await kv.delete({ container: "map:m", key: bytes("a") });
  out.has = (await kv.has({ container: "map:m", key: bytes("a") })).has;
  out.count = Number((await kv.count({ container: "map:m" })).count);

  out.appended = Number(
    (
      await kv.append({
        container: "map:mm",
        key: bytes("k"),
        values: ["x", "y", "x"].map(bytes),
        unique: true,
      })
    ).count,
  );
  await kv.deleteValue({
    container: "map:mm",
    key: bytes("k"),
    value: bytes("x"),
  });
  out.values = (
    await kv.values({ container: "map:mm", key: bytes("k") })
  ).values.map(text);

  await kv.append({
    container: "array:a",
    key: bytes("a"),
    values: ["p", "p", "q"].map(bytes),
    unique: false,
  });
  out.setAt = (
    await kv.setAt({
      container: "array:a",
      key: bytes("a"),
      index: 1n,
      value: bytes("r"),
    })
  ).set;
  out.getAt = text(
    (await kv.getAt({ container: "array:a", key: bytes("a"), index: 1n }))
      .value,
  );
  out.pop = text(
    (await kv.pop({ container: "array:a", key: bytes("a") })).value,
  );

  await kv.begin({});
  await kv.put({
    container: "map:t",
    key: bytes("k"),
    value: bytes("dropped"),
  });
  await kv.rollback({});
  out.rolledBack = (await kv.has({ container: "map:t", key: bytes("k") })).has;
  return out;
}

test("every backend answers the same", async () => {
  const results = {};
  for (const backend of BACKENDS) {
    for (const path of [undefined, freshPath()]) {
      const kv = await open(backend, { path });
      try {
        results[`${backend} ${path ? "file" : "memory"}`] = await scenario(kv);
      } finally {
        await kv.destroy();
      }
    }
  }
  const [first, ...rest] = Object.values(results);
  assert.deepEqual(first, {
    get: ["0", null],
    forward: ["b", "c"],
    reverse: ["d", "c"],
    has: false,
    count: 3,
    appended: 2,
    values: ["y"],
    setAt: true,
    getAt: "r",
    pop: "q",
    rolledBack: false,
  });
  for (const [name, result] of Object.entries(results)) {
    assert.deepEqual(result, first, name);
  }
  assert.equal(rest.length, BACKENDS.length * 2 - 1);
});

test("a database one build writes opens in every other, encrypted or not", async () => {
  for (const encryptionKey of [undefined, new Uint8Array(32).fill(9)]) {
    for (const writer of BACKENDS) {
      const path = freshPath();
      const kv = await open(writer, { path, encryptionKey });
      await kv.put({
        container: "map:x",
        key: bytes("written by"),
        value: bytes(writer),
      });
      await kv.destroy();
      for (const reader of BACKENDS) {
        const kv = await open(reader, { path, encryptionKey });
        try {
          const [{ value }] = (
            await kv.get({ container: "map:x", keys: [bytes("written by")] })
          ).values;
          assert.equal(text(value), writer, `${writer} -> ${reader}`);
        } finally {
          await kv.destroy();
        }
      }
    }
  }
});

test("a wrong key fails the open with SQLite's message, on every backend", async () => {
  const path = freshPath();
  const kv = await open("napi", {
    path,
    encryptionKey: new Uint8Array(32).fill(1),
  });
  await kv.put({ container: "map:x", key: bytes("k"), value: bytes("v") });
  await kv.destroy();
  for (const backend of BACKENDS) {
    await assert.rejects(
      async () =>
        open(backend, { path, encryptionKey: new Uint8Array(32).fill(2) }),
      /file is not a database/,
      backend,
    );
  }
});

test("export and deleteStore", async () => {
  for (const backend of BACKENDS) {
    const path = freshPath();
    const kv = await open(backend, { path });
    try {
      await kv.put({ container: "map:x", key: bytes("k"), value: bytes("v") });
      const exported = (await kv.export({})).bytes;
      assert.equal(text(exported.subarray(0, 15)), "SQLite format 3", backend);
      await kv.deleteStore({});
      assert.equal(existsSync(path), false, backend);
      await assert.rejects(
        async () => kv.has({ container: "map:x", key: bytes("k") }),
        /not open/,
        backend,
      );
    } finally {
      await kv.destroy();
    }
  }
});

test("the server bindings answer the client through a backend object", async () => {
  const held = new Map();
  const handler = {
    put({ key, value }) {
      held.set(text(key), value);
      return {};
    },
    get({ keys }) {
      return { values: keys.map((key) => ({ value: held.get(text(key)) ?? null })) };
    },
  };
  const kv = await KvService.create({
    backend: {
      call: async (request) => handleRequestSync(handler, request),
      destroy: async () => {},
    },
  });
  try {
    await kv.put({ container: "map:m", key: bytes("a"), value: bytes("1") });
    const { values } = await kv.get({ container: "map:m", keys: [bytes("a"), bytes("b")] });
    assert.deepEqual(
      values.map(({ value }) => value && text(value)),
      ["1", null],
    );
  } finally {
    await kv.destroy();
  }
});
