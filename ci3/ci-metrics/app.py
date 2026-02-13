from flask import Flask, request, Response, redirect
from flask_compress import Compress
from flask_httpauth import HTTPBasicAuth
from datetime import datetime, timedelta
import json
import os
import re
import redis
import threading
from pathlib import Path

import db
import metrics
import github_data
import billing.aws as billing_aws
from billing import (
    get_billing_files_in_range,
    aggregate_billing_weekly, aggregate_billing_monthly,
    serve_billing_dashboard,
)

REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
LOGS_DISK_PATH = os.getenv('LOGS_DISK_PATH', '/logs-disk')
DASHBOARD_PASSWORD = os.getenv('DASHBOARD_PASSWORD', 'password')

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=False)

app = Flask(__name__)
Compress(app)
auth = HTTPBasicAuth()


@auth.verify_password
def verify_password(username, password):
    return password == DASHBOARD_PASSWORD


def _init():
    """Initialize SQLite, warm caches, and start background threads."""
    try:
        db.get_db()
        metrics.start_test_listener(r)
        metrics.start_ci_run_sync(r)
        print("[ci-metrics] Background threads started")
    except Exception as e:
        print(f"[ci-metrics] Warning: startup failed: {e}")
    # Warm billing caches so first request isn't slow
    try:
        from billing.gcp import _ensure_cached as _warm_gcp
        _warm_gcp()
        print("[ci-metrics] GCP billing cache warmed")
    except Exception as e:
        print(f"[ci-metrics] GCP billing warmup failed: {e}")
    try:
        billing_aws.get_costs_overview()
        print("[ci-metrics] AWS costs cache warmed")
    except Exception as e:
        print(f"[ci-metrics] AWS costs warmup failed: {e}")

threading.Thread(target=_init, daemon=True, name='metrics-init').start()


# ---- Helpers ----

def _aggregate_dates(by_date_list, granularity, sum_fields, avg_fields=None):
    """Aggregate a list of {date, ...} dicts by weekly/monthly granularity."""
    if granularity == 'daily' or not by_date_list:
        return by_date_list

    buckets = {}
    for entry in by_date_list:
        d = datetime.strptime(entry['date'], '%Y-%m-%d')
        if granularity == 'weekly':
            key = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        else:  # monthly
            key = d.strftime('%Y-%m') + '-01'

        if key not in buckets:
            buckets[key] = {'date': key}
            for f in sum_fields:
                buckets[key][f] = 0
            if avg_fields:
                for f in avg_fields:
                    buckets[key][f'_avg_sum_{f}'] = 0
                    buckets[key][f'_avg_cnt_{f}'] = 0

        for f in sum_fields:
            buckets[key][f] += entry.get(f) or 0
        if avg_fields:
            for f in avg_fields:
                val = entry.get(f)
                if val is not None:
                    buckets[key][f'_avg_sum_{f}'] += val
                    buckets[key][f'_avg_cnt_{f}'] += 1

    result = []
    for key in sorted(buckets):
        b = buckets[key]
        out = {'date': b['date']}
        for f in sum_fields:
            out[f] = round(b[f], 2) if isinstance(b[f], float) else b[f]
        if avg_fields:
            for f in avg_fields:
                cnt = b[f'_avg_cnt_{f}']
                out[f] = round(b[f'_avg_sum_{f}'] / cnt, 1) if cnt else None
        result.append(out)

    return result


def _json(data):
    return Response(json.dumps(data), mimetype='application/json')


# ---- Namespace billing ----

@app.route('/namespace-billing')
@auth.login_required
def namespace_billing():
    html = serve_billing_dashboard()
    if html:
        return html
    return "Billing dashboard not found", 404


@app.route('/api/billing/data')
@auth.login_required
def billing_data():
    date_from_str = request.args.get('from')
    date_to_str = request.args.get('to')
    granularity = request.args.get('granularity', 'daily')

    if not date_from_str or not date_to_str:
        return _json({'error': 'from and to date params required (YYYY-MM-DD)'}), 400
    try:
        date_from = datetime.strptime(date_from_str, '%Y-%m-%d')
        date_to = datetime.strptime(date_to_str, '%Y-%m-%d')
    except ValueError:
        return _json({'error': 'Invalid date format, use YYYY-MM-DD'}), 400

    daily_data = get_billing_files_in_range(date_from, date_to)

    # Filter out namespaces costing less than $1 total across the range
    ns_totals = {}
    for entry in daily_data:
        for ns, ns_data in entry.get('namespaces', {}).items():
            ns_totals[ns] = ns_totals.get(ns, 0) + ns_data.get('total', 0)
    cheap_ns = {ns for ns, total in ns_totals.items() if total < 1.0}
    if cheap_ns:
        for entry in daily_data:
            entry['namespaces'] = {ns: d for ns, d in entry.get('namespaces', {}).items()
                                   if ns not in cheap_ns}

    if granularity == 'weekly':
        result = aggregate_billing_weekly(daily_data)
    elif granularity == 'monthly':
        result = aggregate_billing_monthly(daily_data)
    else:
        result = daily_data

    return _json(result)


# ---- CI runs ----

@app.route('/api/ci/runs')
@auth.login_required
def api_ci_runs():
    date_from = request.args.get('from', '')
    date_to = request.args.get('to', '')
    status_filter = request.args.get('status', '')
    author = request.args.get('author', '')
    dashboard = request.args.get('dashboard', '')
    limit = min(int(request.args.get('limit', 100)), 1000)
    offset = int(request.args.get('offset', 0))

    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000) if date_from else None
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000) if date_to else None

    runs = metrics.get_ci_runs(r, ts_from, ts_to)

    if status_filter:
        runs = [run for run in runs if run.get('status') == status_filter]
    if author:
        runs = [run for run in runs if run.get('author') == author]
    if dashboard:
        runs = [run for run in runs if run.get('dashboard') == dashboard]

    runs.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    runs = runs[offset:offset + limit]

    return _json(runs)


@app.route('/api/ci/stats')
@auth.login_required
def api_ci_stats():
    ts_from = int((datetime.now() - timedelta(days=7)).timestamp() * 1000)
    runs = metrics.get_ci_runs(r, ts_from)

    total = len(runs)
    passed = sum(1 for run in runs if run.get('status') == 'PASSED')
    failed = sum(1 for run in runs if run.get('status') == 'FAILED')
    costs = [run['cost_usd'] for run in runs if run.get('cost_usd') is not None]
    durations = []
    for run in runs:
        complete = run.get('complete')
        ts = run.get('timestamp')
        if complete and ts:
            durations.append((complete - ts) / 60000.0)

    return _json({
        'total_runs': total,
        'passed': passed,
        'failed': failed,
        'total_cost': round(sum(costs), 2) if costs else None,
        'avg_duration_mins': round(sum(durations) / len(durations), 1) if durations else None,
    })


# ---- Cost endpoints ----

@app.route('/api/costs/overview')
@auth.login_required
def api_costs_overview():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    granularity = request.args.get('granularity', 'daily')
    result = billing_aws.get_costs_overview(date_from, date_to)
    if granularity != 'daily' and result.get('by_date'):
        buckets = {}
        for entry in result['by_date']:
            d = datetime.strptime(entry['date'], '%Y-%m-%d')
            if granularity == 'weekly':
                key = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
            else:
                key = d.strftime('%Y-%m') + '-01'
            if key not in buckets:
                buckets[key] = {'date': key, 'aws': {}, 'gcp': {}, 'aws_total': 0, 'gcp_total': 0}
            for cat, amt in entry.get('aws', {}).items():
                buckets[key]['aws'][cat] = buckets[key]['aws'].get(cat, 0) + amt
            for cat, amt in entry.get('gcp', {}).items():
                buckets[key]['gcp'][cat] = buckets[key]['gcp'].get(cat, 0) + amt
            buckets[key]['aws_total'] += entry.get('aws_total', 0)
            buckets[key]['gcp_total'] += entry.get('gcp_total', 0)
        result['by_date'] = sorted(buckets.values(), key=lambda x: x['date'])
    result['period'] = {'from': date_from, 'to': date_to}
    return _json(result)


@app.route('/api/costs/details')
@auth.login_required
def api_costs_details():
    """Per-resource (USAGE_TYPE) cost breakdown."""
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))

    rows = billing_aws.get_aws_cost_details(date_from, date_to)

    usage_map = {}
    for row in rows:
        ut = row['usage_type']
        if ut not in usage_map:
            usage_map[ut] = {
                'usage_type': ut,
                'service': row['service'],
                'category': row['category'],
                'total': 0,
                'by_date': {},
                'is_ri': 'HeavyUsage' in ut,
            }
        usage_map[ut]['total'] += row['amount_usd']
        d = row['date']
        usage_map[ut]['by_date'][d] = usage_map[ut]['by_date'].get(d, 0) + row['amount_usd']

    items = sorted(usage_map.values(), key=lambda x: -x['total'])
    for item in items:
        item['total'] = round(item['total'], 2)
        item['by_date'] = {d: round(v, 4) for d, v in sorted(item['by_date'].items())}

    all_dates = sorted({row['date'] for row in rows})
    ri_items = [i for i in items if i['is_ri']]
    ri_total = round(sum(i['total'] for i in ri_items), 2)

    return _json({
        'items': items,
        'dates': all_dates,
        'ri_total': ri_total,
        'grand_total': round(sum(i['total'] for i in items), 2),
    })


@app.route('/api/costs/attribution')
@auth.login_required
def api_costs_attribution():
    """CI cost attribution by user, branch, instance."""
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)

    runs = metrics.get_ci_runs(r, ts_from, ts_to)
    runs_with_cost = [run for run in runs if run.get('cost_usd') is not None]

    # Enrich merge queue runs with PR author from GitHub
    pr_numbers = {run.get('pr_number') for run in runs_with_cost if run.get('pr_number')}
    pr_authors = github_data.batch_get_pr_authors(pr_numbers)

    granularity = request.args.get('granularity', 'daily')

    instances = []
    by_user = {}
    by_branch = {}
    by_type = {}
    by_date_type = {}

    for run in runs_with_cost:
        info = billing_aws.decode_branch_info(run)
        cost = run['cost_usd']
        date = metrics._ts_to_date(run.get('timestamp', 0))

        author = info['author']
        prn = info['pr_number']
        if prn and int(prn) in pr_authors:
            author = pr_authors[int(prn)]['author']

        inst_type = run.get('instance_type', 'unknown')
        vcpus = run.get('instance_vcpus')
        if inst_type == 'unknown' and vcpus:
            inst_type = f'{vcpus}vcpu'

        instances.append({
            'instance_name': info['instance_name'],
            'date': date,
            'cost_usd': cost,
            'author': author,
            'branch': info['branch'],
            'pr_number': prn,
            'type': info['type'],
            'instance_type': inst_type,
            'spot': run.get('spot', False),
            'job_id': run.get('job_id', ''),
            'duration_mins': round((run.get('complete', 0) - run.get('timestamp', 0)) / 60000, 1) if run.get('complete') else None,
        })

        if author not in by_user:
            by_user[author] = {'aws_cost': 0, 'gcp_cost': 0, 'runs': 0, 'by_date': {}}
        by_user[author]['aws_cost'] += cost
        by_user[author]['runs'] += 1
        by_user[author]['by_date'][date] = by_user[author]['by_date'].get(date, 0) + cost

        branch_key = info['branch'] or info['type']
        if branch_key not in by_branch:
            by_branch[branch_key] = {'cost': 0, 'runs': 0, 'type': info['type'], 'author': author}
        by_branch[branch_key]['cost'] += cost
        by_branch[branch_key]['runs'] += 1

        rt = info['type']
        if rt not in by_type:
            by_type[rt] = {'cost': 0, 'runs': 0}
        by_type[rt]['cost'] += cost
        by_type[rt]['runs'] += 1

        if date not in by_date_type:
            by_date_type[date] = {}
        by_date_type[date][rt] = by_date_type[date].get(rt, 0) + cost

    # GCP costs — reported as total, no namespace→user heuristic
    gcp_total = 0
    try:
        from billing.gcp import get_billing_files_in_range as get_gcp_billing
        gcp_data = get_gcp_billing(
            datetime.strptime(date_from, '%Y-%m-%d'),
            datetime.strptime(date_to, '%Y-%m-%d'),
        )
        for entry in gcp_data:
            for ns, ns_data in entry.get('namespaces', {}).items():
                gcp_total += ns_data.get('total', 0)
    except Exception as e:
        print(f"[attribution] GKE billing error: {e}")

    # Sort and format
    user_list = [{'author': a, 'aws_cost': round(v['aws_cost'], 2), 'gcp_cost': round(v['gcp_cost'], 2),
                  'total_cost': round(v['aws_cost'] + v['gcp_cost'], 2), 'runs': v['runs'],
                  'by_date': {d: round(c, 2) for d, c in sorted(v['by_date'].items())}}
                 for a, v in sorted(by_user.items(), key=lambda x: -(x[1]['aws_cost'] + x[1]['gcp_cost']))]

    branch_list = [{'branch': b, 'cost': round(v['cost'], 2), 'runs': v['runs'],
                     'type': v['type'], 'author': v['author']}
                    for b, v in sorted(by_branch.items(), key=lambda x: -x[1]['cost'])[:100]]

    type_list = [{'type': t, 'cost': round(v['cost'], 2), 'runs': v['runs']}
                 for t, v in sorted(by_type.items(), key=lambda x: -x[1]['cost'])]

    instances.sort(key=lambda x: -(x['cost_usd'] or 0))

    all_types = sorted(by_type.keys())
    by_date_list = []
    for date in sorted(by_date_type):
        entry = {'date': date, 'total': 0, 'runs': 0}
        for rt in all_types:
            entry[rt] = round(by_date_type[date].get(rt, 0), 2)
            entry['total'] += by_date_type[date].get(rt, 0)
        entry['total'] = round(entry['total'], 2)
        entry['runs'] = sum(1 for inst in instances if inst['date'] == date)
        by_date_list.append(entry)

    by_date_list = _aggregate_dates(by_date_list, granularity,
                                     sum_fields=['total', 'runs'] + all_types)

    total_aws = sum(u['aws_cost'] for u in user_list)

    return _json({
        'by_user': user_list,
        'by_branch': branch_list,
        'by_type': type_list,
        'by_date': by_date_list,
        'run_types': all_types,
        'instances': instances[:500],
        'period': {'from': date_from, 'to': date_to},
        'totals': {'aws': round(total_aws, 2), 'gcp': round(gcp_total, 2),
                   'gcp_unattributed': round(gcp_total, 2),
                   'combined': round(total_aws + gcp_total, 2)},
    })


@app.route('/api/costs/runners')
@auth.login_required
def api_costs_runners():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    granularity = request.args.get('granularity', 'daily')
    dashboard = request.args.get('dashboard', '')
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)

    runs = metrics.get_ci_runs(r, ts_from, ts_to)
    runs_with_cost = [run for run in runs if run.get('cost_usd') is not None]
    if dashboard:
        runs_with_cost = [run for run in runs_with_cost if run.get('dashboard') == dashboard]

    by_date_map = {}
    for run in runs_with_cost:
        date = metrics._ts_to_date(run.get('timestamp', 0))
        if date not in by_date_map:
            by_date_map[date] = {'spot_cost': 0, 'ondemand_cost': 0, 'total': 0}
        cost = run['cost_usd']
        if run.get('spot'):
            by_date_map[date]['spot_cost'] += cost
        else:
            by_date_map[date]['ondemand_cost'] += cost
        by_date_map[date]['total'] += cost

    by_date = [{'date': date, 'spot_cost': round(d['spot_cost'], 2),
                'ondemand_cost': round(d['ondemand_cost'], 2), 'total': round(d['total'], 2),
                'spot_pct': round(100.0 * d['spot_cost'] / max(d['total'], 0.01), 1)}
               for date, d in sorted(by_date_map.items())]

    by_date = _aggregate_dates(by_date, granularity,
                               sum_fields=['spot_cost', 'ondemand_cost', 'total'])
    for d in by_date:
        d['spot_pct'] = round(100.0 * d['spot_cost'] / max(d['total'], 0.01), 1)

    by_instance_map = {}
    for run in runs_with_cost:
        inst = run.get('instance_type', 'unknown')
        if inst not in by_instance_map:
            by_instance_map[inst] = {'cost': 0, 'runs': 0}
        by_instance_map[inst]['cost'] += run['cost_usd']
        by_instance_map[inst]['runs'] += 1
    by_instance = [{'instance_type': k, 'cost': round(v['cost'], 2), 'runs': v['runs']}
                   for k, v in sorted(by_instance_map.items(), key=lambda x: -x[1]['cost'])]

    by_dash_map = {}
    for run in runs_with_cost:
        dash = run.get('dashboard', 'unknown')
        if dash not in by_dash_map:
            by_dash_map[dash] = {'cost': 0, 'runs': 0}
        by_dash_map[dash]['cost'] += run['cost_usd']
        by_dash_map[dash]['runs'] += 1
    by_dashboard = [{'dashboard': k, 'cost': round(v['cost'], 2), 'runs': v['runs']}
                    for k, v in sorted(by_dash_map.items(), key=lambda x: -x[1]['cost'])]

    total_cost = sum(run['cost_usd'] for run in runs_with_cost)
    spot_cost = sum(run['cost_usd'] for run in runs_with_cost if run.get('spot'))

    return _json({
        'by_date': by_date,
        'by_instance_type': by_instance,
        'by_dashboard': by_dashboard,
        'period': {'from': date_from, 'to': date_to},
        'summary': {
            'total_cost': round(total_cost, 2),
            'spot_pct': round(100.0 * spot_cost / max(total_cost, 0.01), 1),
            'avg_cost_per_run': round(total_cost / max(len(runs_with_cost), 1), 2),
            'total_runs': len(runs_with_cost),
        },
    })


# ---- CI Performance ----

@app.route('/api/ci/performance')
@auth.login_required
def api_ci_performance():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    dashboard = request.args.get('dashboard', '')
    granularity = request.args.get('granularity', 'daily')
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)

    runs = metrics.get_ci_runs(r, ts_from, ts_to)
    runs = [run for run in runs if run.get('status') in ('PASSED', 'FAILED')]
    if dashboard:
        runs = [run for run in runs if run.get('dashboard') == dashboard]

    by_date_map = {}
    for run in runs:
        date = metrics._ts_to_date(run.get('timestamp', 0))
        if date not in by_date_map:
            by_date_map[date] = {'total': 0, 'passed': 0, 'failed': 0, 'durations': []}
        by_date_map[date]['total'] += 1
        if run.get('status') == 'PASSED':
            by_date_map[date]['passed'] += 1
        else:
            by_date_map[date]['failed'] += 1
        complete = run.get('complete')
        ts = run.get('timestamp')
        if complete and ts:
            by_date_map[date]['durations'].append((complete - ts) / 60000.0)

    by_date = []
    for date in sorted(by_date_map):
        d = by_date_map[date]
        by_date.append({
            'date': date,
            'total': d['total'],
            'passed': d['passed'],
            'failed': d['failed'],
            'pass_rate': round(100.0 * d['passed'] / max(d['total'], 1), 1),
            'failure_rate': round(100.0 * d['failed'] / max(d['total'], 1), 1),
            'avg_duration_mins': round(sum(d['durations']) / len(d['durations']), 1) if d['durations'] else None,
        })

    # Merge test outcome counts from test_daily_stats before aggregation
    ds_conditions = ['date >= ?', 'date <= ?']
    ds_params = [date_from, date_to]
    if dashboard:
        ds_conditions.append('dashboard = ?')
        ds_params.append(dashboard)
    ds_where = 'WHERE ' + ' AND '.join(ds_conditions)

    daily_test_counts = db.query(f'''
        SELECT date, SUM(passed) as passed, SUM(failed) as failed, SUM(flaked) as flaked
        FROM test_daily_stats {ds_where}
        GROUP BY date
    ''', ds_params)
    daily_test_map = {r['date']: r for r in daily_test_counts}
    for d in by_date:
        tc = daily_test_map.get(d['date'], {})
        d['flake_count'] = tc.get('flaked', 0) or 0
        d['test_failure_count'] = tc.get('failed', 0) or 0
        d['test_success_count'] = tc.get('passed', 0) or 0

    by_date = _aggregate_dates(by_date, granularity,
                               sum_fields=['total', 'passed', 'failed',
                                           'flake_count', 'test_failure_count', 'test_success_count'],
                               avg_fields=['avg_duration_mins'])
    for d in by_date:
        d['pass_rate'] = round(100.0 * d['passed'] / max(d['total'], 1), 1)
        d['failure_rate'] = round(100.0 * d['failed'] / max(d['total'], 1), 1)

    # Top flakes/failures
    if dashboard:
        top_flakes = db.query('''
            SELECT test_cmd, COUNT(*) as count, ref_name
            FROM test_events WHERE status='flaked' AND dashboard = ?
            AND timestamp >= ? AND timestamp <= ?
            GROUP BY test_cmd ORDER BY count DESC LIMIT 15
        ''', (dashboard, date_from, date_to + 'T23:59:59'))
        top_failures = db.query('''
            SELECT test_cmd, COUNT(*) as count
            FROM test_events WHERE status='failed' AND dashboard = ?
            AND timestamp >= ? AND timestamp <= ?
            GROUP BY test_cmd ORDER BY count DESC LIMIT 15
        ''', (dashboard, date_from, date_to + 'T23:59:59'))
    else:
        top_flakes = db.query('''
            SELECT test_cmd, COUNT(*) as count, ref_name
            FROM test_events WHERE status='flaked' AND timestamp >= ? AND timestamp <= ?
            GROUP BY test_cmd ORDER BY count DESC LIMIT 15
        ''', (date_from, date_to + 'T23:59:59'))
        top_failures = db.query('''
            SELECT test_cmd, COUNT(*) as count
            FROM test_events WHERE status='failed' AND timestamp >= ? AND timestamp <= ?
            GROUP BY test_cmd ORDER BY count DESC LIMIT 15
        ''', (date_from, date_to + 'T23:59:59'))

    # Summary
    total = len(runs)
    passed = sum(1 for run in runs if run.get('status') == 'PASSED')
    failed = total - passed
    durations = []
    for run in runs:
        complete = run.get('complete')
        ts = run.get('timestamp')
        if complete and ts:
            durations.append((complete - ts) / 60000.0)

    # Test outcome summary from test_daily_stats
    ds_summary = db.query(f'''
        SELECT SUM(passed) as passed, SUM(failed) as failed, SUM(flaked) as flaked
        FROM test_daily_stats {ds_where}
    ''', ds_params)
    ds_s = ds_summary[0] if ds_summary else {}
    fc = ds_s.get('flaked', 0) or 0
    tfc = ds_s.get('failed', 0) or 0
    tpc = ds_s.get('passed', 0) or 0
    tc = fc + tfc + tpc

    return _json({
        'by_date': by_date,
        'top_flakes': top_flakes,
        'top_failures': top_failures,
        'period': {'from': date_from, 'to': date_to},
        'summary': {
            'total_runs': total,
            'pass_rate': round(100.0 * passed / max(total, 1), 1),
            'failure_rate': round(100.0 * failed / max(total, 1), 1),
            'avg_duration_mins': round(sum(durations) / len(durations), 1) if durations else None,
            'flake_rate': round(100.0 * fc / max(tc, 1), 1) if tc else 0,
            'total_flakes': fc,
            'total_test_failures': tfc,
            'total_test_successes': tpc,
        },
    })


# ---- GitHub integration ----

@app.route('/api/deployments/speed')
@auth.login_required
def api_deploy_speed():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    workflow = request.args.get('workflow', '')
    granularity = request.args.get('granularity', 'daily')
    result = github_data.get_deployment_speed(date_from, date_to, workflow)
    if granularity != 'daily' and result.get('by_date'):
        result['by_date'] = _aggregate_dates(
            result['by_date'], granularity,
            sum_fields=['count', 'success', 'failure'],
            avg_fields=['median_mins', 'p95_mins'])
    return _json(result)


@app.route('/api/branches/lag')
@auth.login_required
def api_branch_lag():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    return _json(github_data.get_branch_lag(date_from, date_to))


@app.route('/api/prs/metrics')
@auth.login_required
def api_pr_metrics():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    author = request.args.get('author', '')
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)
    ci_runs = metrics.get_ci_runs(r, ts_from, ts_to)
    return _json(github_data.get_pr_metrics(date_from, date_to, author, ci_runs))


@app.route('/api/merge-queue/stats')
@auth.login_required
def api_merge_queue_stats():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    return _json(github_data.get_merge_queue_stats(date_from, date_to))


@app.route('/api/ci/flakes-by-command')
@auth.login_required
def api_flakes_by_command():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    dashboard = request.args.get('dashboard', '')
    metrics.sync_failed_tests_to_sqlite(r)
    return _json(metrics.get_flakes_by_command(date_from, date_to, dashboard))


# ---- Test timings ----

@app.route('/api/tests/timings')
@auth.login_required
def api_test_timings():
    """Test timing statistics: duration by test command, with trends."""
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    dashboard = request.args.get('dashboard', '')
    status = request.args.get('status', '')  # filter to specific status
    test_cmd = request.args.get('test_cmd', '')  # filter to specific test

    conditions = ['duration_secs IS NOT NULL', 'duration_secs > 0',
                  'timestamp >= ?', "timestamp < ? || 'T23:59:59'"]
    params = [date_from, date_to]

    if dashboard:
        conditions.append('dashboard = ?')
        params.append(dashboard)
    if status:
        conditions.append('status = ?')
        params.append(status)
    if test_cmd:
        conditions.append('test_cmd = ?')
        params.append(test_cmd)

    where = 'WHERE ' + ' AND '.join(conditions)

    # Per-test timing from test_events (failed/flaked only — passed not persisted)
    by_test = db.query(f'''
        SELECT test_cmd,
               COUNT(*) as event_count,
               ROUND(AVG(duration_secs), 1) as avg_secs,
               ROUND(MIN(duration_secs), 1) as min_secs,
               ROUND(MAX(duration_secs), 1) as max_secs,
               dashboard
        FROM test_events {where}
        GROUP BY test_cmd
        ORDER BY event_count DESC
        LIMIT 200
    ''', params)

    # Per-test counts from daily stats (includes passed)
    ds_conditions = ['date >= ?', 'date <= ?']
    ds_params = [date_from, date_to]
    if dashboard:
        ds_conditions.append('dashboard = ?')
        ds_params.append(dashboard)
    if test_cmd:
        ds_conditions.append('test_cmd = ?')
        ds_params.append(test_cmd)
    ds_where = 'WHERE ' + ' AND '.join(ds_conditions)

    daily_stats_by_test = {r['test_cmd']: r for r in db.query(f'''
        SELECT test_cmd,
               SUM(passed) as passed, SUM(failed) as failed, SUM(flaked) as flaked
        FROM test_daily_stats {ds_where}
        GROUP BY test_cmd
    ''', ds_params)}

    # Merge counts into timing data
    for row in by_test:
        ds = daily_stats_by_test.get(row['test_cmd'], {})
        row['passed'] = ds.get('passed', 0) or 0
        row['failed'] = ds.get('failed', 0) or row['event_count']
        row['flaked'] = ds.get('flaked', 0) or 0
        row['count'] = row['passed'] + row['failed'] + row['flaked']
        total = max(row['count'], 1)
        row['pass_rate'] = round(100.0 * row['passed'] / total, 1)
        row['total_time_secs'] = round(row['avg_secs'] * row['event_count'], 0)
        del row['event_count']

    # Also add tests that only have daily stats (all passed, no individual events)
    existing_cmds = {r['test_cmd'] for r in by_test}
    for cmd, ds in daily_stats_by_test.items():
        if cmd not in existing_cmds and not status:
            passed = ds.get('passed', 0) or 0
            failed = ds.get('failed', 0) or 0
            flaked = ds.get('flaked', 0) or 0
            total = passed + failed + flaked
            if total > 0:
                by_test.append({
                    'test_cmd': cmd, 'count': total,
                    'avg_secs': None, 'min_secs': None, 'max_secs': None,
                    'passed': passed, 'failed': failed, 'flaked': flaked,
                    'pass_rate': round(100.0 * passed / total, 1),
                    'total_time_secs': 0, 'dashboard': '',
                })
    by_test.sort(key=lambda r: r['count'], reverse=True)

    # Daily time series from daily stats
    by_date = db.query(f'''
        SELECT date,
               SUM(passed) as passed, SUM(failed) as failed, SUM(flaked) as flaked,
               SUM(passed) + SUM(failed) + SUM(flaked) as count
        FROM test_daily_stats {ds_where}
        GROUP BY date
        ORDER BY date
    ''', ds_params)

    # Enrich with timing from test_events
    timing_by_date = {r['date']: r for r in db.query(f'''
        SELECT substr(timestamp, 1, 10) as date,
               ROUND(AVG(duration_secs), 1) as avg_secs,
               ROUND(MAX(duration_secs), 1) as max_secs
        FROM test_events {where}
        GROUP BY substr(timestamp, 1, 10)
    ''', params)}
    for d in by_date:
        t = timing_by_date.get(d['date'], {})
        d['avg_secs'] = t.get('avg_secs')
        d['max_secs'] = t.get('max_secs')

    # Summary from daily stats
    ds_summary = db.query(f'''
        SELECT SUM(passed) as passed, SUM(failed) as failed, SUM(flaked) as flaked
        FROM test_daily_stats {ds_where}
    ''', ds_params)
    ds_s = ds_summary[0] if ds_summary else {}

    # Timing summary from test_events
    timing_summary = db.query(f'''
        SELECT ROUND(AVG(duration_secs), 1) as avg_secs,
               ROUND(MAX(duration_secs), 1) as max_secs,
               SUM(duration_secs) as total_secs
        FROM test_events {where}
    ''', params)
    ts = timing_summary[0] if timing_summary else {}

    passed = ds_s.get('passed', 0) or 0
    failed = ds_s.get('failed', 0) or 0
    flaked = ds_s.get('flaked', 0) or 0

    # Slowest individual test runs
    slowest = db.query(f'''
        SELECT test_cmd, status, duration_secs, dashboard,
               substr(timestamp, 1, 10) as date, commit_author, log_url
        FROM test_events {where}
        ORDER BY duration_secs DESC
        LIMIT 50
    ''', params)

    return _json({
        'by_test': by_test,
        'by_date': by_date,
        'slowest': slowest,
        'period': {'from': date_from, 'to': date_to},
        'summary': {
            'total_runs': passed + failed + flaked,
            'avg_duration_secs': ts.get('avg_secs'),
            'max_duration_secs': ts.get('max_secs'),
            'total_compute_secs': round(ts.get('total_secs', 0) or 0, 0),
            'passed': passed,
            'failed': failed,
            'flaked': flaked,
        },
    })


# ---- Dashboard views ----

@app.route('/ci-health')
@auth.login_required
def ci_health():
    return redirect('/ci-insights')


@app.route('/ci-insights')
@auth.login_required
def ci_insights():
    path = Path(__file__).parent / 'views' / 'ci-insights.html'
    if path.exists():
        return path.read_text()
    return "Dashboard not found", 404


@app.route('/cost-overview')
@auth.login_required
def cost_overview():
    path = Path(__file__).parent / 'views' / 'cost-overview.html'
    if path.exists():
        return path.read_text()
    return "Dashboard not found", 404


@app.route('/test-timings')
@auth.login_required
def test_timings():
    path = Path(__file__).parent / 'views' / 'test-timings.html'
    if path.exists():
        return path.read_text()
    return "Dashboard not found", 404


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8081)
