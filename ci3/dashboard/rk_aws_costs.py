"""AWS Cost Explorer daily fetch -> SQLite.

Polls AWS Cost Explorer API daily and stores results in aws_daily_costs table.
"""
import threading
import time
from datetime import datetime, timedelta, timezone

import rk_db

SERVICE_CATEGORY_MAP = {
    'Amazon Elastic Compute Cloud - Compute': 'ec2',
    'Amazon CloudFront': 'cloudfront',
    'Amazon ElastiCache': 'elasticache',
    'Amazon Elastic Container Service': 'ecs',
    'Amazon Virtual Private Cloud': 'vpc',
    'Elastic Load Balancing': 'elb',
    'Amazon Elastic File System': 'efs',
    'Amazon Simple Storage Service': 's3',
    'Amazon EC2 Container Registry (ECR)': 'ecr',
    'AmazonCloudWatch': 'cloudwatch',
    'AWS CloudTrail': 'cloudtrail',
    'Amazon Route 53': 'route53',
    'AWS Secrets Manager': 'secrets',
    'AWS Key Management Service': 'kms',
    'Tax': 'tax',
}


def _fetch_aws_costs(date_from: str, date_to: str) -> list[dict]:
    """Query AWS Cost Explorer for daily costs by service."""
    try:
        import boto3
    except ImportError:
        print("[rk_aws_costs] boto3 not installed, skipping AWS cost fetch")
        return []

    client = boto3.client('ce', region_name='us-east-2')
    rows = []
    try:
        response = client.get_cost_and_usage(
            TimePeriod={'Start': date_from, 'End': date_to},
            Granularity='DAILY',
            Metrics=['UnblendedCost'],
            GroupBy=[{'Type': 'DIMENSION', 'Key': 'SERVICE'}],
        )
        now = datetime.now(timezone.utc).isoformat()
        for result in response['ResultsByTime']:
            date = result['TimePeriod']['Start']
            for group in result['Groups']:
                service = group['Keys'][0]
                amount = float(group['Metrics']['UnblendedCost']['Amount'])
                if amount == 0:
                    continue
                category = SERVICE_CATEGORY_MAP.get(service, 'other')
                rows.append({
                    'date': date,
                    'service': service,
                    'category': category,
                    'amount_usd': round(amount, 4),
                    'fetched_at': now,
                })
    except Exception as e:
        print(f"[rk_aws_costs] Error fetching from Cost Explorer: {e}")
    return rows


def _store_aws_costs(rows: list[dict]):
    """Write AWS cost rows to SQLite."""
    if not rows:
        return
    rk_db.executemany('''
        INSERT OR REPLACE INTO aws_daily_costs (date, service, category, amount_usd, fetched_at)
        VALUES (:date, :service, :category, :amount_usd, :fetched_at)
    ''', rows)


def _find_missing_dates() -> list[str]:
    """Find dates not yet in aws_daily_costs (last 90 days)."""
    today = datetime.now(timezone.utc).date()
    existing = {r['date'] for r in rk_db.query(
        "SELECT DISTINCT date FROM aws_daily_costs WHERE date >= ?",
        ((today - timedelta(days=90)).isoformat(),)
    )}
    missing = []
    for i in range(1, 91):  # skip today (incomplete)
        d = (today - timedelta(days=i)).isoformat()
        if d not in existing:
            missing.append(d)
    return sorted(missing)


_fetch_lock = threading.Lock()


def ensure_aws_costs():
    """Fetch any missing AWS cost data."""
    if not _fetch_lock.acquire(blocking=False):
        return
    try:
        missing = _find_missing_dates()
        if not missing:
            return
        # Fetch in chunks of 30 days (Cost Explorer limit)
        date_from = missing[0]
        date_to = (datetime.fromisoformat(missing[-1]) + timedelta(days=1)).date().isoformat()
        print(f"[rk_aws_costs] Fetching AWS costs {date_from} to {date_to}")
        rows = _fetch_aws_costs(date_from, date_to)
        _store_aws_costs(rows)
        # Mark fetched dates with no data so we don't re-query
        fetched_dates = {r['date'] for r in rows}
        now = datetime.now(timezone.utc).isoformat()
        for d in missing:
            if d not in fetched_dates:
                rk_db.execute(
                    "INSERT OR IGNORE INTO aws_daily_costs (date, service, category, amount_usd, fetched_at) VALUES (?, ?, ?, ?, ?)",
                    (d, '_none', 'none', 0, now)
                )
        print(f"[rk_aws_costs] Stored {len(rows)} cost rows")
    except Exception as e:
        print(f"[rk_aws_costs] Error: {e}")
    finally:
        _fetch_lock.release()


def get_aws_costs(date_from: str, date_to: str) -> list[dict]:
    """Get AWS costs from SQLite, triggering fetch for missing dates."""
    threading.Thread(target=ensure_aws_costs, daemon=True).start()
    return rk_db.query(
        "SELECT date, service, category, amount_usd FROM aws_daily_costs WHERE date >= ? AND date <= ? AND service != '_none' ORDER BY date",
        (date_from, date_to)
    )


def get_costs_overview(date_from: str, date_to: str) -> dict:
    """Get combined AWS + GCP cost overview."""
    aws_rows = get_aws_costs(date_from, date_to)
    gcp_rows = rk_db.query(
        "SELECT date, namespace, category, amount_usd FROM gcp_namespace_costs WHERE date >= ? AND date <= ? ORDER BY date",
        (date_from, date_to)
    )

    # Aggregate by date
    by_date = {}
    for r in aws_rows:
        d = r['date']
        if d not in by_date:
            by_date[d] = {'date': d, 'aws': {}, 'gcp': {}, 'aws_total': 0, 'gcp_total': 0}
        cat = r['category']
        by_date[d]['aws'][cat] = by_date[d]['aws'].get(cat, 0) + r['amount_usd']
        by_date[d]['aws_total'] += r['amount_usd']

    for r in gcp_rows:
        d = r['date']
        if d not in by_date:
            by_date[d] = {'date': d, 'aws': {}, 'gcp': {}, 'aws_total': 0, 'gcp_total': 0}
        cat = r['category']
        by_date[d]['gcp'][cat] = by_date[d]['gcp'].get(cat, 0) + r['amount_usd']
        by_date[d]['gcp_total'] += r['amount_usd']

    sorted_dates = sorted(by_date.values(), key=lambda x: x['date'])
    aws_total = sum(d['aws_total'] for d in sorted_dates)
    gcp_total = sum(d['gcp_total'] for d in sorted_dates)

    return {
        'by_date': sorted_dates,
        'totals': {
            'aws': round(aws_total, 2),
            'gcp': round(gcp_total, 2),
            'combined': round(aws_total + gcp_total, 2),
        }
    }


def start_daily_poll(interval_hours=6):
    """Start background thread to poll AWS costs periodically."""
    def loop():
        time.sleep(30)  # initial delay
        while True:
            try:
                ensure_aws_costs()
            except Exception as e:
                print(f"[rk_aws_costs] Poll error: {e}")
            time.sleep(interval_hours * 3600)

    t = threading.Thread(target=loop, daemon=True, name='aws-cost-poll')
    t.start()
    return t
