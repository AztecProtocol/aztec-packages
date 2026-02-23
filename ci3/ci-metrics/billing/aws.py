"""AWS Cost Explorer fetch with in-memory cache.

Fetches on first request, caches for 6 hours. No SQLite, no background threads.
"""
import threading
import time
from datetime import datetime, timedelta, timezone

SERVICE_CATEGORY_MAP = {
    # Compute
    'Amazon Elastic Compute Cloud - Compute': 'ec2',
    'EC2 - Other': 'ec2',  # EBS volumes, snapshots, NAT gateways, data transfer
    'Amazon Elastic Container Service': 'ecs',
    'Amazon Elastic Kubernetes Service': 'eks',
    'Amazon EC2 Container Registry (ECR)': 'ecr',
    'AWS Lambda': 'lambda',
    'Amazon Lightsail': 'lightsail',
    # Storage
    'Amazon Simple Storage Service': 's3',
    'Amazon Elastic File System': 'efs',
    'Amazon Elastic Block Store': 'ebs',
    'Amazon ElastiCache': 'elasticache',
    'Amazon Relational Database Service': 'rds',
    'Amazon DynamoDB': 'dynamodb',
    'AWS Backup': 'backup',
    # Networking
    'Amazon CloudFront': 'cloudfront',
    'CloudFront Flat-Rate Plans': 'cloudfront',
    'Amazon Virtual Private Cloud': 'vpc',
    'Elastic Load Balancing': 'elb',
    'Amazon Elastic Load Balancing': 'elb',
    'Amazon Route 53': 'route53',
    'Amazon API Gateway': 'apigateway',
    'AWS Data Transfer': 'data_transfer',
    'AWS Global Accelerator': 'global_accelerator',
    # Monitoring & Security
    'AmazonCloudWatch': 'cloudwatch',
    'AWS CloudTrail': 'cloudtrail',
    'AWS Secrets Manager': 'secrets',
    'AWS Key Management Service': 'kms',
    'AWS WAF': 'waf',
    'AWS Config': 'config',
    'AWS Certificate Manager': 'acm',
    # CI/CD & Dev Tools
    'AWS CodeBuild': 'codebuild',
    'AWS CodePipeline': 'codepipeline',
    'AWS CloudFormation': 'cloudformation',
    'AWS Amplify': 'amplify',
    # Data & Analytics
    'AWS Glue': 'glue',
    # IoT
    'AWS IoT': 'iot',
    'Amazon Location Service': 'location',
    # Messaging
    'Amazon Simple Notification Service': 'sns',
    'Amazon Simple Queue Service': 'sqs',
    # Savings Plans / Reserved Instances
    'Savings Plans for AWS Compute usage': 'savings_plans',
    # Other
    'Tax': 'tax',
    'AWS Support (Business)': 'support',
    'AWS Support (Enterprise)': 'support',
    'AWS Cost Explorer': 'cost_explorer',
}

import re

# One-time contract payments: annual Savings Plan upfronts and monthly Reserved Instance charges.
# These appear as large single-day spikes but are not operational spend.
_ONE_TIME_CATEGORIES = frozenset({
    'savings_plan_1yr_annual',
    'savings_plan_3yr_annual',
    'savings_plan_1yr_annual_partial',
    'savings_plan_3yr_annual_partial',
    'reserved_instance_monthly',
})

_cache = {'rows': [], 'ts': 0}
_cache_lock = threading.Lock()
_detail_cache = {'rows': [], 'ts': 0}
_detail_cache_lock = threading.Lock()
_CACHE_TTL = 6 * 3600

# Known job postfixes from ci.sh (these become INSTANCE_POSTFIX)
_JOB_POSTFIXES = re.compile(
    r'_(x[0-9]+-(?:full|fast)|a[0-9]+-(?:full|fast)|n-deploy-[0-9]+|grind-test-[a-f0-9]+)$'
)
_ARCH_SUFFIXES = ('_amd64', '_arm64', '_x86_64', '_aarch64')


def decode_instance_name(run: dict) -> str:
    """Reconstruct the EC2 instance name from CI run metadata.

    bootstrap_ec2 naming:
      merge queue: pr-{number}_{arch}[_{postfix}]
      branch:      {sanitized_branch}_{arch}[_{postfix}]
    """
    name = run.get('name', '')
    pr = run.get('pr_number')
    arch = run.get('arch', 'amd64')
    # Normalize arch names
    if arch in ('x86_64', 'amd64'):
        arch = 'amd64'
    elif arch in ('aarch64', 'arm64'):
        arch = 'arm64'
    job = run.get('job_id', '')

    if '(queue)' in name and pr:
        base = f'pr-{pr}_{arch}'
    elif pr:
        base = f'pr-{pr}_{arch}'
    else:
        # Replicate: echo -n "$REF_NAME" | head -c 50 | tr -c 'a-zA-Z0-9-' '_'
        sanitized = re.sub(r'[^a-zA-Z0-9-]', '_', name[:50])
        base = f'{sanitized}_{arch}'
    if job:
        return f'{base}_{job}'
    return base


def decode_branch_info(run: dict) -> dict:
    """Extract branch/PR/user context from a CI run."""
    name = run.get('name', '')
    dashboard = run.get('dashboard', '')
    pr = run.get('pr_number')
    author = run.get('author', 'unknown')

    if '(queue)' in name or dashboard == 'next':
        run_type = 'merge-queue'
        branch = name.replace(' (queue)', '')
    elif dashboard == 'prs':
        run_type = 'pr'
        branch = name
    elif dashboard in ('nightly', 'releases', 'network', 'deflake'):
        run_type = dashboard
        branch = name
    else:
        run_type = 'other'
        branch = name

    return {
        'type': run_type,
        'branch': branch,
        'pr_number': pr,
        'author': author,
        'instance_name': decode_instance_name(run),
    }


def _fetch_aws_costs(date_from: str, date_to: str) -> list[dict]:
    try:
        import boto3
    except ImportError:
        print("[rk_aws_costs] boto3 not installed, skipping")
        return []

    try:
        client = boto3.client('ce', region_name='us-east-2')
        rows = []
        next_token = None

        while True:
            kwargs = dict(
                TimePeriod={'Start': date_from, 'End': date_to},
                Granularity='DAILY',
                Metrics=['UnblendedCost'],
                GroupBy=[
                    {'Type': 'DIMENSION', 'Key': 'SERVICE'},
                    {'Type': 'DIMENSION', 'Key': 'USAGE_TYPE'},
                ],
            )
            if next_token:
                kwargs['NextPageToken'] = next_token

            response = client.get_cost_and_usage(**kwargs)

            for result in response['ResultsByTime']:
                date = result['TimePeriod']['Start']
                for group in result['Groups']:
                    service = group['Keys'][0]
                    usage_type = group['Keys'][1] if len(group['Keys']) > 1 else ''
                    amount = float(group['Metrics']['UnblendedCost']['Amount'])
                    if amount == 0:
                        continue
                    category = SERVICE_CATEGORY_MAP.get(service, 'other')
                    # Savings plans: ComputeSP:1yrAllUpfront, ComputeSP:3yrNoUpfront, etc.
                    if category == 'savings_plans':
                        m = re.match(r'ComputeSP:(\d+yr)(\w+)', usage_type)
                        if m:
                            term = m.group(1)
                            payment = m.group(2)
                            if payment == 'NoUpfront':
                                category = f'savings_plan_{term}_monthly'
                            elif 'Upfront' in payment:
                                category = f'savings_plan_{term}_annual'
                    # EC2 reserved instances: HeavyUsage:<type> billed monthly on 1st
                    elif category == 'ec2' and 'HeavyUsage:' in usage_type:
                        category = 'reserved_instance_monthly'
                    if category == 'other':
                        print(f"[rk_aws_costs] unmapped service: {service!r} / {usage_type!r} (${amount:.2f})")
                    rows.append({
                        'date': date,
                        'service': service,
                        'category': category,
                        'amount_usd': round(amount, 4),
                    })

            next_token = response.get('NextPageToken')
            if not next_token:
                break

        return rows
    except Exception as e:
        print(f"[rk_aws_costs] Error: {e}")
        return []


def _ensure_cached():
    now = time.time()
    if _cache['rows'] and now - _cache['ts'] < _CACHE_TTL:
        return
    if not _cache_lock.acquire(blocking=False):
        return
    try:
        today = datetime.now(timezone.utc).date()
        rows = _fetch_aws_costs(
            (today - timedelta(days=365)).isoformat(),
            today.isoformat(),
        )
        if rows:
            _cache['rows'] = rows
            _cache['ts'] = now
    finally:
        _cache_lock.release()


def get_aws_costs(date_from: str, date_to: str) -> list[dict]:
    """Get AWS costs for date range. Blocks on first fetch, async refresh after."""
    if not _cache['rows']:
        _ensure_cached()  # block on first load so dashboard isn't empty
    else:
        threading.Thread(target=_ensure_cached, daemon=True).start()
    return [r for r in _cache['rows'] if date_from <= r['date'] <= date_to]


def _fetch_aws_cost_details(date_from: str, date_to: str) -> list[dict]:
    """Fetch per-resource (USAGE_TYPE) cost breakdown from AWS Cost Explorer."""
    try:
        import boto3
    except ImportError:
        return []

    try:
        client = boto3.client('ce', region_name='us-east-2')
        rows = []
        next_token = None

        while True:
            kwargs = dict(
                TimePeriod={'Start': date_from, 'End': date_to},
                Granularity='DAILY',
                Metrics=['UnblendedCost'],
                GroupBy=[
                    {'Type': 'DIMENSION', 'Key': 'SERVICE'},
                    {'Type': 'DIMENSION', 'Key': 'USAGE_TYPE'},
                ],
            )
            if next_token:
                kwargs['NextPageToken'] = next_token

            response = client.get_cost_and_usage(**kwargs)

            for result in response['ResultsByTime']:
                date = result['TimePeriod']['Start']
                for group in result['Groups']:
                    service = group['Keys'][0]
                    usage_type = group['Keys'][1]
                    amount = float(group['Metrics']['UnblendedCost']['Amount'])
                    if amount == 0:
                        continue
                    category = SERVICE_CATEGORY_MAP.get(service, 'other')
                    rows.append({
                        'date': date,
                        'service': service,
                        'usage_type': usage_type,
                        'category': category,
                        'amount_usd': round(amount, 4),
                    })

            next_token = response.get('NextPageToken')
            if not next_token:
                break

        return rows
    except Exception as e:
        print(f"[rk_aws_costs] Detail fetch error: {e}")
        return []


def _ensure_detail_cached():
    now = time.time()
    if _detail_cache['rows'] and now - _detail_cache['ts'] < _CACHE_TTL:
        return
    if not _detail_cache_lock.acquire(blocking=False):
        return
    try:
        today = datetime.now(timezone.utc).date()
        rows = _fetch_aws_cost_details(
            (today - timedelta(days=365)).isoformat(),
            today.isoformat(),
        )
        if rows:
            _detail_cache['rows'] = rows
            _detail_cache['ts'] = now
    finally:
        _detail_cache_lock.release()


def get_aws_cost_details(date_from: str, date_to: str) -> list[dict]:
    """Get per-resource AWS cost details. Blocks on first fetch, async refresh after."""
    if not _detail_cache['rows']:
        _ensure_detail_cached()
    else:
        threading.Thread(target=_ensure_detail_cached, daemon=True).start()
    return [r for r in _detail_cache['rows'] if date_from <= r['date'] <= date_to]


def get_costs_overview(date_from: str, date_to: str) -> dict:
    """Combined AWS + GCP cost overview. GCP data comes from billing JSON files."""
    aws_rows = get_aws_costs(date_from, date_to)

    # GCP data from billing files (already on disk, no SQLite needed)
    gcp_by_date = {}
    try:
        from billing.gcp import get_billing_files_in_range
        billing_data = get_billing_files_in_range(
            datetime.strptime(date_from, '%Y-%m-%d'),
            datetime.strptime(date_to, '%Y-%m-%d'),
        )
        for entry in billing_data:
            d = entry['date']
            if d not in gcp_by_date:
                gcp_by_date[d] = {}
            for ns_data in entry.get('namespaces', {}).values():
                for cat, amt in ns_data.get('breakdown', {}).items():
                    gcp_by_date[d][cat] = gcp_by_date[d].get(cat, 0) + amt
    except Exception as e:
        print(f"[rk_aws_costs] GCP billing read failed: {e}")

    by_date = {}
    for r in aws_rows:
        d = r['date']
        if d not in by_date:
            by_date[d] = {'date': d, 'aws': {}, 'gcp': {}, 'aws_total': 0, 'gcp_total': 0, 'aws_one_time': 0}
        cat = r['category']
        by_date[d]['aws'][cat] = by_date[d]['aws'].get(cat, 0) + r['amount_usd']
        by_date[d]['aws_total'] += r['amount_usd']
        if cat in _ONE_TIME_CATEGORIES:
            by_date[d]['aws_one_time'] += r['amount_usd']

    for d, cats in gcp_by_date.items():
        if d not in by_date:
            by_date[d] = {'date': d, 'aws': {}, 'gcp': {}, 'aws_total': 0, 'gcp_total': 0, 'aws_one_time': 0}
        by_date[d]['gcp'] = cats
        by_date[d]['gcp_total'] = sum(cats.values())

    sorted_dates = sorted(by_date.values(), key=lambda x: x['date'])
    aws_total = sum(d['aws_total'] for d in sorted_dates)
    aws_one_time = sum(d['aws_one_time'] for d in sorted_dates)
    gcp_total = sum(d['gcp_total'] for d in sorted_dates)

    return {
        'by_date': sorted_dates,
        'totals': {
            'aws': round(aws_total, 2),
            'aws_operational': round(aws_total - aws_one_time, 2),
            'aws_one_time': round(aws_one_time, 2),
            'gcp': round(gcp_total, 2),
            'combined': round(aws_total + gcp_total, 2),
            'combined_operational': round(aws_total - aws_one_time + gcp_total, 2),
        }
    }
