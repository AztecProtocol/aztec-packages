#!/usr/bin/env python3
"""CLI tool to explore GCP billing data from the Cloud Billing BigQuery export.

Queries the actual billing export tables (not usage metering) to get real
invoice-level costs. Caches results in SQLite for fast re-queries.

Usage:
  python billing_explore.py discover               # find billing export tables
  python billing_explore.py fetch [--months N]      # fetch & cache billing data
  python billing_explore.py monthly                 # show monthly totals
  python billing_explore.py monthly --by service    # monthly by service
  python billing_explore.py monthly --by sku        # monthly by SKU
  python billing_explore.py monthly --by project    # monthly by project
  python billing_explore.py daily [--month 2024-12] # daily for a month
  python billing_explore.py top [--month 2024-12]   # top costs for a month
  python billing_explore.py compare                 # compare billing export vs usage metering
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

DB_PATH = os.path.join(os.getenv('LOGS_DISK_PATH', '/tmp'), 'billing_explore.db')

SCHEMA = """
CREATE TABLE IF NOT EXISTS gcp_billing (
    date           TEXT NOT NULL,
    project_id     TEXT NOT NULL DEFAULT '',
    service        TEXT NOT NULL DEFAULT '',
    sku            TEXT NOT NULL DEFAULT '',
    cost           REAL NOT NULL DEFAULT 0,
    credits        REAL NOT NULL DEFAULT 0,
    usage_amount   REAL NOT NULL DEFAULT 0,
    usage_unit     TEXT NOT NULL DEFAULT '',
    currency       TEXT NOT NULL DEFAULT 'USD',
    fetched_at     TEXT NOT NULL,
    PRIMARY KEY (date, project_id, service, sku)
);
CREATE INDEX IF NOT EXISTS idx_gcp_billing_date ON gcp_billing(date);
CREATE INDEX IF NOT EXISTS idx_gcp_billing_service ON gcp_billing(service);

CREATE TABLE IF NOT EXISTS gcp_billing_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def get_db():
    os.makedirs(os.path.dirname(DB_PATH) or '.', exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA busy_timeout = 5000')
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def fmt_usd(v):
    if v >= 1000:
        return f'${v:,.0f}'
    if v >= 1:
        return f'${v:,.2f}'
    return f'${v:,.4f}'


# ---- BigQuery Discovery ----

def cmd_discover(args):
    """Find billing export tables in the project."""
    from google.cloud import bigquery
    project = args.project
    client = bigquery.Client(project=project)

    print(f'Listing datasets in project: {project}')
    datasets = list(client.list_datasets())
    if not datasets:
        print('  No datasets found.')
        return

    for ds in datasets:
        ds_id = ds.dataset_id
        tables = list(client.list_tables(ds.reference))
        billing_tables = [t for t in tables if 'billing' in t.table_id.lower() or 'cost' in t.table_id.lower()]
        if billing_tables:
            print(f'\n  Dataset: {ds_id}')
            for t in billing_tables:
                full = f'{project}.{ds_id}.{t.table_id}'
                print(f'    {full}')
                # Show schema for first billing table
                tbl = client.get_table(t.reference)
                print(f'      rows: {tbl.num_rows}, size: {tbl.num_bytes / 1e6:.1f} MB')
                print(f'      columns: {", ".join(f.name for f in tbl.schema[:15])}')
        else:
            # Check for usage metering tables too
            usage_tables = [t for t in tables if 'gke_cluster' in t.table_id.lower()]
            if usage_tables:
                print(f'\n  Dataset: {ds_id} (usage metering)')
                for t in usage_tables:
                    print(f'    {project}.{ds_id}.{t.table_id}')

    # Also try common billing export naming patterns
    print(f'\n  Trying common billing export table patterns...')
    for ds in datasets:
        for t in client.list_tables(ds.reference):
            if t.table_id.startswith('gcp_billing_export'):
                full = f'{project}.{ds.dataset_id}.{t.table_id}'
                print(f'    FOUND: {full}')


# ---- BigQuery Fetch ----

def cmd_fetch(args):
    """Fetch billing data from BigQuery and cache in SQLite."""
    from google.cloud import bigquery

    table = args.table
    project = args.project
    months = args.months

    if not table:
        print('ERROR: --table is required. Run "discover" first to find the billing export table.')
        print('       e.g. --table project.dataset.gcp_billing_export_resource_v1_XXXXXX')
        sys.exit(1)

    client = bigquery.Client(project=project)
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=months * 31)

    print(f'Fetching billing data from {start_date} to {end_date}')
    print(f'Table: {table}')

    # Query the billing export table
    # The standard billing export has: billing_account_id, service.description,
    # sku.description, usage_start_time, project.id, cost, credits, usage.amount, usage.unit
    query = f"""
    SELECT
        DATE(usage_start_time) AS date,
        COALESCE(project.id, '') AS project_id,
        COALESCE(service.description, '') AS service,
        COALESCE(sku.description, '') AS sku,
        SUM(cost) AS cost,
        SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits,
        SUM(usage.amount) AS usage_amount,
        MAX(usage.unit) AS usage_unit
    FROM `{table}`
    WHERE DATE(usage_start_time) BETWEEN @start_date AND @end_date
    GROUP BY date, project_id, service, sku
    HAVING ABS(cost) > 0.0001 OR ABS(credits) > 0.0001
    ORDER BY date, service, sku
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter('start_date', 'DATE', start_date.isoformat()),
            bigquery.ScalarQueryParameter('end_date', 'DATE', end_date.isoformat()),
        ]
    )

    print('Running query...')
    result = list(client.query(query, job_config=job_config).result())
    print(f'Got {len(result)} rows')

    if not result:
        print('No data returned. Check table name and date range.')
        return

    # Store in SQLite
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    db.execute('DELETE FROM gcp_billing WHERE date >= ? AND date <= ?',
               (start_date.isoformat(), end_date.isoformat()))

    for row in result:
        db.execute('''
            INSERT OR REPLACE INTO gcp_billing
            (date, project_id, service, sku, cost, credits, usage_amount, usage_unit, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date),
            row.project_id or '',
            row.service or '',
            row.sku or '',
            float(row.cost or 0),
            float(row.credits or 0),
            float(row.usage_amount or 0),
            row.usage_unit or '',
            now,
        ))

    db.commit()
    db.execute("INSERT OR REPLACE INTO gcp_billing_meta VALUES ('last_fetch', ?)", (now,))
    db.execute("INSERT OR REPLACE INTO gcp_billing_meta VALUES ('table', ?)", (table,))
    db.commit()

    print(f'Cached {len(result)} rows in {DB_PATH}')

    # Show quick summary
    rows = db.execute('''
        SELECT substr(date, 1, 7) as month, SUM(cost) as cost, SUM(credits) as credits
        FROM gcp_billing GROUP BY month ORDER BY month
    ''').fetchall()
    print(f'\n{"Month":<10} {"Gross":>12} {"Credits":>12} {"Net":>12}')
    print('-' * 48)
    for r in rows:
        net = r['cost'] + r['credits']
        print(f'{r["month"]:<10} {fmt_usd(r["cost"]):>12} {fmt_usd(r["credits"]):>12} {fmt_usd(net):>12}')


# ---- Reports ----

def cmd_monthly(args):
    """Show monthly totals."""
    db = get_db()
    group_by = args.by

    if group_by == 'service':
        rows = db.execute('''
            SELECT substr(date, 1, 7) as month, service,
                   SUM(cost) as cost, SUM(credits) as credits
            FROM gcp_billing GROUP BY month, service ORDER BY month, cost DESC
        ''').fetchall()

        current_month = None
        for r in rows:
            if r['month'] != current_month:
                current_month = r['month']
                month_total = sum(row['cost'] + row['credits'] for row in rows if row['month'] == current_month)
                print(f'\n  {current_month}  (net: {fmt_usd(month_total)})')
                print(f'  {"Service":<45} {"Gross":>10} {"Credits":>10} {"Net":>10}')
                print('  ' + '-' * 77)
            net = r['cost'] + r['credits']
            if abs(net) >= 0.01:
                print(f'  {r["service"]:<45} {fmt_usd(r["cost"]):>10} {fmt_usd(r["credits"]):>10} {fmt_usd(net):>10}')

    elif group_by == 'sku':
        month_filter = args.month
        if not month_filter:
            # Use most recent month
            row = db.execute('SELECT MAX(substr(date, 1, 7)) as m FROM gcp_billing').fetchone()
            month_filter = row['m'] if row else None

        if not month_filter:
            print('No data.')
            return

        rows = db.execute('''
            SELECT service, sku, SUM(cost) as cost, SUM(credits) as credits,
                   SUM(usage_amount) as usage_amount, MAX(usage_unit) as usage_unit
            FROM gcp_billing WHERE substr(date, 1, 7) = ?
            GROUP BY service, sku ORDER BY cost DESC
        ''', (month_filter,)).fetchall()

        total = sum(r['cost'] + r['credits'] for r in rows)
        print(f'\n  {month_filter}  (net: {fmt_usd(total)})')
        print(f'  {"Service":<30} {"SKU":<40} {"Net":>10} {"Usage":>15}')
        print('  ' + '-' * 97)
        for r in rows[:40]:
            net = r['cost'] + r['credits']
            if abs(net) >= 0.01:
                usage = f'{r["usage_amount"]:.1f} {r["usage_unit"]}' if r['usage_amount'] else ''
                print(f'  {r["service"][:29]:<30} {r["sku"][:39]:<40} {fmt_usd(net):>10} {usage:>15}')

    elif group_by == 'project':
        rows = db.execute('''
            SELECT substr(date, 1, 7) as month, project_id,
                   SUM(cost) as cost, SUM(credits) as credits
            FROM gcp_billing GROUP BY month, project_id ORDER BY month, cost DESC
        ''').fetchall()

        current_month = None
        for r in rows:
            if r['month'] != current_month:
                current_month = r['month']
                month_total = sum(row['cost'] + row['credits'] for row in rows if row['month'] == current_month)
                print(f'\n  {current_month}  (net: {fmt_usd(month_total)})')
                print(f'  {"Project":<45} {"Net":>12}')
                print('  ' + '-' * 59)
            net = r['cost'] + r['credits']
            if abs(net) >= 0.01:
                print(f'  {r["project_id"]:<45} {fmt_usd(net):>12}')

    else:
        # Default: just monthly totals
        rows = db.execute('''
            SELECT substr(date, 1, 7) as month,
                   SUM(cost) as cost, SUM(credits) as credits,
                   COUNT(DISTINCT date) as days
            FROM gcp_billing GROUP BY month ORDER BY month
        ''').fetchall()

        print(f'\n  {"Month":<10} {"Gross":>12} {"Credits":>12} {"Net":>12} {"Days":>6} {"Daily Avg":>12}')
        print('  ' + '-' * 68)
        grand_total = 0
        for r in rows:
            net = r['cost'] + r['credits']
            daily = net / max(r['days'], 1)
            grand_total += net
            print(f'  {r["month"]:<10} {fmt_usd(r["cost"]):>12} {fmt_usd(r["credits"]):>12} {fmt_usd(net):>12} {r["days"]:>6} {fmt_usd(daily):>12}')
        print('  ' + '-' * 68)
        print(f'  {"TOTAL":<10} {"":>12} {"":>12} {fmt_usd(grand_total):>12}')


def cmd_daily(args):
    """Show daily costs for a month."""
    db = get_db()
    month = args.month
    if not month:
        row = db.execute('SELECT MAX(substr(date, 1, 7)) as m FROM gcp_billing').fetchone()
        month = row['m'] if row else None

    if not month:
        print('No data.')
        return

    rows = db.execute('''
        SELECT date, SUM(cost) as cost, SUM(credits) as credits
        FROM gcp_billing WHERE substr(date, 1, 7) = ?
        GROUP BY date ORDER BY date
    ''', (month,)).fetchall()

    total = 0
    print(f'\n  {"Date":<12} {"Gross":>10} {"Credits":>10} {"Net":>10}')
    print('  ' + '-' * 44)
    for r in rows:
        net = r['cost'] + r['credits']
        total += net
        print(f'  {r["date"]:<12} {fmt_usd(r["cost"]):>10} {fmt_usd(r["credits"]):>10} {fmt_usd(net):>10}')
    print('  ' + '-' * 44)
    print(f'  {"TOTAL":<12} {"":>10} {"":>10} {fmt_usd(total):>10}')


def cmd_top(args):
    """Show top cost items for a month."""
    db = get_db()
    month = args.month
    if not month:
        row = db.execute('SELECT MAX(substr(date, 1, 7)) as m FROM gcp_billing').fetchone()
        month = row['m'] if row else None

    if not month:
        print('No data.')
        return

    # Top services
    services = db.execute('''
        SELECT service, SUM(cost + credits) as net, SUM(cost) as gross
        FROM gcp_billing WHERE substr(date, 1, 7) = ?
        GROUP BY service ORDER BY net DESC LIMIT 15
    ''', (month,)).fetchall()

    total = sum(r['net'] for r in services)
    print(f'\n  Top services for {month} (total: {fmt_usd(total)})')
    print(f'  {"Service":<45} {"Net":>12} {"% of Total":>10}')
    print('  ' + '-' * 69)
    for r in services:
        pct = 100 * r['net'] / max(total, 0.01)
        if abs(r['net']) >= 0.01:
            print(f'  {r["service"]:<45} {fmt_usd(r["net"]):>12} {pct:>9.1f}%')

    # Top SKUs
    skus = db.execute('''
        SELECT service, sku, SUM(cost + credits) as net
        FROM gcp_billing WHERE substr(date, 1, 7) = ?
        GROUP BY service, sku ORDER BY net DESC LIMIT 20
    ''', (month,)).fetchall()

    print(f'\n  Top SKUs for {month}')
    print(f'  {"Service":<25} {"SKU":<40} {"Net":>12}')
    print('  ' + '-' * 79)
    for r in skus:
        if abs(r['net']) >= 0.01:
            print(f'  {r["service"][:24]:<25} {r["sku"][:39]:<40} {fmt_usd(r["net"]):>12}')


def cmd_compare(args):
    """Compare billing export data vs usage metering estimates."""
    db = get_db()

    # Get billing export monthly totals
    billing_rows = db.execute('''
        SELECT substr(date, 1, 7) as month, SUM(cost + credits) as net
        FROM gcp_billing GROUP BY month ORDER BY month
    ''').fetchall()

    if not billing_rows:
        print('No billing export data cached. Run "fetch" first.')
        return

    # Get usage metering estimates
    try:
        from billing import gcp as _gcp_billing
        _gcp_billing._ensure_cached()
        metering_data = _gcp_billing._cache.get('data', [])
    except Exception as e:
        print(f'Could not load usage metering data: {e}')
        metering_data = []

    metering_monthly = {}
    for entry in metering_data:
        month = entry['date'][:7]
        day_total = sum(ns.get('total', 0) for ns in entry.get('namespaces', {}).values())
        metering_monthly[month] = metering_monthly.get(month, 0) + day_total

    print(f'\n  {"Month":<10} {"Billing Export":>15} {"Usage Metering":>15} {"Ratio":>8}')
    print('  ' + '-' * 50)
    for r in billing_rows:
        billing = r['net']
        metering = metering_monthly.get(r['month'], 0)
        ratio = f'{billing / metering:.2f}x' if metering > 0 else '--'
        print(f'  {r["month"]:<10} {fmt_usd(billing):>15} {fmt_usd(metering):>15} {ratio:>8}')


def cmd_status(args):
    """Show what data we have cached."""
    db = get_db()
    meta = {r['key']: r['value'] for r in db.execute('SELECT * FROM gcp_billing_meta').fetchall()}
    billing_count = db.execute('SELECT COUNT(*) as c FROM gcp_billing').fetchone()['c']
    billing_range = db.execute('SELECT MIN(date) as mn, MAX(date) as mx FROM gcp_billing').fetchone()

    print(f'\n  Billing export cache:')
    print(f'    DB path:    {DB_PATH}')
    print(f'    Table:      {meta.get("table", "(not set)")}')
    print(f'    Last fetch: {meta.get("last_fetch", "(never)")}')
    print(f'    Rows:       {billing_count}')
    if billing_count:
        print(f'    Date range: {billing_range["mn"]} to {billing_range["mx"]}')

    # Also check billing export table status
    try:
        from google.cloud import bigquery
        client = bigquery.Client(project=args.project)
        table_id = 'testnet-440309.testnet440309billing.gcp_billing_export_v1_01EA8B_291C89_753ABC'
        t = client.get_table(table_id)
        print(f'\n  BigQuery billing export:')
        print(f'    Table:    {table_id}')
        print(f'    Rows:     {t.num_rows}')
        print(f'    Modified: {t.modified}')
        if t.num_rows > 0:
            print(f'    STATUS: Data available! Run "fetch --table {table_id}" to cache it.')
        else:
            print(f'    STATUS: Not yet populated. GCP takes up to 24h after enabling export.')
    except Exception as e:
        print(f'\n  BigQuery check failed: {e}')


def cmd_metering(args):
    """Query both usage metering tables and compare with different approaches."""
    from google.cloud import bigquery
    project = args.project
    client = bigquery.Client(project=project)
    months = args.months

    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=months * 31)

    # Table names
    usage_table = f'{project}.egress_consumption.gke_cluster_resource_usage'
    consumption_table = f'{project}.egress_consumption.gke_cluster_resource_consumption'

    print(f'Date range: {start_date} to {end_date}')

    # 1. Current approach: usage table with our SKU pricing
    print('\n=== Approach 1: gke_cluster_resource_usage (requests) with hardcoded SKU prices ===')
    _query_metering_table(client, usage_table, start_date, end_date, 'REQUESTS')

    # 2. Consumption table with our SKU pricing
    print('\n=== Approach 2: gke_cluster_resource_consumption (actual) with hardcoded SKU prices ===')
    _query_metering_table(client, consumption_table, start_date, end_date, 'CONSUMPTION')

    # 3. Raw totals: what does each table report?
    print('\n=== Approach 3: Raw resource totals from both tables ===')
    for tname, label in [(usage_table, 'REQUESTS'), (consumption_table, 'CONSUMPTION')]:
        query = f"""
        SELECT
            FORMAT_DATE('%Y-%m', DATE(start_time)) AS month,
            resource_name,
            SUM(usage.amount) AS total_amount,
            usage.unit
        FROM `{tname}`
        WHERE DATE(start_time) BETWEEN @start AND @end
        GROUP BY month, resource_name, usage.unit
        ORDER BY month, resource_name
        """
        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter('start', 'DATE', start_date.isoformat()),
            bigquery.ScalarQueryParameter('end', 'DATE', end_date.isoformat()),
        ])
        rows = list(client.query(query, job_config=job_config).result())
        print(f'\n  {label} table raw resources:')
        print(f'  {"Month":<10} {"Resource":<20} {"Amount":>20} {"Unit":<15}')
        print('  ' + '-' * 67)
        for r in rows:
            print(f'  {r.month:<10} {r.resource_name:<20} {r.total_amount:>20,.0f} {r.unit:<15}')

    # 4. Count distinct SKUs
    print('\n=== Approach 4: Distinct SKUs in usage table ===')
    query = f"""
    SELECT sku_id, resource_name, COUNT(*) as row_count,
           SUM(usage.amount) as total_amount, usage.unit
    FROM `{usage_table}`
    WHERE DATE(start_time) BETWEEN @start AND @end
    GROUP BY sku_id, resource_name, usage.unit
    ORDER BY total_amount DESC
    """
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter('start', 'DATE', start_date.isoformat()),
        bigquery.ScalarQueryParameter('end', 'DATE', end_date.isoformat()),
    ])
    rows = list(client.query(query, job_config=job_config).result())
    # Import pricing to check
    from billing.gcp import _SKU_PRICING
    print(f'  {"SKU ID":<20} {"Resource":<20} {"Rows":>10} {"Amount":>18} {"Unit":<12} {"Known?"}')
    print('  ' + '-' * 90)
    for r in rows:
        known = 'YES' if r.sku_id in _SKU_PRICING else 'MISSING'
        print(f'  {r.sku_id:<20} {r.resource_name:<20} {r.row_count:>10,} {r.total_amount:>18,.0f} {r.unit:<12} {known}')


def _query_metering_table(client, table, start_date, end_date, label):
    """Query a metering table and compute costs using our SKU pricing."""
    from google.cloud import bigquery
    from billing.gcp import _SKU_PRICING, _usage_to_cost

    query = f"""
    SELECT
        FORMAT_DATE('%Y-%m', DATE(start_time)) AS month,
        namespace,
        sku_id,
        resource_name,
        SUM(usage.amount) AS total_usage
    FROM `{table}`
    WHERE DATE(start_time) BETWEEN @start AND @end
    GROUP BY month, namespace, sku_id, resource_name
    ORDER BY month, namespace
    """
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter('start', 'DATE', start_date.isoformat()),
        bigquery.ScalarQueryParameter('end', 'DATE', end_date.isoformat()),
    ])
    rows = list(client.query(query, job_config=job_config).result())

    monthly = {}
    monthly_by_cat = {}
    missing_skus = set()
    for r in rows:
        cost, category = _usage_to_cost(r.sku_id, r.resource_name, float(r.total_usage))
        if r.sku_id not in _SKU_PRICING:
            missing_skus.add(r.sku_id)
        month = r.month
        monthly[month] = monthly.get(month, 0) + cost
        key = (month, category)
        monthly_by_cat[key] = monthly_by_cat.get(key, 0) + cost

    print(f'  {"Month":<10} {"Total":>12}   {"compute_spot":>14} {"compute_od":>14} {"network":>10} {"storage":>10}')
    print('  ' + '-' * 74)
    for month in sorted(monthly.keys()):
        total = monthly[month]
        spot = monthly_by_cat.get((month, 'compute_spot'), 0)
        od = monthly_by_cat.get((month, 'compute_ondemand'), 0)
        net = monthly_by_cat.get((month, 'network'), 0)
        stor = monthly_by_cat.get((month, 'storage'), 0)
        print(f'  {month:<10} {fmt_usd(total):>12}   {fmt_usd(spot):>14} {fmt_usd(od):>14} {fmt_usd(net):>10} {fmt_usd(stor):>10}')

    if missing_skus:
        print(f'\n  WARNING: {len(missing_skus)} unknown SKU IDs (not priced): {", ".join(sorted(missing_skus)[:5])}...')


# ---- Main ----

def main():
    parser = argparse.ArgumentParser(description='Explore GCP billing data')
    parser.add_argument('--project', default='testnet-440309', help='GCP project ID')
    parser.add_argument('--table', default='', help='BigQuery billing export table')
    sub = parser.add_subparsers(dest='command')

    sub.add_parser('discover', help='Find billing export tables')

    fetch_p = sub.add_parser('fetch', help='Fetch billing data from BigQuery')
    fetch_p.add_argument('--months', type=int, default=6, help='How many months back to fetch')

    monthly_p = sub.add_parser('monthly', help='Monthly totals')
    monthly_p.add_argument('--by', choices=['service', 'sku', 'project'], default='', help='Group by')
    monthly_p.add_argument('--month', default='', help='Filter to month (YYYY-MM)')

    daily_p = sub.add_parser('daily', help='Daily costs')
    daily_p.add_argument('--month', default='', help='Month to show (YYYY-MM)')

    top_p = sub.add_parser('top', help='Top cost items')
    top_p.add_argument('--month', default='', help='Month to show (YYYY-MM)')

    sub.add_parser('compare', help='Compare billing export vs usage metering')
    sub.add_parser('status', help='Show data status (what we have cached)')

    meter_p = sub.add_parser('metering', help='Query both metering tables directly and compare')
    meter_p.add_argument('--months', type=int, default=6, help='How many months back')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    cmds = {
        'discover': cmd_discover,
        'fetch': cmd_fetch,
        'monthly': cmd_monthly,
        'daily': cmd_daily,
        'top': cmd_top,
        'compare': cmd_compare,
        'metering': cmd_metering,
        'status': cmd_status,
    }
    cmds[args.command](args)


if __name__ == '__main__':
    main()
