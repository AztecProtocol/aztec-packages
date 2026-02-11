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
    timestamp      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_test_events_status ON test_events(status);
CREATE INDEX IF NOT EXISTS idx_test_events_ts ON test_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_test_events_cmd ON test_events(test_cmd);

CREATE TABLE IF NOT EXISTS merge_queue_daily (
    date           TEXT PRIMARY KEY,
    total          INTEGER NOT NULL DEFAULT 0,
    success        INTEGER NOT NULL DEFAULT 0,
    failure        INTEGER NOT NULL DEFAULT 0,
    cancelled      INTEGER NOT NULL DEFAULT 0,
    in_progress    INTEGER NOT NULL DEFAULT 0
);
"""


def get_db() -> sqlite3.Connection:
    conn = getattr(_local, 'conn', None)
    if conn is None:
        os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
        conn = sqlite3.connect(_DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)
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
