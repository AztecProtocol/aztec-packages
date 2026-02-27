#!/usr/bin/env python3
"""Test CloudTrail instance type resolution against real data + SQLite.

Usage:
  python3 test_cloudtrail.py /path/to/metrics.db --dry-run   # preview matches
  python3 test_cloudtrail.py /path/to/metrics.db              # apply updates
  python3 test_cloudtrail.py --days 7 --dry-run               # only last 7 days
"""
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

try:
    import boto3
except ImportError:
    print("ERROR: boto3 not installed")
    sys.exit(1)

DB_PATH = os.getenv('METRICS_DB_PATH',
                     os.path.join(os.getenv('LOGS_DISK_PATH', '/logs-disk'), 'metrics.db'))
for arg in sys.argv[1:]:
    if not arg.startswith('-') and os.path.exists(arg):
        DB_PATH = arg
        break

dry_run = '--dry-run' in sys.argv
days_back = 90
for i, arg in enumerate(sys.argv):
    if arg == '--days' and i + 1 < len(sys.argv):
        days_back = int(sys.argv[i + 1])

ct = boto3.client('cloudtrail', region_name='us-east-2')


def fetch_events(event_name, start, end, max_events=10000):
    events = []
    kwargs = {
        'LookupAttributes': [{'AttributeKey': 'EventName', 'AttributeValue': event_name}],
        'StartTime': start, 'EndTime': end, 'MaxResults': 50,
    }
    while True:
        resp = ct.lookup_events(**kwargs)
        events.extend(resp.get('Events', []))
        token = resp.get('NextToken')
        if not token or len(events) >= max_events:
            break
        kwargs['NextToken'] = token
    return events


def normalize_branch_name(name):
    """Normalize a branch name the same way bootstrap_ec2 does for the EC2 Name tag."""
    # Strip merge queue prefix: gh-readonly-queue/next/pr-123-... → pr-123
    m = re.match(r'^gh-readonly-queue/[^/]+/pr-(\d+)', name)
    if m:
        return f'pr-{m.group(1)}'
    # Strip " (queue)" suffix from log_ci_run simplified names
    name = re.sub(r'\s*\(queue\)$', '', name)
    # Same as: echo -n "$REF_NAME" | head -c 50 | tr -c 'a-zA-Z0-9-' '_'
    return re.sub(r'[^a-zA-Z0-9-]', '_', name[:50])


# ---- Step 1: Fetch RunInstances events in daily chunks ----
end_time = datetime.now(timezone.utc)
start_time = end_time - timedelta(days=days_back)

print(f"Fetching RunInstances events in daily chunks ({start_time.date()} to {end_time.date()})...")
instance_types = {}   # instance_id → instance_type
instance_times = {}   # instance_id → launch_time_ms
total_run_events = 0

day_start = start_time.replace(hour=0, minute=0, second=0, microsecond=0)
while day_start < end_time:
    day_end = min(day_start + timedelta(days=1), end_time)
    events = fetch_events('RunInstances', day_start, day_end)
    total_run_events += len(events)

    for event in events:
        try:
            detail = json.loads(event.get('CloudTrailEvent', '{}'))
            itype = detail.get('requestParameters', {}).get('instanceType', '')
            items = (detail.get('responseElements') or {}).get('instancesSet', {}).get('items', [])
            for item in items:
                iid = item.get('instanceId', '')
                item_type = item.get('instanceType', '') or itype
                if iid and item_type:
                    instance_types[iid] = item_type
                    instance_times[iid] = int(event['EventTime'].timestamp() * 1000)
        except Exception:
            continue

    day_start = day_start + timedelta(days=1)
    sys.stdout.write(f"\r  {day_start.strftime('%Y-%m-%d')}: {total_run_events} events, {len(instance_types)} instances")
    sys.stdout.flush()

print(f"\n  Total: {total_run_events} RunInstances events, {len(instance_types)} unique instances")

if not instance_types:
    print("No RunInstances data. Exiting.")
    sys.exit(1)

# ---- Step 2: Fetch CreateTags events in daily chunks ----
# NOTE: Tags are applied to CI instances in multiple create-tags calls:
#   1. aws_request_instance_type line 97: Name + Group + GithubActor + CICommand + Dashboard (all at once)
#   2. aws_request_instance_type line 126: Name only (redundant, after SSH)
#   3. aws_request_instance_type line 127: Group only (redundant, after SSH)
# CloudTrail sometimes misses event #1, so we must accumulate tags from ALL events
# for each instance, then filter to build instances afterwards.
print(f"\nFetching CreateTags events in daily chunks...")
all_instance_tags = {}  # instance_id → accumulated tags (unfiltered)
total_tag_events = 0

day_start = start_time.replace(hour=0, minute=0, second=0, microsecond=0)
while day_start < end_time:
    day_end = min(day_start + timedelta(days=1), end_time)
    events = fetch_events('CreateTags', day_start, day_end)
    total_tag_events += len(events)

    for event in events:
        try:
            detail = json.loads(event.get('CloudTrailEvent', '{}'))
            req = detail.get('requestParameters', {})
            resources = req.get('resourcesSet', {}).get('items', [])
            tags = req.get('tagSet', {}).get('items', [])
            tag_dict = {t.get('key', ''): t.get('value', '') for t in tags}
            for res in resources:
                rid = res.get('resourceId', '')
                if rid.startswith('i-'):
                    if rid not in all_instance_tags:
                        all_instance_tags[rid] = {}
                    all_instance_tags[rid].update(tag_dict)
        except Exception:
            continue

    day_start = day_start + timedelta(days=1)
    sys.stdout.write(f"\r  {day_start.strftime('%Y-%m-%d')}: {total_tag_events} events, {len(all_instance_tags)} instances")
    sys.stdout.flush()

# Filter to build instances (those with Group=build-instance tag)
instance_tags = {
    iid: tags for iid, tags in all_instance_tags.items()
    if tags.get('Group') == 'build-instance'
}
print(f"\n  Total: {total_tag_events} CreateTags events, {len(all_instance_tags)} total instances, {len(instance_tags)} build instances")

# ---- Step 3: Join RunInstances + CreateTags by instance_id ----
instances = []
joined_count = 0
for iid, itype in instance_types.items():
    tags = instance_tags.get(iid, {})
    has_tags = bool(tags.get('Name'))
    if has_tags:
        joined_count += 1
    instances.append({
        'instance_id': iid,
        'instance_type': itype,
        'launch_ms': instance_times.get(iid, 0),
        'dashboard': tags.get('Dashboard', ''),
        'name_tag': tags.get('Name', ''),
        'actor': tags.get('GithubActor', ''),
    })

print(f"\n  Joined: {len(instances)} total RunInstances, {joined_count} with Name tag from CreateTags")
print(f"  CreateTags instances NOT in RunInstances: {len(instance_tags) - joined_count}")

# Show type distribution
type_counts = {}
for inst in instances:
    if inst['name_tag']:
        type_counts[inst['instance_type']] = type_counts.get(inst['instance_type'], 0) + 1
print(f"\n  Instance types (from joined data):")
for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
    print(f"    {t}: {c}")

# ---- Step 4: Load SQLite and match ----
if not os.path.exists(DB_PATH):
    print(f"\nNo database at {DB_PATH}. Exiting after CloudTrail summary.")
    sys.exit(0)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

cutoff_ms = int((datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp() * 1000)
unknown_runs = conn.execute('''
    SELECT dashboard, name, timestamp_ms, complete_ms, instance_vcpus, spot,
           cost_usd, arch, pr_number
    FROM ci_runs
    WHERE (instance_type IS NULL OR instance_type = '' OR instance_type = 'unknown')
    AND timestamp_ms > ?
''', (cutoff_ms,)).fetchall()
print(f"\n{len(unknown_runs)} unknown ci_runs in last {days_back} days")

# Build lookup: normalized_name → [instances] for fast matching
# Name tag format: <branch_normalized>_<arch>[_<postfix>]
# Examples:
#   next_amd64                              → branch=next
#   merge-train_spartan_amd64_17            → branch=merge-train_spartan
#   pr-20419_arm64_a1-fast                  → branch=pr-20419
#   cl_all_in_makefile_arm64_a1-fast        → branch=cl_all_in_makefile
_NAME_TAG_RE = re.compile(r'^(.+)_(amd64|arm64)(?:_.*)?$')
tag_index = {}
for inst in instances:
    if inst['name_tag']:
        m = _NAME_TAG_RE.match(inst['name_tag'])
        if m:
            branch = m.group(1)
            tag_index.setdefault(branch, []).append(inst)
        else:
            # No arch suffix found — use name as-is
            tag_index.setdefault(inst['name_tag'], []).append(inst)

updated = 0
unmatched_dashboards = {}
matches = []
for run in unknown_runs:
    run_name = run['name']
    run_arch = run['arch'] or ''
    run_ts = run['timestamp_ms']
    run_dashboard = run['dashboard']

    # Compute expected EC2 instance name (same as bootstrap_ec2)
    expected_name = normalize_branch_name(run_name)

    # Look up by normalized name
    candidates = tag_index.get(expected_name, [])

    best = None
    best_delta = float('inf')
    for inst in candidates:
        # Verify arch matches — Name tag format: branch_<arch>[_postfix]
        if run_arch:
            m = _NAME_TAG_RE.match(inst['name_tag'])
            if m and m.group(2) != run_arch:
                continue
        # Verify dashboard matches (if tag present)
        if inst['dashboard'] and inst['dashboard'] != run_dashboard:
            continue
        # CI run should start AFTER instance launch. Instance runs multiple steps
        # over its ~90-minute lifetime (default shutdown timer).
        delta = run_ts - inst['launch_ms']
        if delta < -60_000:  # run shouldn't start >1 min before launch
            continue
        if delta > 5400_000:  # 90 min max lifetime
            continue
        # Prefer the most recently launched instance (closest launch BEFORE run)
        if delta >= 0 and (best is None or inst['launch_ms'] > best['launch_ms']):
            best_delta = delta
            best = inst
        elif best is None and abs(delta) < 60_000:
            # Allow small negative delta (clock skew)
            best_delta = abs(delta)
            best = inst

    if best:
        matches.append({
            'dashboard': run_dashboard,
            'name': run_name,
            'timestamp_ms': run_ts,
            'new_type': best['instance_type'],
            'delta_s': round(best_delta / 1000),
            'tag': best['name_tag'],
            'iid': best['instance_id'],
        })
        if not dry_run:
            conn.execute('''
                UPDATE ci_runs SET instance_type = ?
                WHERE dashboard = ? AND timestamp_ms = ? AND name = ?
            ''', (best['instance_type'], run_dashboard, run_ts, run_name))
        updated += 1
    else:
        unmatched_dashboards[run_dashboard] = unmatched_dashboards.get(run_dashboard, 0) + 1

if not dry_run and updated:
    conn.commit()

print(f"\n{'Would resolve' if dry_run else 'Resolved'} {updated}/{len(unknown_runs)} unknown instance types")

if matches:
    print(f"\nSample matches:")
    for m in matches[:30]:
        print(f"  [{m['dashboard']:6s}] {m['name']:45s} -> {m['new_type']:15s} "
              f"(dt={m['delta_s']:4d}s, tag={m['tag']}, id={m['iid']})")
    if len(matches) > 30:
        print(f"  ... and {len(matches) - 30} more")

    # Summary by type
    type_counts = {}
    for m in matches:
        type_counts[m['new_type']] = type_counts.get(m['new_type'], 0) + 1
    print(f"\nResolved types:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")

if unmatched_dashboards:
    print(f"\nUnmatched by dashboard:")
    for d, c in sorted(unmatched_dashboards.items(), key=lambda x: -x[1]):
        print(f"  {d}: {c}")

conn.close()
