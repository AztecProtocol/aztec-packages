"""Namespace billing helpers for rkapp.

Fetches GKE namespace billing from BigQuery with in-memory cache.
Route definitions remain in rk.py; this module provides the logic.
"""
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# BigQuery defaults
_BQ_PROJECT = 'testnet-440309'
_BQ_DATASET = 'egress_consumption'
_BQ_TABLE_USAGE = 'gke_cluster_resource_usage'

# SKU pricing (from GCP Cloud Billing Catalog API, us-west1)
# cpu: price per vCPU-hour, memory: price per GiB-hour
# network: price per GiB, storage: price per GiB-month
_SKU_PRICING = {
    # Compute - Spot
    'E7FF-A0FB-FA82': {'price': 0.00497,  'resource': 'cpu',    'category': 'compute_spot'},
    '48AB-89F5-9112': {'price': 0.000668, 'resource': 'memory', 'category': 'compute_spot'},
    # Compute - On-demand T2D
    'EFE6-E23C-19CB': {'price': 0.027502, 'resource': 'cpu',    'category': 'compute_ondemand'},
    'FB05-036A-8982': {'price': 0.003686, 'resource': 'memory', 'category': 'compute_ondemand'},
    # Compute - On-demand N2
    'BB77-5FDA-69D9': {'price': 0.031611, 'resource': 'cpu',    'category': 'compute_ondemand'},
    '5B01-D157-A097': {'price': 0.004237, 'resource': 'memory', 'category': 'compute_ondemand'},
    # Compute - On-demand N2D
    'A03E-E620-7389': {'price': 0.027502, 'resource': 'cpu',    'category': 'compute_ondemand'},
    '5535-6D2D-4B50': {'price': 0.003686, 'resource': 'memory', 'category': 'compute_ondemand'},
    # Network Egress (price per GiB)
    '0C3C-6B13-B1E8': {'price': 0.02,  'resource': 'networkEgress', 'category': 'network'},
    '6B8F-E63D-832B': {'price': 0.0,   'resource': 'networkEgress', 'category': 'network'},
    '92CB-C25F-B1D1': {'price': 0.0,   'resource': 'networkEgress', 'category': 'network'},
    '984A-1F27-2D1F': {'price': 0.04,  'resource': 'networkEgress', 'category': 'network'},
    '9DE9-9092-B3BC': {'price': 0.20,  'resource': 'networkEgress', 'category': 'network'},
    'C863-37DA-506E': {'price': 0.02,  'resource': 'networkEgress', 'category': 'network'},
    'C8EA-1A86-3D28': {'price': 0.02,  'resource': 'networkEgress', 'category': 'network'},
    'DE9E-AFBC-A15A': {'price': 0.01,  'resource': 'networkEgress', 'category': 'network'},
    'DFA5-B5C6-36D6': {'price': 0.085, 'resource': 'networkEgress', 'category': 'network'},
    'F274-1692-F213': {'price': 0.08,  'resource': 'networkEgress', 'category': 'network'},
    'FDBC-6E3B-D4D8': {'price': 0.15,  'resource': 'networkEgress', 'category': 'network'},
    # Storage (price per GiB-month)
    'D973-5D65-BAB2': {'price': 0.04,  'resource': 'storage', 'category': 'storage'},
}

# In-memory cache (same pattern as rk_aws_costs.py)
_cache = {'data': [], 'ts': 0}
_cache_lock = threading.Lock()
_CACHE_TTL = 6 * 3600  # 6 hours


# ---- BigQuery fetch ----

def _usage_to_cost(sku_id, resource_name, amount):
    info = _SKU_PRICING.get(sku_id)
    if not info:
        return 0.0, 'other'
    price = info['price']
    if resource_name == 'cpu':
        # cpu-seconds -> hours
        return (amount / 3600.0) * price, info['category']
    elif resource_name == 'memory':
        # byte-seconds -> GiB-hours
        return (amount / 3600.0 / (1024 ** 3)) * price, info['category']
    elif resource_name.startswith('networkEgress'):
        # bytes -> GiB
        return (amount / (1024 ** 3)) * price, info['category']
    elif resource_name == 'storage':
        # byte-seconds -> GiB-months (730 hours/month)
        gib_months = amount / (1024 ** 3) / (730 * 3600)
        return gib_months * price, info['category']
    return 0.0, info['category']


def _fetch_from_bigquery(date_from_str, date_to_str):
    """Query BigQuery for usage data, return list of daily billing entries."""
    try:
        from google.cloud import bigquery
    except ImportError:
        print("[rk_billing] google-cloud-bigquery not installed")
        return []

    try:
        client = bigquery.Client(project=_BQ_PROJECT)
        # Use the usage table for all resources (actual consumption, not just requests).
        # The consumption table only records resource *requests* which can be far lower
        # than actual usage (e.g. prove-n-tps-real: $2.87 requests vs $138.72 actual).
        usage = f'{_BQ_PROJECT}.{_BQ_DATASET}.{_BQ_TABLE_USAGE}'
        query = f"""
        SELECT DATE(start_time) AS date, namespace, sku_id, resource_name,
               SUM(usage.amount) AS total_usage
        FROM `{usage}`
        WHERE DATE(start_time) BETWEEN @date_from AND @date_to
        GROUP BY date, namespace, sku_id, resource_name
        ORDER BY date, namespace
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter('date_from', 'DATE', date_from_str),
                bigquery.ScalarQueryParameter('date_to', 'DATE', date_to_str),
            ]
        )
        rows = list(client.query(query, job_config=job_config).result())
    except Exception as e:
        print(f"[rk_billing] BigQuery fetch failed: {e}")
        return []

    # Build daily structures
    days = {}
    for row in rows:
        date_str = row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date)
        ns = row.namespace
        cost, category = _usage_to_cost(row.sku_id, row.resource_name, float(row.total_usage))
        if cost <= 0:
            continue
        if date_str not in days:
            days[date_str] = {'date': date_str, 'namespaces': {}}
        if ns not in days[date_str]['namespaces']:
            days[date_str]['namespaces'][ns] = {'total': 0, 'breakdown': {}}
        entry = days[date_str]['namespaces'][ns]
        entry['breakdown'][category] = entry['breakdown'].get(category, 0) + cost
        entry['total'] += cost

    # Round values
    for data in days.values():
        for ns_data in data['namespaces'].values():
            ns_data['total'] = round(ns_data['total'], 4)
            ns_data['breakdown'] = {k: round(v, 4) for k, v in ns_data['breakdown'].items()}

    return sorted(days.values(), key=lambda x: x['date'])


def _ensure_cached():
    now = time.time()
    if _cache['data'] and now - _cache['ts'] < _CACHE_TTL:
        return
    if not _cache_lock.acquire(blocking=False):
        return
    try:
        yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
        date_from = (yesterday - timedelta(days=90)).isoformat()
        date_to = yesterday.isoformat()
        print(f"[rk_billing] Fetching billing data from BigQuery ({date_from} to {date_to})...")
        data = _fetch_from_bigquery(date_from, date_to)
        if data:
            _cache['data'] = data
            _cache['ts'] = now
            print(f"[rk_billing] Cached {len(data)} days of billing data")
    finally:
        _cache_lock.release()


# ---- Public API ----

def get_billing_files_in_range(date_from, date_to):
    """Return billing data for dates in range. Fetches from BigQuery with in-memory cache."""
    if not _cache['data']:
        _ensure_cached()  # block on first load so dashboard isn't empty
    else:
        threading.Thread(target=_ensure_cached, daemon=True).start()

    # Convert datetime args to date strings for filtering
    from_str = date_from.strftime('%Y-%m-%d') if hasattr(date_from, 'strftime') else str(date_from)
    to_str = date_to.strftime('%Y-%m-%d') if hasattr(date_to, 'strftime') else str(date_to)

    return [e for e in _cache['data'] if from_str <= e['date'] <= to_str]


def _merge_ns_billing(target, ns_data):
    target['total'] += ns_data.get('total', 0)
    for cat, val in ns_data.get('breakdown', {}).items():
        target['breakdown'][cat] = target['breakdown'].get(cat, 0) + val


def aggregate_billing_weekly(daily_data):
    if not daily_data:
        return []
    weeks = {}
    for entry in daily_data:
        d = datetime.strptime(entry['date'], '%Y-%m-%d')
        week_start = d - timedelta(days=d.weekday())
        week_key = week_start.strftime('%Y-%m-%d')
        if week_key not in weeks:
            weeks[week_key] = {'date': week_key, 'namespaces': {}}
        for ns, ns_data in entry.get('namespaces', {}).items():
            if ns not in weeks[week_key]['namespaces']:
                weeks[week_key]['namespaces'][ns] = {'total': 0, 'breakdown': {}}
            _merge_ns_billing(weeks[week_key]['namespaces'][ns], ns_data)
    return sorted(weeks.values(), key=lambda x: x['date'])


def aggregate_billing_monthly(daily_data):
    if not daily_data:
        return []
    months = {}
    for entry in daily_data:
        month_key = entry['date'][:7] + '-01'
        if month_key not in months:
            months[month_key] = {'date': month_key, 'namespaces': {}}
        for ns, ns_data in entry.get('namespaces', {}).items():
            if ns not in months[month_key]['namespaces']:
                months[month_key]['namespaces'][ns] = {'total': 0, 'breakdown': {}}
            _merge_ns_billing(months[month_key]['namespaces'][ns], ns_data)
    return sorted(months.values(), key=lambda x: x['date'])


def serve_billing_dashboard():
    billing_html_path = Path('namespace-billing/billing-dashboard.html')
    if billing_html_path.exists():
        with billing_html_path.open('r') as f:
            return f.read()
    return None
