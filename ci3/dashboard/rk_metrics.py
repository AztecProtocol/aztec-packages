"""CI metrics ingestion: Redis pub/sub listener + periodic sorted set backfill.

Consumes Redis events and CI run data, writes to SQLite via rk_db.
"""
import json
import re
import threading
import time
from datetime import datetime, timezone

import rk_db

# Redis sorted set keys for CI runs
SECTIONS = ['next', 'prs', 'master', 'staging', 'releases', 'nightly', 'network']

# Pub/sub channels to subscribe to
CHANNELS = [
    b'ci:test:started',
    b'ci:test:failed',
    b'ci:test:flaked',
    b'ci:run:started',
    b'ci:run:completed',
]

# EC2 instance hourly rates (us-east-2, spot bid $0.0433/vCPU-hr)
INSTANCE_HOURLY_RATES = {
    ('m6a.48xlarge', True):  8.31,
    ('m6a.48xlarge', False): 16.56,
    ('m6a.32xlarge', True):  5.54,
    ('m6a.32xlarge', False): 11.04,
    ('m6a.16xlarge', True):  2.77,
    ('m6a.16xlarge', False): 5.52,
    ('m7a.48xlarge', True):  8.31,
    ('m7a.48xlarge', False): 16.56,
    ('m7a.16xlarge', True):  2.77,
    ('m7a.16xlarge', False): 5.52,
    ('m7i.48xlarge', True):  8.31,
    ('m7i.48xlarge', False): 16.56,
    ('r7g.16xlarge', True):  1.97,
    ('r7g.16xlarge', False): 3.94,
}
FALLBACK_VCPU_HOUR = {True: 0.0433, False: 0.0864}

_PR_RE = re.compile(r'(?:pr-|#)(\d+)', re.IGNORECASE)


def compute_run_cost(data: dict) -> float | None:
    """Compute CI run cost from instance type, spot flag, and duration."""
    complete = data.get('complete')
    ts = data.get('timestamp')
    if not complete or not ts:
        return None
    hours = (complete - ts) / 3_600_000
    instance_type = data.get('instance_type', 'unknown')
    is_spot = bool(data.get('spot'))
    rate = INSTANCE_HOURLY_RATES.get((instance_type, is_spot))
    if not rate:
        vcpus = data.get('instance_vcpus', 192)
        rate = vcpus * FALLBACK_VCPU_HOUR[is_spot]
    return round(hours * rate, 4)


def extract_pr_number(name: str) -> int | None:
    """Extract PR number from branch name or commit message."""
    m = _PR_RE.search(name)
    return int(m.group(1)) if m else None


def _handle_test_event(channel: str, data: dict):
    """Insert a test event from pub/sub into SQLite."""
    # Channel is like 'ci:test:failed' -> status = 'failed'
    status = channel.split(':')[-1]
    rk_db.execute('''
        INSERT INTO test_events
        (status, test_cmd, log_url, ref_name, commit_hash, commit_author,
         commit_msg, exit_code, duration_secs, is_scenario, owners,
         flake_group_id, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        status,
        data.get('test_cmd', ''),
        data.get('log_url'),
        data.get('ref_name', ''),
        data.get('commit_hash'),
        data.get('commit_author'),
        data.get('commit_msg'),
        data.get('exit_code'),
        data.get('duration_seconds'),
        1 if data.get('is_scenario_test') else 0,
        json.dumps(data['owners']) if data.get('owners') else None,
        data.get('flake_group_id'),
        data.get('timestamp', datetime.now(timezone.utc).isoformat()),
    ))


def _upsert_ci_run(data: dict, dashboard: str):
    """Insert or update a CI run in SQLite."""
    cost = compute_run_cost(data)
    rk_db.execute('''
        INSERT INTO ci_runs
        (run_id, job_id, timestamp_ms, complete_ms, status, dashboard,
         ref_name, msg, name, author, arch, spot, instance_type,
         instance_vcpus, pr_number, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, job_id, timestamp_ms) DO UPDATE SET
            complete_ms = excluded.complete_ms,
            status = excluded.status,
            cost_usd = excluded.cost_usd,
            instance_type = COALESCE(excluded.instance_type, ci_runs.instance_type),
            instance_vcpus = COALESCE(excluded.instance_vcpus, ci_runs.instance_vcpus)
    ''', (
        data.get('run_id', ''),
        data.get('job_id', ''),
        data.get('timestamp', 0),
        data.get('complete'),
        data.get('status', 'RUNNING'),
        dashboard,
        data.get('name', ''),
        data.get('msg'),
        data.get('name', ''),
        data.get('author', ''),
        data.get('arch'),
        1 if data.get('spot') else 0,
        data.get('instance_type'),
        data.get('instance_vcpus'),
        extract_pr_number(data.get('name', '') or data.get('msg', '')),
        cost,
    ))


def handle_event(channel: str, data: dict):
    """Dispatch a Redis pub/sub event to the appropriate handler."""
    try:
        if channel.startswith('ci:test:'):
            _handle_test_event(channel, data)
        elif channel == 'ci:run:started':
            _upsert_ci_run(data, data.get('dashboard', 'prs'))
        elif channel == 'ci:run:completed':
            _upsert_ci_run(data, data.get('dashboard', 'prs'))
    except Exception as e:
        print(f"[rk_metrics] Error handling {channel}: {e}")


def start_redis_listener(redis_conn):
    """Start a background thread subscribing to CI event channels."""
    def listener():
        try:
            pubsub = redis_conn.pubsub()
            pubsub.subscribe(*CHANNELS)
            for message in pubsub.listen():
                if message['type'] != 'message':
                    continue
                channel = message['channel']
                if isinstance(channel, bytes):
                    channel = channel.decode()
                try:
                    payload = message['data']
                    if isinstance(payload, bytes):
                        payload = payload.decode()
                    data = json.loads(payload)
                    handle_event(channel, data)
                except Exception as e:
                    print(f"[rk_metrics] Error parsing message on {channel}: {e}")
        except Exception as e:
            print(f"[rk_metrics] Redis listener error: {e}")

    t = threading.Thread(target=listener, daemon=True, name='metrics-listener')
    t.start()
    return t


def backfill_ci_runs(redis_conn):
    """Scan Redis sorted sets and upsert CI run data into SQLite."""
    for section in SECTIONS:
        key = f'ci-run-{section}'
        try:
            entries = redis_conn.zrange(key, 0, -1, withscores=True)
            for entry_bytes, score in entries:
                try:
                    if isinstance(entry_bytes, bytes):
                        entry_bytes = entry_bytes.decode()
                    data = json.loads(entry_bytes)
                    _upsert_ci_run(data, section)
                except Exception:
                    continue
        except Exception as e:
            print(f"[rk_metrics] Error backfilling {key}: {e}")


def start_backfill_loop(redis_conn, interval_secs=300):
    """Start a background thread that periodically backfills CI runs from Redis."""
    def loop():
        while True:
            try:
                backfill_ci_runs(redis_conn)
            except Exception as e:
                print(f"[rk_metrics] Backfill error: {e}")
            time.sleep(interval_secs)

    t = threading.Thread(target=loop, daemon=True, name='metrics-backfill')
    t.start()
    return t
