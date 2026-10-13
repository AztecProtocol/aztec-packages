# Chonk Breakdowns - Barretenberg Benchmark Viewer

This viewer displays hierarchical timing breakdowns for Barretenberg's Chonk (IVC) proving system. It shows where time is spent during proof generation, with drill-down capabilities to explore component performance.

It shows the per-phase timings that `bb`'s `--bench_out_hierarchical` flag produces (ChonkAccumulate, ChonkProve, OinkProver, etc.), with each phase's share of the total; click a component to drill down into its child operations.

`barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh` uploads the breakdowns from CI benchmark runs to S3, under `s3://$S3_LOGS_BUCKET/$S3_LOGS_PREFIX/bench/bb-breakdown/` (default `s3://aztec-ci-artifacts/logs/bench/bb-breakdown/`), one `<runtime>-<flow>-<sha>.log.gz` per run (memory profiles sit beside them as `memory-<runtime>-<flow>-<sha>.log.gz`). The viewer (route `/chonk-breakdowns` in `ci3/dashboard/rk.py`) reads them from there.

## Local Testing

1. **Start the server** from `ci3/dashboard`, with AWS credentials that can read the bucket above:
   ```bash
   cd ci3/dashboard
   ./chonk-breakdowns/run-local.sh
   ```
   On first run, the script creates `ci3/dashboard/venv` (not gitignored; do not commit it) and installs `requirements.txt`.

2. **Test in browser:**
   - Open: http://localhost:8080/chonk-breakdowns
   - The dashboard uses HTTP basic auth (user `aztec`, password `$DASHBOARD_PASSWORD`). If `DASHBOARD_PASSWORD` is unset, no auth is applied.
   - The SHA field will auto-populate with the latest commit from `aztec-packages` `next` branch
   - Select Runtime: `native` or `wasm`
   - The Flow dropdown will dynamically show flows available for the selected runtime and SHA
   - Click "Load Breakdown"

## Environment Variables

- `S3_LOGS_BUCKET` - Bucket holding the breakdowns (default: `aztec-ci-artifacts`)
- `S3_LOGS_PREFIX` - Key prefix (default: `logs`)
- `DASHBOARD_PASSWORD` - Basic-auth password; unset means no auth
- `LOGS_DISK_PATH` - Directory where the `ci-metrics` sidecar that `rk.py` starts keeps `metrics.db` (default: `/logs-disk`; `run-local.sh` sets `/tmp/ci-dashboard-local`)
- `REDIS_HOST` - Redis hostname (default: `localhost`)
- `REDIS_PORT` - Redis port (default: `6379`; `run-local.sh` sets `9999`, where no redis runs, because the breakdowns viewer does not need redis)
