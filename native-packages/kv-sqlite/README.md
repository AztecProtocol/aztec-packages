# kv-sqlite

An ordered key-value store as an IPC service, over SQLite3 Multiple Ciphers: the store `@aztec-labs/kv-store`'s
maps, multimaps, sets, arrays and singletons are built from. One C++ service (`cpp/`) builds a native binary,
`kv-sqlite`, and a native library, `libkv_sqlite.so`, behind one generated TypeScript client, `@aztec-labs/kv-sqlite`:
the process or the library (napi) in node, and the library through JSI in React Native.

## Wire contract

`kv_schema.jsonc`, the `Kv` service: `Init` opens a store (a file, or memory), optionally encrypted with a 32-byte
key; then reads (`Get`, `Has`, `Count`, `Range`, `Values`, `GetAt`), writes (`Put`, `PutMany`, `Delete`, `Append`,
`DeleteValue`, `SetAt`, `Pop`), transactions (`Begin`, `Commit`, `Rollback`) and whole-store commands (`Clear`,
`Export`, `DeleteStore`). Nothing in it is specific to SQLite.

A browser has no build of this service. `@aztec-labs/kv-store`'s browser store serves the same contract in
TypeScript instead, on a worker over the sqlite3mc wasm build and SQLite's own OPFS VFS, with the server bindings the
package exports at `@aztec-labs/kv-sqlite/server`:

```ts
import { type SyncHandler, handleRequestSync } from '@aztec-labs/kv-sqlite/server';

const answer = (request: Uint8Array) => handleRequestSync(myHandler, request);
```

The client takes any object with `call(bytes)`/`destroy()` as its backend, so kv-store's containers run unchanged on
either.

## The database

One table holds every container's entries, in the layout `@aztec-labs/kv-store`'s browser store has always
written, so a database opens in either implementation, encrypted ones included (the same SQLite3 Multiple Ciphers
release, ChaCha20, keyed with the raw key). The `hash` column, which identifies a value within its key, holds the
value's SHA-256, where the browser store once wrote an `ohash` of the JS value. Maps read and write as before, but
values appended to a multimap or array under `ohash` are not matched by value (dedup, `DeleteValue`): a store holding
those should move to a fresh database, as the PXE does by bumping its schema version. See `cpp/src/kv/store.hpp`.

## Tests

- `cpp/src/kv/store.test.cpp`: the store, natively, a database in the browser store's layout included.
- `scripts/kv.test.mjs`: the package, through the process and the library: every backend answers the same, and a
  database either writes, encrypted or not, opens in the other.
- `@aztec-labs/kv-store`'s container suites run against both this service and the browser store's, through the same
  client.
