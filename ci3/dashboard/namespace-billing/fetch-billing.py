#!/usr/bin/env python3
"""Fetch GKE namespace billing data from BigQuery and write daily JSON files.

Queries the `egress_consumption` BigQuery dataset (populated by GKE resource
consumption metering) for CPU, memory and egress usage per namespace, applies
GCP pricing to estimate dollar costs, and writes one JSON file per day to the
billing data directory.

Usage:
    # Fetch last 30 days (default)
    python fetch-billing.py

    # Fetch specific range
    python fetch-billing.py --from 2026-01-01 --to 2026-01-31

    # Custom output dir and project
    python fetch-billing.py --output-dir /logs-disk/billing --project testnet-440309

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


# -- GCP configuration --
DEFAULT_PROJECT = 'testnet-440309'
DEFAULT_DATASET = 'egress_consumption'
DEFAULT_OUTPUT_DIR = os.path.join(
    os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'billing'
)

# -- GCE on-demand pricing (us-west1, USD/hour) --
# Source: https://cloud.google.com/compute/vm-instance-pricing
# These are approximate list prices; update as needed.
PRICING = {
    'cpu_ondemand':    0.03090,   # N2 / T2D vCPU per hour (blended)
    'memory_ondemand': 0.00414,   # N2 / T2D GB per hour (blended)
    'cpu_spot':        0.00927,   # ~70% discount
    'memory_spot':     0.00124,
    'egress_per_gb':   0.085,     # Egress to internet per GB (first 10 TB tier)
}


def discover_table(client: bigquery.Client, project: str, dataset: str) -> str:
    """Find the GKE resource consumption table in the dataset."""
    tables = list(client.list_tables(f'{project}.{dataset}'))
    table_ids = [t.table_id for t in tables]

    # Prefer the consumption table, fall back to usage
    for candidate in ['gke_cluster_resource_consumption', 'gke_cluster_resource_usage']:
        if candidate in table_ids:
            return candidate

    if table_ids:
        print(f'Available tables in {dataset}: {table_ids}', file=sys.stderr)
        raise RuntimeError(
            f'No GKE consumption table found. Available: {table_ids}'
        )
    raise RuntimeError(f'Dataset {project}.{dataset} has no tables')


def fetch_daily_usage(
    client: bigquery.Client,
    project: str,
    dataset: str,
    table: str,
    date_from: str,
    date_to: str,
) -> list[dict]:
    """Query BigQuery for daily namespace resource usage.

    Returns list of rows with: date, namespace, resource_name,
    total_usage, usage_unit.
    """
    query = f"""
    SELECT
        DATE(start_time) AS date,
        namespace,
        resource_name,
        SUM(usage.amount) AS total_usage,
        ANY_VALUE(usage.unit) AS usage_unit
    FROM
        `{project}.{dataset}.{table}`
    WHERE
        DATE(start_time) BETWEEN @date_from AND @date_to
        AND namespace IS NOT NULL
        AND namespace != ''
    GROUP BY
        date, namespace, resource_name
    ORDER BY
        date, namespace, resource_name
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter('date_from', 'DATE', date_from),
            bigquery.ScalarQueryParameter('date_to', 'DATE', date_to),
        ]
    )
    result = client.query(query, job_config=job_config).result()
    return [dict(row) for row in result]


def usage_to_cost(resource_name: str, amount: float, unit: str) -> dict:
    """Convert a resource usage amount into estimated dollar cost.

    Returns dict with cost broken down by on-demand vs spot estimate.
    Since the metering table doesn't distinguish spot/on-demand,
    we report a single estimated cost using on-demand rates (conservative).
    """
    if resource_name == 'cpu':
        # amount is in cpu-seconds
        vcpu_hours = amount / 3600.0
        return {
            'cpu': round(vcpu_hours * PRICING['cpu_ondemand'], 4),
        }
    elif resource_name == 'memory':
        # amount is in byte-seconds
        gb_hours = amount / 3600.0 / (1024 ** 3)
        return {
            'memory': round(gb_hours * PRICING['memory_ondemand'], 4),
        }
    elif resource_name in ('egress', 'network_egress'):
        # amount is in bytes
        gb = amount / (1024 ** 3)
        return {
            'egress': round(gb * PRICING['egress_per_gb'], 4),
        }
    elif resource_name == 'ephemeral_storage':
        # Storage usage – approximate with SSD pricing
        gb_hours = amount / 3600.0 / (1024 ** 3)
        ssd_per_gb_hour = 0.000232  # ~$0.17/GB/month
        return {
            'storage': round(gb_hours * ssd_per_gb_hour, 4),
        }
    else:
        return {}


def build_daily_files(rows: list[dict]) -> dict[str, dict]:
    """Aggregate BQ rows into per-day billing JSON objects."""
    days = {}

    for row in rows:
        date_str = row['date'].isoformat() if hasattr(row['date'], 'isoformat') else str(row['date'])
        ns = row['namespace']
        resource = row['resource_name']
        amount = float(row['total_usage'])
        unit = row.get('usage_unit', '')

        if date_str not in days:
            days[date_str] = {'date': date_str, 'namespaces': {}}

        if ns not in days[date_str]['namespaces']:
            days[date_str]['namespaces'][ns] = {'total': 0, 'breakdown': {}}

        cost_parts = usage_to_cost(resource, amount, unit)
        ns_data = days[date_str]['namespaces'][ns]

        for cat, cost in cost_parts.items():
            ns_data['breakdown'][cat] = ns_data['breakdown'].get(cat, 0) + cost
            ns_data['total'] += cost

    # Round totals
    for day in days.values():
        for ns_data in day['namespaces'].values():
            ns_data['total'] = round(ns_data['total'], 4)

    return days


def write_files(days: dict[str, dict], output_dir: str) -> int:
    """Write daily billing JSON files to disk."""
    os.makedirs(output_dir, exist_ok=True)
    count = 0
    for date_str, data in sorted(days.items()):
        filepath = os.path.join(output_dir, f'{date_str}.json')
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description='Fetch GKE namespace billing from BigQuery')
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

    print(f'Discovering tables in {args.dataset}...')
    table = discover_table(client, args.project, args.dataset)
    print(f'Using table: {args.project}.{args.dataset}.{table}')

    print(f'Fetching data from {args.date_from} to {args.date_to}...')
    rows = fetch_daily_usage(client, args.project, args.dataset, table,
                             args.date_from, args.date_to)
    print(f'Got {len(rows)} rows')

    if not rows:
        print('No data found for the given date range.')
        return

    days = build_daily_files(rows)
    count = write_files(days, args.output_dir)
    print(f'Wrote {count} daily billing files to {args.output_dir}')

    # Print summary
    total_cost = sum(
        ns['total']
        for day in days.values()
        for ns in day['namespaces'].values()
    )
    ns_set = set()
    for day in days.values():
        ns_set.update(day['namespaces'].keys())
    print(f'Total estimated cost: ${total_cost:,.2f}')
    print(f'Namespaces: {sorted(ns_set)}')


if __name__ == '__main__':
    main()
