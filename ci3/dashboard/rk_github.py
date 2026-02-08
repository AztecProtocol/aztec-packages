"""GitHub API polling with in-memory cache.

Fetches PR lifecycle, deployment runs, and branch lag via `gh` CLI.
All data cached in memory with TTL. No SQLite, no background threads.
"""
import json
import subprocess
import threading
import time
from datetime import datetime, timedelta, timezone

REPO = 'AztecProtocol/aztec-packages'

BRANCH_PAIRS = [
    ('next', 'staging-public'),
    ('next', 'testnet'),
    ('staging-public', 'testnet'),
]

DEPLOY_WORKFLOWS = [
    'deploy-staging-networks.yml',
    'deploy-network.yml',
    'deploy-next-net.yml',
]

_CACHE_TTL = 3600  # 1 hour
_pr_cache = {'data': [], 'ts': 0}
_deploy_cache = {'data': [], 'ts': 0}
_lag_cache = {'data': [], 'ts': 0}
_pr_author_cache = {}  # {pr_number: {'author': str, 'title': str, 'branch': str}}
_pr_lock = threading.Lock()
_deploy_lock = threading.Lock()
_lag_lock = threading.Lock()


def _gh(args: list[str]) -> str | None:
    try:
        result = subprocess.run(
            ['gh'] + args,
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"[rk_github] gh error: {e}")
    return None


# ---- PR lifecycle ----

def _fetch_and_process_prs() -> list[dict]:
    out = _gh([
        'pr', 'list', '--repo', REPO, '--state', 'merged',
        '--limit', '100',
        '--json', 'number,author,title,createdAt,mergedAt,closedAt,baseRefName'
    ])
    if not out:
        return []
    try:
        prs = json.loads(out)
    except json.JSONDecodeError:
        return []

    for pr in prs:
        author = pr.get('author', {})
        if isinstance(author, dict):
            pr['author'] = author.get('login', 'unknown')
        created = pr.get('createdAt', '')
        merged = pr.get('mergedAt')
        if created and merged:
            try:
                c = datetime.fromisoformat(created.replace('Z', '+00:00'))
                m = datetime.fromisoformat(merged.replace('Z', '+00:00'))
                pr['merge_time_hrs'] = round((m - c).total_seconds() / 3600, 2)
            except (ValueError, TypeError):
                pr['merge_time_hrs'] = None
        else:
            pr['merge_time_hrs'] = None
        pr['merged_date'] = merged[:10] if merged else None
    return prs


def _ensure_prs():
    now = time.time()
    if _pr_cache['data'] and now - _pr_cache['ts'] < _CACHE_TTL:
        return
    if not _pr_lock.acquire(blocking=False):
        return
    try:
        prs = _fetch_and_process_prs()
        if prs:
            _pr_cache['data'] = prs
            _pr_cache['ts'] = now
    finally:
        _pr_lock.release()


# ---- Deployments ----

def _fetch_all_deploys() -> list[dict]:
    all_runs = []
    for workflow in DEPLOY_WORKFLOWS:
        out = _gh([
            'run', 'list', '--repo', REPO,
            '--workflow', workflow, '--limit', '50',
            '--json', 'databaseId,status,conclusion,createdAt,updatedAt,headBranch,name'
        ])
        if not out:
            continue
        try:
            runs = json.loads(out)
        except json.JSONDecodeError:
            continue
        for run in runs:
            started = run.get('createdAt', '')
            completed = run.get('updatedAt')
            duration = None
            if started and completed:
                try:
                    s = datetime.fromisoformat(started.replace('Z', '+00:00'))
                    c = datetime.fromisoformat(completed.replace('Z', '+00:00'))
                    duration = round((c - s).total_seconds(), 1)
                except (ValueError, TypeError):
                    pass
            all_runs.append({
                'run_id': str(run.get('databaseId', '')),
                'workflow_name': workflow.replace('.yml', ''),
                'ref_name': run.get('headBranch', ''),
                'status': run.get('conclusion', run.get('status', 'unknown')),
                'started_at': started,
                'completed_at': completed,
                'duration_secs': duration,
                'started_date': started[:10] if started else None,
            })
    return all_runs


def _ensure_deploys():
    now = time.time()
    if _deploy_cache['data'] and now - _deploy_cache['ts'] < _CACHE_TTL:
        return
    if not _deploy_lock.acquire(blocking=False):
        return
    try:
        deploys = _fetch_all_deploys()
        if deploys:
            _deploy_cache['data'] = deploys
            _deploy_cache['ts'] = now
    finally:
        _deploy_lock.release()


# ---- Branch lag ----

def _fetch_branch_lag() -> list[dict]:
    results = []
    today = datetime.now(timezone.utc).date().isoformat()
    for source, target in BRANCH_PAIRS:
        out = _gh([
            'api', f'repos/{REPO}/compare/{target}...{source}',
            '--jq', '.ahead_by'
        ])
        if not out:
            continue
        try:
            commits_behind = int(out)
        except (ValueError, TypeError):
            continue

        days_behind = None
        out2 = _gh([
            'api', f'repos/{REPO}/compare/{target}...{source}',
            '--jq', '.commits[0].commit.committer.date'
        ])
        if out2:
            try:
                oldest = datetime.fromisoformat(out2.replace('Z', '+00:00'))
                days_behind = round((datetime.now(timezone.utc) - oldest).total_seconds() / 86400, 1)
            except (ValueError, TypeError):
                pass

        results.append({
            'date': today,
            'source': source,
            'target': target,
            'commits_behind': commits_behind,
            'days_behind': days_behind,
        })
    return results


def _ensure_lag():
    now = time.time()
    if _lag_cache['data'] and now - _lag_cache['ts'] < _CACHE_TTL:
        return
    if not _lag_lock.acquire(blocking=False):
        return
    try:
        lag = _fetch_branch_lag()
        if lag:
            _lag_cache['data'] = lag
            _lag_cache['ts'] = now
    finally:
        _lag_lock.release()


# ---- Query functions for API endpoints ----

def get_deployment_speed(date_from: str, date_to: str, workflow: str = '') -> dict:
    if not _deploy_cache['data']:
        _ensure_deploys()
    else:
        threading.Thread(target=_ensure_deploys, daemon=True).start()
    deploys = [d for d in _deploy_cache['data']
               if d.get('started_date') and date_from <= d['started_date'] <= date_to]
    if workflow:
        deploys = [d for d in deploys if d['workflow_name'] == workflow]

    # Group by date
    by_date_map = {}
    for d in deploys:
        date = d['started_date']
        if date not in by_date_map:
            by_date_map[date] = {'durations': [], 'success': 0, 'failure': 0, 'count': 0}
        by_date_map[date]['count'] += 1
        if d['duration_secs'] is not None:
            by_date_map[date]['durations'].append(d['duration_secs'] / 60.0)
        if d['status'] == 'success':
            by_date_map[date]['success'] += 1
        elif d['status'] == 'failure':
            by_date_map[date]['failure'] += 1

    by_date = []
    for date in sorted(by_date_map):
        b = by_date_map[date]
        durs = sorted(b['durations'])
        by_date.append({
            'date': date,
            'median_mins': round(durs[len(durs)//2], 1) if durs else None,
            'p95_mins': round(durs[int(len(durs)*0.95)], 1) if durs else None,
            'count': b['count'],
            'success': b['success'],
            'failure': b['failure'],
        })

    all_durs = sorted([d['duration_secs']/60.0 for d in deploys if d['duration_secs'] is not None])
    total = len(deploys)
    success = sum(1 for d in deploys if d['status'] == 'success')

    recent = [{'run_id': d['run_id'], 'workflow_name': d['workflow_name'],
               'status': d['status'], 'duration_mins': round(d['duration_secs']/60.0, 1) if d['duration_secs'] else None,
               'started_at': d['started_at'], 'ref_name': d['ref_name']}
              for d in sorted(deploys, key=lambda x: x['started_at'], reverse=True)[:50]]

    return {
        'by_date': by_date,
        'summary': {
            'median_mins': round(all_durs[len(all_durs)//2], 1) if all_durs else None,
            'p95_mins': round(all_durs[int(len(all_durs)*0.95)], 1) if all_durs else None,
            'success_rate': round(100.0 * success / max(total, 1), 1),
            'total': total,
        },
        'recent': recent,
    }


def get_branch_lag(date_from: str, date_to: str) -> dict:
    if not _lag_cache['data']:
        _ensure_lag()
    else:
        threading.Thread(target=_ensure_lag, daemon=True).start()
    pairs = []
    for source, target in BRANCH_PAIRS:
        matching = [l for l in _lag_cache['data']
                    if l['source'] == source and l['target'] == target]
        current = matching[-1] if matching else {'commits_behind': 0, 'days_behind': 0}
        pairs.append({
            'source': source,
            'target': target,
            'current': {'commits_behind': current.get('commits_behind', 0),
                        'days_behind': current.get('days_behind', 0)},
            'history': [{'date': l['date'], 'commits_behind': l['commits_behind'],
                         'days_behind': l['days_behind']} for l in matching],
        })
    return {'pairs': pairs}


def get_pr_author(pr_number) -> dict | None:
    """Look up PR author/title by number. Results are cached permanently (PR data doesn't change)."""
    pr_number = int(pr_number) if pr_number else None
    if not pr_number:
        return None
    if pr_number in _pr_author_cache:
        return _pr_author_cache[pr_number]

    # Check merged PR cache first (already fetched)
    for pr in _pr_cache.get('data', []):
        if pr.get('number') == pr_number:
            info = {'author': pr.get('author', 'unknown'), 'title': pr.get('title', ''),
                    'branch': pr.get('headRefName', '')}
            _pr_author_cache[pr_number] = info
            return info

    # Fetch from GitHub API
    out = _gh(['pr', 'view', str(pr_number), '--repo', REPO,
               '--json', 'author,title,headRefName'])
    if out:
        try:
            data = json.loads(out)
            author = data.get('author', {})
            if isinstance(author, dict):
                author = author.get('login', 'unknown')
            info = {'author': author, 'title': data.get('title', ''),
                    'branch': data.get('headRefName', '')}
            _pr_author_cache[pr_number] = info
            return info
        except (json.JSONDecodeError, KeyError):
            pass
    return None


def batch_get_pr_authors(pr_numbers: set) -> dict:
    """Fetch authors for multiple PR numbers, using cache. Returns {pr_number: info}."""
    result = {}
    to_fetch = []
    for prn in pr_numbers:
        if not prn:
            continue
        prn = int(prn)
        if prn in _pr_author_cache:
            result[prn] = _pr_author_cache[prn]
        else:
            to_fetch.append(prn)

    # Check merged PR cache first
    for pr in _pr_cache.get('data', []):
        num = pr.get('number')
        if num in to_fetch:
            info = {'author': pr.get('author', 'unknown'), 'title': pr.get('title', ''),
                    'branch': pr.get('headRefName', '')}
            _pr_author_cache[num] = info
            result[num] = info
            to_fetch.remove(num)

    # Fetch remaining individually (with a cap to avoid API abuse)
    for prn in to_fetch[:50]:
        info = get_pr_author(prn)
        if info:
            result[prn] = info

    return result


def get_pr_metrics(date_from: str, date_to: str, author: str = '',
                   ci_runs: list = None) -> dict:
    """Get PR metrics. ci_runs should be passed from the caller (read from Redis)."""
    if not _pr_cache['data']:
        _ensure_prs()
    else:
        threading.Thread(target=_ensure_prs, daemon=True).start()

    prs = [p for p in _pr_cache['data']
           if p.get('merged_date') and date_from <= p['merged_date'] <= date_to]
    if author:
        prs = [p for p in prs if p.get('author') == author]

    # Compute per-PR CI cost from ci_runs
    pr_costs = {}
    pr_run_counts = {}
    if ci_runs:
        for run in ci_runs:
            prn = run.get('pr_number')
            if prn and run.get('cost_usd') is not None:
                pr_costs[prn] = pr_costs.get(prn, 0) + run['cost_usd']
                pr_run_counts[prn] = pr_run_counts.get(prn, 0) + 1

    for pr in prs:
        prn = pr.get('number')
        pr['ci_cost_usd'] = round(pr_costs.get(prn, 0), 2)
        pr['ci_runs_count'] = pr_run_counts.get(prn, 0)

    # Group by date
    by_date_map = {}
    for pr in prs:
        date = pr['merged_date']
        if date not in by_date_map:
            by_date_map[date] = {'costs': [], 'merge_times': [], 'count': 0}
        by_date_map[date]['count'] += 1
        by_date_map[date]['costs'].append(pr['ci_cost_usd'])
        if pr.get('merge_time_hrs') is not None:
            by_date_map[date]['merge_times'].append(pr['merge_time_hrs'])

    by_date = [{'date': d, 'avg_cost': round(sum(v['costs'])/max(len(v['costs']),1), 2),
                'avg_merge_time_hrs': round(sum(v['merge_times'])/max(len(v['merge_times']),1), 1) if v['merge_times'] else None,
                'pr_count': v['count']}
               for d, v in sorted(by_date_map.items())]

    # By author (all PRs in range, not filtered by author)
    all_prs_in_range = [p for p in _pr_cache['data']
                        if p.get('merged_date') and date_from <= p['merged_date'] <= date_to]
    for pr in all_prs_in_range:
        prn = pr.get('number')
        pr.setdefault('ci_cost_usd', round(pr_costs.get(prn, 0), 2))

    author_map = {}
    for pr in all_prs_in_range:
        a = pr.get('author', 'unknown')
        if a not in author_map:
            author_map[a] = {'total_cost': 0, 'pr_count': 0, 'merge_times': []}
        author_map[a]['total_cost'] += pr.get('ci_cost_usd', 0)
        author_map[a]['pr_count'] += 1
        if pr.get('merge_time_hrs') is not None:
            author_map[a]['merge_times'].append(pr['merge_time_hrs'])

    by_author = [{'author': a, 'total_cost': round(v['total_cost'], 2), 'pr_count': v['pr_count'],
                  'avg_merge_time_hrs': round(sum(v['merge_times'])/max(len(v['merge_times']),1), 1) if v['merge_times'] else None}
                 for a, v in sorted(author_map.items(), key=lambda x: -x[1]['total_cost'])[:20]]

    all_costs = [p.get('ci_cost_usd', 0) for p in prs]
    all_merge = [p['merge_time_hrs'] for p in prs if p.get('merge_time_hrs') is not None]
    all_run_counts = [p.get('ci_runs_count', 0) for p in prs]

    return {
        'by_date': by_date,
        'by_author': by_author,
        'summary': {
            'avg_cost_per_pr': round(sum(all_costs)/max(len(all_costs),1), 2) if all_costs else 0,
            'median_merge_time_hrs': round(sorted(all_merge)[len(all_merge)//2], 1) if all_merge else None,
            'total_prs': len(prs),
            'total_cost': round(sum(all_costs), 2),
            'avg_ci_runs_per_pr': round(sum(all_run_counts)/max(len(all_run_counts),1), 1) if all_run_counts else 0,
        },
    }
