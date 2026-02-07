# CI Cost and Metrics Tracking System -- Implementation Plan

## Overview

This plan adds a comprehensive cost and metrics tracking system to the existing rkapp dashboard at `ci.aztec-labs.com`. It introduces SQLite as a persistent analytical data store, extends the existing Redis pub/sub system, instruments CI scripts for richer metadata, publishes CI build times as benchmarks, and delivers 7 new Chart.js dashboard views in the existing terminal aesthetic.

**Architecture decision: SQLite over Postgres.** The bastion host (`ci-bastion.aztecprotocol.com`) already runs the dashboard as a single Docker container. SQLite eliminates operational complexity. The dataset is modest (hundreds of CI runs/day, daily cost snapshots). A single WAL-mode SQLite database at `/logs-disk/metrics.db` gives concurrent read/write with zero additional infrastructure.

**Architecture decision: event-driven + polling hybrid.** Redis pub/sub provides real-time CI run tracking. Daily cron-style polling (via background threads, matching the existing `rk_billing.py` pattern) handles AWS Cost Explorer, GCP BigQuery, and GitHub API data. This keeps the system simple with no additional message queue.

---

## 1. Data Architecture

### 1.1 SQLite Schema

Single database file: `/logs-disk/metrics.db`

```sql
-- Enable WAL mode for concurrent reads during writes
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- COST TABLES
-- ============================================================

-- Daily AWS costs by service, pulled from Cost Explorer API
CREATE TABLE aws_daily_costs (
    date       TEXT NOT NULL,       -- YYYY-MM-DD
    service    TEXT NOT NULL,       -- e.g. 'Amazon Elastic Compute Cloud - Compute', 'Amazon CloudFront'
    category   TEXT NOT NULL,       -- normalized: 'ec2_spot', 'ec2_ondemand', 'cloudfront', 's3', 'elasticache', 'ecr', 'ecs', 'vpc', 'elb', 'efs', 'other'
    amount_usd REAL NOT NULL,
    currency   TEXT NOT NULL DEFAULT 'USD',
    fetched_at TEXT NOT NULL,       -- ISO timestamp of when we fetched this
    PRIMARY KEY (date, service)
);
CREATE INDEX idx_aws_costs_date ON aws_daily_costs(date);
CREATE INDEX idx_aws_costs_category ON aws_daily_costs(category);

-- Daily GCP namespace costs (replaces JSON files on disk over time)
-- Keeps the existing BigQuery fetch, just writes to SQLite instead of/in addition to JSON
CREATE TABLE gcp_namespace_costs (
    date       TEXT NOT NULL,       -- YYYY-MM-DD
    namespace  TEXT NOT NULL,
    category   TEXT NOT NULL,       -- 'compute_spot', 'compute_ondemand', 'network', 'storage'
    amount_usd REAL NOT NULL,
    PRIMARY KEY (date, namespace, category)
);
CREATE INDEX idx_gcp_costs_date ON gcp_namespace_costs(date);
CREATE INDEX idx_gcp_costs_ns ON gcp_namespace_costs(namespace);

-- ============================================================
-- CI RUN TABLES
-- ============================================================

-- One row per CI job (a run_id groups multiple jobs)
CREATE TABLE ci_runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id         TEXT NOT NULL,       -- groups jobs in a single CI invocation
    job_id         TEXT NOT NULL,
    timestamp_ms   INTEGER NOT NULL,    -- epoch ms, from Redis sorted set score
    complete_ms    INTEGER,             -- epoch ms when finished
    status         TEXT NOT NULL,       -- 'RUNNING', 'PASSED', 'FAILED', 'INACTIVE'
    dashboard      TEXT NOT NULL,       -- 'next', 'prs', 'master', 'staging', 'releases', 'nightly', 'network'
    ref_name       TEXT NOT NULL,
    target_branch  TEXT,
    commit_hash    TEXT,
    msg            TEXT,
    name           TEXT NOT NULL,
    author         TEXT NOT NULL,
    arch           TEXT,                -- 'x86_64', 'aarch64'
    spot           INTEGER,             -- 1=spot, 0=on-demand
    instance_type  TEXT,                -- NEW: 'm6a.48xlarge' etc. from EC2 metadata
    instance_vcpus INTEGER,             -- NEW: 192, 128, 64 etc.
    pr_number      INTEGER,             -- NEW: extracted from merge queue ref or PR
    cost_usd       REAL,                -- NEW: computed from duration * hourly rate
    UNIQUE(run_id, job_id, timestamp_ms)
);
CREATE INDEX idx_ci_runs_run_id ON ci_runs(run_id);
CREATE INDEX idx_ci_runs_status ON ci_runs(status);
CREATE INDEX idx_ci_runs_dashboard ON ci_runs(dashboard);
CREATE INDEX idx_ci_runs_author ON ci_runs(author);
CREATE INDEX idx_ci_runs_pr ON ci_runs(pr_number);
CREATE INDEX idx_ci_runs_date ON ci_runs(timestamp_ms);

-- ============================================================
-- TEST EVENT TABLES
-- ============================================================

-- Individual test results from Redis pub/sub
CREATE TABLE test_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    status         TEXT NOT NULL,       -- 'started', 'failed', 'flaked', 'passed'
    test_cmd       TEXT NOT NULL,
    log_url        TEXT,
    ref_name       TEXT NOT NULL,
    commit_hash    TEXT,
    commit_author  TEXT,
    commit_msg     TEXT,
    exit_code      INTEGER,
    duration_secs  REAL,
    is_scenario    INTEGER DEFAULT 0,
    owners         TEXT,                -- JSON array of Slack UIDs
    flake_group_id TEXT,
    timestamp      TEXT NOT NULL        -- ISO timestamp
);
CREATE INDEX idx_test_events_status ON test_events(status);
CREATE INDEX idx_test_events_ref ON test_events(ref_name);
CREATE INDEX idx_test_events_ts ON test_events(timestamp);
CREATE INDEX idx_test_events_cmd ON test_events(test_cmd);

-- ============================================================
-- DEPLOYMENT TABLES
-- ============================================================

-- Tracks deploy-staging-networks and deploy-and-test-scenarios runs
CREATE TABLE deployments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id         TEXT NOT NULL,
    workflow_name  TEXT NOT NULL,       -- 'deploy-staging-networks', 'ci-network-scenario'
    ref_name       TEXT NOT NULL,
    namespace      TEXT,
    status         TEXT NOT NULL,       -- 'success', 'failure', 'cancelled'
    started_at     TEXT NOT NULL,       -- ISO timestamp
    completed_at   TEXT,
    duration_secs  REAL,
    trigger        TEXT,                -- 'tag', 'label', 'nightly'
    UNIQUE(run_id, workflow_name)
);
CREATE INDEX idx_deployments_workflow ON deployments(workflow_name);
CREATE INDEX idx_deployments_status ON deployments(status);

-- ============================================================
-- BRANCH LAG TABLE
-- ============================================================

-- Daily snapshot of branch positions relative to each other
CREATE TABLE branch_lag (
    date           TEXT NOT NULL,       -- YYYY-MM-DD
    source_branch  TEXT NOT NULL,       -- e.g. 'next'
    target_branch  TEXT NOT NULL,       -- e.g. 'staging-public'
    commits_behind INTEGER NOT NULL,
    days_behind    REAL,                -- based on oldest unique commit timestamp
    PRIMARY KEY (date, source_branch, target_branch)
);

-- ============================================================
-- PR LIFECYCLE TABLE
-- ============================================================

-- Tracks PR open-to-merge lifecycle and associated CI cost
CREATE TABLE pr_lifecycle (
    pr_number      INTEGER PRIMARY KEY,
    author         TEXT NOT NULL,
    title          TEXT,
    created_at     TEXT NOT NULL,       -- ISO timestamp
    merged_at      TEXT,
    closed_at      TEXT,
    base_branch    TEXT,
    ci_runs_count  INTEGER DEFAULT 0,
    ci_cost_usd    REAL DEFAULT 0,      -- sum of ci_runs.cost_usd for this PR
    merge_time_hrs REAL                 -- hours from created_at to merged_at
);
CREATE INDEX idx_pr_lifecycle_author ON pr_lifecycle(author);
CREATE INDEX idx_pr_lifecycle_merged ON pr_lifecycle(merged_at);

-- ============================================================
-- METADATA / SYNC TABLE
-- ============================================================

-- Tracks last successful sync for each data source
CREATE TABLE sync_state (
    source     TEXT PRIMARY KEY,        -- 'aws_costs', 'gcp_billing', 'github_prs', 'github_workflows', 'branch_lag', 'redis_backfill'
    last_sync  TEXT NOT NULL,           -- ISO timestamp
    last_date  TEXT,                    -- last date processed (YYYY-MM-DD) for date-based sources
    status     TEXT DEFAULT 'ok',
    error_msg  TEXT
);
```

### 1.2 Design Rationale

- **`ci_runs` is the central table.** Every CI job that touches Redis also lands here. The `cost_usd` column is computed on insert: `(complete_ms - timestamp_ms) / 3600000 * hourly_rate`. Hourly rates are derived from `instance_type` and `spot` flag.
- **`test_events` captures the pub/sub stream.** This powers flake rate, failure breakdown, and scenario test metrics.
- **`gcp_namespace_costs` replaces JSON files** as the canonical store. The existing JSON-on-disk system remains as a read fallback during migration, but new data writes to SQLite.
- **`branch_lag` is a daily snapshot** because git operations are cheap and we only need daily granularity.
- **`pr_lifecycle` is denormalized** for query speed. `ci_cost_usd` is updated as CI runs complete.

---

## 2. Data Collection

### 2.1 AWS Cost Explorer (Daily Poll)

**New file: `ci3/dashboard/rk_aws_costs.py`**

```python
"""AWS Cost Explorer daily fetch -> SQLite."""
import boto3
from datetime import datetime, timedelta

AWS_ACCOUNT_ID = '278380418400'

# Normalize AWS service names to dashboard categories
SERVICE_CATEGORY_MAP = {
    'Amazon Elastic Compute Cloud - Compute': 'ec2',
    'Amazon CloudFront': 'cloudfront',
    'Amazon ElastiCache': 'elasticache',
    'Amazon Elastic Container Service': 'ecs',
    'Amazon Virtual Private Cloud': 'vpc',
    'Elastic Load Balancing': 'elb',
    'Amazon Elastic File System': 'efs',
    'Amazon Simple Storage Service': 's3',
    'Amazon EC2 Container Registry (ECR)': 'ecr',
}

# EC2 spot pricing for cost attribution
SPOT_RATES = {
    'm6a.48xlarge': {'vcpus': 192, 'hourly_spot': 8.31, 'hourly_ondemand': 16.56},
    'm6a.32xlarge': {'vcpus': 128, 'hourly_spot': 5.54, 'hourly_ondemand': 11.04},
    'm6a.16xlarge': {'vcpus': 64, 'hourly_spot': 2.77, 'hourly_ondemand': 5.52},
}

def fetch_aws_daily_costs(date_from: str, date_to: str) -> list[dict]:
    """Query AWS Cost Explorer for daily costs by service."""
    client = boto3.client('ce', region_name='us-east-2')
    response = client.get_cost_and_usage(
        TimePeriod={'Start': date_from, 'End': date_to},
        Granularity='DAILY',
        Metrics=['UnblendedCost'],
        GroupBy=[{'Type': 'DIMENSION', 'Key': 'SERVICE'}],
    )
    rows = []
    for result in response['ResultsByTime']:
        date = result['TimePeriod']['Start']
        for group in result['Groups']:
            service = group['Keys'][0]
            amount = float(group['Metrics']['UnblendedCost']['Amount'])
            category = SERVICE_CATEGORY_MAP.get(service, 'other')
            rows.append({
                'date': date,
                'service': service,
                'category': category,
                'amount_usd': round(amount, 4),
            })
    return rows
```

**Schedule:** Background thread, runs daily at 06:00 UTC (matching the existing `rk_billing.py` pattern). Fetches the previous day. On first run, backfills 90 days.

**Dependency:** `boto3` added to `requirements.txt`. AWS credentials already available in the environment (same credentials used by CI).

### 2.2 GCP BigQuery Metering (Extend Existing)

**Modify: `ci3/dashboard/rk_billing.py`**

The existing `_fetch_from_bigquery` function already works. Changes:
1. After writing JSON files (keep for backward compat), also INSERT into `gcp_namespace_costs` table.
2. The `ensure_billing_data` function gains a SQLite write path.
3. The API endpoints (`/api/billing/data`) read from SQLite first, fall back to JSON files.

This is a parallel-write migration: both JSON and SQLite are populated. Once stable, JSON writes can be removed.

### 2.3 Redis CI Run Data (Real-time + Backfill)

**New file: `ci3/dashboard/rk_metrics.py`**

This is the core new module. It has two responsibilities:

**A. Redis Pub/Sub Listener (real-time)**

```python
"""Subscribe to Redis pub/sub channels and write events to SQLite."""
import threading
import json
import sqlite3

CHANNELS = [
    'ci:test:started',
    'ci:test:failed',
    'ci:test:flaked',
    'ci:run:started',
    'ci:run:completed',
]

def start_redis_listener(db_path: str, redis_conn):
    """Start a background thread that subscribes to CI event channels."""
    def listener():
        pubsub = redis_conn.pubsub()
        pubsub.subscribe(*CHANNELS)
        for message in pubsub.listen():
            if message['type'] != 'message':
                continue
            channel = message['channel']
            if isinstance(channel, bytes):
                channel = channel.decode()
            data = json.loads(message['data'])
            handle_event(db_path, channel, data)

    t = threading.Thread(target=listener, daemon=True)
    t.start()
    return t
```

**B. Periodic Redis Sorted Set Scan (backfill)**

Every 5 minutes, scan all `ci-run-{section}` sorted sets and upsert into `ci_runs`. This catches any runs that were logged before the listener started, and serves as the primary ingestion path for CI run metadata (since `log_ci_run` writes to sorted sets, not pub/sub).

```python
SECTIONS = ['next', 'prs', 'master', 'staging', 'releases', 'nightly', 'network']

def backfill_ci_runs(db_path: str, redis_conn):
    """Scan Redis sorted sets and upsert CI run data into SQLite."""
    conn = sqlite3.connect(db_path)
    for section in SECTIONS:
        key = f'ci-run-{section}'
        entries = redis_conn.zrange(key, 0, -1, withscores=True)
        for entry_bytes, score in entries:
            data = json.loads(entry_bytes)
            cost = compute_run_cost(data)
            conn.execute('''
                INSERT OR REPLACE INTO ci_runs
                (run_id, job_id, timestamp_ms, complete_ms, status, dashboard,
                 ref_name, msg, name, author, arch, spot, instance_type,
                 instance_vcpus, pr_number, cost_usd)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data.get('run_id'), data.get('job_id'), data.get('timestamp'),
                data.get('complete'), data.get('status'), section,
                data.get('name'), data.get('msg'), data.get('name'),
                data.get('author'), data.get('arch'),
                1 if data.get('spot') else 0,
                data.get('instance_type'), data.get('instance_vcpus'),
                extract_pr_number(data.get('name', '')), cost,
            ))
    conn.commit()
    conn.close()
```

### 2.4 GitHub API (Daily Poll)

**New file: `ci3/dashboard/rk_github.py`**

Fetches PR lifecycle data and workflow run metadata.

```python
"""GitHub API polling for PR lifecycle and workflow run data."""
import subprocess
import json

def fetch_recent_prs(since_date: str, limit: int = 100) -> list[dict]:
    """Fetch recently merged/updated PRs via gh CLI."""
    result = subprocess.run(
        ['gh', 'pr', 'list', '--repo', 'AztecProtocol/aztec-packages',
         '--state', 'merged', '--limit', str(limit),
         '--json', 'number,author,title,createdAt,mergedAt,closedAt,baseRefName'],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

def fetch_workflow_runs(workflow: str, branch: str, limit: int = 50) -> list[dict]:
    """Fetch workflow runs for deployment tracking."""
    result = subprocess.run(
        ['gh', 'run', 'list', '--repo', 'AztecProtocol/aztec-packages',
         '--workflow', workflow, '--branch', branch, '--limit', str(limit),
         '--json', 'databaseId,status,conclusion,createdAt,updatedAt,headBranch,headSha'],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)
```

**Schedule:** Daily at 07:00 UTC. Fetches PRs merged in the last 7 days (with overlap for idempotency).

### 2.5 Branch Lag (Daily Poll)

**New function in `ci3/dashboard/rk_github.py`**

```python
BRANCH_PAIRS = [
    ('next', 'staging-public'),
    ('next', 'testnet'),
    ('staging-public', 'testnet'),
]

def compute_branch_lag(source: str, target: str) -> dict:
    """Compute commits behind and days lag between two branches."""
    result = subprocess.run(
        ['git', 'rev-list', '--count', f'{target}..{source}'],
        capture_output=True, text=True, cwd='/path/to/repo'
    )
    commits_behind = int(result.stdout.strip())
    return {'commits_behind': commits_behind, 'days_behind': days_behind}
```

**Note:** The bastion does not have the full git repo. Recommended approach: a small GitHub Actions workflow that computes lag and POSTs results to `/api/metrics/branch-lag`.

### 2.6 EC2 Instance Metadata (CI Instrumentation)

See Section 4 for the exact changes to `ci3/log_ci_run`.

---

## 3. Redis Event System

### 3.1 Existing Channels (Already Published, Not Consumed)

| Channel | Publisher | Payload |
|---------|-----------|---------|
| `ci:test:started` | `ci3/run_test_cmd` | `{status, test_cmd, log_id, log_url, ref_name, commit_hash, commit_author, commit_msg, is_scenario_test, timestamp}` |
| `ci:test:failed` | `ci3/run_test_cmd` | `{status, test_cmd, log_url, ref_name, commit_hash, commit_author, commit_msg, exit_code, duration_seconds, is_scenario_test, timestamp}` |
| `ci:test:flaked` | `ci3/run_test_cmd` | `{status, test_cmd, log_url, ref_name, commit_hash, commit_author, commit_msg, exit_code, duration_seconds, owners, flake_group_id, timestamp}` |

### 3.2 New Channels to Add

| Channel | Publisher | Payload |
|---------|-----------|---------|
| `ci:run:started` | `ci3/log_ci_run` (new) | `{run_id, job_id, timestamp, status, name, author, arch, spot, instance_type, instance_vcpus, dashboard}` |
| `ci:run:completed` | `ci3/log_ci_run` (new) | `{run_id, job_id, timestamp, complete, status, name, author, arch, spot, instance_type, cost_usd, dashboard}` |

### 3.3 Event Processing in rkapp

The `rk_metrics.py` listener handles all channels:

- **`ci:test:*`** -> INSERT into `test_events` table
- **`ci:run:started`** -> INSERT into `ci_runs` table (status=RUNNING)
- **`ci:run:completed`** -> UPDATE `ci_runs` row with complete_ms, status, cost_usd. Also UPDATE `pr_lifecycle.ci_cost_usd` if PR is tracked.

### 3.4 Sorted Set Backfill

The 5-minute backfill scan of `ci-run-{section}` sorted sets is the belt-and-suspenders approach. Even if pub/sub messages are lost (container restart, network blip), the sorted sets are persistent and the backfill will catch up. The UPSERT (`INSERT OR REPLACE`) ensures idempotency.

---

## 4. CI Instrumentation Changes

### 4.1 `ci3/log_ci_run` -- Add Instance Type and Pub/Sub

**Current state (line 37):**
```bash
[ "$(aws_get_meta_data instance-life-cycle)" == "spot" ] && spot=true || spot=false
```

**Changes to add after line 37:**
```bash
# Capture instance type for cost attribution
instance_type=$(aws_get_meta_data instance-type)
instance_vcpus=$(nproc)

# Extract PR number from merge queue ref
pr_number=""
if [[ "$name" =~ pr-([0-9]+) ]]; then
  pr_number="${BASH_REMATCH[1]}"
fi
```

**Changes to the JSON construction (line 46-56):**
```bash
json=$(jq -c -j -n \
    --argjson timestamp "$key" \
    --arg run_id "${RUN_ID:-}" \
    --arg job_id "${JOB_ID:-}" \
    --arg status "$status" \
    --arg msg "$msg" \
    --arg name "$name" \
    --arg author "$author" \
    --arg arch "$(arch)" \
    --argjson spot "$spot" \
    --arg instance_type "${instance_type:-unknown}" \
    --argjson instance_vcpus "${instance_vcpus:-0}" \
    --arg pr_number "${pr_number:-}" \
    --arg dashboard "${range_key#ci-run-}" \
    '{timestamp: $timestamp, run_id: $run_id, job_id: $job_id, status: $status, msg: $msg, name: $name, author: $author, arch: $arch, spot: $spot, instance_type: $instance_type, instance_vcpus: $instance_vcpus, pr_number: $pr_number, dashboard: $dashboard}')
```

**Add pub/sub publish after the ZADD (new lines after line 58):**
```bash
# Publish run event for real-time metrics ingestion
if [ "$status" == "RUNNING" ]; then
  redis_publish "ci:run:started" "$json"
else
  redis_publish "ci:run:completed" "$json"
fi
```

### 4.2 Cost Computation

Hourly rates stored as a Python dict in `rk_metrics.py`:

```python
# Spot bid prices from AWS (us-east-2, Jan 2026)
INSTANCE_HOURLY_RATES = {
    ('m6a.48xlarge', True):  8.31,    # 192 vCPU spot
    ('m6a.48xlarge', False): 16.56,   # 192 vCPU on-demand
    ('m6a.32xlarge', True):  5.54,    # 128 vCPU spot
    ('m6a.32xlarge', False): 11.04,
    ('m6a.16xlarge', True):  2.77,    # 64 vCPU spot
    ('m6a.16xlarge', False): 5.52,
    # ARM64
    ('r7g.16xlarge', True):  1.97,    # 64 vCPU spot
    ('r7g.16xlarge', False): 3.94,
}

# Fallback: $0.0433/vCPU-hour spot, $0.0864/vCPU-hour on-demand
FALLBACK_VCPU_HOUR = {True: 0.0433, False: 0.0864}

def compute_run_cost(data: dict) -> float | None:
    if not data.get('complete') or not data.get('timestamp'):
        return None
    hours = (data['complete'] - data['timestamp']) / 3_600_000
    instance_type = data.get('instance_type', 'unknown')
    is_spot = bool(data.get('spot'))
    rate = INSTANCE_HOURLY_RATES.get((instance_type, is_spot))
    if not rate:
        vcpus = data.get('instance_vcpus', 192)
        rate = vcpus * FALLBACK_VCPU_HOUR[is_spot]
    return round(hours * rate, 4)
```

---

## 5. Benchmark Publishing

### 5.1 Adding CI Build Times to the Benchmark Pipeline

**Approach: Generate `bench-out/ci-timing.bench.json` in `bootstrap.sh`**

The existing benchmark system already merges all `bench-out/*.bench.json` files via `bench_merge`. We add a new function that captures CI phase timing and writes a bench file.

**Add to `bootstrap.sh`:**

```bash
# Array to collect phase timings
declare -a CI_PHASE_TIMINGS=()

function ci_phase_start {
  export _CI_PHASE_NAME="$1"
  export _CI_PHASE_START=$SECONDS
}

function ci_phase_end {
  if [ -n "${_CI_PHASE_NAME:-}" ]; then
    local elapsed=$(( SECONDS - _CI_PHASE_START ))
    CI_PHASE_TIMINGS+=("{\"name\":\"ci/${_CI_PHASE_NAME}\",\"value\":${elapsed},\"unit\":\"seconds\"}")
    unset _CI_PHASE_NAME _CI_PHASE_START
  fi
}

function ci_timing_bench {
  if [ "${CI_FULL:-0}" -eq 0 ]; then return; fi
  mkdir -p bench-out
  local total=$SECONDS
  CI_PHASE_TIMINGS+=("{\"name\":\"ci/total_duration\",\"value\":${total},\"unit\":\"seconds\"}")
  printf '[%s]' "$(IFS=,; echo "${CI_PHASE_TIMINGS[*]}")" | jq '.' > bench-out/ci-timing.bench.json
}
```

Then wrap existing CI phases:
```bash
ci_phase_start "build"
build
ci_phase_end

ci_phase_start "test"
test
ci_phase_end

ci_phase_start "bench"
bench
ci_phase_end

ci_timing_bench
```

This produces benchmarks like:
- `ci/build` -- 1200 seconds
- `ci/test` -- 900 seconds
- `ci/bench` -- 600 seconds
- `ci/total_duration` -- 2847 seconds

All tracked historically on GitHub Pages via the existing `benchmark-action/github-action-benchmark` pipeline.

---

## 6. API Design

### 6.1 Endpoint Inventory

All endpoints follow the pattern established by the existing billing API: `/api/{domain}/{endpoint}?from=&to=&granularity=`

#### Cost Endpoints

```
GET /api/costs/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=daily|weekly|monthly
  Returns: {
    aws: [{date, categories: {ec2: N, cloudfront: N, ...}, total: N}],
    gcp: [{date, categories: {compute_spot: N, compute_ondemand: N, network: N, storage: N}, total: N}],
    combined_total: N
  }

GET /api/costs/aws?from=&to=&granularity=
  Returns: [{date, service, category, amount_usd}]

GET /api/costs/runners?from=&to=&granularity=
  Returns: {
    by_date: [{date, spot_cost: N, ondemand_cost: N, total: N}],
    by_instance_type: {m6a.48xlarge: N, ...},
    by_job_type: {merge_queue: N, fast: N, full: N, ...},
    spot_vs_ondemand: {spot_pct: N, ondemand_pct: N}
  }
```

#### CI Performance Endpoints

```
GET /api/ci/performance?from=&to=&branch=next&granularity=
  Returns: {
    by_date: [{date, total_runs: N, passed: N, failed: N, flaked: N,
               pass_rate: N, flake_rate: N, failure_rate: N}],
    top_flakes: [{test_cmd, count, owners}],
    top_failures: [{test_cmd, count}],
    avg_duration_mins: N,
    p95_duration_mins: N
  }

GET /api/ci/runs?from=&to=&status=&author=&dashboard=&limit=100&offset=0
  Returns: [{run_id, job_id, status, name, author, duration_mins, cost_usd, spot, instance_type}]
```

#### Deployment Endpoints

```
GET /api/deployments/speed?from=&to=&workflow=
  Returns: {
    by_date: [{date, median_duration_mins: N, p95_duration_mins: N, count: N}],
    success_rate: N,
    recent: [{run_id, workflow_name, status, duration_mins, started_at}]
  }
```

#### Branch Lag Endpoints

```
GET /api/branches/lag?from=&to=
  Returns: {
    pairs: [
      {source: 'next', target: 'staging-public',
       history: [{date, commits_behind: N, days_behind: N}],
       current: {commits_behind: N, days_behind: N}}
    ]
  }
```

#### PR Metrics Endpoints

```
GET /api/prs/metrics?from=&to=&author=
  Returns: {
    by_date: [{date, avg_cost: N, avg_merge_time_hrs: N, pr_count: N}],
    by_author: [{author, total_cost: N, pr_count: N, avg_merge_time_hrs: N}],
    cost_distribution: [{bucket, count}],
    merge_time_distribution: [{bucket, count}]
  }
```

### 6.2 Flask Route Registration Pattern

Following the existing pattern where `rk_billing.py` provides logic and `rk.py` registers routes:

```python
# In rk.py, add imports:
from rk_metrics import get_ci_performance, get_deployment_speed
from rk_aws_costs import get_aws_costs_overview
from rk_github import get_branch_lag
from rk_prs import get_pr_metrics

# Generic dashboard server
def serve_dashboard(name):
    path = Path(f'dashboard-views/{name}.html')
    if path.exists():
        return path.read_text()
    return f"Dashboard {name} not found", 404
```

### 6.3 Authentication

All new endpoints use the existing `@auth.login_required` decorator (HTTP Basic with `aztec/DASHBOARD_PASSWORD`). No changes to auth.

---

## 7. Frontend

### 7.1 Shared Navigation

All 7 dashboard views share a navigation bar:

```html
<div class="nav">
  <a href="/">&lt; CI</a>
  <span class="sep">|</span>
  <a href="/cost-overview" class="nav-link">cost overview</a>
  <a href="/namespace-billing" class="nav-link">namespace billing</a>
  <a href="/ci-performance" class="nav-link">ci performance</a>
  <a href="/deploy-speed" class="nav-link">deploy speed</a>
  <a href="/branch-lag" class="nav-link">branch lag</a>
  <a href="/pr-metrics" class="nav-link">pr metrics</a>
  <a href="/runner-costs" class="nav-link">runner costs</a>
</div>
```

**Styling** (matching `billing-dashboard.html`):
```css
.nav { margin: 8px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.nav a { color: #58a6ff; text-decoration: none; font-size: 13px; }
.nav a:hover { text-decoration: underline; }
.nav a.active { color: #fff; border-bottom: 1px solid #58a6ff; }
.sep { color: #333; }
```

### 7.2 Shared Chart.js Dark Theme

```javascript
const DARK_THEME = {
  grid: { color: '#181818' },
  ticks: { color: '#555', font: { family: 'monospace', size: 11 } },
};
const COLORS = {
  primary: '#58a6ff', success: '#3fb950', purple: '#d2a8ff',
  warning: '#f0883e', danger: '#f85149',
  spot: '#3fb950', ondemand: '#58a6ff', network: '#d2a8ff', storage: '#f0883e',
};
Chart.defaults.color = '#888';
Chart.defaults.font.family = 'monospace';
Chart.defaults.font.size = 10;
```

### 7.3 Goal Lines Plugin

```javascript
const goalLinePlugin = {
  id: 'goalLine',
  afterDraw(chart) {
    const goals = chart.options.plugins.goalLine?.goals || [];
    const ctx = chart.ctx;
    const yAxis = chart.scales.y;
    goals.forEach(({ value, label, color }) => {
      const y = yAxis.getPixelForValue(value);
      ctx.save();
      ctx.strokeStyle = color || '#f0883e';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chart.chartArea.left, y);
      ctx.lineTo(chart.chartArea.right, y);
      ctx.stroke();
      ctx.fillStyle = color || '#f0883e';
      ctx.font = '10px monospace';
      ctx.fillText(label || '', chart.chartArea.right + 4, y + 3);
      ctx.restore();
    });
  }
};
Chart.register(goalLinePlugin);
```

### 7.4 Dashboard View Specifications

#### View A: Cost Overview (`dashboard-views/cost-overview.html`)
- **Top stats:** Total GCP+AWS spend, daily average, month-over-month delta
- **Chart 1 (full width, stacked bar):** Combined daily spend. AWS + GCP categories stacked.
- **Chart 2 (half width, horizontal bar):** Service category breakdown
- **Chart 3 (half width, doughnut):** AWS vs GCP split
- **Table:** Daily breakdown sortable by date, AWS total, GCP total, combined total

#### View B: Namespace Billing (`billing-dashboard.html` -- already exists)
- Add the shared nav bar to the top. No other changes needed.

#### View C: CI Performance (`dashboard-views/ci-performance.html`)
- **Top stats:** Pass rate (%), flake rate (%), failure rate (%), avg duration, total runs
- **Chart 1 (full width, line):** Pass rate / flake rate / failure rate over time. Goal lines for targets.
- **Chart 2 (half width, bar):** Run volume per day (stacked by status: passed/failed/flaked)
- **Chart 3 (half width, horizontal bar):** Top 10 flaky tests
- **Table:** Recent failures and flakes with links to logs

#### View D: Deploy Speed (`dashboard-views/deploy-speed.html`)
- **Top stats:** Median deploy time, P95 deploy time, success rate, deploy count
- **Chart 1 (full width, line):** Median and P95 deploy duration over time. Goal line.
- **Chart 2 (half width, bar):** Deploy count per day (stacked by success/failure)
- **Chart 3 (half width, scatter):** Issue-to-fix-deployed time

#### View E: Branch Lag (`dashboard-views/branch-lag.html`)
- **Top stats:** Current lag for each pair (commits behind, days behind)
- **Chart 1 (full width, multi-line):** Days behind over time for each branch pair
- **Chart 2 (full width, stacked area):** Commits behind over time
- **Colored indicators:** Green < 2 days, yellow 2-5 days, red > 5 days

#### View F: PR Metrics (`dashboard-views/pr-metrics.html`)
- **Top stats:** Avg cost per PR, avg merge time, total PRs merged, total CI spend
- **Chart 1 (full width, bar+line combo):** Cost per PR (bar) with merge time overlay (line)
- **Chart 2 (half width, horizontal bar):** Top 10 authors by CI cost
- **Chart 3 (half width, histogram):** Merge time distribution
- **Table:** PR list with cost, merge time, author, sortable

#### View G: Runner Costs (`dashboard-views/runner-costs.html`)
- **Top stats:** Total runner spend, spot %, avg cost per run, spot eviction count
- **Chart 1 (full width, stacked bar):** Daily runner cost, spot vs on-demand
- **Chart 2 (half width, doughnut):** Instance type breakdown
- **Chart 3 (half width, horizontal bar):** Cost by job type
- **Table:** Individual runs with cost, duration, instance type, spot flag

### 7.5 File Organization

```
ci3/dashboard/
  rk.py                    # Flask app (add new routes)
  rk_core.py               # Redis connection (no changes)
  rk_billing.py            # GCP billing (modify to dual-write SQLite)
  rk_metrics.py            # NEW: SQLite init, Redis listener, CI run ingestion
  rk_aws_costs.py          # NEW: AWS Cost Explorer polling
  rk_github.py             # NEW: GitHub API + branch lag polling
  rk_prs.py                # NEW: PR lifecycle tracking
  rk_db.py                 # NEW: SQLite connection management, schema migration
  dashboard-views/
    cost-overview.html      # NEW
    ci-performance.html     # NEW
    deploy-speed.html       # NEW
    branch-lag.html         # NEW
    pr-metrics.html         # NEW
    runner-costs.html       # NEW
  namespace-billing/
    billing-dashboard.html  # MODIFY: add shared nav
```

---

## 8. Implementation Phases

### Phase 1: Foundation
**Deliverables:** SQLite database, CI instrumentation, Redis ingestion

1. Create `rk_db.py` with schema initialization and migration support
2. Create `rk_metrics.py` with Redis pub/sub listener and sorted set backfill
3. Modify `ci3/log_ci_run` to add `instance_type`, `instance_vcpus`, `pr_number`, and `dashboard` fields to the JSON payload
4. Add `redis_publish "ci:run:started"` and `ci:run:completed` calls to `log_ci_run`
5. Wire up `rk_metrics.py` in `rk.py` (start listener and backfill threads on app startup)
6. Add `sqlite3` usage (stdlib, no new dependency)
7. Deploy and verify CI runs are being captured in SQLite

**Validation:** SSH to bastion, `sqlite3 /logs-disk/metrics.db "SELECT count(*) FROM ci_runs;"`

### Phase 2: Cost Data
**Deliverables:** AWS costs in SQLite, GCP costs dual-written to SQLite

1. Create `rk_aws_costs.py` with Cost Explorer fetch logic
2. Add `boto3` to `requirements.txt`
3. Modify `rk_billing.py` to dual-write GCP costs to SQLite (keep JSON for backward compat)
4. Start daily background threads for both AWS and GCP cost polling
5. Create `/api/costs/overview` and `/api/costs/aws` endpoints
6. Create `/api/costs/runners` endpoint (derived from `ci_runs` table)
7. Build `cost-overview.html` and `runner-costs.html` dashboards

**Validation:** Visit `/cost-overview` and see AWS + GCP cost data charted

### Phase 3: CI Performance Dashboard
**Deliverables:** CI performance view, test event ingestion

1. Wire up `ci:test:started`, `ci:test:failed`, `ci:test:flaked` event processing in `rk_metrics.py`
2. Create `/api/ci/performance` endpoint
3. Build `ci-performance.html` dashboard with pass/flake/failure rates, goal lines, and top flakes table
4. Add goal line annotations for target metrics (see Section 9)

**Validation:** Visit `/ci-performance` and see rates charted with goal lines

### Phase 4: Benchmarks + PR Metrics
**Deliverables:** CI build times in benchmark pipeline, PR cost attribution

1. Add `ci_timing_bench` function to `bootstrap.sh`
2. Add phase timing instrumentation (`ci_phase_start`/`ci_phase_end`) around major CI phases
3. Verify benchmarks appear on GitHub Pages after merge-queue run
4. Create `rk_github.py` with PR lifecycle fetching
5. Create `rk_prs.py` with PR cost aggregation logic
6. Create `/api/prs/metrics` endpoint
7. Build `pr-metrics.html` dashboard

**Validation:** See `ci/total_duration` on `aztecprotocol.github.io/aztec-packages/bench?branch=next`. Visit `/pr-metrics` and see cost-per-PR charts.

### Phase 5: Deployments + Branch Lag
**Deliverables:** Deploy speed view, branch lag view

1. Create GitHub Actions workflow for daily branch lag computation (`.github/workflows/metrics-branch-lag.yml`)
2. Add `/api/metrics/branch-lag` POST endpoint (authenticated) for the GH Action to push data
3. Create workflow run fetching for deployment tracking in `rk_github.py`
4. Create `/api/deployments/speed` and `/api/branches/lag` endpoints
5. Build `deploy-speed.html` and `branch-lag.html` dashboards

**Validation:** Visit `/branch-lag` and see lag charts. Visit `/deploy-speed` and see deployment duration trends.

### Phase 6: Polish + Org Readiness
**Deliverables:** Shared navigation, goal metrics, alerting

1. Add shared navigation bar to all 7 dashboards (including modifying `billing-dashboard.html`)
2. Add the rkapp root page links to new dashboards
3. Implement goal line annotations on all relevant charts
4. Add a summary "health" endpoint `/api/health/summary` that returns current metric values vs targets
5. Write a Slack bot integration that posts weekly metrics summary to a channel

---

## 9. Goal Metrics

Specific targets for the metrics from the original issue. Rendered as horizontal dashed lines on relevant charts.

| Metric | Current (Estimated) | Target | Dashboard View |
|--------|---------------------|--------|----------------|
| **Merge queue failure rate** | ~15-20% | < 5% | CI Performance |
| **Merge queue pass rate** | ~80-85% | > 95% | CI Performance |
| **CI flake rate** (merge queue) | ~10-15% | < 3% | CI Performance |
| **deploy-and-test-scenarios failure rate** | Unknown | < 10% | Deploy Speed |
| **deploy-staging-networks failure rate** | Unknown | < 5% | Deploy Speed |
| **Merge queue CI duration (median)** | ~45 min | < 30 min | CI Performance |
| **Merge queue CI duration (P95)** | ~70 min | < 50 min | CI Performance |
| **Deploy duration (median)** | Unknown | < 20 min | Deploy Speed |
| **Issue-to-fix deployed** | Unknown | < 4 hours | Deploy Speed |
| **Branch lag: next -> staging-public** | Unknown | < 3 days | Branch Lag |
| **Branch lag: next -> testnet** | Unknown | < 7 days | Branch Lag |
| **Cost per merge-queue PR** | ~$40-50 | < $30 | PR Metrics |
| **Monthly AWS CI spend** | ~$30K | < $25K | Cost Overview |

These targets should be configurable via environment variables or a simple JSON config file.

---

## 10. Dependencies and Risks

### New Python Dependencies
- `boto3` -- AWS Cost Explorer API
- No new deps for SQLite (stdlib)
- No new deps for GitHub (`gh` CLI already available)

### Updated `requirements.txt`
```
flask
gunicorn
redis
ansi2html
Flask-Compress
requests
Flask-HTTPAuth
google-cloud-bigquery
boto3
```

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| SQLite write contention from multiple threads | WAL mode + single writer thread with queue |
| AWS Cost Explorer API rate limits (5 req/s) | Single daily fetch, exponential backoff |
| BigQuery query costs | Existing queries are modest; no change to query volume |
| Redis pub/sub message loss on restart | 5-minute sorted set backfill catches up |
| Bastion disk space | SQLite is compact; 1 year of data < 100MB |
| No git repo on bastion for branch lag | GitHub Actions workflow pushes lag data via API |
| `gh` CLI not installed in Docker | Add to Dockerfile or use GitHub API directly via `requests` |

### Backward Compatibility

- All existing endpoints continue to work unchanged
- The namespace billing JSON-on-disk system continues to work (dual-write)
- The existing Redis sorted set CI run display continues to work
- The benchmark pipeline is purely additive (new bench-out file)
- The `log_ci_run` changes are additive (new fields, old consumers ignore them)

---

## Critical Files for Implementation

- `ci3/log_ci_run` -- Add instance_type, pub/sub, pr_number fields
- `ci3/dashboard/rk.py` -- Register all new routes and dashboard views, initialize SQLite and background threads
- `ci3/dashboard/rk_billing.py` -- Extend to dual-write GCP costs to SQLite alongside JSON files
- `bootstrap.sh` -- Add ci_timing_bench and phase timing functions for benchmark publishing
- `ci3/dashboard/namespace-billing/billing-dashboard.html` -- Reference implementation for Chart.js dark theme
