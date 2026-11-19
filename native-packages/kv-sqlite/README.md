# kv-sqlite

An ordered key-value store as an IPC service, over SQLite3 Multiple Ciphers: the store `@aztec-labs/kv-store`'s
maps, multimaps, sets, arrays and singletons are built from. One C++ service (`cpp/`) builds a native binary,
`kv-sqlite`, a native library, `libkv_sqlite.so`, and a wasm module, `kv_sqlite.wasm`, behind one generated
TypeScript client, `@aztec-labs/kv-sqlite`: the process or the library (napi) in node, the library through JSI in
React Native, and the wasm module in browsers.

## Wire contracts

- `kv_schema.jsonc`, the `Kv` service: `Init` opens a store (a file, or memory), optionally encrypted with a
  32-byte key; then reads (`Get`, `Has`, `Count`, `Range`, `Values`, `GetAt`), writes (`Put`, `PutMany`, `Delete`,
  `Append`, `DeleteValue`, `SetAt`, `Pop`), transactions (`Begin`, `Commit`, `Rollback`) and whole-store commands
  (`Clear`, `Export`, `DeleteStore`). Nothing in it is specific to SQLite.
- `files_schema.jsonc`, the `Files` service: the files a wasm module keeps its database in. The module has no file
  system, so its SQLite VFS (`cpp/src/kv/host_vfs.cpp`) calls the host's `files` host-call target. The host serves
  it with `@aztec-labs/kv-sqlite-files`, its generated server bindings; `handleRequestSync` answers a synchronous
  instance (`KvServiceSync`), which holds its thread until each answer returns.

```ts
const files = (request: Uint8Array) => handleRequestSync(myFiles, request);
const kv = await KvServiceSync.create({ backend: 'wasm', wasm: { hostCall: { files } }, init: { path: 'pxe.sqlite' } });
```

Native builds use the file system directly and never call it.

## The database

One table holds every container's entries, in the layout `@aztec-labs/kv-store`'s browser store has always
written, so its databases open here unchanged, encrypted ones included (the same SQLite3 Multiple Ciphers release,
ChaCha20, keyed with the raw key). The `hash` column, which identifies a value within its key, now holds the value's
SHA-256, where the browser store wrote an `ohash` of the JS value. Its maps read and write as before, but values it
appended to a multimap or array are not matched by value (dedup, `DeleteValue`): a store holding those should move to
a fresh database, as the PXE does by bumping its schema version. See
`cpp/src/kv/store.hpp`.

## Tests

- `cpp/src/kv/store.test.cpp`: the store, natively, a database in the browser store's layout included.
- `scripts/kv.test.mjs`: the package, through the process, the library and the wasm module (on a worker and on the
  calling thread, its files answered from the file system): every backend answers the same, and a database any of
  them writes, encrypted or not, opens in all the others.
