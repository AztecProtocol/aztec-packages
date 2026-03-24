#!/usr/bin/env python3
"""Fetch namespace billing data from GKE resource consumption metering in BigQuery.

Queries the GKE cluster resource consumption table which records CPU and memory
usage per namespace per pod.  Actual GCP SKU prices (from the Cloud Billing
Catalog API) are applied to convert resource usage into dollar costs.

Categories produced:
  - compute_spot     (Spot / Preemptible VM cores + RAM)
  - compute_ondemand (On-demand VM cores + RAM)

Usage:
    # Fetch last 30 days
    python fetch-billing.py

    # Specific range
    python fetch-billing.py --from 2026-01-01 --to 2026-01-31

    # Custom output directory
    python fetch-billing.py --output-dir /tmp/billing

Environment:
    Requires Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS.
    pip install google-cloud-bigquery
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta

from google.cloud import bigquery

# ---- defaults ----
DEFAULT_PROJECT = 'testnet-440309'
DEFAULT_DATASET = 'egress_consumption'
DEFAULT_TABLE_CONSUMPTION = 'gke_cluster_resource_consumption'
DEFAULT_TABLE_USAGE = 'gke_cluster_resource_usage'
DEFAULT_OUTPUT_DIR = os.path.join(
    os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'billing'
)

# ---- SKU pricing ----
# Prices sourced from GCP Cloud Billing Catalog API for us-west1.
SKU_PRICING = {
    # Compute - Spot (per vCPU-hour / per GiB-hour)
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
    # Network Egress (per GiB)
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
    # Storage (per GiB-month)
    'D973-5D65-BAB2': {'price': 0.04,  'resource': 'storage', 'category': 'storage'},
}


def usage_to_cost(sku_id: str, resource_name: str, amount: float) -> tuple[float, str]:
    """Convert raw usage amount to dollar cost. Returns (cost_usd, category)."""
    info = SKU_PRICING.get(sku_id)
    if not info:
        return 0.0, 'other'

    price = info['price']
    if resource_name == 'cpu':
        return (amount / 3600.0) * price, info['category']
    elif resource_name == 'memory':
        return (amount / 3600.0 / (1024 ** 3)) * price, info['category']
    elif resource_name.startswith('networkEgress'):
        return (amount / (1024 ** 3)) * price, info['category']
    elif resource_name == 'storage':
        gib_months = amount / (1024 ** 3) / (730 * 3600)
        return gib_months * price, info['category']
    return 0.0, info['category']


# ---- BigQuery query ----

def fetch_usage_rows(
    client: bigquery.Client,
    project: str,
    dataset: str,
    date_from: str,
    date_to: str,
) -> list[dict]:
    """Query both metering tables for daily usage by namespace + SKU."""
    consumption = f'{project}.{dataset}.{DEFAULT_TABLE_CONSUMPTION}'
    usage = f'{project}.{dataset}.{DEFAULT_TABLE_USAGE}'
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
            bigquery.ScalarQueryParameter('date_from', 'DATE', date_from),
            bigquery.ScalarQueryParameter('date_to', 'DATE', date_to),
        ]
    )
    rows = client.query(query, job_config=job_config).result()
    return [dict(row) for row in rows]


# ---- aggregate into daily JSON ----

def build_daily_files(rows: list[dict]) -> tuple[dict[str, dict], set[str]]:
    """Convert raw usage rows into daily billing JSON structures.

    Returns (days_dict, unknown_skus).
    """
    days: dict[str, dict] = {}
    unknown_skus: set[str] = set()

    for row in rows:
        date_str = (
            row['date'].isoformat()
            if hasattr(row['date'], 'isoformat')
            else str(row['date'])
        )
        ns = row['namespace']
        sku_id = row['sku_id']
        resource_name = row['resource_name']
        amount = float(row['total_usage'])

        cost, category = usage_to_cost(sku_id, resource_name, amount)

        if sku_id not in SKU_PRICING:
            unknown_skus.add(sku_id)

        if cost <= 0:
            continue

        if date_str not in days:
            days[date_str] = {'date': date_str, 'namespaces': {}}
        if ns not in days[date_str]['namespaces']:
            days[date_str]['namespaces'][ns] = {'total': 0, 'breakdown': {}}

        entry = days[date_str]['namespaces'][ns]
        entry['breakdown'][category] = (
            entry['breakdown'].get(category, 0) + cost
        )
        entry['total'] += cost

    # Round
    for day in days.values():
        for ns_data in day['namespaces'].values():
            ns_data['total'] = round(ns_data['total'], 4)
            ns_data['breakdown'] = {
                k: round(v, 4) for k, v in ns_data['breakdown'].items()
            }

    return days, unknown_skus


def write_files(days: dict[str, dict], output_dir: str) -> int:
    os.makedirs(output_dir, exist_ok=True)
    count = 0
    for date_str, data in sorted(days.items()):
        filepath = os.path.join(output_dir, f'{date_str}.json')
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        count += 1
    return count


# ---- CLI ----

def main():
    parser = argparse.ArgumentParser(
        description='Fetch GKE namespace compute billing from resource consumption metering'
    )
    today = datetime.utcnow().strftime('%Y-%m-%d')
    default_from = (datetime.utcnow() - timedelta(days=30)).strftime('%Y-%m-%d')

    parser.add_argument('--from', dest='date_from', default=default_from,
                        help='Start date YYYY-MM-DD (default: 30 days ago)')
    parser.add_argument('--to', dest='date_to', default=today,
                        help='End date YYYY-MM-DD (default: today)')
    parser.add_argument('--project', default=DEFAULT_PROJECT,
                        help=f'GCP project ID (default: {DEFAULT_PROJECT})')
    parser.add_argument('--dataset', default=DEFAULT_DATASET,
                        help=f'BigQuery dataset (default: {DEFAULT_DATASET})')
    parser.add_argument('--output-dir', default=DEFAULT_OUTPUT_DIR,
                        help=f'Output directory (default: {DEFAULT_OUTPUT_DIR})')
    args = parser.parse_args()

    print(f'Connecting to BigQuery ({args.project})...')
    client = bigquery.Client(project=args.project)

    print(f'Fetching metering data {args.date_from} to {args.date_to}...')
    print(f'  consumption: {args.project}.{args.dataset}.{DEFAULT_TABLE_CONSUMPTION}')
    print(f'  usage:       {args.project}.{args.dataset}.{DEFAULT_TABLE_USAGE}')
    rows = fetch_usage_rows(
        client, args.project, args.dataset,
        args.date_from, args.date_to,
    )
    print(f'Got {len(rows)} aggregated rows')

    if not rows:
        print('No metering data found. Check that:')
        print('  1. GKE resource consumption metering is enabled')
        print('  2. The date range has data')
        return

    days, unknown_skus = build_daily_files(rows)
    count = write_files(days, args.output_dir)
    print(f'Wrote {count} daily billing files to {args.output_dir}')

    if unknown_skus:
        print(f'\nWARNING: {len(unknown_skus)} unknown SKU(s) had zero cost assigned:')
        for s in sorted(unknown_skus):
            print(f'  {s}')
        print('Add these to SKU_PRICING in fetch-billing.py with prices from')
        print('the GCP Cloud Billing Catalog API.')

    # Summary
    total = sum(
        ns['total'] for day in days.values()
        for ns in day['namespaces'].values()
    )
    ns_set: set[str] = set()
    cat_set: set[str] = set()
    for day in days.values():
        for ns_name, ns_data in day['namespaces'].items():
            ns_set.add(ns_name)
            cat_set.update(ns_data['breakdown'].keys())

    print(f'\nTotal cost: ${total:,.2f}')
    print(f'Namespaces ({len(ns_set)}): {sorted(ns_set)}')
    print(f'Categories: {sorted(cat_set)}')


if __name__ == '__main__':
    main()
