#!/usr/bin/env python3
"""Generate sample billing data for testing the namespace billing dashboard.

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

NAMESPACES = [
    'aztec-proving',
    'aztec-sequencer',
    'aztec-prover-node',
    'aztec-pxe',
    'aztec-faucet',
    'aztec-bot',
    'aztec-ethereum',
    'monitoring',
]

# Base daily cost per namespace (USD) and category weights
NS_PROFILES = {
    'aztec-proving':      {'base': 120.0, 'compute': 0.70, 'storage': 0.10, 'network': 0.10, 'other': 0.10},
    'aztec-sequencer':    {'base': 85.0,  'compute': 0.55, 'storage': 0.15, 'network': 0.20, 'other': 0.10},
    'aztec-prover-node':  {'base': 95.0,  'compute': 0.65, 'storage': 0.15, 'network': 0.10, 'other': 0.10},
    'aztec-pxe':          {'base': 40.0,  'compute': 0.45, 'storage': 0.20, 'network': 0.25, 'other': 0.10},
    'aztec-faucet':       {'base': 15.0,  'compute': 0.30, 'storage': 0.10, 'network': 0.50, 'other': 0.10},
    'aztec-bot':          {'base': 25.0,  'compute': 0.50, 'storage': 0.10, 'network': 0.30, 'other': 0.10},
    'aztec-ethereum':     {'base': 55.0,  'compute': 0.40, 'storage': 0.30, 'network': 0.20, 'other': 0.10},
    'monitoring':         {'base': 20.0,  'compute': 0.25, 'storage': 0.40, 'network': 0.15, 'other': 0.20},
}


def generate_day(date: datetime) -> dict:
    """Generate billing data for a single day."""
    namespaces = {}
    day_of_week = date.weekday()
    # Slightly lower costs on weekends
    weekend_factor = 0.6 if day_of_week >= 5 else 1.0

    for ns in NAMESPACES:
        profile = NS_PROFILES[ns]
        # Add some random variation (+/- 20%) and a slow upward trend
        days_ago = (datetime.now() - date).days
        trend = 1.0 + (60 - min(days_ago, 60)) * 0.003  # gradual increase toward present
        noise = random.uniform(0.8, 1.2)
        daily_total = profile['base'] * weekend_factor * trend * noise

        breakdown = {}
        for cat in ['compute', 'storage', 'network', 'other']:
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
