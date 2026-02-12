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

# Namespace cost profiles: base daily cost (USD) and spot fraction.
# Categories match what fetch-billing.py produces from GKE metering:
#   compute_spot, compute_ondemand
NS_PROFILES = {
    'sepolia':                  {'base': 8.0,  'spot_frac': 0.00},
    'eth-mainnet':              {'base': 12.0, 'spot_frac': 0.00},
    'mainnet':                  {'base': 1.5,  'spot_frac': 0.30},
    'testnet':                  {'base': 2.0,  'spot_frac': 0.40},
    'devnet':                   {'base': 0.7,  'spot_frac': 0.02},
    'devnet-next':              {'base': 0.9,  'spot_frac': 0.02},
    'staging-public':           {'base': 3.5,  'spot_frac': 0.50},
    'staging-ignition':         {'base': 1.7,  'spot_frac': 0.30},
    'next-net':                 {'base': 2.8,  'spot_frac': 0.80},
    'nightly-bench':            {'base': 1.2,  'spot_frac': 0.70},
    'kube-system':              {'base': 2.0,  'spot_frac': 0.20},
    'metrics':                  {'base': 1.4,  'spot_frac': 0.01},
    'gmp-system':               {'base': 0.6,  'spot_frac': 0.25},
    'ignition-fisherman-sepolia': {'base': 1.0, 'spot_frac': 0.55},
}

CATEGORIES = ['compute_spot', 'compute_ondemand']


def generate_day(date: datetime) -> dict:
    namespaces = {}
    day_of_week = date.weekday()
    weekend_factor = 0.7 if day_of_week >= 5 else 1.0

    for ns, profile in NS_PROFILES.items():
        days_ago = (datetime.now() - date).days
        trend = 1.0 + (60 - min(days_ago, 60)) * 0.002
        noise = random.uniform(0.8, 1.2)
        daily_total = profile['base'] * weekend_factor * trend * noise

        spot = daily_total * profile['spot_frac'] * random.uniform(0.85, 1.15)
        ondemand = daily_total - spot

        breakdown = {}
        if spot > 0:
            breakdown['compute_spot'] = round(spot, 4)
        breakdown['compute_ondemand'] = round(ondemand, 4)

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
