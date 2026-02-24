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

CREATE TABLE IF NOT EXISTS api_cache (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    created_at REAL NOT NULL,
    ttl_secs   INTEGER NOT NULL DEFAULT 300
);
"""


_MIGRATIONS = [
    # Add columns introduced after initial schema
    "ALTER TABLE ci_runs ADD COLUMN instance_vcpus INTEGER",
    "ALTER TABLE ci_runs ADD COLUMN job_id TEXT DEFAULT ''",
    "ALTER TABLE ci_runs ADD COLUMN arch TEXT DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_ci_runs_dashboard ON ci_runs(dashboard)",
]


def get_db() -> sqlite3.Connection:
    conn = getattr(_local, 'conn', None)
    if conn is None:
        os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
        conn = sqlite3.connect(_DB_PATH)
        conn.execute('PRAGMA busy_timeout = 5000')
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
    return conn


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
        "DELETE FROM api_cache WHERE cast(strftime('%s','now') as real) - created_at > ttl_secs"
    )
