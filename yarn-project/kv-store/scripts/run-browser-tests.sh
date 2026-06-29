#!/usr/bin/env bash
# Local-dev entrypoint for `yarn test:browser`: runs every browser test file
# in its own vitest process, sequentially. Delegates per-file dispatch to
# scripts/run_test.sh (which CI also uses for per-file fan-out).
#
# Why not a single `vitest run` over all files: vitest+chromium have a CDP
# teardown deadlock at test-file transitions under CPU-constrained
# environments (CI3 ISOLATE: --cpus=2). Vitest closes a cohort of CDP TCP
# connections when switching files; chromium's network service can't drain
# them fast enough under contention; vitest's teardown blocks indefinitely
# on the close-handshake. By running each file in a separate vitest process
# the close-handshake only happens at process exit, avoiding the cross-file
# teardown path entirely. See scripts/repro-browser-hang.sh for the repro.
set -euo pipefail

cd "$(dirname "$0")/.."

files=$(find src/deprecated/indexeddb src/sqlite-opfs -name '*.test.ts' 2>/dev/null | sort)

if [ -z "$files" ]; then
  echo "No test files found in src/deprecated/indexeddb or src/sqlite-opfs"
  exit 0
fi

count=$(echo "$files" | wc -l)
echo "Running $count browser test files (one vitest process per file)"

i=0
for f in $files; do
  i=$((i + 1))
  echo "==> [$i/$count] $f"
  bash scripts/run_test.sh "$f"
done
