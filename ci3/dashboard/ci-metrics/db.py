"""SQLite database for CI metrics storage.

Stores test events (from Redis pub/sub) and merge queue daily stats
(backfilled from GitHub API).
"""
import json
import os
import sqlite3
import threading
import time

_DB_PATH = os.getenv('METRICS_DB_PATH',
                     os.path.join(os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'metrics.db'))
_local = threading.local()

# WAL maintenance. get_db() hands each worker thread a long-lived connection,
# so a reader snapshot is almost always open. SQLite's automatic *passive*
# checkpoint can never truncate the -wal while any older snapshot is held, so
# the -wal file grows without bound (it reached 45 GB in prod and filled the
# bastion disk, taking claudebox.work down). Bound it two ways:
#   1. journal_size_limit truncates the -wal file back down after a checkpoint.
#   2. a background thread forces wal_checkpoint(TRUNCATE) on an interval, which
#      resets the -wal to zero whenever readers momentarily clear.
_WAL_SIZE_LIMIT_BYTES = int(os.getenv('METRICS_WAL_SIZE_LIMIT_BYTES', str(64 * 1024 * 1024)))
_WAL_CHECKPOINT_SECS = int(os.getenv('METRICS_WAL_CHECKPOINT_SECS', '60'))
_checkpoint_lock = threading.Lock()
_checkpoint_started = False

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS test_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    status         TEXT NOT NULL,
    test_cmd       TEXT NOT NULL,
    log_url        TEXT,
    ref_name       TEXT NOT NULL,
    commit_hash    TEXT,
    commit_author  TEXT,
    commit_msg     TEXT,
    exit_code      INTEGER,
    duration_secs  REAL,
    is_scenario    INTEGER DEFAULT 0,
    owners         TEXT,
    flake_group_id TEXT,
    dashboard      TEXT NOT NULL DEFAULT '',
    timestamp      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_test_events_status ON test_events(status);
CREATE INDEX IF NOT EXISTS idx_test_events_ts ON test_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_test_events_cmd ON test_events(test_cmd);
CREATE INDEX IF NOT EXISTS idx_test_events_dashboard ON test_events(dashboard);
CREATE INDEX IF NOT EXISTS idx_test_events_status_ts ON test_events(status, timestamp);

CREATE TABLE IF NOT EXISTS merge_queue_daily (
    date           TEXT PRIMARY KEY,
    total          INTEGER NOT NULL DEFAULT 0,
    success        INTEGER NOT NULL DEFAULT 0,
    failure        INTEGER NOT NULL DEFAULT 0,
    cancelled      INTEGER NOT NULL DEFAULT 0,
    in_progress    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ci_runs (
    dashboard     TEXT NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    timestamp_ms  INTEGER NOT NULL,
    complete_ms   INTEGER,
    status        TEXT,
    author        TEXT,
    pr_number     INTEGER,
    instance_type TEXT,
    instance_vcpus INTEGER,
    spot          INTEGER DEFAULT 0,
    cost_usd      REAL,
    job_id        TEXT DEFAULT '',
    arch          TEXT DEFAULT '',
    synced_at     TEXT NOT NULL,
    PRIMARY KEY (dashboard, timestamp_ms, name)
);
CREATE INDEX IF NOT EXISTS idx_ci_runs_ts ON ci_runs(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_ci_runs_name ON ci_runs(name);
CREATE INDEX IF NOT EXISTS idx_ci_runs_dashboard ON ci_runs(dashboard);

CREATE TABLE IF NOT EXISTS test_daily_stats (
    date          TEXT NOT NULL,
    test_cmd      TEXT NOT NULL,
    dashboard     TEXT NOT NULL DEFAULT '',
    passed        INTEGER NOT NULL DEFAULT 0,
    failed        INTEGER NOT NULL DEFAULT 0,
    flaked        INTEGER NOT NULL DEFAULT 0,
    total_secs    REAL NOT NULL DEFAULT 0,
    count_timed   INTEGER NOT NULL DEFAULT 0,
    min_secs      REAL,
    max_secs      REAL,
    PRIMARY KEY (date, test_cmd, dashboard)
);
CREATE INDEX IF NOT EXISTS idx_tds_date ON test_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_tds_dashboard ON test_daily_stats(dashboard);

CREATE TABLE IF NOT EXISTS merge_queue_snapshots (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp      TEXT NOT NULL,
    depth          INTEGER NOT NULL,
    entries_json   TEXT
);
CREATE INDEX IF NOT EXISTS idx_mqs_ts ON merge_queue_snapshots(timestamp);

CREATE TABLE IF NOT EXISTS ci_run_daily_stats (
    date          TEXT NOT NULL,
    dashboard     TEXT NOT NULL,
    run_count     INTEGER NOT NULL DEFAULT 0,
    passed        INTEGER NOT NULL DEFAULT 0,
    failed        INTEGER NOT NULL DEFAULT 0,
    sum_duration  REAL NOT NULL DEFAULT 0,
    min_duration  REAL,
    max_duration  REAL,
    p50_duration  REAL,
    p95_duration  REAL,
    PRIMARY KEY (date, dashboard)
);
CREATE INDEX IF NOT EXISTS idx_crds_date ON ci_run_daily_stats(date);

CREATE TABLE IF NOT EXISTS ci_phases (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phase         TEXT NOT NULL,
    duration_secs REAL NOT NULL,
    exit_code     INTEGER,
    run_id        TEXT,
    job_id        TEXT,
    dashboard     TEXT NOT NULL DEFAULT '',
    ref_name      TEXT,
    commit_hash   TEXT,
    timestamp     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ci_phases_run ON ci_phases(run_id);
CREATE INDEX IF NOT EXISTS idx_ci_phases_ts ON ci_phases(timestamp);
CREATE INDEX IF NOT EXISTS idx_ci_phases_phase ON ci_phases(phase);

CREATE TABLE IF NOT EXISTS pr_authors (
    pr_number     INTEGER PRIMARY KEY,
    author        TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    branch        TEXT NOT NULL DEFAULT '',
    additions     INTEGER DEFAULT 0,
    deletions     INTEGER DEFAULT 0,
    fetched_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_cache (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    created_at REAL NOT NULL,
    ttl_secs   INTEGER NOT NULL DEFAULT 300
);

CREATE TABLE IF NOT EXISTS pr_cache (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at REAL NOT NULL
);
"""


_MIGRATIONS = [
    # Add columns introduced after initial schema
    "ALTER TABLE ci_runs ADD COLUMN instance_vcpus INTEGER",
    "ALTER TABLE ci_runs ADD COLUMN job_id TEXT DEFAULT ''",
    "ALTER TABLE ci_runs ADD COLUMN arch TEXT DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_ci_runs_dashboard ON ci_runs(dashboard)",
    "ALTER TABLE test_events ADD COLUMN test_hash TEXT",
    "CREATE INDEX IF NOT EXISTS idx_test_events_hash ON test_events(test_hash)",
    "ALTER TABLE merge_queue_daily ADD COLUMN avg_depth REAL",
    "ALTER TABLE merge_queue_daily ADD COLUMN peak_depth INTEGER",
    "CREATE INDEX IF NOT EXISTS idx_test_events_duration_ts ON test_events(timestamp) WHERE duration_secs IS NOT NULL AND duration_secs > 0",
    "ALTER TABLE test_daily_stats ADD COLUMN total_secs REAL NOT NULL DEFAULT 0",
    "ALTER TABLE test_daily_stats ADD COLUMN count_timed INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE test_daily_stats ADD COLUMN min_secs REAL",
    "ALTER TABLE test_daily_stats ADD COLUMN max_secs REAL",
    "CREATE INDEX IF NOT EXISTS idx_test_events_duration ON test_events(duration_secs DESC) WHERE duration_secs IS NOT NULL AND duration_secs > 0",
]


def get_db() -> sqlite3.Connection:
    conn = getattr(_local, 'conn', None)
    if conn is None:
        os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
        conn = sqlite3.connect(_DB_PATH)
        conn.execute('PRAGMA busy_timeout = 5000')
        # Cap the on-disk -wal so a checkpoint truncates it instead of letting
        # it grow forever.
        conn.execute(f'PRAGMA journal_size_limit = {_WAL_SIZE_LIMIT_BYTES}')
        conn.execute('PRAGMA wal_autocheckpoint = 1000')
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)
        # Run migrations (ignore "duplicate column" errors for idempotency)
        for sql in _MIGRATIONS:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError:
                pass
        conn.commit()
        _local.conn = conn
        _ensure_wal_checkpointer()
    return conn


def _wal_checkpoint_loop():
    """Periodically force a TRUNCATE checkpoint so the -wal cannot grow without
    bound under long-lived reader connections. Uses its own connection so it
    never races a request thread's cursor."""
    conn = sqlite3.connect(_DB_PATH)
    conn.execute('PRAGMA busy_timeout = 5000')
    conn.execute(f'PRAGMA journal_size_limit = {_WAL_SIZE_LIMIT_BYTES}')
    while True:
        time.sleep(_WAL_CHECKPOINT_SECS)
        try:
            conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        except sqlite3.OperationalError:
            # Busy (a reader held it the whole window); next tick retries.
            pass


def _ensure_wal_checkpointer():
    """Start the background checkpointer exactly once per process."""
    global _checkpoint_started
    with _checkpoint_lock:
        if _checkpoint_started:
            return
        threading.Thread(target=_wal_checkpoint_loop, name='wal-checkpoint',
                         daemon=True).start()
        _checkpoint_started = True


def query(sql: str, params=()) -> list[dict]:
    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def execute(sql: str, params=()):
    conn = get_db()
    conn.execute(sql, params)
    conn.commit()


def cache_get(key: str):
    """Return cached value (parsed JSON) if not expired, else None."""
    rows = query('SELECT value, created_at, ttl_secs FROM api_cache WHERE key = ?', (key,))
    if rows and time.time() - rows[0]['created_at'] < rows[0]['ttl_secs']:
        return json.loads(rows[0]['value'])
    return None


def cache_set(key: str, data, ttl_secs: int = 300) -> None:
    """Store data as JSON in the cache with a TTL."""
    execute(
        'INSERT OR REPLACE INTO api_cache (key, value, created_at, ttl_secs) VALUES (?, ?, ?, ?)',
        (key, json.dumps(data, default=str), time.time(), ttl_secs),
    )


def cache_invalidate_prefix(prefix: str) -> None:
    """Delete all cache entries whose key starts with prefix."""
    execute('DELETE FROM api_cache WHERE key LIKE ?', (prefix + '%',))


def cache_cleanup() -> None:
    """Remove expired entries."""
    execute(
        "DELETE FROM api_cache WHERE created_at + ttl_secs < unixepoch('now')"
    )
