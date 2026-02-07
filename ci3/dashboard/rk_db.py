"""SQLite database for CI cost and metrics tracking.

Single WAL-mode database at {LOGS_DISK_PATH}/metrics.db.
All tables are created on first call to get_db().
"""
import os
import sqlite3
import threading

_DB_PATH = os.path.join(os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'metrics.db')
_local = threading.local()

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS aws_daily_costs (
    date       TEXT NOT NULL,
    service    TEXT NOT NULL,
    category   TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    currency   TEXT NOT NULL DEFAULT 'USD',
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (date, service)
);
CREATE INDEX IF NOT EXISTS idx_aws_costs_date ON aws_daily_costs(date);
CREATE INDEX IF NOT EXISTS idx_aws_costs_category ON aws_daily_costs(category);

CREATE TABLE IF NOT EXISTS gcp_namespace_costs (
    date       TEXT NOT NULL,
    namespace  TEXT NOT NULL,
    category   TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    PRIMARY KEY (date, namespace, category)
);
CREATE INDEX IF NOT EXISTS idx_gcp_costs_date ON gcp_namespace_costs(date);
CREATE INDEX IF NOT EXISTS idx_gcp_costs_ns ON gcp_namespace_costs(namespace);

CREATE TABLE IF NOT EXISTS ci_runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id         TEXT NOT NULL,
    job_id         TEXT NOT NULL,
    timestamp_ms   INTEGER NOT NULL,
    complete_ms    INTEGER,
    status         TEXT NOT NULL,
    dashboard      TEXT NOT NULL,
    ref_name       TEXT NOT NULL,
    target_branch  TEXT,
    commit_hash    TEXT,
    msg            TEXT,
    name           TEXT NOT NULL,
    author         TEXT NOT NULL,
    arch           TEXT,
    spot           INTEGER,
    instance_type  TEXT,
    instance_vcpus INTEGER,
    pr_number      INTEGER,
    cost_usd       REAL,
    UNIQUE(run_id, job_id, timestamp_ms)
);
CREATE INDEX IF NOT EXISTS idx_ci_runs_run_id ON ci_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_ci_runs_status ON ci_runs(status);
CREATE INDEX IF NOT EXISTS idx_ci_runs_dashboard ON ci_runs(dashboard);
CREATE INDEX IF NOT EXISTS idx_ci_runs_author ON ci_runs(author);
CREATE INDEX IF NOT EXISTS idx_ci_runs_pr ON ci_runs(pr_number);
CREATE INDEX IF NOT EXISTS idx_ci_runs_date ON ci_runs(timestamp_ms);

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
CREATE INDEX IF NOT EXISTS idx_test_events_ref ON test_events(ref_name);
CREATE INDEX IF NOT EXISTS idx_test_events_ts ON test_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_test_events_cmd ON test_events(test_cmd);

CREATE TABLE IF NOT EXISTS deployments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id         TEXT NOT NULL,
    workflow_name  TEXT NOT NULL,
    ref_name       TEXT NOT NULL,
    namespace      TEXT,
    status         TEXT NOT NULL,
    started_at     TEXT NOT NULL,
    completed_at   TEXT,
    duration_secs  REAL,
    trigger        TEXT,
    UNIQUE(run_id, workflow_name)
);
CREATE INDEX IF NOT EXISTS idx_deployments_workflow ON deployments(workflow_name);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

CREATE TABLE IF NOT EXISTS branch_lag (
    date           TEXT NOT NULL,
    source_branch  TEXT NOT NULL,
    target_branch  TEXT NOT NULL,
    commits_behind INTEGER NOT NULL,
    days_behind    REAL,
    PRIMARY KEY (date, source_branch, target_branch)
);

CREATE TABLE IF NOT EXISTS pr_lifecycle (
    pr_number      INTEGER PRIMARY KEY,
    author         TEXT NOT NULL,
    title          TEXT,
    created_at     TEXT NOT NULL,
    merged_at      TEXT,
    closed_at      TEXT,
    base_branch    TEXT,
    ci_runs_count  INTEGER DEFAULT 0,
    ci_cost_usd    REAL DEFAULT 0,
    merge_time_hrs REAL
);
CREATE INDEX IF NOT EXISTS idx_pr_lifecycle_author ON pr_lifecycle(author);
CREATE INDEX IF NOT EXISTS idx_pr_lifecycle_merged ON pr_lifecycle(merged_at);

CREATE TABLE IF NOT EXISTS sync_state (
    source     TEXT PRIMARY KEY,
    last_sync  TEXT NOT NULL,
    last_date  TEXT,
    status     TEXT DEFAULT 'ok',
    error_msg  TEXT
);
"""


def get_db() -> sqlite3.Connection:
    """Get a thread-local SQLite connection, creating the schema if needed."""
    conn = getattr(_local, 'conn', None)
    if conn is None:
        os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
        conn = sqlite3.connect(_DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)
        _local.conn = conn
    return conn


def query(sql: str, params=()) -> list[dict]:
    """Execute a SELECT and return results as list of dicts."""
    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def execute(sql: str, params=()):
    """Execute a write statement and commit."""
    conn = get_db()
    conn.execute(sql, params)
    conn.commit()


def executemany(sql: str, param_list):
    """Execute a write statement for many rows and commit."""
    conn = get_db()
    conn.executemany(sql, param_list)
    conn.commit()
