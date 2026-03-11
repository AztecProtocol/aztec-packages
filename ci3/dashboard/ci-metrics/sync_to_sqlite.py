#!/usr/bin/env python3
"""Sync ephemeral Redis CI data to persistent SQLite.

Normally run automatically by the ci-metrics server's background sync thread.
Can also be run standalone for a one-off manual sync:

  cd ci3/dashboard/ci-metrics && python3 sync_to_sqlite.py

Connects to Redis, reads all CI runs and failed test lists, writes to SQLite.
"""
import os
import sys
import time

# Ensure this script can import sibling modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import redis as redis_lib
import db
import metrics

REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))


def main():
    start = time.time()
    r = redis_lib.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=False)

    try:
        r.ping()
    except Exception as e:
        print(f"[sync] Cannot connect to Redis at {REDIS_HOST}:{REDIS_PORT}: {e}")
        sys.exit(1)

    # Ensure DB schema is up to date
    db.get_db()

    # Force sync by resetting the TTL gates
    metrics._ci_sync_ts = 0
    metrics._failed_tests_sync_ts = 0

    # Sync CI runs
    print("[sync] Syncing CI runs from Redis to SQLite...")
    metrics.sync_ci_runs_to_sqlite(r)

    # Sync failed/flaked test events from Redis lists
    print("[sync] Syncing test events from Redis to SQLite...")
    metrics.sync_failed_tests_to_sqlite(r)

    # Report
    conn = db.get_db()
    ci_count = conn.execute('SELECT COUNT(*) as c FROM ci_runs').fetchone()['c']
    te_count = conn.execute('SELECT COUNT(*) as c FROM test_events').fetchone()['c']
    elapsed = time.time() - start
    print(f"[sync] Done in {elapsed:.1f}s. SQLite: {ci_count} CI runs, {te_count} test events.")


if __name__ == '__main__':
    main()
