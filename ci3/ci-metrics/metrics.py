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

import db
import github_data
import ec2_pricing

SECTIONS = ['next', 'prs', 'master', 'staging', 'releases', 'nightly', 'network', 'deflake', 'local']

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
    rate = ec2_pricing.get_instance_rate(instance_type, is_spot)
    if not rate:
        vcpus = data.get('instance_vcpus', 192)
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


def get_ci_runs(redis_conn, date_from_ms=None, date_to_ms=None):
    """Read CI runs from Redis, backfilled with SQLite for data that Redis has flushed."""
    redis_runs = _get_ci_runs_from_redis(redis_conn, date_from_ms, date_to_ms)

    # Find the earliest timestamp in Redis to know what SQLite needs to fill
    redis_keys = set()
    redis_min_ts = float('inf')
    for run in redis_runs:
        ts = run.get('timestamp', 0)
        redis_keys.add((run.get('dashboard', ''), ts, run.get('name', '')))
        if ts < redis_min_ts:
            redis_min_ts = ts

    # If requesting data older than what Redis has, backfill from SQLite
    sqlite_runs = []
    need_sqlite = (date_from_ms is not None and date_from_ms < redis_min_ts) or not redis_runs
    if need_sqlite:
        sqlite_to = int(redis_min_ts) if redis_runs else date_to_ms
        sqlite_runs = _get_ci_runs_from_sqlite(date_from_ms, sqlite_to)
        # Deduplicate: only include SQLite runs not already in Redis
        sqlite_runs = [r for r in sqlite_runs
                       if (r.get('dashboard', ''), r.get('timestamp', 0), r.get('name', ''))
                       not in redis_keys]

    return sqlite_runs + redis_runs


def _ts_to_date(ts_ms):
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime('%Y-%m-%d')


# ---- Test event handling (only thing needing SQLite) ----

def _upsert_daily_stats(status: str, test_cmd: str, dashboard: str, timestamp: str):
    """Increment the daily counter for a test status."""
    date = timestamp[:10]  # 'YYYY-MM-DD'
    col = status if status in ('passed', 'failed', 'flaked') else None
    if not col:
        return
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

    # Always update daily stats (lightweight aggregate)
    _upsert_daily_stats(status, test_cmd, dashboard, timestamp)

    # Only persist individual rows for failed/flaked (for drill-down / log URLs).
    # Passed events are tracked via daily stats only.
    if status == 'passed':
        return

    db.execute('''
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
        dashboard,
        timestamp,
    ))


def start_test_listener(redis_conn):
    """Subscribe to test event channels only. Reconnects on failure."""
    channels = [b'ci:test:started', b'ci:test:passed', b'ci:test:failed', b'ci:test:flaked']

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

    conn = db.get_db()
    # Track existing entries to avoid duplicates: log_url for entries that have one,
    # (test_cmd, timestamp, dashboard) composite key for entries without log_url
    existing_urls = {row['log_url'] for row in conn.execute(
        "SELECT DISTINCT log_url FROM test_events WHERE log_url IS NOT NULL"
    ).fetchall()}
    existing_keys = {(row['test_cmd'], row['timestamp'], row['dashboard']) for row in conn.execute(
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
                conn.execute('''
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
    conn.commit()
    if total:
        print(f"[rk_metrics] Synced {total} test events from Redis lists")


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
                conn.execute('''
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
        conn.commit()
        print(f"[rk_metrics] Loaded {len(events)} test events from seed")


# ---- CI run sync (Redis → SQLite) for flake correlation ----

_ci_sync_ts = 0
_CI_SYNC_TTL = 3600  # 1 hour


def sync_ci_runs_to_sqlite(redis_conn):
    """Sync all CI runs from Redis into SQLite for persistence."""
    global _ci_sync_ts
    now = time.time()
    if now - _ci_sync_ts < _CI_SYNC_TTL:
        return
    _ci_sync_ts = now

    # Sync everything Redis has (not just 30 days)
    runs = _get_ci_runs_from_redis(redis_conn)

    now_iso = datetime.now(timezone.utc).isoformat()
    conn = db.get_db()
    count = 0
    for run in runs:
        try:
            conn.execute('''
                INSERT OR REPLACE INTO ci_runs
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
            count += 1
        except Exception as e:
            print(f"[rk_metrics] Error syncing run: {e}")
    conn.commit()
    print(f"[rk_metrics] Synced {count} CI runs to SQLite")


def _backfill_daily_stats():
    """Populate test_daily_stats from existing test_events rows (one-time)."""
    conn = db.get_db()
    # Check if daily stats are already populated
    row = conn.execute("SELECT COUNT(*) as c FROM test_daily_stats").fetchone()
    if row['c'] > 0:
        return
    conn.execute('''
        INSERT OR IGNORE INTO test_daily_stats (date, test_cmd, dashboard, passed, failed, flaked)
        SELECT substr(timestamp, 1, 10) as date, test_cmd, dashboard,
               SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END),
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
               SUM(CASE WHEN status = 'flaked' THEN 1 ELSE 0 END)
        FROM test_events
        GROUP BY substr(timestamp, 1, 10), test_cmd, dashboard
    ''')
    conn.commit()
    count = conn.execute("SELECT COUNT(*) as c FROM test_daily_stats").fetchone()['c']
    if count:
        print(f"[rk_metrics] Backfilled {count} daily stat rows from test_events")


# ---- CloudTrail instance type resolution ----

_ct_resolve_ts = 0
_CT_RESOLVE_TTL = 6 * 3600  # 6 hours


def _fetch_cloudtrail_events(ct, event_name, start_time, end_time, max_events=5000):
    """Paginate through CloudTrail lookup_events for a given event name."""
    events = []
    kwargs = {
        'LookupAttributes': [
            {'AttributeKey': 'EventName', 'AttributeValue': event_name},
        ],
        'StartTime': start_time,
        'EndTime': end_time,
        'MaxResults': 50,
    }
    while True:
        resp = ct.lookup_events(**kwargs)
        events.extend(resp.get('Events', []))
        token = resp.get('NextToken')
        if not token or len(events) >= max_events:
            break
        kwargs['NextToken'] = token
    return events


def resolve_unknown_instance_types():
    """Query CloudTrail for RunInstances + CreateTags events to resolve unknown instance types.

    Correlates by joining RunInstances and CreateTags on instance ID, then
    matching to ci_runs via the Dashboard and Name tags set on each EC2 instance.
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

        # Fetch RunInstances events → instance_id → instance_type
        run_events = _fetch_cloudtrail_events(ct, 'RunInstances', start_time, end_time)
        instance_types = {}  # instance_id → instance_type
        instance_launch_times = {}  # instance_id → launch time ms
        for event in run_events:
            try:
                detail = json.loads(event.get('CloudTrailEvent', '{}'))
                resp_items = detail.get('responseElements', {}).get('instancesSet', {}).get('items', [])
                for item in resp_items:
                    iid = item.get('instanceId', '')
                    itype = item.get('instanceType', '') or detail.get('requestParameters', {}).get('instanceType', '')
                    if iid and itype:
                        instance_types[iid] = itype
                        instance_launch_times[iid] = int(event['EventTime'].timestamp() * 1000)
            except Exception:
                continue

        if not instance_types:
            print("[rk_metrics] CloudTrail: no RunInstances events found")
            return

        # Fetch CreateTags events → instance_id → {Name, Dashboard} tags
        tag_events = _fetch_cloudtrail_events(ct, 'CreateTags', start_time, end_time)
        instance_tags = {}  # instance_id → {Name, Dashboard, GithubActor}
        for event in tag_events:
            try:
                detail = json.loads(event.get('CloudTrailEvent', '{}'))
                req = detail.get('requestParameters', {})
                resources = req.get('resourcesSet', {}).get('items', [])
                tags = req.get('tagSet', {}).get('items', [])
                tag_dict = {t.get('key', ''): t.get('value', '') for t in tags}
                # Only care about build instances
                if tag_dict.get('Group') != 'build-instance' and 'Dashboard' not in tag_dict:
                    continue
                for res in resources:
                    rid = res.get('resourceId', '')
                    if rid.startswith('i-'):
                        if rid not in instance_tags:
                            instance_tags[rid] = {}
                        instance_tags[rid].update(tag_dict)
            except Exception:
                continue

        # Join: build list of instances with both type and tags
        instances = []
        for iid, itype in instance_types.items():
            tags = instance_tags.get(iid, {})
            instances.append({
                'instance_id': iid,
                'instance_type': itype,
                'launch_ms': instance_launch_times.get(iid, 0),
                'dashboard': tags.get('Dashboard', ''),
                'name_tag': tags.get('Name', ''),
                'actor': tags.get('GithubActor', ''),
            })

        # Match unknown runs to instances using tags
        updated = 0
        for run in unknown_runs:
            run_dashboard = run['dashboard']
            run_ts = run['timestamp_ms']

            best = None
            best_score = -1
            for inst in instances:
                score = 0
                # Dashboard tag must match
                if inst['dashboard'] and inst['dashboard'] == run_dashboard:
                    score += 10
                elif inst['dashboard']:
                    continue  # Dashboard mismatch — skip

                # Name tag contains branch_arch; match components
                name_tag = inst['name_tag']
                if name_tag:
                    # Name tag format: "branch-name_arch" (e.g. "pr-123_amd64")
                    run_arch = run['arch'] or ''
                    if run_arch and name_tag.endswith('_' + run_arch):
                        score += 3
                    # Check PR number in name tag
                    run_pr = run['pr_number']
                    if run_pr:
                        tag_pr = extract_pr_number(name_tag)
                        if tag_pr == run_pr:
                            score += 5

                # Timestamp proximity (within 10 min)
                delta = abs(inst['launch_ms'] - run_ts)
                if delta > 600_000:
                    continue
                # Closer timestamps score higher
                score += max(0, 5 - delta / 120_000)

                if score > best_score:
                    best_score = score
                    best = inst

            if best and best_score >= 10:
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
            print(f"[rk_metrics] CloudTrail: {len(instances)} instances found, "
                  f"{len(instance_tags)} tagged, 0/{len(unknown_runs)} matched")
    except Exception as e:
        print(f"[rk_metrics] CloudTrail resolution failed: {e}")


def start_ci_run_sync(redis_conn):
    """Start periodic CI run + test event sync thread."""
    _load_seed_data()
    _backfill_daily_stats()

    def loop():
        while True:
            try:
                sync_ci_runs_to_sqlite(redis_conn)
                sync_failed_tests_to_sqlite(redis_conn)
                resolve_unknown_instance_types()
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
