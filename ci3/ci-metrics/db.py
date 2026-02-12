"""SQLite database for CI metrics storage.

Stores test events (from Redis pub/sub) and merge queue daily stats
(backfilled from GitHub API).
"""
import os
import sqlite3
import threading

_DB_PATH = os.path.join(os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'metrics.db')
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
