# @aztec/sqlite3mc-wasm

SQLite3 Multiple Ciphers v2.3.5 (based on SQLite 3.53.2) packaged as a WASM
module.

Upstream: https://github.com/utelle/SQLite3MultipleCiphers

Cipher schemes enabled: ChaCha20 (PRAGMA cipher = chacha20), SQLCipher v4,
AES-256, and others. See sqlite3mc upstream docs.

Usage: import sqlite3InitModule from @aztec/sqlite3mc-wasm. API is identical
to @sqlite.org/sqlite-wasm; sqlite3mc is a strict superset.

License: sqlite3mc is MIT-licensed.

## How vendoring works

Upstream WASM/JS artifacts under `vendor/jswasm/` are fetched at build time. The committed state of the directory is:

| File                              | Why                                                                                                                                    |
|-----------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `.gitignore`                      | Allowlist that keeps the rest of `vendor/jswasm/` out of git                                                                           |
| `SHA256SUMS`                      | Per-file integrity manifest. Pinned at vendoring time; verified at every build                                                         |
| `sqlite3.d.mts`                   | Locally-authored TypeScript declaration companion for the upstream `sqlite3.mjs`. Required by TS NodeNext module resolution.           |

Everything else in `vendor/jswasm/` (the actual `.wasm`, `.mjs`, `.js`) is populated by `scripts/vendor.sh`, which is
invoked from `yarn-project/bootstrap.sh` before any package compiles. It downloads the upstream release zip, verifies
its SHA256 against the pinned value, extracts the WASM/JS files, and regenerates `SHA256SUMS`. On CI cache hits the
files come back via the build cache without re-fetching from upstream.

The pinned upstream version lives in `scripts/vendor.pin`:

```sh
MC_VERSION=2.3.5
SQLITE_VERSION=3.53.2
SHA256=3d0d5ebe4c54a9a22012410726ecef711e4e3e15ec11dffddf09488c72a10670
```

## Verification (full chain)

Run from this package's root, after `scripts/vendor.sh ensure` has populated `vendor/jswasm/`.

### Step 1: zip matches the pinned SHA

The build script verifies this automatically. To check by hand:

```bash
source scripts/vendor.pin
curl -sL "https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v${MC_VERSION}/sqlite3mc-${MC_VERSION}-sqlite-${SQLITE_VERSION}-wasm.zip" \
  | sha256sum
# Expected: matches $SHA256 from scripts/vendor.pin
```

If this fails: upstream re-released the asset, or the artifact was tampered with in transit. Investigate before
trusting any subsequent check.

### Step 2: vendored files match the manifest

```bash
cd vendor/jswasm && sha256sum -c SHA256SUMS
```

Expected output: every file reports `OK`.

If any file reports `FAILED`: the file's bytes differ from what was recorded at vendoring time. Either the file was
modified post-fetch (via pre-commit hooks, accidental edits, etc.), or `SHA256SUMS` itself was tampered with. Both
cases need investigation, the build should not be trusted.

### Step 3 (optional, stronger): independently re-derive SHA256SUMS from the zip

A reviewer who wants to prove `SHA256SUMS` itself wasn't tampered with can regenerate it from the upstream zip:

```bash
source scripts/vendor.pin
curl -sL "https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v${MC_VERSION}/sqlite3mc-${MC_VERSION}-sqlite-${SQLITE_VERSION}-wasm.zip" -o /tmp/sqlite3mc.zip
unzip -q /tmp/sqlite3mc.zip -d /tmp/sqlite3mc-check

# Compute per-file hashes from the extracted jswasm/
(cd /tmp/sqlite3mc-check/sqlite3mc-wasm-* && cd jswasm && sha256sum -- * | sort -k2) > /tmp/upstream-sums

# Compare against repo's SHA256SUMS, excluding our locally-authored d.mts
grep -v 'sqlite3\.d\.mts' vendor/jswasm/SHA256SUMS | sort -k2 > /tmp/repo-sums
diff /tmp/upstream-sums /tmp/repo-sums
```

Expected: empty diff. Any output means either upstream files have been modified or `SHA256SUMS` claims different hashes
than the zip.

## Bumping the pinned version

1. Edit `scripts/vendor.pin` with the new `MC_VERSION`, `SQLITE_VERSION`, and the SHA256 of the new release zip (find
   it in the upstream release notes or compute it: `curl -sL <url> | sha256sum`).
2. Run `scripts/vendor.sh` (no args). It fetches the new release, verifies the SHA, replaces `vendor/jswasm/`, and
   regenerates `SHA256SUMS`.
3. Re-run kv-store tests to confirm compatibility: `yarn workspace @aztec/kv-store test:browser`
4. Commit `scripts/vendor.pin` and `vendor/jswasm/SHA256SUMS` together.

To verify a candidate release before editing the pin file:

```bash
scripts/vendor.sh <mc-version> <sqlite-version> <expected-sha256>
```

The 3-argument form overrides the pin file but does not modify it.

## Why `vendor/` is excluded from prettier

The repo's `.prettierignore` includes `sqlite3mc-wasm/vendor/`. Without this, pre-commit hooks would silently reformat
the upstream `.js` / `.mjs` files between fetch and the next commit (whitespace only, semantically identical, but
cryptographically different bytes), breaking the verification chain above.

If you see prettier formatting drift in this directory, the ignore entry is missing or misconfigured.
