"""CI metrics: direct Redis reads + test event listener.

Reads CI run data directly from Redis sorted sets on each request.
Test events stored in SQLite since they only arrive via pub/sub.
CI runs periodically synced from Redis to SQLite for flake correlation.
"""
import json
import re
import time
import threading
from datetime import datetime, timedelta, timezone

import rk_db
import rk_github

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
    # Build branch→PR map for runs where we can't extract PR from name/msg
    branch_pr_map = rk_github.get_branch_pr_map()

    runs = []
    for section in SECTIONS:
        key = f'ci-run-{section}'
        try:
            if date_from_ms is not None or date_to_ms is not None:
                lo = date_from_ms if date_from_ms is not None else '-inf'
                hi = date_to_ms if date_to_ms is not None else '+inf'
                entries = redis_conn.zrangebyscore(key, lo, hi, withscores=True)
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
                        or branch_pr_map.get(data.get('name'))
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
         flake_group_id, dashboard, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        data.get('dashboard', ''),
        data.get('timestamp', datetime.now(timezone.utc).isoformat()),
    ))


def start_test_listener(redis_conn):
    """Subscribe to test event channels only. Reconnects on failure."""
    channels = [b'ci:test:started', b'ci:test:failed', b'ci:test:flaked']

    def listener():
        backoff = 1
        while True:
            try:
                pubsub = redis_conn.pubsub()
                pubsub.subscribe(*channels)
                backoff = 1  # reset on successful connection
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
                print(f"[rk_metrics] Test listener error (reconnecting in {backoff}s): {e}")
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)

    t = threading.Thread(target=listener, daemon=True, name='test-listener')
    t.start()
    return t


# ---- Sync failed_tests_{section} lists from Redis into SQLite ----

_ANSI_STRIP = re.compile(r'\x1b\[[^m]*m|\x1b\]8;;[^\x07]*\x07')
_GRIND_CMD_RE = re.compile(r'/grind\?cmd=([^&\x07"]+)')
_LOG_KEY_RE = re.compile(r'ci\.aztec-labs\.com/([a-f0-9]{16})')
_INLINE_CMD_RE = re.compile(r'(?:grind\)|[0-9a-f]{16}\)):?\s+(.+?)\s+\(\d+s\)')
_DURATION_RE = re.compile(r'\((\d+)s\)')
_AUTHOR_MSG_RE = re.compile(r'\(code: \d+\)\s+\((.+?): (.+?)\)\s*$')
_FLAKE_GROUP_RE = re.compile(r'group:(\S+)')

_failed_tests_sync_ts = 0
_FAILED_TESTS_SYNC_TTL = 3600  # 1 hour


def _parse_failed_test_entry(raw: str, section: str) -> dict | None:
    """Parse an ANSI-formatted failed_tests_{section} entry into structured data."""
    from urllib.parse import unquote
    clean = _ANSI_STRIP.sub('', raw)

    # Status
    if 'FLAKED' in clean:
        status = 'flaked'
    elif 'FAILED' in clean:
        status = 'failed'
    else:
        return None

    # Timestamp: "02-11 15:11:00: ..."
    ts_match = re.match(r'(\d{2}-\d{2} \d{2}:\d{2}:\d{2})', clean)
    if not ts_match:
        return None
    # Assume current year for MM-DD HH:MM:SS; handle year rollover
    now = datetime.now(timezone.utc)
    year = now.year
    ts_str = f'{year}-{ts_match.group(1)}'
    try:
        parsed_dt = datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        # If parsed date is in the future, it's from the previous year
        if parsed_dt > now + timedelta(days=1):
            parsed_dt = parsed_dt.replace(year=year - 1)
        timestamp = parsed_dt.isoformat()
    except ValueError:
        return None

    # Log key
    log_key = None
    m = _LOG_KEY_RE.search(raw)
    if m:
        log_key = m.group(1)

    # Test command: try grind link first, then inline text
    test_cmd = ''
    m = _GRIND_CMD_RE.search(raw)
    if m:
        cmd_raw = unquote(m.group(1))
        # Format: "hash:KEY=VAL:KEY=VAL actual_command"
        # Strip the hash:KEY=VAL prefix to get the actual test command
        parts = cmd_raw.split(' ', 1)
        if len(parts) == 2 and ':' in parts[0]:
            test_cmd = parts[1].strip()
        else:
            test_cmd = cmd_raw
    else:
        # Fallback: extract from inline text after log key
        m = _INLINE_CMD_RE.search(clean)
        if m:
            test_cmd = m.group(1).strip()

    # Duration
    duration = None
    m = _DURATION_RE.search(clean)
    if m:
        duration = float(m.group(1))

    # Author and commit message
    author, msg = None, None
    m = _AUTHOR_MSG_RE.search(clean)
    if m:
        author = m.group(1)
        msg = m.group(2)

    # Flake group
    flake_group = None
    m = _FLAKE_GROUP_RE.search(clean)
    if m:
        flake_group = m.group(1)

    return {
        'status': status,
        'test_cmd': test_cmd,
        'log_url': f'http://ci.aztec-labs.com/{log_key}' if log_key else None,
        'log_key': log_key,
        'ref_name': section,  # section is the best ref we have from these lists
        'commit_author': author,
        'commit_msg': msg,
        'duration_secs': duration,
        'flake_group_id': flake_group,
        'timestamp': timestamp,
        'dashboard': section,
    }


def sync_failed_tests_to_sqlite(redis_conn):
    """Read failed_tests_{section} lists from Redis and insert into test_events."""
    global _failed_tests_sync_ts
    now = time.time()
    if now - _failed_tests_sync_ts < _FAILED_TESTS_SYNC_TTL:
        return
    _failed_tests_sync_ts = now

    db = rk_db.get_db()
    # Track existing entries to avoid duplicates: log_url for entries that have one,
    # (test_cmd, timestamp, dashboard) composite key for entries without log_url
    existing_urls = {row['log_url'] for row in db.execute(
        "SELECT DISTINCT log_url FROM test_events WHERE log_url IS NOT NULL"
    ).fetchall()}
    existing_keys = {(row['test_cmd'], row['timestamp'], row['dashboard']) for row in db.execute(
        "SELECT test_cmd, timestamp, dashboard FROM test_events WHERE log_url IS NULL"
    ).fetchall()}

    total = 0
    for section in SECTIONS:
        key = f'failed_tests_{section}'
        try:
            entries = redis_conn.lrange(key, 0, -1)
        except Exception as e:
            print(f"[rk_metrics] Error reading {key}: {e}")
            continue

        for entry_bytes in entries:
            raw = entry_bytes.decode() if isinstance(entry_bytes, bytes) else entry_bytes
            parsed = _parse_failed_test_entry(raw, section)
            if not parsed:
                continue
            if parsed['log_url']:
                if parsed['log_url'] in existing_urls:
                    continue
                existing_urls.add(parsed['log_url'])
            else:
                composite = (parsed['test_cmd'], parsed['timestamp'], parsed['dashboard'])
                if composite in existing_keys:
                    continue
                existing_keys.add(composite)
            try:
                db.execute('''
                    INSERT INTO test_events
                    (status, test_cmd, log_url, ref_name, commit_author,
                     commit_msg, duration_secs, flake_group_id, dashboard,
                     timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    parsed['status'], parsed['test_cmd'], parsed['log_url'],
                    parsed['ref_name'], parsed['commit_author'],
                    parsed['commit_msg'], parsed['duration_secs'],
                    parsed['flake_group_id'], parsed['dashboard'],
                    parsed['timestamp'],
                ))
                total += 1
            except Exception as e:
                print(f"[rk_metrics] Error inserting test event: {e}")
    db.commit()
    if total:
        print(f"[rk_metrics] Synced {total} test events from Redis lists")


# ---- Seed loading ----

def _load_seed_data():
    """Load CI runs and test events from ci-run-seed.json.gz if SQLite is empty."""
    import gzip
    from pathlib import Path

    db = rk_db.get_db()
    ci_count = db.execute('SELECT COUNT(*) as c FROM ci_runs').fetchone()['c']
    te_count = db.execute('SELECT COUNT(*) as c FROM test_events').fetchone()['c']
    if ci_count > 0 and te_count > 0:
        return

    seed = Path(__file__).parent / 'ci-run-seed.json.gz'
    if not seed.exists():
        return

    with gzip.open(seed, 'rt') as f:
        data = json.load(f)

    now_iso = datetime.now(timezone.utc).isoformat()

    if ci_count == 0 and data.get('ci_runs'):
        runs = data['ci_runs']
        for run in runs:
            try:
                db.execute('''
                    INSERT OR IGNORE INTO ci_runs
                    (dashboard, name, timestamp_ms, complete_ms, status, author,
                     pr_number, instance_type, spot, cost_usd, synced_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    run.get('dashboard', ''),
                    run.get('name', ''),
                    run.get('timestamp', 0),
                    run.get('complete'),
                    run.get('status'),
                    run.get('author'),
                    run.get('pr_number'),
                    run.get('instance_type'),
                    1 if run.get('spot') else 0,
                    run.get('cost_usd'),
                    now_iso,
                ))
            except Exception:
                continue
        db.commit()
        print(f"[rk_metrics] Loaded {len(runs)} CI runs from seed")

    if te_count == 0 and data.get('test_events'):
        events = data['test_events']
        for ev in events:
            try:
                db.execute('''
                    INSERT OR IGNORE INTO test_events
                    (status, test_cmd, log_url, ref_name, commit_hash, commit_author,
                     commit_msg, exit_code, duration_secs, is_scenario, owners,
                     flake_group_id, dashboard, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    ev.get('status', ''),
                    ev.get('test_cmd', ''),
                    ev.get('log_url'),
                    ev.get('ref_name', ''),
                    ev.get('commit_hash'),
                    ev.get('commit_author'),
                    ev.get('commit_msg'),
                    ev.get('exit_code'),
                    ev.get('duration_secs'),
                    ev.get('is_scenario', 0),
                    ev.get('owners'),
                    ev.get('flake_group_id'),
                    ev.get('dashboard', ''),
                    ev.get('timestamp', ''),
                ))
            except Exception:
                continue
        db.commit()
        print(f"[rk_metrics] Loaded {len(events)} test events from seed")


# ---- CI run sync (Redis → SQLite) for flake correlation ----

_ci_sync_ts = 0
_CI_SYNC_TTL = 3600  # 1 hour


def sync_ci_runs_to_sqlite(redis_conn):
    """Sync CI runs from Redis sorted sets into SQLite for flake correlation."""
    global _ci_sync_ts
    now = time.time()
    if now - _ci_sync_ts < _CI_SYNC_TTL:
        return
    _ci_sync_ts = now

    # Sync last 30 days of runs
    ts_from = int((datetime.now(timezone.utc) - timedelta(days=30)).timestamp() * 1000)
    runs = get_ci_runs(redis_conn, ts_from)

    now_iso = datetime.now(timezone.utc).isoformat()
    db = rk_db.get_db()
    count = 0
    for run in runs:
        try:
            db.execute('''
                INSERT OR REPLACE INTO ci_runs
                (dashboard, name, timestamp_ms, complete_ms, status, author,
                 pr_number, instance_type, spot, cost_usd, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                run.get('dashboard', ''),
                run.get('name', ''),
                run.get('timestamp', 0),
                run.get('complete'),
                run.get('status'),
                run.get('author'),
                run.get('pr_number'),
                run.get('instance_type'),
                1 if run.get('spot') else 0,
                run.get('cost_usd'),
                now_iso,
            ))
            count += 1
        except Exception as e:
            print(f"[rk_metrics] Error syncing run: {e}")
    db.commit()
    print(f"[rk_metrics] Synced {count} CI runs to SQLite")


def start_ci_run_sync(redis_conn):
    """Start periodic CI run + test event sync thread."""
    _load_seed_data()

    def loop():
        while True:
            try:
                sync_ci_runs_to_sqlite(redis_conn)
                sync_failed_tests_to_sqlite(redis_conn)
            except Exception as e:
                print(f"[rk_metrics] sync error: {e}")
            time.sleep(600)  # check every 10 min (TTL gates actual work)

    t = threading.Thread(target=loop, daemon=True, name='ci-run-sync')
    t.start()
    return t


def get_flakes_by_command(date_from, date_to, dashboard=''):
    """Get flake stats grouped by CI command type (dashboard/section)."""
    if dashboard:
        rows = rk_db.query('''
            SELECT dashboard, test_cmd, COUNT(*) as count
            FROM test_events
            WHERE status = 'flaked' AND dashboard = ?
            AND timestamp >= ? AND timestamp < ?
            GROUP BY dashboard, test_cmd
            ORDER BY count DESC
        ''', (dashboard, date_from, date_to + 'T23:59:59'))
    else:
        rows = rk_db.query('''
            SELECT dashboard, test_cmd, COUNT(*) as count
            FROM test_events
            WHERE status = 'flaked' AND dashboard != ''
            AND timestamp >= ? AND timestamp < ?
            GROUP BY dashboard, test_cmd
            ORDER BY count DESC
        ''', (date_from, date_to + 'T23:59:59'))

    by_command = {}
    total_flakes = 0
    for row in rows:
        cmd = row['dashboard']
        if cmd not in by_command:
            by_command[cmd] = {'total': 0, 'tests': {}}
        by_command[cmd]['total'] += row['count']
        by_command[cmd]['tests'][row['test_cmd']] = row['count']
        total_flakes += row['count']

    if dashboard:
        failure_rows = rk_db.query('''
            SELECT dashboard, COUNT(*) as count
            FROM test_events
            WHERE status = 'failed' AND dashboard = ?
            AND timestamp >= ? AND timestamp < ?
            GROUP BY dashboard
        ''', (dashboard, date_from, date_to + 'T23:59:59'))
    else:
        failure_rows = rk_db.query('''
            SELECT dashboard, COUNT(*) as count
            FROM test_events
            WHERE status = 'failed' AND dashboard != ''
            AND timestamp >= ? AND timestamp < ?
            GROUP BY dashboard
        ''', (date_from, date_to + 'T23:59:59'))
    failures_by_command = {r['dashboard']: r['count'] for r in failure_rows}

    result_list = []
    for cmd, data in sorted(by_command.items(), key=lambda x: -x[1]['total']):
        top_tests = sorted(data['tests'].items(), key=lambda x: -x[1])[:10]
        result_list.append({
            'command': cmd,
            'total_flakes': data['total'],
            'total_failures': failures_by_command.get(cmd, 0),
            'top_tests': [{'test_cmd': t, 'count': c} for t, c in top_tests],
        })

    return {
        'by_command': result_list,
        'summary': {
            'total_flakes': total_flakes,
            'total_failures': sum(failures_by_command.values()),
        },
    }
