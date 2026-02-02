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
DEFAULT_TABLE = 'gke_cluster_resource_consumption'
DEFAULT_OUTPUT_DIR = os.path.join(
    os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'billing'
)

# ---- SKU pricing ----
# Prices sourced from GCP Cloud Billing Catalog API for us-west1.
# CPU prices are per vCPU-hour; memory prices are per GiB-hour.
SKU_PRICING = {
    # Spot / Preemptible
    'E7FF-A0FB-FA82': {'desc': 'Spot T2D AMD Core',  'price_per_hour': 0.00497,  'resource': 'cpu',    'category': 'compute_spot'},
    '48AB-89F5-9112': {'desc': 'Spot T2D AMD Ram',   'price_per_hour': 0.000668, 'resource': 'memory', 'category': 'compute_spot'},
    # On-demand T2D
    'EFE6-E23C-19CB': {'desc': 'T2D AMD Core',       'price_per_hour': 0.027502, 'resource': 'cpu',    'category': 'compute_ondemand'},
    'FB05-036A-8982': {'desc': 'T2D AMD Ram',         'price_per_hour': 0.003686, 'resource': 'memory', 'category': 'compute_ondemand'},
    # On-demand N2
    'BB77-5FDA-69D9': {'desc': 'N2 Core',             'price_per_hour': 0.031611, 'resource': 'cpu',    'category': 'compute_ondemand'},
    '5B01-D157-A097': {'desc': 'N2 Ram',              'price_per_hour': 0.004237, 'resource': 'memory', 'category': 'compute_ondemand'},
    # On-demand N2D
    'A03E-E620-7389': {'desc': 'N2D AMD Core',        'price_per_hour': 0.027502, 'resource': 'cpu',    'category': 'compute_ondemand'},
    '5535-6D2D-4B50': {'desc': 'N2D AMD Ram',         'price_per_hour': 0.003686, 'resource': 'memory', 'category': 'compute_ondemand'},
}


def usage_to_cost(sku_id: str, resource_name: str, amount: float) -> tuple[float, str]:
    """Convert raw usage amount to dollar cost.

    CPU usage is in cpu-seconds  → cost = (seconds / 3600) × price_per_cpu_hour
    Memory usage is in byte-seconds → cost = (byte_seconds / 3600 / 1024³) × price_per_GiB_hour

    Returns (cost_usd, category).
    """
    info = SKU_PRICING.get(sku_id)
    if not info:
        # Unknown SKU – bucket into compute_ondemand with zero cost so we
        # don't silently drop data.  A warning is printed at the end.
        return 0.0, 'compute_ondemand'

    price = info['price_per_hour']
    if resource_name == 'cpu':
        cost = (amount / 3600.0) * price
    elif resource_name == 'memory':
        gib_hours = amount / 3600.0 / (1024 ** 3)
        cost = gib_hours * price
    else:
        cost = 0.0

    return cost, info['category']


# ---- BigQuery query ----

def fetch_usage_rows(
    client: bigquery.Client,
    project: str,
    dataset: str,
    table: str,
    date_from: str,
    date_to: str,
) -> list[dict]:
    """Query the metering table for daily usage by namespace + SKU."""
    full_table = f'{project}.{dataset}.{table}'
    query = f"""
    SELECT
        DATE(start_time) AS date,
        namespace,
        sku_id,
        resource_name,
        SUM(usage.amount) AS total_usage
    FROM
        `{full_table}`
    WHERE
        DATE(start_time) BETWEEN @date_from AND @date_to
    GROUP BY
        date, namespace, sku_id, resource_name
    ORDER BY
        date, namespace
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
    parser.add_argument('--table', default=DEFAULT_TABLE,
                        help=f'BigQuery table (default: {DEFAULT_TABLE})')
    parser.add_argument('--output-dir', default=DEFAULT_OUTPUT_DIR,
                        help=f'Output directory (default: {DEFAULT_OUTPUT_DIR})')
    args = parser.parse_args()

    print(f'Connecting to BigQuery ({args.project})...')
    client = bigquery.Client(project=args.project)

    full_table = f'{args.project}.{args.dataset}.{args.table}'
    print(f'Using table: {full_table}')

    print(f'Fetching metering data {args.date_from} to {args.date_to}...')
    rows = fetch_usage_rows(
        client, args.project, args.dataset, args.table,
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
