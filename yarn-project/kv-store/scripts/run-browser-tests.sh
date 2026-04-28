#!/usr/bin/env bash
# Runs vitest browser tests one test file per vitest invocation.
#
# Why not a single `vitest run` over all files: vitest+chromium have a CDP
# teardown deadlock at test-file transitions under CPU-constrained
# environments (CI3 ISOLATE: --cpus=2). Vitest closes a cohort of CDP TCP
# connections when switching files; chromium's network service can't drain
# them fast enough under contention; vitest's teardown blocks indefinitely
# on the close-handshake. See scripts/repro-browser-hang.sh for the repro.
#
# By running each file in a separate vitest process, the close-handshake
# only happens at process exit (where the OS reaps everything), avoiding
# the cross-file teardown path entirely. Cost is ~5-10s of vite startup
# per file, which is acceptable for ~10 files.
set -euo pipefail

cd "$(dirname "$0")/.."

# Mirror vitest.config.ts include patterns. Bench tests are excluded —
# benchmarks should be run via `yarn bench:browser`, which is already a
# one-shot invocation.
files=$(find src/indexeddb src/sqlite-opfs -name '*.test.ts' 2>/dev/null | sort)

if [ -z "$files" ]; then
  echo "No test files found in src/indexeddb or src/sqlite-opfs"
  exit 0
fi

count=$(echo "$files" | wc -l)
echo "Running $count browser test files (one vitest process per file)"

i=0
for f in $files; do
  i=$((i + 1))
  echo "==> [$i/$count] $f"
  yarn vitest run --config ./vitest.config.ts "$f"
done
