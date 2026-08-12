"""Automated performance tests: SQLite response cache makes 1-year ci-insights fast.

Usage:
    pip install pytest
    METRICS_DB_PATH=/tmp/t.db DASHBOARD_PASSWORD=test REDIS_HOST=invalid pytest test_cache.py -v

All 18 parametrised tests should pass.  Cold requests may take several seconds;
warm (cached) requests must be < 100 ms each.
"""
import base64
import json
import os
import tempfile
import time
from datetime import date, timedelta

# Set env vars BEFORE importing the app so db path and Redis host are fixed
_db_path = tempfile.mktemp(suffix='.db')
os.environ.setdefault('METRICS_DB_PATH', _db_path)
os.environ.setdefault('DASHBOARD_PASSWORD', 'test')
os.environ.setdefault('REDIS_HOST', 'invalid')  # causes Redis errors, swallowed silently

import pytest

# Import app after env vars are set; background threads start but Redis fails gracefully
from app import app
import db

# Basic-auth header for 'test:test'
_AUTH = {'Authorization': 'Basic ' + base64.b64encode(b'test:test').decode()}

YEAR_FROM = '2025-02-24'
YEAR_TO = '2026-02-24'

ENDPOINTS = [
    f'/api/ci/performance?from={YEAR_FROM}&to={YEAR_TO}&granularity=daily',
    f'/api/ci/phases?from={YEAR_FROM}&to={YEAR_TO}',
    f'/api/ci/flakes-by-command?from={YEAR_FROM}&to={YEAR_TO}',
    f'/api/tests/timings?from={YEAR_FROM}&to={YEAR_TO}',
    f'/api/merge-queue/stats?from={YEAR_FROM}&to={YEAR_TO}',
    f'/api/prs/metrics?from={YEAR_FROM}&to={YEAR_TO}',
]


def _seed():
    """Insert one year of synthetic data covering all 6 ci-insights endpoints."""
    conn = db.get_db()
    dashboards = ['main', 'prs']
    start = date(2025, 2, 24)
    end = date(2026, 2, 24)
    ts_base = int(time.mktime(start.timetuple())) * 1000
    ms_per_day = 86_400_000

    for i, day in enumerate(
        start + timedelta(days=n) for n in range((end - start).days + 1)
    ):
        ds = day.isoformat()
        ts = ts_base + i * ms_per_day

        # merge_queue_daily — one row per day
        conn.execute(
            'INSERT OR IGNORE INTO merge_queue_daily (date, total, success, failure) VALUES (?,10,8,2)',
            (ds,),
        )

        for dash in dashboards:
            # ci_runs — 5 per pipeline per day
            for j in range(5):
                conn.execute(
                    '''INSERT OR IGNORE INTO ci_runs
                       (dashboard, name, timestamp_ms, complete_ms, status, author, synced_at)
                       VALUES (?,?,?,?,?,?,?)''',
                    (
                        dash, f'run-{i}-{dash}-{j}',
                        ts + j * 60_000,
                        ts + j * 60_000 + 3_600_000,
                        'PASSED' if j % 5 != 0 else 'FAILED',
                        'ci-bot', ds,
                    ),
                )

            # test_daily_stats
            conn.execute(
                '''INSERT OR IGNORE INTO test_daily_stats
                   (date, test_cmd, dashboard, passed, failed, flaked) VALUES (?,?,?,80,5,2)''',
                (ds, f'test_{dash}', dash),
            )

            # test_events — 3 per pipeline per day (one flaked for flakes endpoint)
            for j in range(3):
                conn.execute(
                    '''INSERT OR IGNORE INTO test_events
                       (status, test_cmd, ref_name, dashboard, timestamp, duration_secs)
                       VALUES (?,?,?,?,?,?)''',
                    (
                        'passed' if j < 2 else 'flaked',
                        f'test_{dash}',
                        'main', dash,
                        f'{ds}T12:00:0{j}',
                        30.0 + j,
                    ),
                )

            # ci_phases — build + test phases per pipeline per day
            for phase in ('build', 'test'):
                conn.execute(
                    '''INSERT OR IGNORE INTO ci_phases
                       (phase, duration_secs, dashboard, timestamp) VALUES (?,?,?,?)''',
                    (phase, 1200.0, dash, f'{ds}T12:00:00'),
                )

    conn.commit()


@pytest.fixture(scope='session', autouse=True)
def seeded_db():
    _seed()


@pytest.fixture(scope='session')
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


@pytest.mark.parametrize('url', ENDPOINTS)
def test_cold_returns_valid_json(client, url):
    """First request computes from SQLite and returns valid JSON."""
    r = client.get(url, headers=_AUTH)
    assert r.status_code == 200, f'HTTP {r.status_code}: {r.data[:200]}'
    data = json.loads(r.data)
    assert data  # non-empty response


@pytest.mark.parametrize('url', ENDPOINTS)
def test_warm_hit_under_100ms(client, url):
    """Second request is served from cache and completes in < 100 ms."""
    # Ensure cold request ran (order not guaranteed across parametrised tests)
    client.get(url, headers=_AUTH)
    # Warm request — must hit cache
    t0 = time.perf_counter()
    r = client.get(url, headers=_AUTH)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert r.status_code == 200
    assert elapsed_ms < 100, f'{url}: cache hit took {elapsed_ms:.1f} ms (limit 100 ms)'


@pytest.mark.parametrize('url', ENDPOINTS)
def test_cached_response_matches_original(client, url):
    """Cached response is byte-for-byte identical to the original."""
    r1 = client.get(url, headers=_AUTH)
    r2 = client.get(url, headers=_AUTH)
    assert r1.data == r2.data
