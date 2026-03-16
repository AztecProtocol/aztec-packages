"""CI metrics: SQLite source of truth + Redis ingestion + test event listener.

CI runs are ingested from Redis (written by log_ci_run on CI instances) and
stored in SQLite. All reads go through SQLite so enriched fields (instance_type
from CloudTrail, recalculated costs) are preserved.
Test events stored in SQLite since they only arrive via pub/sub.
"""
import hashlib
import json
import re
import time
import threading
from datetime import datetime, timedelta, timezone

import db
import github_data
import ec2_pricing

SECTIONS = ['next', 'prs', 'master', 'staging', 'releases', 'nightly', 'network', 'deflake', 'local']

_PR_RE = re.compile(r'(?:pr-|#)(\d+)', re.IGNORECASE)
_ANSI_RE = re.compile(r'\x1b\[[^m]*m|\x1b\]8;;[^\x07]*\x07')
_URL_PR_RE = re.compile(r'/pull/(\d+)')


def hash_str_orig(s: str) -> str:
    """Replicate bash's `echo "$s" | git hash-object --stdin | cut -c1-16`.

    git hash-object computes SHA-1 of "blob <len>\\0<content>" where content
    includes the trailing newline from echo. Length is byte length, not
    Unicode code points.
    """
    content = (s + "\n").encode('utf-8')
    blob = f"blob {len(content)}\0".encode('utf-8') + content
    return hashlib.sha1(blob).hexdigest()[:16]


def compute_run_cost(data: dict) -> float | None:
    complete = data.get('complete')
    ts = data.get('timestamp')
    if not complete or not ts:
        return None
    hours = (complete - ts) / 3_600_000
    instance_type = data.get('instance_type', 'unknown')
    is_spot = bool(data.get('spot'))
    rate = ec2_pricing.get_instance_rate(instance_type, is_spot)
    if not rate:
        vcpus = data.get('instance_vcpus')
        if not vcpus:
            return None  # unknown instance type and no vCPU data
        rate = vcpus * ec2_pricing.get_fallback_vcpu_rate(is_spot)
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


def _get_ci_runs_from_redis(redis_conn, date_from_ms=None, date_to_ms=None):
    """Read CI runs from Redis sorted sets."""
    branch_pr_map = github_data.get_branch_pr_map()

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


def _get_ci_runs_from_sqlite(date_from_ms=None, date_to_ms=None):
    """Read CI runs from SQLite (persistent store)."""
    conditions = []
    params = []
    if date_from_ms is not None:
        conditions.append('timestamp_ms >= ?')
        params.append(date_from_ms)
    if date_to_ms is not None:
        conditions.append('timestamp_ms <= ?')
        params.append(date_to_ms)
    where = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''
    rows = db.query(f'SELECT * FROM ci_runs {where} ORDER BY timestamp_ms', params)
    runs = []
    for row in rows:
        runs.append({
            'dashboard': row['dashboard'],
            'name': row['name'],
            'timestamp': row['timestamp_ms'],
            'complete': row['complete_ms'],
            'status': row['status'],
            'author': row['author'],
            'pr_number': row['pr_number'],
            'instance_type': row['instance_type'],
            'instance_vcpus': row.get('instance_vcpus'),
            'spot': bool(row['spot']),
            'cost_usd': row['cost_usd'],
            'job_id': row.get('job_id', ''),
            'arch': row.get('arch', ''),
        })
    return runs


def get_ci_runs(date_from_ms=None, date_to_ms=None):
    """Read CI runs from SQLite (the source of truth).

    Redis is only an ingestion pipe — sync_ci_runs_to_sqlite() copies data in.
    All reads go through SQLite so enriched fields (instance_type from CloudTrail,
    recalculated costs) are always reflected.
    """
    return _get_ci_runs_from_sqlite(date_from_ms, date_to_ms)


def get_ci_runs_for_pr(pr_number: int, limit: int = 100) -> list:
    """Return CI runs for a specific PR, most recent first."""
    rows = db.query(
        'SELECT * FROM ci_runs WHERE pr_number = ? ORDER BY timestamp_ms DESC LIMIT ?',
        (pr_number, limit)
    )
    return [{
        'dashboard': row['dashboard'],
        'name': row['name'],
        'timestamp': row['timestamp_ms'],
        'complete': row['complete_ms'],
        'status': row['status'],
        'author': row['author'],
        'pr_number': row['pr_number'],
        'instance_type': row['instance_type'],
        'instance_vcpus': row.get('instance_vcpus'),
        'spot': bool(row['spot']),
        'cost_usd': row['cost_usd'],
        'job_id': row.get('job_id', ''),
        'arch': row.get('arch', ''),
    } for row in rows]


def _ts_to_date(ts_ms):
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime('%Y-%m-%d')


# ---- Test event handling (only thing needing SQLite) ----

def _upsert_daily_stats(status: str, test_cmd: str, dashboard: str, timestamp: str, duration_secs=None):
    """Increment the daily counter for a test status."""
    date = timestamp[:10]  # 'YYYY-MM-DD'
    col = status if status in ('passed', 'failed', 'flaked') else None
    if not col:
        return
    d = duration_secs if duration_secs and duration_secs > 0 else None
    if d:
        db.execute(f'''
            INSERT INTO test_daily_stats (date, test_cmd, dashboard, {col}, total_secs, count_timed, min_secs, max_secs)
            VALUES (?, ?, ?, 1, ?, 1, ?, ?)
            ON CONFLICT(date, test_cmd, dashboard) DO UPDATE SET
                {col} = {col} + 1,
                total_secs = total_secs + excluded.total_secs,
                count_timed = count_timed + 1,
                min_secs = CASE WHEN min_secs IS NULL OR excluded.min_secs < min_secs THEN excluded.min_secs ELSE min_secs END,
                max_secs = CASE WHEN max_secs IS NULL OR excluded.max_secs > max_secs THEN excluded.max_secs ELSE max_secs END
        ''', (date, test_cmd, dashboard, d, d, d))
    else:
        db.execute(f'''
            INSERT INTO test_daily_stats (date, test_cmd, dashboard, {col})
            VALUES (?, ?, ?, 1)
            ON CONFLICT(date, test_cmd, dashboard) DO UPDATE SET {col} = {col} + 1
        ''', (date, test_cmd, dashboard))


def _handle_test_event(channel: str, data: dict):
    status = channel.split(':')[-1]
    # Handle field name mismatches: run_test_cmd publishes 'cmd' for failed/flaked
    # but 'test_cmd' for started events. Same for 'log_key' vs 'log_url'.
    test_cmd = data.get('test_cmd') or data.get('cmd', '')
    log_url = data.get('log_url') or data.get('log_key')
    if log_url and not log_url.startswith('http'):
        log_url = f'http://ci.aztec-labs.com/{log_url}'
    dashboard = data.get('dashboard', '')
    timestamp = data.get('timestamp', datetime.now(timezone.utc).isoformat())
    test_hash = hash_str_orig(test_cmd) if test_cmd else None

    # Always update daily stats (lightweight aggregate)
    _upsert_daily_stats(status, test_cmd, dashboard, timestamp, data.get('duration_secs'))

    db.execute('''
        INSERT INTO test_events
        (status, test_cmd, log_url, ref_name, commit_hash, commit_author,
         commit_msg, exit_code, duration_secs, is_scenario, owners,
         flake_group_id, dashboard, timestamp, test_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        dashboard,
        timestamp,
        test_hash,
    ))


def start_test_listener(redis_conn):
    """Subscribe to test event channels only. Reconnects on failure."""
    channels = [b'ci:test:passed', b'ci:test:failed', b'ci:test:flaked']

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


# ---- CI Phase timing listener ----

def _handle_phase_event(data: dict):
    """Insert a CI phase timing event into SQLite."""
    db.execute('''
        INSERT INTO ci_phases
        (phase, duration_secs, exit_code, run_id, job_id, dashboard,
         ref_name, commit_hash, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('phase', ''),
        data.get('duration_secs', 0),
        data.get('exit_code'),
        data.get('run_id', ''),
        data.get('job_id', ''),
        data.get('dashboard', ''),
        data.get('ref_name', ''),
        data.get('commit_hash', ''),
        datetime.now(timezone.utc).isoformat(),
    ))


def start_phase_listener(redis_conn):
    """Subscribe to ci:phase:complete and store in ci_phases table."""
    def listener():
        backoff = 1
        while True:
            try:
                pubsub = redis_conn.pubsub()
                pubsub.subscribe(b'ci:phase:complete')
                backoff = 1
                for message in pubsub.listen():
                    if message['type'] != 'message':
                        continue
                    try:
                        payload = message['data']
                        if isinstance(payload, bytes):
                            payload = payload.decode()
                        _handle_phase_event(json.loads(payload))
                    except Exception as e:
                        print(f"[rk_metrics] Error parsing phase event: {e}")
            except Exception as e:
                print(f"[rk_metrics] Phase listener error (reconnecting in {backoff}s): {e}")
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)

    t = threading.Thread(target=listener, daemon=True, name='phase-listener')
    t.start()
    return t


def get_phases(date_from: str, date_to: str, dashboard: str = '',
               run_id: str = '') -> dict:
    """Query CI phase timing data for the API."""
    conditions = ['timestamp >= ?', 'timestamp < ?']
    params: list = [date_from, date_to + 'T23:59:59']
    if dashboard:
        conditions.append('dashboard = ?')
        params.append(dashboard)
    if run_id:
        conditions.append('run_id = ?')
        params.append(run_id)
    where = 'WHERE ' + ' AND '.join(conditions)

    # Aggregate by phase name
    by_phase = db.query(f'''
        SELECT phase,
               COUNT(*) as count,
               ROUND(AVG(duration_secs), 1) as avg_secs,
               ROUND(MIN(duration_secs), 1) as min_secs,
               ROUND(MAX(duration_secs), 1) as max_secs,
               ROUND(SUM(duration_secs), 0) as total_secs
        FROM ci_phases {where}
        GROUP BY phase
        ORDER BY total_secs DESC
    ''', params)

    # Aggregate by date: avg duration per phase per day
    date_rows = db.query(f'''
        SELECT substr(timestamp, 1, 10) as date, phase,
               ROUND(AVG(duration_secs), 1) as avg_secs,
               COUNT(*) as count
        FROM ci_phases {where}
        GROUP BY date, phase
        ORDER BY date
    ''', params)
    by_date: dict[str, dict] = {}
    for row in date_rows:
        d = row['date']
        if d not in by_date:
            by_date[d] = {'date': d, 'phases': {}}
        by_date[d]['phases'][row['phase']] = row['avg_secs']

    # Recent individual runs with their phases
    recent_runs = db.query(f'''
        SELECT run_id, job_id, dashboard, ref_name, commit_hash,
               phase, duration_secs, exit_code, timestamp
        FROM ci_phases {where}
        ORDER BY timestamp DESC
        LIMIT 500
    ''', params)
    runs_map: dict[str, dict] = {}
    for row in recent_runs:
        rid = row['run_id'] or row['timestamp']
        if rid not in runs_map:
            runs_map[rid] = {
                'run_id': row['run_id'], 'job_id': row['job_id'],
                'dashboard': row['dashboard'], 'ref_name': row['ref_name'],
                'commit_hash': row['commit_hash'], 'phases': [],
            }
        runs_map[rid]['phases'].append({
            'phase': row['phase'],
            'duration_secs': row['duration_secs'],
            'exit_code': row['exit_code'],
        })

    # Aggregate by dashboard: P95 duration per phase per pipeline.
    # Step 1: sum durations within each (dashboard, phase, run_id) — multiple machines
    # running the same phase in one run are summed, not counted separately.
    # Step 2: compute P95 across run_ids in Python.
    per_run_rows = db.query(f'''
        SELECT dashboard, phase, run_id,
               ROUND(SUM(duration_secs), 3) as run_total
        FROM ci_phases {where}
        AND dashboard != ''
        AND run_id != ''
        GROUP BY dashboard, phase, run_id
    ''', params)

    import math
    from collections import defaultdict
    run_totals: dict[tuple, list] = defaultdict(list)
    for row in per_run_rows:
        run_totals[(row['dashboard'], row['phase'])].append(row['run_total'])

    by_dashboard: dict[str, dict] = {}
    for (dash, phase), totals in sorted(run_totals.items()):
        totals_s = sorted(totals)
        n = len(totals_s)
        p95_idx = min(math.ceil(0.95 * n) - 1, n - 1)
        p95 = round(totals_s[p95_idx], 1)
        if dash not in by_dashboard:
            by_dashboard[dash] = {'dashboard': dash, 'phases': {}, 'total_secs': 0, 'count': 0}
        by_dashboard[dash]['phases'][phase] = p95
        by_dashboard[dash]['total_secs'] += sum(totals_s)
        by_dashboard[dash]['count'] = max(by_dashboard[dash]['count'], n)
    for d in by_dashboard.values():
        d['total_secs'] = round(d['total_secs'], 1)

    return {
        'by_phase': by_phase,
        'by_date': list(by_date.values()),
        'by_dashboard': list(by_dashboard.values()),
        'recent_runs': list(runs_map.values())[:50],
    }


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

    conn = db.get_db()
    # Track existing failed/flaked entries to avoid duplicates (this sync only
    # processes failed/flaked from Redis lists, so no need to scan passed rows).
    existing_urls = {row['log_url'] for row in conn.execute(
        "SELECT DISTINCT log_url FROM test_events WHERE log_url IS NOT NULL AND status IN ('failed', 'flaked')"
    ).fetchall()}
    existing_keys = {(row['test_cmd'], row['timestamp'], row['dashboard']) for row in conn.execute(
        "SELECT test_cmd, timestamp, dashboard FROM test_events WHERE log_url IS NULL AND status IN ('failed', 'flaked')"
    ).fetchall()}

    total = 0
    for section in SECTIONS + ['']:
        key = f'failed_tests_{section}' if section else 'failed_tests'
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
                conn.execute('''
                    INSERT INTO test_events
                    (status, test_cmd, log_url, ref_name, commit_author,
                     commit_msg, duration_secs, flake_group_id, dashboard,
                     timestamp, test_hash)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    parsed['status'], parsed['test_cmd'], parsed['log_url'],
                    parsed['ref_name'], parsed['commit_author'],
                    parsed['commit_msg'], parsed['duration_secs'],
                    parsed['flake_group_id'], parsed['dashboard'],
                    parsed['timestamp'],
                    hash_str_orig(parsed['test_cmd']) if parsed['test_cmd'] else None,
                ))
                _upsert_daily_stats(
                    parsed['status'], parsed['test_cmd'],
                    parsed['dashboard'], parsed['timestamp'])
                total += 1
            except Exception as e:
                print(f"[rk_metrics] Error inserting test event: {e}")
    conn.commit()
    if total:
        print(f"[rk_metrics] Synced {total} test events from Redis lists")
        db.cache_invalidate_prefix('flakes:')
        db.cache_invalidate_prefix('timings:')


# ---- Seed loading ----

def _load_seed_data():
    """Load CI runs and test events from ci-run-seed.json.gz if SQLite is empty."""
    import gzip
    from pathlib import Path

    conn = db.get_db()
    ci_count = conn.execute('SELECT COUNT(*) as c FROM ci_runs').fetchone()['c']
    te_count = conn.execute('SELECT COUNT(*) as c FROM test_events').fetchone()['c']
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
                conn.execute('''
                    INSERT OR IGNORE INTO ci_runs
                    (dashboard, name, timestamp_ms, complete_ms, status, author,
                     pr_number, instance_type, instance_vcpus, spot, cost_usd,
                     job_id, arch, synced_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    run.get('dashboard', ''),
                    run.get('name', ''),
                    run.get('timestamp', 0),
                    run.get('complete'),
                    run.get('status'),
                    run.get('author'),
                    run.get('pr_number'),
                    run.get('instance_type'),
                    run.get('instance_vcpus'),
                    1 if run.get('spot') else 0,
                    run.get('cost_usd'),
                    run.get('job_id', ''),
                    run.get('arch', ''),
                    now_iso,
                ))
            except Exception:
                continue
        conn.commit()
        print(f"[rk_metrics] Loaded {len(runs)} CI runs from seed")

    if te_count == 0 and data.get('test_events'):
        events = data['test_events']
        for ev in events:
            try:
                te_cmd = ev.get('test_cmd', '')
                conn.execute('''
                    INSERT OR IGNORE INTO test_events
                    (status, test_cmd, log_url, ref_name, commit_hash, commit_author,
                     commit_msg, exit_code, duration_secs, is_scenario, owners,
                     flake_group_id, dashboard, timestamp, test_hash)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    ev.get('status', ''),
                    te_cmd,
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
                    hash_str_orig(te_cmd) if te_cmd else None,
                ))
            except Exception:
                continue
        conn.commit()
        print(f"[rk_metrics] Loaded {len(events)} test events from seed")


# ---- CI run sync (Redis → SQLite) for flake correlation ----

_ci_sync_ts = 0
_CI_SYNC_TTL = 3600  # 1 hour


def sync_ci_runs_to_sqlite(redis_conn):
    """Ingest CI runs from Redis into SQLite.

    Redis is the ingestion pipe (log_ci_run writes there from CI instances).
    SQLite is the source of truth. Fields enriched post-ingestion (instance_type,
    cost_usd from CloudTrail resolution) are preserved — only overwritten if
    Redis has a non-empty value.
    """
    global _ci_sync_ts
    now = time.time()
    if now - _ci_sync_ts < _CI_SYNC_TTL:
        return
    _ci_sync_ts = now

    runs = _get_ci_runs_from_redis(redis_conn)

    now_iso = datetime.now(timezone.utc).isoformat()
    conn = db.get_db()
    count = 0
    for run in runs:
        try:
            conn.execute('''
                INSERT INTO ci_runs
                (dashboard, name, timestamp_ms, complete_ms, status, author,
                 pr_number, instance_type, instance_vcpus, spot, cost_usd,
                 job_id, arch, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(dashboard, timestamp_ms, name) DO UPDATE SET
                    complete_ms = excluded.complete_ms,
                    status = excluded.status,
                    author = excluded.author,
                    pr_number = excluded.pr_number,
                    instance_vcpus = excluded.instance_vcpus,
                    spot = excluded.spot,
                    job_id = excluded.job_id,
                    arch = excluded.arch,
                    synced_at = excluded.synced_at,
                    -- Preserve enriched fields: only overwrite if Redis has real data
                    instance_type = CASE
                        WHEN excluded.instance_type IS NOT NULL AND excluded.instance_type != ''
                        THEN excluded.instance_type
                        ELSE ci_runs.instance_type
                    END,
                    cost_usd = CASE
                        WHEN excluded.instance_type IS NOT NULL AND excluded.instance_type != ''
                        THEN excluded.cost_usd
                        ELSE ci_runs.cost_usd
                    END
            ''', (
                run.get('dashboard', ''),
                run.get('name', ''),
                run.get('timestamp', 0),
                run.get('complete'),
                run.get('status'),
                run.get('author'),
                run.get('pr_number'),
                run.get('instance_type'),
                run.get('instance_vcpus'),
                1 if run.get('spot') else 0,
                run.get('cost_usd'),
                run.get('job_id', ''),
                run.get('arch', ''),
                now_iso,
            ))
            count += 1
        except Exception as e:
            print(f"[rk_metrics] Error syncing run: {e}")
    conn.commit()
    print(f"[rk_metrics] Synced {count} CI runs to SQLite")
    db.cache_invalidate_prefix('perf:')


def _backfill_daily_stats():
    """Populate test_daily_stats from existing test_events rows.

    Uses INSERT OR IGNORE to fill gaps without overwriting data from the
    real-time listener.  Safe to call repeatedly — skips dates/tests that
    already have rows.
    """
    conn = db.get_db()
    cur = conn.execute('''
        INSERT OR IGNORE INTO test_daily_stats (date, test_cmd, dashboard, passed, failed, flaked)
        SELECT substr(timestamp, 1, 10) as date, test_cmd, dashboard,
               SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END),
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
               SUM(CASE WHEN status = 'flaked' THEN 1 ELSE 0 END)
        FROM test_events
        GROUP BY substr(timestamp, 1, 10), test_cmd, dashboard
    ''')
    conn.commit()
    if cur.rowcount and cur.rowcount > 0:
        print(f"[rk_metrics] Backfilled {cur.rowcount} daily stat rows from test_events")


def _materialize_ci_run_daily_stats():
    """Recompute ci_run_daily_stats from ci_runs.

    Replaces all rows — safe to call repeatedly.  Stores pre-aggregated
    duration percentiles so the API doesn't need to scan raw rows.
    """
    conn = db.get_db()
    # Fetch raw daily durations grouped by date + dashboard
    rows = conn.execute('''
        SELECT
            strftime('%Y-%m-%d', timestamp_ms / 1000, 'unixepoch') AS date,
            dashboard,
            (complete_ms - timestamp_ms) / 60000.0 AS dur_mins
        FROM ci_runs
        WHERE status IN ('PASSED', 'FAILED')
          AND complete_ms IS NOT NULL AND complete_ms > timestamp_ms
    ''').fetchall()

    # Group durations: {(date, dashboard): [dur_mins, ...]}
    groups = {}
    for r in rows:
        key = (r['date'], r['dashboard'])
        groups.setdefault(key, {'passed': 0, 'failed': 0, 'durs': []})
        groups[key]['durs'].append(r['dur_mins'])

    # Also count pass/fail per group
    status_rows = conn.execute('''
        SELECT
            strftime('%Y-%m-%d', timestamp_ms / 1000, 'unixepoch') AS date,
            dashboard, status, COUNT(*) as cnt
        FROM ci_runs
        WHERE status IN ('PASSED', 'FAILED')
        GROUP BY date, dashboard, status
    ''').fetchall()
    for r in status_rows:
        key = (r['date'], r['dashboard'])
        if key not in groups:
            groups[key] = {'passed': 0, 'failed': 0, 'durs': []}
        if r['status'] == 'PASSED':
            groups[key]['passed'] = r['cnt']
        else:
            groups[key]['failed'] = r['cnt']

    conn.execute('DELETE FROM ci_run_daily_stats')
    inserted = 0
    for (date, dashboard), g in groups.items():
        durs = sorted(g['durs'])
        n = len(durs)
        conn.execute('''
            INSERT INTO ci_run_daily_stats
            (date, dashboard, run_count, passed, failed,
             sum_duration, min_duration, max_duration, p50_duration, p95_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            date, dashboard, g['passed'] + g['failed'],
            g['passed'], g['failed'],
            round(sum(durs), 2) if durs else 0,
            round(min(durs), 1) if durs else None,
            round(max(durs), 1) if durs else None,
            round(durs[n // 2], 1) if durs else None,
            round(durs[int(n * 0.95)], 1) if durs else None,
        ))
        inserted += 1
    conn.commit()
    print(f"[rk_metrics] Materialized {inserted} ci_run_daily_stats rows")


def _backfill_test_hashes():
    """Populate test_hash for existing test_events rows that are missing it."""
    conn = db.get_db()
    rows = conn.execute(
        "SELECT DISTINCT test_cmd FROM test_events WHERE test_hash IS NULL AND test_cmd != ''"
    ).fetchall()
    if not rows:
        return
    for row in rows:
        cmd = row['test_cmd']
        h = hash_str_orig(cmd)
        conn.execute(
            "UPDATE test_events SET test_hash = ? WHERE test_cmd = ? AND test_hash IS NULL",
            (h, cmd))
    conn.commit()
    print(f"[rk_metrics] Backfilled test_hash for {len(rows)} distinct test commands")


# ---- CloudTrail instance type resolution ----

_ct_resolve_ts = 0
_CT_RESOLVE_TTL = 6 * 3600  # 6 hours


def _fetch_cloudtrail_daily(ct, event_name, start_time, end_time, max_per_day=10000):
    """Fetch CloudTrail events in daily chunks to avoid the 5000-event global limit."""
    events = []
    day = start_time.replace(hour=0, minute=0, second=0, microsecond=0)
    while day < end_time:
        day_end = min(day + timedelta(days=1), end_time)
        kwargs = {
            'LookupAttributes': [
                {'AttributeKey': 'EventName', 'AttributeValue': event_name},
            ],
            'StartTime': day,
            'EndTime': day_end,
            'MaxResults': 50,
        }
        while True:
            resp = ct.lookup_events(**kwargs)
            events.extend(resp.get('Events', []))
            token = resp.get('NextToken')
            if not token or len(events) >= max_per_day:
                break
            kwargs['NextToken'] = token
        day += timedelta(days=1)
    return events


# Name tag format: <branch_normalized>_<arch>[_<postfix>]
_NAME_TAG_RE = re.compile(r'^(.+)_(amd64|arm64)(?:_.*)?$')


def _normalize_branch_name(name):
    """Normalize a branch name the same way bootstrap_ec2 does for the EC2 Name tag."""
    m = re.match(r'^gh-readonly-queue/[^/]+/pr-(\d+)', name)
    if m:
        return f'pr-{m.group(1)}'
    name = re.sub(r'\s*\(queue\)$', '', name)
    return re.sub(r'[^a-zA-Z0-9-]', '_', name[:50])


def resolve_unknown_instance_types():
    """Query CloudTrail for RunInstances + CreateTags events to resolve unknown instance types.

    Strategy:
    1. Fetch RunInstances events (daily chunks) → instance_id → instance_type + launch_time
    2. Fetch CreateTags events (daily chunks) → instance_id → {Name, Group, Dashboard, ...}
       Tags are accumulated across multiple events then filtered to Group=build-instance.
    3. Join by instance_id, then match to ci_runs by normalized branch name + arch + time window.
    """
    global _ct_resolve_ts
    now = time.time()
    if now - _ct_resolve_ts < _CT_RESOLVE_TTL:
        return
    _ct_resolve_ts = now

    conn = db.get_db()
    unknown_runs = conn.execute('''
        SELECT dashboard, name, timestamp_ms, complete_ms, instance_vcpus, spot,
               cost_usd, arch, pr_number
        FROM ci_runs
        WHERE (instance_type IS NULL OR instance_type = '' OR instance_type = 'unknown')
        AND timestamp_ms > ?
    ''', (int((time.time() - 90 * 86400) * 1000),)).fetchall()

    if not unknown_runs:
        return

    try:
        import boto3
    except ImportError:
        return

    try:
        ct = boto3.client('cloudtrail', region_name='us-east-2')
        start_time = datetime.fromtimestamp(
            min(r['timestamp_ms'] for r in unknown_runs) / 1000 - 300, tz=timezone.utc)
        end_time = datetime.now(timezone.utc)

        # Step 1: Fetch RunInstances events in daily chunks → instance_id → type + launch time
        run_events = _fetch_cloudtrail_daily(ct, 'RunInstances', start_time, end_time)
        instance_types = {}
        instance_launch_times = {}
        for event in run_events:
            try:
                detail = json.loads(event.get('CloudTrailEvent', '{}'))
                itype = detail.get('requestParameters', {}).get('instanceType', '')
                items = (detail.get('responseElements') or {}).get('instancesSet', {}).get('items', [])
                for item in items:
                    iid = item.get('instanceId', '')
                    item_type = item.get('instanceType', '') or itype
                    if iid and item_type:
                        instance_types[iid] = item_type
                        instance_launch_times[iid] = int(event['EventTime'].timestamp() * 1000)
            except Exception:
                continue

        if not instance_types:
            print("[rk_metrics] CloudTrail: no RunInstances events found")
            return

        # Step 2: Fetch CreateTags events in daily chunks.
        # Accumulate ALL tags per instance first, then filter to build instances.
        # This handles the case where Name, Group, and Dashboard are set in separate
        # create-tags API calls (aws_request_instance_type lines 97, 126, 127).
        tag_events = _fetch_cloudtrail_daily(ct, 'CreateTags', start_time, end_time)
        all_instance_tags = {}
        for event in tag_events:
            try:
                detail = json.loads(event.get('CloudTrailEvent', '{}'))
                req = detail.get('requestParameters', {})
                resources = req.get('resourcesSet', {}).get('items', [])
                tags = req.get('tagSet', {}).get('items', [])
                tag_dict = {t.get('key', ''): t.get('value', '') for t in tags}
                for res in resources:
                    rid = res.get('resourceId', '')
                    if rid.startswith('i-'):
                        if rid not in all_instance_tags:
                            all_instance_tags[rid] = {}
                        all_instance_tags[rid].update(tag_dict)
            except Exception:
                continue

        # Filter to build instances
        instance_tags = {
            iid: tags for iid, tags in all_instance_tags.items()
            if tags.get('Group') == 'build-instance'
        }

        # Step 3: Join RunInstances + CreateTags by instance_id
        instances = []
        for iid, itype in instance_types.items():
            tags = instance_tags.get(iid, {})
            if not tags.get('Name'):
                continue
            instances.append({
                'instance_type': itype,
                'launch_ms': instance_launch_times.get(iid, 0),
                'dashboard': tags.get('Dashboard', ''),
                'name_tag': tags.get('Name', ''),
            })

        # Build index: normalized branch name → [instances]
        tag_index = {}
        for inst in instances:
            m = _NAME_TAG_RE.match(inst['name_tag'])
            if m:
                tag_index.setdefault(m.group(1), []).append(inst)
            else:
                tag_index.setdefault(inst['name_tag'], []).append(inst)

        # Step 4: Match unknown runs to instances
        updated = 0
        for run in unknown_runs:
            run_name = run['name']
            run_arch = run['arch'] or ''
            run_ts = run['timestamp_ms']
            run_dashboard = run['dashboard']

            expected_name = _normalize_branch_name(run_name)
            candidates = tag_index.get(expected_name, [])

            best = None
            for inst in candidates:
                # Verify arch matches
                if run_arch:
                    m = _NAME_TAG_RE.match(inst['name_tag'])
                    if m and m.group(2) != run_arch:
                        continue

                # Verify dashboard matches (if tag present)
                if inst['dashboard'] and inst['dashboard'] != run_dashboard:
                    continue

                # CI run starts after instance launch; allow up to 90 min (instance lifetime)
                delta = run_ts - inst['launch_ms']
                if delta < -60_000 or delta > 5400_000:
                    continue

                # Prefer most recently launched instance before the run
                if delta >= 0 and (best is None or inst['launch_ms'] > best['launch_ms']):
                    best = inst
                elif best is None and abs(delta) < 60_000:
                    best = inst

            if best:
                itype = best['instance_type']
                is_spot = bool(run['spot'])
                rate = ec2_pricing.get_instance_rate(itype, is_spot)
                new_cost = run['cost_usd']
                if rate and run['complete_ms'] and run['timestamp_ms']:
                    hours = (run['complete_ms'] - run['timestamp_ms']) / 3_600_000
                    new_cost = round(hours * rate, 4)
                conn.execute('''
                    UPDATE ci_runs SET instance_type = ?, cost_usd = ?
                    WHERE dashboard = ? AND timestamp_ms = ? AND name = ?
                ''', (itype, new_cost, run['dashboard'], run['timestamp_ms'], run['name']))
                updated += 1

        conn.commit()
        if updated:
            print(f"[rk_metrics] CloudTrail: resolved {updated}/{len(unknown_runs)} unknown instance types")
        else:
            print(f"[rk_metrics] CloudTrail: {len(instances)} instances, "
                  f"0/{len(unknown_runs)} matched")
    except Exception as e:
        print(f"[rk_metrics] CloudTrail resolution failed: {e}")


def recalculate_all_costs():
    """Recalculate cost_usd for all ci_runs based on current instance_type and pricing."""
    conn = db.get_db()
    runs = conn.execute('''
        SELECT dashboard, name, timestamp_ms, complete_ms, instance_type,
               instance_vcpus, spot, cost_usd
        FROM ci_runs
        WHERE complete_ms IS NOT NULL AND complete_ms > 0
    ''').fetchall()
    updated = 0
    for run in runs:
        cost = compute_run_cost({
            'complete': run['complete_ms'],
            'timestamp': run['timestamp_ms'],
            'instance_type': run['instance_type'] or 'unknown',
            'spot': run['spot'],
            'instance_vcpus': run['instance_vcpus'],
        })
        if cost is not None and cost != run['cost_usd']:
            conn.execute('''
                UPDATE ci_runs SET cost_usd = ?
                WHERE dashboard = ? AND timestamp_ms = ? AND name = ?
            ''', (cost, run['dashboard'], run['timestamp_ms'], run['name']))
            updated += 1
    conn.commit()
    print(f"[rk_metrics] Recalculated costs: {updated}/{len(runs)} changed")
    return updated


def start_ci_run_sync(redis_conn):
    """Start periodic CI run + test event sync thread."""
    _load_seed_data()
    _backfill_daily_stats()
    _backfill_test_hashes()
    _materialize_ci_run_daily_stats()

    def loop():
        while True:
            try:
                sync_ci_runs_to_sqlite(redis_conn)
                sync_failed_tests_to_sqlite(redis_conn)
                resolve_unknown_instance_types()
                _materialize_ci_run_daily_stats()
                db.cache_cleanup()
            except Exception as e:
                print(f"[rk_metrics] sync error: {e}")
            time.sleep(600)  # check every 10 min (TTL gates actual work)

    t = threading.Thread(target=loop, daemon=True, name='ci-run-sync')
    t.start()
    return t


def get_flakes_by_command(date_from, date_to, dashboard=''):
    """Get flake stats grouped by CI command type (dashboard/section)."""
    if dashboard:
        rows = db.query('''
            SELECT dashboard, test_cmd, COUNT(*) as count
            FROM test_events
            WHERE status = 'flaked' AND dashboard = ?
            AND timestamp >= ? AND timestamp < ?
            GROUP BY dashboard, test_cmd
            ORDER BY count DESC
        ''', (dashboard, date_from, date_to + 'T23:59:59'))
    else:
        rows = db.query('''
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
        failure_rows = db.query('''
            SELECT dashboard, COUNT(*) as count
            FROM test_events
            WHERE status = 'failed' AND dashboard = ?
            AND timestamp >= ? AND timestamp < ?
            GROUP BY dashboard
        ''', (dashboard, date_from, date_to + 'T23:59:59'))
    else:
        failure_rows = db.query('''
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


def get_test_history(test_hash: str, branch: str = '', limit: int = 1000) -> list[dict]:
    """Get test event history by test_hash, matching Redis history_{hash}[_{branch}] lists."""
    conditions = ['test_hash = ?']
    params: list = [test_hash]
    if branch:
        conditions.append('ref_name = ?')
        params.append(branch)
    where = 'WHERE ' + ' AND '.join(conditions)
    params.append(limit)
    return db.query(f'''
        SELECT status, test_cmd, log_url, ref_name, commit_author,
               commit_msg, duration_secs, dashboard, timestamp
        FROM test_events {where}
        ORDER BY timestamp DESC
        LIMIT ?
    ''', params)
