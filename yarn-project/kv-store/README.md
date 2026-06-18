# KV Store

The Aztec KV store is an implementation of a durable key-value database with a pluggable backend. The backend is selected at import time — you import `createStore` (and friends) from the entrypoint you want:

- `@aztec/kv-store/lmdb-v2`: server / Node. The current default for node components.
- `@aztec/kv-store/lmdb`: the legacy LMDB backend, backed by [`lmdb-js`](https://github.com/kriszyp/lmdb-js).
- `@aztec/kv-store/browser`: **the recommended browser backend.** Durable and encryption-at-rest capable, backed by SQLite over the Origin Private File System (OPFS). An alias of `@aztec/kv-store/sqlite-opfs`.
- `@aztec/kv-store/sqlite-opfs`: browser, the explicit SQLite-OPFS backend that `@aztec/kv-store/browser` points at.
- `@aztec/kv-store/deprecated/indexeddb`: **deprecated** browser backend, backed by IndexedDB. Stores plaintext, and its transaction model cannot span async work — new browser code must use `@aztec/kv-store/browser`.

This package exports a number of primitive data structures that can be used to build domain-specific databases in each node component (e.g. a PXE database or an Archiver database). The data structures supported:

- singleton - holds a single value. Great for when a value needs to be stored but it's not a collection (e.g. the latest block header or the length of an array)
- array - works like a normal in-memory JS array. It can't contain holes and it can be used as a stack (push-pop mechanics).
- map - a hashmap where keys can be numbers or strings
- multi-map - just like a map but each key holds multiple values. Can be used for indexing into other data structures
