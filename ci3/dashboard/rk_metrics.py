"""CI metrics: direct Redis reads + test event listener.

Reads CI run data directly from Redis sorted sets on each request.
Test events stored in SQLite since they only arrive via pub/sub.
"""
import json
import re
import threading
from datetime import datetime, timezone

import rk_db

SECTIONS = ['next', 'prs', 'master', 'staging', 'releases', 'nightly', 'network', 'deflake', 'local']

# EC2 instance hourly rates (us-east-2)
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
_ANSI_RE = re.compile(r'\x1b\[[^m]*m|\x1b\]8;;[^\x07]*\x07')
_URL_PR_RE = re.compile(r'/pull/(\d+)')


def compute_run_cost(data: dict) -> float | None:
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
    m = _PR_RE.search(name)
    if m:
        return int(m.group(1))
    # Try matching GitHub PR URL in ANSI-encoded strings
    m = _URL_PR_RE.search(name)
    if m:
        return int(m.group(1))
    # Strip ANSI codes and retry
    clean = _ANSI_RE.sub('', name)
    m = _PR_RE.search(clean)
    return int(m.group(1)) if m else None


def get_ci_runs(redis_conn, date_from_ms=None, date_to_ms=None):
    """Read CI runs directly from Redis sorted sets."""
    runs = []
    for section in SECTIONS:
        key = f'ci-run-{section}'
        try:
            if date_from_ms is not None and date_to_ms is not None:
                entries = redis_conn.zrangebyscore(key, date_from_ms, date_to_ms, withscores=True)
            else:
                entries = redis_conn.zrange(key, 0, -1, withscores=True)
            for entry_bytes, score in entries:
                try:
                    raw = entry_bytes.decode() if isinstance(entry_bytes, bytes) else entry_bytes
                    data = json.loads(raw)
                    data.setdefault('dashboard', section)
                    data['cost_usd'] = compute_run_cost(data)
                    data['pr_number'] = (
                        extract_pr_number(data.get('name', ''))
                        or extract_pr_number(data.get('msg', ''))
                        or (int(data['pr_number']) if data.get('pr_number') else None)
                    )
                    runs.append(data)
                except Exception:
                    continue
        except Exception as e:
            print(f"[rk_metrics] Error reading {key}: {e}")
    return runs


def _ts_to_date(ts_ms):
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime('%Y-%m-%d')


# ---- Test event handling (only thing needing SQLite) ----

def _handle_test_event(channel: str, data: dict):
    status = channel.split(':')[-1]
    # Handle field name mismatches: run_test_cmd publishes 'cmd' for failed/flaked
    # but 'test_cmd' for started events. Same for 'log_key' vs 'log_url'.
    test_cmd = data.get('test_cmd') or data.get('cmd', '')
    log_url = data.get('log_url') or data.get('log_key')
    if log_url and not log_url.startswith('http'):
        log_url = f'http://ci.aztec-labs.com/{log_url}'
    rk_db.execute('''
        INSERT INTO test_events
        (status, test_cmd, log_url, ref_name, commit_hash, commit_author,
         commit_msg, exit_code, duration_secs, is_scenario, owners,
         flake_group_id, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        status,
        test_cmd,
        log_url,
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


def start_test_listener(redis_conn):
    """Subscribe to test event channels only."""
    channels = [b'ci:test:started', b'ci:test:failed', b'ci:test:flaked']

    def listener():
        try:
            pubsub = redis_conn.pubsub()
            pubsub.subscribe(*channels)
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
                    _handle_test_event(channel, json.loads(payload))
                except Exception as e:
                    print(f"[rk_metrics] Error parsing test event: {e}")
        except Exception as e:
            print(f"[rk_metrics] Test listener error: {e}")

    t = threading.Thread(target=listener, daemon=True, name='test-listener')
    t.start()
    return t
