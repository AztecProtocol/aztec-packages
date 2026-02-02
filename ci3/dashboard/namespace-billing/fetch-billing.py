#!/usr/bin/env python3
"""Fetch namespace billing data from the GCP Cloud Billing Export in BigQuery.

Queries the detailed billing export table
(gcp_billing_export_resource_v1_<BILLING_ACCOUNT_ID>) which contains actual
dollar costs per SKU.  When GKE cost allocation is enabled the export includes
a `k8s-namespace` label on every GKE line item, giving us real cost-per-namespace
with zero estimation.

Costs are categorised automatically from the SKU description:
  - compute_spot    (Spot / Preemptible VM cores + RAM)
  - compute_ondemand (On-demand VM cores + RAM)
  - storage         (Persistent Disk, Filestore, etc.)
  - network         (Egress, LB, IP addresses, etc.)
  - other           (Everything else)

Usage:
    # Fetch last 30 days
    python fetch-billing.py

    # Specific range
    python fetch-billing.py --from 2026-01-01 --to 2026-01-31

    # Point at a different dataset / project
    python fetch-billing.py --project testnet-440309 --dataset billing_export

Environment:
    Requires Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS.
    pip install google-cloud-bigquery
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta

from google.cloud import bigquery

# ---- defaults ----
DEFAULT_PROJECT = 'testnet-440309'
DEFAULT_DATASET = None   # auto-discover
DEFAULT_OUTPUT_DIR = os.path.join(
    os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'billing'
)


# ---- table discovery ----

def discover_billing_table(client: bigquery.Client, project: str,
                           dataset: str | None) -> tuple[str, str]:
    """Find the detailed billing export table.

    If *dataset* is given, look only there.  Otherwise scan every dataset in
    the project for a table matching the billing export naming convention.

    Returns (dataset_id, table_id).
    """
    pattern = re.compile(r'^gcp_billing_export_resource_v1_')

    datasets_to_check = (
        [dataset] if dataset
        else [ds.dataset_id for ds in client.list_datasets(project)]
    )

    for ds_id in datasets_to_check:
        for tbl in client.list_tables(f'{project}.{ds_id}'):
            if pattern.match(tbl.table_id):
                return ds_id, tbl.table_id

    # Also check the egress_consumption dataset for the metering table
    # as a fallback (less accurate but still useful).
    raise RuntimeError(
        'No Cloud Billing export table found '
        f'(gcp_billing_export_resource_v1_*) in project {project}.  '
        'Enable detailed billing export to BigQuery first: '
        'https://docs.google.com/billing/docs/how-to/export-data-bigquery'
    )


# ---- SKU categorisation ----

_SPOT_RE = re.compile(r'spot|preemptible', re.IGNORECASE)
_STORAGE_RE = re.compile(
    r'storage|persistent disk|pd snapshot|filestore|ssd|hdd', re.IGNORECASE
)
_NETWORK_RE = re.compile(
    r'egress|ingress|load balanc|ip address|network|nat|vpn|interconnect|cdn',
    re.IGNORECASE,
)
_COMPUTE_RE = re.compile(
    r'instance core|instance ram|cpu|memory|core running|ram running|custom instance',
    re.IGNORECASE,
)


def categorise_sku(service: str, sku: str) -> str:
    """Map a (service.description, sku.description) pair to a category."""
    combined = f'{service} {sku}'

    if _SPOT_RE.search(combined) and _COMPUTE_RE.search(combined):
        return 'compute_spot'
    if _COMPUTE_RE.search(combined):
        return 'compute_ondemand'
    if _STORAGE_RE.search(combined):
        return 'storage'
    if _NETWORK_RE.search(combined):
        return 'network'
    return 'other'


# ---- BigQuery query ----

def fetch_billing_rows(
    client: bigquery.Client,
    project: str,
    dataset: str,
    table: str,
    date_from: str,
    date_to: str,
) -> list[dict]:
    """Query the billing export for daily cost by namespace + service + SKU."""
    full_table = f'{project}.{dataset}.{table}'
    query = f"""
    SELECT
        DATE(usage_start_time) AS date,
        IFNULL(ns_label.value, '__unallocated__') AS namespace,
        service.description AS service,
        sku.description AS sku,
        SUM(cost)
            + SUM(IFNULL(
                (SELECT SUM(c.amount) FROM UNNEST(credits) c), 0
              )) AS net_cost
    FROM
        `{full_table}`
    LEFT JOIN
        UNNEST(labels) AS ns_label ON ns_label.key = 'k8s-namespace'
    WHERE
        DATE(usage_start_time) BETWEEN @date_from AND @date_to
        AND cost_type = 'regular'
    GROUP BY
        date, namespace, service, sku
    HAVING
        net_cost > 0
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

def build_daily_files(rows: list[dict]) -> dict[str, dict]:
    days: dict[str, dict] = {}

    for row in rows:
        date_str = (
            row['date'].isoformat()
            if hasattr(row['date'], 'isoformat')
            else str(row['date'])
        )
        ns = row['namespace']
        category = categorise_sku(row['service'], row['sku'])
        cost = float(row['net_cost'])

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

    return days


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
        description='Fetch GKE namespace billing from GCP Cloud Billing Export'
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
                        help='BigQuery dataset (default: auto-discover)')
    parser.add_argument('--output-dir', default=DEFAULT_OUTPUT_DIR,
                        help=f'Output directory (default: {DEFAULT_OUTPUT_DIR})')
    args = parser.parse_args()

    print(f'Connecting to BigQuery ({args.project})...')
    client = bigquery.Client(project=args.project)

    print('Discovering billing export table...')
    ds_id, tbl_id = discover_billing_table(client, args.project, args.dataset)
    print(f'Using table: {args.project}.{ds_id}.{tbl_id}')

    print(f'Fetching billing data {args.date_from} to {args.date_to}...')
    rows = fetch_billing_rows(
        client, args.project, ds_id, tbl_id,
        args.date_from, args.date_to,
    )
    print(f'Got {len(rows)} rows')

    if not rows:
        print('No billing data found.  Check that:')
        print('  1. Cloud Billing export (detailed) is enabled')
        print('  2. GKE cost allocation is enabled on your clusters')
        print('  3. The date range has data')
        return

    days = build_daily_files(rows)
    count = write_files(days, args.output_dir)
    print(f'Wrote {count} daily billing files to {args.output_dir}')

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
