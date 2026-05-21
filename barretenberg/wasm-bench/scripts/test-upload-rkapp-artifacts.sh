#!/usr/bin/env bash
set -euo pipefail

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

bench_out="$tmp/bench-out"
mkdir -p "$bench_out/macos/traces"
printf '{}\n' > "$bench_out/trace-manifest.json"
printf '# manifest\n' > "$bench_out/trace-manifest.md"
printf '[]\n' > "$bench_out/macos-flow.bench.json"
printf '{}\n' > "$bench_out/macos/results.jsonl"
printf '{}\n' > "$bench_out/macos/progress.jsonl"
printf '{"traceEvents":[]}\n' > "$bench_out/macos/traces/trace-flow-1.perfetto.json"
printf 'log\n' > "$bench_out/macos/runner.log"
printf 'key\n' > "$bench_out/macos/bs-local.key"

out="$(WASM_BENCH_UPLOAD_DRY_RUN=1 scripts/upload-rkapp-artifacts.sh "$bench_out" test-run)"

grep -q 'wasm-bench?run=test-run' <<< "$out"
grep -q 'trace-manifest.json.log.gz' <<< "$out"
grep -q 'macos/results.jsonl.log.gz' <<< "$out"
grep -q 'macos/progress.jsonl.log.gz' <<< "$out"
grep -q 'macos/traces/trace-flow-1.perfetto.json.log.gz' <<< "$out"
grep -q 'macos-flow.bench.json.log.gz' <<< "$out"
! grep -q 'runner.log' <<< "$out"
! grep -q 'bs-local.key' <<< "$out"

echo 'upload-rkapp-artifacts ok'
