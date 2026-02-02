#!/usr/bin/env python3
"""Generate sample billing data for testing the namespace billing dashboard.

Produces JSON files in the same format as fetch-billing.py so the dashboard
can be tested without a BigQuery connection.

Usage:
    python generate-sample-data.py [output_dir] [days]

    output_dir: Directory to write billing JSON files (default: /tmp/rkapp-test-data/billing)
    days:       Number of days of historical data to generate (default: 60)
"""
import json
import os
import random
import sys
from datetime import datetime, timedelta

# Namespace cost profiles: base daily cost (USD) and category weights.
# Categories match what fetch-billing.py produces from GKE metering:
#   cpu, memory, egress, storage
NS_PROFILES = {
    'devnet':           {'base': 180.0, 'cpu': 0.55, 'memory': 0.30, 'egress': 0.05, 'storage': 0.10},
    'staging':          {'base': 140.0, 'cpu': 0.50, 'memory': 0.30, 'egress': 0.08, 'storage': 0.12},
    'production':       {'base': 320.0, 'cpu': 0.50, 'memory': 0.30, 'egress': 0.10, 'storage': 0.10},
    'proving':          {'base': 260.0, 'cpu': 0.70, 'memory': 0.20, 'egress': 0.02, 'storage': 0.08},
    'ci-runners':       {'base': 95.0,  'cpu': 0.60, 'memory': 0.25, 'egress': 0.05, 'storage': 0.10},
    'monitoring':       {'base': 45.0,  'cpu': 0.25, 'memory': 0.35, 'egress': 0.10, 'storage': 0.30},
    'kube-system':      {'base': 30.0,  'cpu': 0.40, 'memory': 0.40, 'egress': 0.05, 'storage': 0.15},
    'default':          {'base': 10.0,  'cpu': 0.45, 'memory': 0.35, 'egress': 0.05, 'storage': 0.15},
}

CATEGORIES = ['cpu', 'memory', 'egress', 'storage']


def generate_day(date: datetime) -> dict:
    namespaces = {}
    day_of_week = date.weekday()
    weekend_factor = 0.6 if day_of_week >= 5 else 1.0

    for ns, profile in NS_PROFILES.items():
        days_ago = (datetime.now() - date).days
        trend = 1.0 + (60 - min(days_ago, 60)) * 0.003
        noise = random.uniform(0.8, 1.2)
        daily_total = profile['base'] * weekend_factor * trend * noise

        breakdown = {}
        for cat in CATEGORIES:
            cat_noise = random.uniform(0.85, 1.15)
            breakdown[cat] = round(daily_total * profile[cat] * cat_noise, 4)

        actual_total = sum(breakdown.values())
        namespaces[ns] = {
            'total': round(actual_total, 4),
            'breakdown': breakdown,
        }

    return {
        'date': date.strftime('%Y-%m-%d'),
        'namespaces': namespaces,
    }


def main():
    output_dir = sys.argv[1] if len(sys.argv) > 1 else '/tmp/rkapp-test-data/billing'
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 60

    os.makedirs(output_dir, exist_ok=True)

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    for i in range(days):
        date = today - timedelta(days=i)
        data = generate_day(date)
        filepath = os.path.join(output_dir, f"{data['date']}.json")
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

    print(f"Generated {days} days of billing data in {output_dir}")


if __name__ == '__main__':
    main()
