#!/usr/bin/env python3
"""Extract RSS transitions from bb log output.

bb logs include "(mem: X.XX MiB)" on every log line (peak RSS via getrusage).
This script filters to only the lines where the RSS value changes, giving a
compact timeline of memory growth.

Usage:
    bb prove ... 2>&1 | python3 scripts/rss_transitions.py
    python3 scripts/rss_transitions.py < logfile.log
"""
import sys

prev = None
for line in sys.stdin:
    line = line.strip()
    parts = line.split('mem: ')
    if len(parts) >= 2:
        val = parts[1].split(' MiB')[0]
        if val != prev:
            msg = parts[0].strip().rstrip('(').strip()
            if len(msg) > 80:
                msg = msg[:80]
            print(f'  {val} MiB  {msg}')
            prev = val
