"""Namespace billing helpers for rkapp.

Reads daily billing JSON files and lazily fetches missing days from BigQuery.
Route definitions remain in rk.py; this module provides the logic.
"""
import gzip
import json
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

BILLING_DIR = os.path.join(os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'billing')

# BigQuery defaults
_BQ_PROJECT = 'testnet-440309'
_BQ_DATASET = 'egress_consumption'
_BQ_TABLE_CONSUMPTION = 'gke_cluster_resource_consumption'  # cpu, memory (request-based)
_BQ_TABLE_USAGE = 'gke_cluster_resource_usage'              # networkEgress, storage + cpu/memory

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
    '0C3C-6B13-B1E8': {'price': 0.02,  'resource': 'networkEgress', 'category': 'network'},  # Inter-region Americas→LA
    '6B8F-E63D-832B': {'price': 0.0,   'resource': 'networkEgress', 'category': 'network'},  # Internet Americas→APAC (free tier)
    '92CB-C25F-B1D1': {'price': 0.0,   'resource': 'networkEgress', 'category': 'network'},  # To Google Services
    '984A-1F27-2D1F': {'price': 0.04,  'resource': 'networkEgress', 'category': 'network'},  # Carrier Peering Americas
    '9DE9-9092-B3BC': {'price': 0.20,  'resource': 'networkEgress', 'category': 'network'},  # Internet Americas→China
    'C863-37DA-506E': {'price': 0.02,  'resource': 'networkEgress', 'category': 'network'},  # Inter-region Americas→Virginia
    'C8EA-1A86-3D28': {'price': 0.02,  'resource': 'networkEgress', 'category': 'network'},  # Inter-region Americas→Americas
    'DE9E-AFBC-A15A': {'price': 0.01,  'resource': 'networkEgress', 'category': 'network'},  # Inter-zone
    'DFA5-B5C6-36D6': {'price': 0.085, 'resource': 'networkEgress', 'category': 'network'},  # Internet Americas→EMEA
    'F274-1692-F213': {'price': 0.08,  'resource': 'networkEgress', 'category': 'network'},  # Internet Americas→Americas
    'FDBC-6E3B-D4D8': {'price': 0.15,  'resource': 'networkEgress', 'category': 'network'},  # Internet Americas→Australia
    # Storage (price per GiB-month)
    'D973-5D65-BAB2': {'price': 0.04,  'resource': 'storage', 'category': 'storage'},  # PD Capacity
}

_fetch_lock = threading.Lock()


# ---- BigQuery fetch ----

def _usage_to_cost(sku_id, resource_name, amount):
    info = _SKU_PRICING.get(sku_id)
    if not info:
        return 0.0, 'other'
    price = info['price']
    if resource_name == 'cpu':
        # cpu-seconds → hours
        return (amount / 3600.0) * price, info['category']
    elif resource_name == 'memory':
        # byte-seconds → GiB-hours
        return (amount / 3600.0 / (1024 ** 3)) * price, info['category']
    elif resource_name.startswith('networkEgress'):
        # bytes → GiB
        return (amount / (1024 ** 3)) * price, info['category']
    elif resource_name == 'storage':
        # byte-seconds → GiB-months (730 hours/month)
        gib_months = amount / (1024 ** 3) / (730 * 3600)
        return gib_months * price, info['category']
    return 0.0, info['category']


def _find_missing_dates(date_from, date_to):
    """Return list of date strings in range that have no billing file on disk."""
    existing = set()
    if os.path.exists(BILLING_DIR):
        for f in os.listdir(BILLING_DIR):
            if f.endswith('.json') or f.endswith('.json.gz'):
                existing.add(f.split('.')[0])

    missing = []
    current = date_from
    while current <= date_to:
        ds = current.strftime('%Y-%m-%d')
        if ds not in existing:
            missing.append(ds)
        current += timedelta(days=1)
    return missing


def _fetch_from_bigquery(date_from_str, date_to_str):
    """Query BigQuery for usage data and write daily JSON files. Returns count of days written."""
    try:
        from google.cloud import bigquery
    except ImportError:
        print("google-cloud-bigquery not installed, skipping auto-fetch")
        return 0

    try:
        client = bigquery.Client(project=_BQ_PROJECT)
        # Query both tables: consumption (cpu/memory requests) and usage (network/storage)
        consumption = f'{_BQ_PROJECT}.{_BQ_DATASET}.{_BQ_TABLE_CONSUMPTION}'
        usage = f'{_BQ_PROJECT}.{_BQ_DATASET}.{_BQ_TABLE_USAGE}'
        query = f"""
        SELECT date, namespace, sku_id, resource_name, SUM(total_usage) AS total_usage FROM (
            SELECT DATE(start_time) AS date, namespace, sku_id, resource_name, SUM(usage.amount) AS total_usage
            FROM `{consumption}`
            WHERE DATE(start_time) BETWEEN @date_from AND @date_to
            GROUP BY date, namespace, sku_id, resource_name
            UNION ALL
            SELECT DATE(start_time) AS date, namespace, sku_id, resource_name, SUM(usage.amount) AS total_usage
            FROM `{usage}`
            WHERE DATE(start_time) BETWEEN @date_from AND @date_to
              AND resource_name IN ('networkEgress', 'storage')
            GROUP BY date, namespace, sku_id, resource_name
        )
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
        print(f"BigQuery fetch failed: {e}")
        return 0

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

    # Round and write
    os.makedirs(BILLING_DIR, exist_ok=True)
    count = 0
    for date_str, data in days.items():
        for ns_data in data['namespaces'].values():
            ns_data['total'] = round(ns_data['total'], 4)
            ns_data['breakdown'] = {k: round(v, 4) for k, v in ns_data['breakdown'].items()}
        with open(os.path.join(BILLING_DIR, f'{date_str}.json'), 'w') as f:
            json.dump(data, f, indent=2)
        count += 1

    # Dual-write to SQLite for the metrics dashboard
    try:
        import rk_db
        sqlite_rows = []
        for date_str, data in days.items():
            for ns, ns_data in data['namespaces'].items():
                for cat, amt in ns_data['breakdown'].items():
                    sqlite_rows.append((date_str, ns, cat, round(amt, 4)))
        if sqlite_rows:
            rk_db.executemany(
                'INSERT OR REPLACE INTO gcp_namespace_costs (date, namespace, category, amount_usd) VALUES (?, ?, ?, ?)',
                sqlite_rows
            )
    except Exception as e:
        print(f"[rk_billing] SQLite dual-write failed (non-fatal): {e}")

    # Also write empty files for dates with no data so we don't re-query them
    current = datetime.strptime(date_from_str, '%Y-%m-%d')
    end = datetime.strptime(date_to_str, '%Y-%m-%d')
    while current <= end:
        ds = current.strftime('%Y-%m-%d')
        if ds not in days:
            filepath = os.path.join(BILLING_DIR, f'{ds}.json')
            if not os.path.exists(filepath):
                with open(filepath, 'w') as f:
                    json.dump({'date': ds, 'namespaces': {}}, f)
                count += 1
        current += timedelta(days=1)

    return count


def ensure_billing_data(date_from, date_to):
    """Fetch any missing billing days from BigQuery. Thread-safe, non-blocking if already running."""
    # Don't fetch today (data incomplete) or future dates
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    effective_to = min(date_to.date() if hasattr(date_to, 'date') else date_to,
                       yesterday)
    effective_from = date_from.date() if hasattr(date_from, 'date') else date_from

    if effective_from > effective_to:
        return

    missing = _find_missing_dates(
        datetime.combine(effective_from, datetime.min.time()),
        datetime.combine(effective_to, datetime.min.time()),
    )
    if not missing:
        return

    if not _fetch_lock.acquire(blocking=False):
        return  # Another fetch is already running

    try:
        print(f"Auto-fetching {len(missing)} missing billing days from BigQuery...")
        _fetch_from_bigquery(missing[0], missing[-1])
    finally:
        _fetch_lock.release()


# ---- File reading ----

def read_billing_file(filepath):
    """Read a billing JSON file (gzipped or plain)."""
    try:
        if filepath.endswith('.gz'):
            with gzip.open(filepath, 'rb') as f:
                return json.loads(f.read().decode('utf-8'))
        else:
            with open(filepath, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error reading billing file {filepath}: {e}")
        return None


def get_billing_files_in_range(date_from, date_to):
    """Return list of billing data entries for dates in range. Auto-fetches missing days."""
    # Trigger async fetch for missing days
    try:
        threading.Thread(
            target=ensure_billing_data,
            args=(date_from, date_to),
            daemon=True,
        ).start()
    except Exception:
        pass

    results = []
    if not os.path.exists(BILLING_DIR):
        return results

    current = date_from
    while current <= date_to:
        date_str = current.strftime('%Y-%m-%d')
        for ext in ['.json', '.json.gz']:
            filepath = os.path.join(BILLING_DIR, date_str + ext)
            if os.path.exists(filepath):
                data = read_billing_file(filepath)
                if data and data.get('namespaces'):
                    data['date'] = date_str
                    results.append(data)
                break
        current += timedelta(days=1)
    return results


def get_all_namespaces():
    """Return sorted list of all namespaces across billing data files."""
    ns_set = set()
    if os.path.exists(BILLING_DIR):
        for filename in os.listdir(BILLING_DIR):
            if filename.endswith('.json') or filename.endswith('.json.gz'):
                filepath = os.path.join(BILLING_DIR, filename)
                data = read_billing_file(filepath)
                if data:
                    ns_set.update(data.get('namespaces', {}).keys())
    return sorted(ns_set)


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
