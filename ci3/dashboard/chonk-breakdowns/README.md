# Chonk Breakdowns - Barretenberg Benchmark Viewer

This viewer displays hierarchical timing breakdowns for Barretenberg's Chonk (IVC) proving system. It shows where time is spent during proof generation, with drill-down capabilities to explore component performance.

## What This Shows

The breakdown viewer visualizes:
- **Hierarchical component timings** from Barretenberg's `--bench_out_hierarchical` flag
- **Time spent in each proving phase**: ChonkAccumulate, ChonkProve, OinkProver, etc.
- **Nested operations**: Click on components to drill down into child operations
- **Percentage distribution**: See which operations dominate proving time

Data comes from CI benchmark runs and is stored in `/logs-disk/bench/bb-breakdown/`.

## Local Testing

### Quick Start

1. **Install dependencies (first time only):**
   ```bash
   cd rkapp
   python3 -m venv venv
   venv/bin/pip install -r requirements.txt
   ```

2. **Fetch sample test data:**
   ```bash
   mkdir -p /tmp/rkapp-test-data/bench/bb-breakdown
   # Fetch all breakdowns for a specific SHA (e.g., f4decd6)
   scp -i ~/.ssh/build_instance_key \
     "ubuntu@ci.aztec-labs.com:/logs-disk/bench/bb-breakdown/*-f4decd6*.log.gz" \
     /tmp/rkapp-test-data/bench/bb-breakdown/
   ```

3. **Start the server:**
   ```bash
   cd rkapp
   ./chonk-breakdowns/run-local.sh
   ```

4. **Test in browser:**
   - Open: http://localhost:8080/chonk-breakdowns
   - Enter credentials when prompted
   - The SHA field will auto-populate with the latest commit from `aztec-packages` `next` branch
   - Select Runtime: `native` or `wasm`
   - The Flow dropdown will dynamically show flows available for the selected runtime and SHA
   - Click "Load Breakdown"

## What the Script Does

- Sets `LOGS_DISK_PATH=/tmp/rkapp-test-data` to use local test data
- Sets `REDIS_TIMEOUT=0.1` for fast failover to disk
- Runs rk.py directly (no mocking needed)

## Environment Variables

- `LOGS_DISK_PATH` - Path to logs directory (default: `/logs-disk`)
- `REDIS_HOST` - Redis hostname (default for local: `localhost`)
- `REDIS_PORT` - Redis port (default for local: `9999` - non-existent)
- `REDIS_TIMEOUT` - Connection timeout in seconds (default: `0.1`)
