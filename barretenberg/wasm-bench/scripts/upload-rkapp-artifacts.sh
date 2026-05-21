#!/usr/bin/env bash
set -euo pipefail

bench_out="${1:-barretenberg/wasm-bench/bench-out}"
run_id="${2:-$(git rev-parse HEAD)}"
repo_root="$(git rev-parse --show-toplevel)"
case "$bench_out" in
  /*) ;;
  *) bench_out="$repo_root/$bench_out" ;;
esac

source "$repo_root/ci3/source"

bench_out="$(realpath "$bench_out")"
dashboard_base="${WASM_BENCH_DASHBOARD_BASE_URL:-${DASHBOARD_URL:-http://ci.aztec-labs.com}/wasm-bench}"
dashboard_url="${dashboard_base}?run=${run_id}"
prefix="bench/wasm-bench/$run_id"
dry_run="${WASM_BENCH_UPLOAD_DRY_RUN:-0}"
logs_location="${CI_LOGS_S3_LOCATION:-s3://aztec-ci-artifacts/logs}"

if [ ! -f "$bench_out/trace-manifest.json" ]; then
  echo "wasm-bench rkapp upload: missing $bench_out/trace-manifest.json" >&2
  exit 2
fi

echo "==== wasm-bench dashboard ===="
echo "$dashboard_url"
echo "$logs_location/$prefix/"
echo "================================"

if [[ "${CI:-0}" != "1" && "${WASM_BENCH_UPLOAD:-0}" != "1" && "$dry_run" != "1" ]]; then
  echo "wasm-bench rkapp upload skipped because CI=0 and WASM_BENCH_UPLOAD is unset."
  exit 0
fi

while IFS= read -r -d '' file; do
  rel="${file#"$bench_out"/}"
  case "$rel" in
    trace-manifest.json|trace-manifest.md|*.bench.json|*/results.jsonl|*/progress.jsonl|*/traces/*.perfetto.json) ;;
    *) continue ;;
  esac
  rel_dir="$(dirname "$rel")"
  rel_name="$(basename "$rel")"
  subfolder="$prefix"
  if [ "$rel_dir" != "." ]; then
    subfolder="$prefix/$rel_dir"
  fi

  if [ "$dry_run" = "1" ]; then
    echo "dry-run upload: $rel -> logs/$subfolder/$rel_name.log.gz"
  else
    gzip -c "$file" | cache_s3_transfer_to "$subfolder" "$rel_name"
  fi
done < <(find "$bench_out" -type f -print0 | sort -z)
