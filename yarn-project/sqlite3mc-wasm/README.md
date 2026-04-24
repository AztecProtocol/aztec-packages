# @aztec/sqlite3mc-wasm

Vendored build of SQLite3 Multiple Ciphers v2.2.4 (based on SQLite 3.50.4).

Upstream: https://github.com/utelle/SQLite3MultipleCiphers

Cipher schemes enabled: ChaCha20 (PRAGMA cipher = chacha20), SQLCipher v4,
AES-256, and others. See sqlite3mc upstream docs.

Usage: import sqlite3InitModule from @aztec/sqlite3mc-wasm. API is identical
to @sqlite.org/sqlite-wasm; sqlite3mc is a strict superset.

License: sqlite3mc is MIT-licensed. Artifacts are unmodified from the
upstream v2.2.4 release.
