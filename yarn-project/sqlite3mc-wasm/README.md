# @aztec/sqlite3mc-wasm

Vendored build of SQLite3 Multiple Ciphers v2.2.4 (based on SQLite 3.50.4).

Upstream: https://github.com/utelle/SQLite3MultipleCiphers

Cipher schemes enabled: ChaCha20 (PRAGMA cipher = chacha20), SQLCipher v4,
AES-256, and others. See sqlite3mc upstream docs.

Usage: import sqlite3InitModule from @aztec/sqlite3mc-wasm. API is identical
to @sqlite.org/sqlite-wasm; sqlite3mc is a strict superset.

License: sqlite3mc is MIT-licensed. Upstream artifacts are unmodified from the
v2.2.4 release (see provenance below). One locally-authored file lives
alongside them — see "Locally-authored files" below.

## Vendored artifact provenance

Files under `vendor/jswasm/` are either (a) extracted verbatim from the upstream
release zip, or (b) one locally-authored TypeScript declaration. Both categories
are individually hash-anchored in `vendor/jswasm/SHA256SUMS`, and the upstream
zip is hash-anchored here in the README.

| Field    | Value                                                                |
|----------|----------------------------------------------------------------------|
| Zip      | `sqlite3mc-2.2.4-sqlite-3.50.4-wasm.zip`                             |
| Source   | https://github.com/utelle/SQLite3MultipleCiphers/releases/tag/v2.2.4 |
| Zip SHA256 | `e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5` |

### Locally-authored files

One file in `vendor/jswasm/` is authored by us, not by upstream:

| File                              | Reason                                                                                                                                                          |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `sqlite3-bundler-friendly.d.mts`  | TypeScript declaration companion for the upstream `.mjs`. Required by TS NodeNext module resolution, which expects `.d.mts` co-located with `.mjs`. 8 lines of trivially-reviewable code re-exporting types from `@sqlite.org/sqlite-wasm`. |

This file is listed in `SHA256SUMS` alongside the upstream files, but its
integrity anchor is git history (this repo's commit graph), not the upstream
release zip. It would not match anything extracted from upstream.

## Verification (full chain)

A reviewer wanting to prove "what's in this repo under `vendor/jswasm/` is
exactly what it claims to be" walks two steps:

### Step 1 — zip matches upstream

```bash
curl -sL https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v2.2.4/sqlite3mc-2.2.4-sqlite-3.50.4-wasm.zip \
  | sha256sum
# Expected: e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5
```

If this fails: upstream re-released the asset, or the artifact was tampered
with in transit. Investigate before trusting any subsequent check.

### Step 2 — vendored files match the zip (and our d.mts matches committed state)

From the package root:

```bash
cd vendor/jswasm && sha256sum -c SHA256SUMS
```

Expected output: every file reports `OK`.

If any file reports `FAILED`: the file's bytes differ from what was recorded
at vendoring time. Either it was modified post-vendoring (via pre-commit hooks,
accidental edits, etc.), or `SHA256SUMS` itself was tampered with. Both cases
need investigation — the build should not be trusted.

### Step 3 (optional, stronger) — independently re-derive SHA256SUMS from the zip

A reviewer who wants to prove `SHA256SUMS` itself wasn't tampered with can
regenerate it from the upstream zip:

```bash
# Extract the zip (already verified in step 1)
curl -sL https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v2.2.4/sqlite3mc-2.2.4-sqlite-3.50.4-wasm.zip -o /tmp/sqlite3mc.zip
unzip -q /tmp/sqlite3mc.zip -d /tmp/sqlite3mc-check

# Compute per-file hashes from the extracted jswasm/
(cd /tmp/sqlite3mc-check/sqlite3mc-wasm-3500400/jswasm && sha256sum -- * | sort -k2) > /tmp/upstream-sums

# Compare against repo's SHA256SUMS, excluding our locally-authored d.mts
grep -v 'sqlite3-bundler-friendly\.d\.mts' vendor/jswasm/SHA256SUMS | sort -k2 > /tmp/repo-sums
diff /tmp/upstream-sums /tmp/repo-sums
```

Expected: empty diff. Any output means either upstream files have been modified
or SHA256SUMS claims different hashes than the zip.

## Re-vendoring (bumping the version)

To bump the sqlite3mc version, run the script from anywhere:

```bash
yarn-project/sqlite3mc-wasm/scripts/vendor.sh <version> <sqlite-version> <expected-sha256>
```

Example, verifying the current pinned version:

```bash
scripts/vendor.sh 2.2.4 3.50.4 e73514200d76286d7d4a239589589b4f64d24ac4f4f7b2760e1f07b14ac5f6a5
```

The script downloads the upstream release zip, verifies its SHA256 matches the
third argument, extracts `jswasm/` into `vendor/jswasm/` (preserving our
locally-authored `.d.mts`), and regenerates `SHA256SUMS`. Update this README's
provenance table with the new version + hash when bumping.

## Why `vendor/` is excluded from prettier

The repo's `.prettierignore` includes `sqlite3mc-wasm/vendor/`. Without this,
pre-commit hooks silently reformat the upstream `.js` / `.mjs` files (whitespace
only — semantically identical, but cryptographically different bytes), breaking
the verification chain above. If you see prettier formatting drift in this
directory, the ignore entry is missing or misconfigured.
