# Wasm BrowserStack Bench Viewer

This rkapp page renders BrowserStack wasm benchmark artifacts as a dashboard:

- headline `setup + prove` time by target
- setup/prove/wall breakdowns
- cold-start fetch, compile, and input decode timings
- `BB_BENCH` wall-time hotspots from `--print-bench`
- progress timeline and Perfetto trace links

The hosted data layout matches the chonk breakdowns style:

```text
$LOGS_DISK_PATH/bench/wasm-bench/<run-id>/trace-manifest.json
$LOGS_DISK_PATH/bench/wasm-bench/<run-id>/<target>/results.jsonl
$LOGS_DISK_PATH/bench/wasm-bench/<run-id>/<target>/progress.jsonl
$LOGS_DISK_PATH/bench/wasm-bench/<run-id>/<target>/traces/*.perfetto.json
```

For S3-backed CI logs, use the same relative layout under
`logs/bench/wasm-bench/<run-id>/...`. Gzipped objects with `.log.gz` are
also supported. The CI publisher uploads the dashboard subset: manifests,
results/progress JSONL, Perfetto traces, and `.bench.json` rows. The upload path is:

```bash
barretenberg/wasm-bench/scripts/upload-rkapp-artifacts.sh \
  barretenberg/wasm-bench/bench-out <run-id>
```

Threaded `BB_BENCH` rows use `time_max` for displayed wall time and keep summed
worker time only as secondary context.

## Local

```bash
cd ci3/dashboard
./wasm-bench/run-local.sh
```

The script uses `/tmp/rkapp-test-data` and seeds it from
`/tmp/pr92-wasm-bench-artifacts/barretenberg/wasm-bench/bench-out` when that
sample exists.
