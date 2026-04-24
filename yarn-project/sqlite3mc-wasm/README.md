# @aztec/sqlite3mc-wasm

Vendored build of SQLite3 Multiple Ciphers v2.2.4 (based on SQLite 3.50.4).

Upstream: https://github.com/utelle/SQLite3MultipleCiphers

Cipher schemes enabled: ChaCha20 (PRAGMA cipher = chacha20), SQLCipher v4,
AES-256, and others. See sqlite3mc upstream docs.

Usage: import sqlite3InitModule from @aztec/sqlite3mc-wasm. API is identical
to @sqlite.org/sqlite-wasm; sqlite3mc is a strict superset.

License: sqlite3mc is MIT-licensed. Artifacts are unmodified from the
upstream v2.2.4 release.

## Vendored artifact provenance

The files under `vendor/jswasm/` were extracted verbatim from the upstream
release zip. Reviewers and future maintainers can independently verify the
binary lineage:

| Field  | Value                                                                                   |
|--------|-----------------------------------------------------------------------------------------|
| Zip    | `sqlite3mc-2.2.4-sqlite-3.50.4-wasm.zip`                                                |
| Source | https://github.com/utelle/SQLite3MultipleCiphers/releases/tag/v2.2.4                    |
| SHA256 | `e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5`                      |

### Verification

```bash
curl -sL https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v2.2.4/sqlite3mc-2.2.4-sqlite-3.50.4-wasm.zip \
  | sha256sum
# Expected: e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5
```

If the recorded hash differs from what upstream serves today, something changed
— either upstream re-released the asset (rare but possible), or the artifact
was tampered with in transit. Investigate before trusting the mismatch.

## Re-vendoring

To bump the sqlite3mc version, run the script from this package's root:

```bash
yarn-project/sqlite3mc-wasm/scripts/vendor.sh <version> <sqlite-version> <expected-sha256>
```

Example, verifying the current pinned version:

```bash
scripts/vendor.sh 2.2.4 3.50.4 e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5
```

The script downloads the upstream release zip, verifies its SHA256 matches the
third argument, extracts `jswasm/` into `vendor/jswasm/`, and exits non-zero on
mismatch. Update this README's provenance table with the new version + hash
when bumping.
