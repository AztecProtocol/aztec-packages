"""GitHub API polling with in-memory cache.

Fetches PR lifecycle, deployment runs, branch lag, and merge queue stats via
the GitHub REST API (using requests + GH_TOKEN env var).
Most data cached in memory with TTL. Merge queue stats persisted to SQLite daily.
"""
import json
import os
import requests
import threading
import time
from datetime import datetime, timedelta, timezone

import db as _db

REPO = 'AztecProtocol/aztec-packages'
_GH_API = 'https://api.github.com'

BRANCH_PAIRS = [
    ('next', 'staging-public'),
    ('next', 'testnet'),
    ('staging-public', 'testnet'),
]

DEPLOY_WORKFLOWS = [
    'deploy-staging-networks.yml',
    'deploy-network.yml',
]

_CACHE_TTL = 3600  # 1 hour
_pr_cache = {'data': [], 'ts': 0}
_commits_cache: dict = {}  # keyed by branch
_commits_lock = threading.Lock()
_deploy_cache = {'data': [], 'ts': 0}
_lag_cache = {'data': [], 'ts': 0}
_pr_lock = threading.Lock()
_deploy_lock = threading.Lock()
_lag_lock = threading.Lock()


def _gh_headers() -> dict:
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
    h = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
    if token:
        h['Authorization'] = f'Bearer {token}'
    return h


def _github_get(path: str, paginate: bool = False) -> list | dict | None:
    """GET from GitHub REST API. Returns parsed JSON (list or dict).
    If paginate=True, follows Link: next headers and merges array results."""
    url = f'{_GH_API}/{path}' if not path.startswith('http') else path
    headers = _gh_headers()
    try:
        if not paginate:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                print(f"[rk_github] API {resp.status_code}: {url}")
                return None
            return resp.json()
        # Paginated: collect all pages
        all_items = []
        while url:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                print(f"[rk_github] API {resp.status_code}: {url}")
                break
            data = resp.json()
            if isinstance(data, list):
                all_items.extend(data)
            elif isinstance(data, dict):
                # For endpoints like /actions/workflows/.../runs that wrap in an object
                all_items.append(data)
            # Follow Link: <url>; rel="next"
            link = resp.headers.get('Link', '')
            url = None
            for part in link.split(','):
                if 'rel="next"' in part:
                    url = part.split('<')[1].split('>')[0]
        return all_items
    except Exception as e:
        print(f"[rk_github] API error: {e}")
        return None


def _github_graphql(query: str, variables: dict = None) -> dict | None:
    """Execute a GitHub GraphQL query."""
    headers = _gh_headers()
    try:
        resp = requests.post(f'{_GH_API}/graphql', headers=headers,
                             json={'query': query, 'variables': variables or {}},
                             timeout=30)
        if resp.status_code != 200:
            print(f"[rk_github] GraphQL {resp.status_code}")
            return None
        data = resp.json()
        if 'errors' in data:
            print(f"[rk_github] GraphQL errors: {data['errors']}")
        return data.get('data')
    except Exception as e:
        print(f"[rk_github] GraphQL error: {e}")
        return None


# ---- PR lifecycle ----

_PR_GQL = '''
query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: MERGED, first: 100, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        author { login }
        title
        createdAt
        mergedAt
        closedAt
        baseRefName
        headRefName
        additions
        deletions
        changedFiles
        isDraft
        reviewDecision
        labels(first: 20) { nodes { name } }
      }
    }
  }
}'''


def _fetch_and_process_prs() -> list[dict]:
    owner, repo = REPO.split('/')
    prs = []
    cursor = None
    for _ in range(5):  # max 5 pages = 500 PRs
        data = _github_graphql(_PR_GQL, {'owner': owner, 'repo': repo, 'cursor': cursor})
        if not data:
            break
        pr_data = data.get('repository', {}).get('pullRequests', {})
        nodes = pr_data.get('nodes', [])
        for node in nodes:
            node['author'] = (node.get('author') or {}).get('login', 'unknown')
            node['labels'] = [l['name'] for l in (node.get('labels') or {}).get('nodes', [])]
        prs.extend(nodes)
        page_info = pr_data.get('pageInfo', {})
        if not page_info.get('hasNextPage'):
            break
        cursor = page_info.get('endCursor')
    if not prs:
        return []

    for pr in prs:
        author = pr.get('author', {})
        if isinstance(author, dict):
            pr['author'] = author.get('login', 'unknown')
        # Extract label names from label objects
        labels = pr.get('labels', [])
        if labels and isinstance(labels[0], dict):
            pr['labels'] = [l.get('name', '') for l in labels]
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
        pr['size'] = (pr.get('additions', 0) or 0) + (pr.get('deletions', 0) or 0)
    return prs


def _ensure_prs():
    import db as _db
    now = time.time()
    if _pr_cache['data'] and now - _pr_cache['ts'] < _CACHE_TTL:
        return
    # Try SQLite cache before hitting GitHub
    if not _pr_cache['data']:
        try:
            rows = _db.query("SELECT value, updated_at FROM pr_cache WHERE key = 'prs'")
            if rows and now - rows[0]['updated_at'] < _CACHE_TTL:
                _pr_cache['data'] = json.loads(rows[0]['value'])
                _pr_cache['ts'] = rows[0]['updated_at']
                return
        except Exception:
            pass
    if not _pr_lock.acquire(blocking=False):
        return
    try:
        prs = _fetch_and_process_prs()
        if prs:
            _pr_cache['data'] = prs
            _pr_cache['ts'] = now
            try:
                _db.execute(
                    "INSERT OR REPLACE INTO pr_cache (key, value, updated_at) VALUES ('prs', ?, ?)",
                    (json.dumps(prs, default=str), now),
                )
            except Exception:
                pass
    finally:
        _pr_lock.release()


# ---- Deployments ----

def _fetch_all_deploys() -> list[dict]:
    all_runs = []
    for workflow in DEPLOY_WORKFLOWS:
        data = _github_get(
            f'repos/{REPO}/actions/workflows/{workflow}/runs?per_page=50&status=completed')
        if not data:
            continue
        runs = data.get('workflow_runs', [])
        for run in runs:
            started = run.get('created_at', '')
            completed = run.get('updated_at')
            duration = None
            if started and completed:
                try:
                    s = datetime.fromisoformat(started.replace('Z', '+00:00'))
                    c = datetime.fromisoformat(completed.replace('Z', '+00:00'))
                    duration = round((c - s).total_seconds(), 1)
                except (ValueError, TypeError):
                    pass
            all_runs.append({
                'run_id': str(run.get('id', '')),
                'workflow_name': workflow.replace('.yml', ''),
                'ref_name': run.get('head_branch', ''),
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
        data = _github_get(f'repos/{REPO}/compare/{target}...{source}')
        if not data:
            continue
        try:
            commits_behind = int(data.get('ahead_by', 0))
        except (ValueError, TypeError):
            continue

        days_behind = None
        commits = data.get('commits', [])
        if commits:
            try:
                oldest_date = commits[0].get('commit', {}).get('committer', {}).get('date', '')
                if oldest_date:
                    oldest = datetime.fromisoformat(oldest_date.replace('Z', '+00:00'))
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


def _cache_pr_author(pr_number: int, info: dict):
    """Write PR author info to SQLite cache."""
    _db.execute('''
        INSERT OR REPLACE INTO pr_authors (pr_number, author, title, branch, additions, deletions, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (pr_number, info['author'], info.get('title', ''), info.get('branch', ''),
          info.get('additions', 0), info.get('deletions', 0),
          datetime.now(timezone.utc).isoformat()))


def _get_cached_pr_author(pr_number: int) -> dict | None:
    """Read PR author info from SQLite cache."""
    rows = _db.query('SELECT * FROM pr_authors WHERE pr_number = ?', (pr_number,))
    if rows:
        r = rows[0]
        return {'author': r['author'], 'title': r['title'], 'branch': r['branch'],
                'additions': r['additions'], 'deletions': r['deletions']}
    return None


def get_pr_author(pr_number) -> dict | None:
    """Look up PR author/title by number. Results cached in SQLite."""
    pr_number = int(pr_number) if pr_number else None
    if not pr_number:
        return None

    # Check SQLite cache
    cached = _get_cached_pr_author(pr_number)
    if cached:
        return cached

    # Check merged PR cache (already fetched in-memory)
    for pr in _pr_cache.get('data', []):
        if pr.get('number') == pr_number:
            info = {'author': pr.get('author', 'unknown'), 'title': pr.get('title', ''),
                    'branch': pr.get('headRefName', ''),
                    'additions': pr.get('additions', 0), 'deletions': pr.get('deletions', 0)}
            _cache_pr_author(pr_number, info)
            return info

    # Fetch from GitHub REST API
    data = _github_get(f'repos/{REPO}/pulls/{pr_number}')
    if data:
        try:
            author = (data.get('user') or {}).get('login', 'unknown')
            info = {'author': author, 'title': data.get('title', ''),
                    'branch': (data.get('head') or {}).get('ref', ''),
                    'additions': data.get('additions', 0), 'deletions': data.get('deletions', 0)}
            _cache_pr_author(pr_number, info)
            return info
        except (KeyError, TypeError):
            pass
    return None


def batch_get_pr_authors(pr_numbers: set) -> dict:
    """Fetch authors for multiple PR numbers, using SQLite cache. Returns {pr_number: info}."""
    result = {}
    # Batch fetch from SQLite cache in a single query
    clean = [int(prn) for prn in pr_numbers if prn]
    if not clean:
        return result
    placeholders = ','.join('?' * len(clean))
    cached_rows = _db.query(
        f'SELECT * FROM pr_authors WHERE pr_number IN ({placeholders})', clean)
    cached_set = set()
    for r in cached_rows:
        prn = r['pr_number']
        result[prn] = {'author': r['author'], 'title': r['title'], 'branch': r['branch'],
                       'additions': r['additions'], 'deletions': r['deletions']}
        cached_set.add(prn)
    to_fetch = [prn for prn in clean if prn not in cached_set]

    # Check merged PR cache (in-memory)
    if to_fetch:
        to_fetch_set = set(to_fetch)
        for pr in _pr_cache.get('data', []):
            num = pr.get('number')
            if num in to_fetch_set:
                info = {'author': pr.get('author', 'unknown'), 'title': pr.get('title', ''),
                        'branch': pr.get('headRefName', ''),
                        'additions': pr.get('additions', 0), 'deletions': pr.get('deletions', 0)}
                _cache_pr_author(num, info)
                result[num] = info
                to_fetch_set.discard(num)
        to_fetch = list(to_fetch_set)

    # Fetch remaining concurrently (with a cap to avoid API abuse)
    if to_fetch:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(get_pr_author, prn): prn for prn in to_fetch[:50]}
            for fut in as_completed(futures):
                prn = futures[fut]
                try:
                    info = fut.result()
                    if info:
                        result[prn] = info
                except Exception:
                    pass

    return result


def get_branch_pr_map() -> dict:
    """Return {branch_name: pr_number} from the PR cache. Call _ensure_prs first."""
    if not _pr_cache['data']:
        _ensure_prs()
    else:
        threading.Thread(target=_ensure_prs, daemon=True).start()
    return {pr['headRefName']: pr['number']
            for pr in _pr_cache.get('data', [])
            if pr.get('headRefName')}


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

    # Compute per-PR CI cost and duration from ci_runs
    pr_costs = {}
    pr_run_counts = {}
    pr_ci_time = {}  # total CI compute hours per PR
    if ci_runs:
        for run in ci_runs:
            prn = run.get('pr_number')
            if not prn:
                continue
            if run.get('cost_usd') is not None:
                pr_costs[prn] = pr_costs.get(prn, 0) + run['cost_usd']
                pr_run_counts[prn] = pr_run_counts.get(prn, 0) + 1
            c = run.get('complete')
            t = run.get('timestamp')
            if c and t:
                pr_ci_time[prn] = pr_ci_time.get(prn, 0) + (c - t) / 3_600_000

    for pr in prs:
        prn = pr.get('number')
        pr['ci_cost_usd'] = round(pr_costs.get(prn, 0), 2)
        pr['ci_runs_count'] = pr_run_counts.get(prn, 0)
        pr['ci_time_hrs'] = round(pr_ci_time.get(prn, 0), 2)

    # Group by date
    by_date_map = {}
    for pr in prs:
        date = pr['merged_date']
        if date not in by_date_map:
            by_date_map[date] = {'costs': [], 'merge_times': [], 'ci_times': [],
                                  'run_counts': [], 'count': 0}
        by_date_map[date]['count'] += 1
        by_date_map[date]['costs'].append(pr['ci_cost_usd'])
        by_date_map[date]['ci_times'].append(pr.get('ci_time_hrs', 0))
        by_date_map[date]['run_counts'].append(pr.get('ci_runs_count', 0))
        if pr.get('merge_time_hrs') is not None:
            by_date_map[date]['merge_times'].append(pr['merge_time_hrs'])

    def _median(vals):
        s = sorted(vals)
        n = len(s)
        if n == 0:
            return None
        if n % 2 == 1:
            return s[n // 2]
        return (s[n // 2 - 1] + s[n // 2]) / 2

    by_date = []
    for d, v in sorted(by_date_map.items()):
        by_date.append({
            'date': d,
            'pr_count': v['count'],
            'avg_cost': round(sum(v['costs']) / max(len(v['costs']), 1), 2),
            'median_merge_time_hrs': round(_median(v['merge_times']), 1) if v['merge_times'] else None,
            'avg_ci_time_hrs': round(sum(v['ci_times']) / max(len(v['ci_times']), 1), 2),
            'avg_runs': round(sum(v['run_counts']) / max(len(v['run_counts']), 1), 1),
        })

    # By author (all PRs in range, not filtered by author)
    all_prs_in_range = [p for p in _pr_cache['data']
                        if p.get('merged_date') and date_from <= p['merged_date'] <= date_to]

    author_map = {}
    for pr in all_prs_in_range:
        prn = pr.get('number')
        a = pr.get('author', 'unknown')
        if a not in author_map:
            author_map[a] = {'total_cost': 0, 'pr_count': 0, 'merge_times': [],
                             'total_ci_time': 0, 'total_runs': 0}
        author_map[a]['total_cost'] += round(pr_costs.get(prn, 0), 2)
        author_map[a]['pr_count'] += 1
        author_map[a]['total_ci_time'] += round(pr_ci_time.get(prn, 0), 2)
        author_map[a]['total_runs'] += pr_run_counts.get(prn, 0)
        if pr.get('merge_time_hrs') is not None:
            author_map[a]['merge_times'].append(pr['merge_time_hrs'])

    by_author = []
    for a, v in sorted(author_map.items(), key=lambda x: -x[1]['total_cost'])[:20]:
        by_author.append({
            'author': a,
            'total_cost': round(v['total_cost'], 2),
            'pr_count': v['pr_count'],
            'avg_merge_time_hrs': round(_median(v['merge_times']), 1) if v['merge_times'] else None,
            'avg_ci_time_hrs': round(v['total_ci_time'] / max(v['pr_count'], 1), 2),
            'avg_runs_per_pr': round(v['total_runs'] / max(v['pr_count'], 1), 1),
        })

    all_costs = [p.get('ci_cost_usd', 0) for p in prs]
    all_merge = [p['merge_time_hrs'] for p in prs if p.get('merge_time_hrs') is not None]
    all_run_counts = [p.get('ci_runs_count', 0) for p in prs]
    all_ci_times = [p.get('ci_time_hrs', 0) for p in prs]

    return {
        'by_date': by_date,
        'by_author': by_author,
        'summary': {
            'avg_cost_per_pr': round(sum(all_costs)/max(len(all_costs),1), 2) if all_costs else 0,
            'median_merge_time_hrs': round(_median(all_merge), 1) if all_merge else None,
            'total_prs': len(prs),
            'total_cost': round(sum(all_costs), 2),
            'avg_ci_runs_per_pr': round(sum(all_run_counts)/max(len(all_run_counts),1), 1) if all_run_counts else 0,
            'avg_ci_time_hrs': round(sum(all_ci_times)/max(len(all_ci_times),1), 2) if all_ci_times else 0,
        },
    }


# ---- Merge queue failure rate ----

CI3_WORKFLOW = 'ci3.yml'

def _fetch_merge_queue_runs(date_str: str) -> dict:
    """Fetch merge_group workflow runs for a single date. Returns daily summary."""
    pages = _github_get(
        f'repos/{REPO}/actions/workflows/{CI3_WORKFLOW}/runs'
        f'?event=merge_group&created={date_str}&per_page=100',
        paginate=True)
    summary = {'date': date_str, 'total': 0, 'success': 0, 'failure': 0,
               'cancelled': 0, 'in_progress': 0}
    if not pages:
        return summary
    for page in pages:
        for run in (page.get('workflow_runs') or []) if isinstance(page, dict) else []:
            conclusion = run.get('conclusion') or ''
            status = run.get('status') or ''
            summary['total'] += 1
            if conclusion == 'success':
                summary['success'] += 1
            elif conclusion == 'failure':
                summary['failure'] += 1
            elif conclusion == 'cancelled':
                summary['cancelled'] += 1
            elif status in ('in_progress', 'queued', 'waiting'):
                summary['in_progress'] += 1
            else:
                summary['failure'] += 1  # treat unknown conclusions as failures
    return summary


def _load_backfill_json():
    """Load seed data from merge-queue-backfill.json if SQLite is empty."""
    import db
    from pathlib import Path
    conn = db.get_db()

    count = conn.execute('SELECT COUNT(*) as c FROM merge_queue_daily').fetchone()['c']
    if count > 0:
        return

    seed = Path(__file__).parent / 'merge-queue-backfill.json'
    if not seed.exists():
        return

    import json
    with seed.open() as f:
        data = json.load(f)

    print(f"[rk_github] Loading {len(data)} days from merge-queue-backfill.json...")
    for ds, summary in data.items():
        conn.execute(
            'INSERT OR REPLACE INTO merge_queue_daily (date, total, success, failure, cancelled, in_progress) '
            'VALUES (?, ?, ?, ?, ?, ?)',
            (ds, summary['total'], summary['success'], summary['failure'],
             summary['cancelled'], summary['in_progress']))
    conn.commit()


def _backfill_merge_queue():
    """Backfill missing merge queue daily stats into SQLite."""
    import db
    conn = db.get_db()

    # Load seed data on first run
    _load_backfill_json()

    # Find which dates we already have
    existing = {row['date'] for row in
                conn.execute('SELECT date FROM merge_queue_daily').fetchall()}

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()
    # Backfill up to 365 days
    start = yesterday - timedelta(days=365)
    current = start

    missing = []
    while current <= yesterday:
        ds = current.isoformat()
        if ds not in existing:
            missing.append(ds)
        current += timedelta(days=1)

    if not missing:
        return

    print(f"[rk_github] Backfilling {len(missing)} days of merge queue stats...")
    for ds in missing:
        summary = _fetch_merge_queue_runs(ds)
        if summary['total'] == 0:
            conn.execute(
                'INSERT OR REPLACE INTO merge_queue_daily (date, total, success, failure, cancelled, in_progress) '
                'VALUES (?, 0, 0, 0, 0, 0)', (ds,))
        else:
            conn.execute(
                'INSERT OR REPLACE INTO merge_queue_daily (date, total, success, failure, cancelled, in_progress) '
                'VALUES (?, ?, ?, ?, ?, ?)',
                (ds, summary['total'], summary['success'], summary['failure'],
                 summary['cancelled'], summary['in_progress']))
        conn.commit()


def refresh_merge_queue_today():
    """Refresh recent merge queue stats. Re-fetches the last 7 days to fix any
    zero rows written during transient API failures."""
    import db
    conn = db.get_db()
    today = datetime.now(timezone.utc).date()

    for i in range(7):
        ds = (today - timedelta(days=i)).isoformat()
        summary = _fetch_merge_queue_runs(ds)
        conn.execute(
            'INSERT OR REPLACE INTO merge_queue_daily (date, total, success, failure, cancelled, in_progress) '
            'VALUES (?, ?, ?, ?, ?, ?)',
            (ds, summary['total'], summary['success'], summary['failure'],
             summary['cancelled'], summary['in_progress']))
        conn.commit()


_MQ_DEPTH_GQL = '''
query($owner: String!, $repo: String!, $branch: String!) {
  repository(owner: $owner, name: $repo) {
    mergeQueue(branch: $branch) {
      entries(first: 100) {
        totalCount
        nodes { position state enqueuedAt pullRequest { number title author { login } } }
      }
    }
  }
}'''

_MQ_BRANCH = 'next'


def poll_merge_queue_depth():
    """Snapshot the current merge queue depth into SQLite."""
    import db
    owner, repo = REPO.split('/')
    data = _github_graphql(_MQ_DEPTH_GQL,
                           {'owner': owner, 'repo': repo, 'branch': _MQ_BRANCH})
    if not data:
        return
    mq = (data.get('repository') or {}).get('mergeQueue')
    if mq is None:
        return
    entries = mq.get('entries', {})
    depth = entries.get('totalCount', 0)
    nodes = entries.get('nodes', [])
    entries_json = json.dumps([{
        'position': n.get('position'),
        'state': n.get('state'),
        'pr': (n.get('pullRequest') or {}).get('number'),
        'author': ((n.get('pullRequest') or {}).get('author') or {}).get('login'),
    } for n in nodes]) if nodes else None

    now = datetime.now(timezone.utc).isoformat()
    db.execute('INSERT INTO merge_queue_snapshots (timestamp, depth, entries_json) VALUES (?, ?, ?)',
               (now, depth, entries_json))


def _aggregate_depth_stats():
    """Aggregate merge_queue_snapshots into avg/peak depth on merge_queue_daily."""
    import db
    conn = db.get_db()
    rows = conn.execute('''
        SELECT substr(timestamp, 1, 10) as date,
               ROUND(AVG(depth), 1) as avg_depth,
               MAX(depth) as peak_depth
        FROM merge_queue_snapshots
        GROUP BY substr(timestamp, 1, 10)
    ''').fetchall()
    for row in rows:
        conn.execute('''
            UPDATE merge_queue_daily SET avg_depth = ?, peak_depth = ?
            WHERE date = ?
        ''', (row['avg_depth'], row['peak_depth'], row['date']))
    conn.commit()


def start_merge_queue_poller():
    """Start background thread that polls merge queue depth every 5 minutes."""
    def loop():
        while True:
            try:
                poll_merge_queue_depth()
            except Exception as e:
                print(f"[rk_github] queue depth poll error: {e}")
            time.sleep(300)  # 5 minutes
    t = threading.Thread(target=loop, daemon=True, name='mq-depth-poller')
    t.start()
    return t


_mq_backfill_lock = threading.Lock()
_mq_last_refresh = 0
_MQ_REFRESH_TTL = 3600  # refresh today's data every hour


def ensure_merge_queue_data():
    """Ensure merge queue data is backfilled and today is fresh."""
    global _mq_last_refresh
    now = time.time()
    if now - _mq_last_refresh < _MQ_REFRESH_TTL:
        return
    if not _mq_backfill_lock.acquire(blocking=False):
        return
    try:
        _backfill_merge_queue()
        refresh_merge_queue_today()
        _aggregate_depth_stats()
        _mq_last_refresh = now
    finally:
        _mq_backfill_lock.release()


def get_merge_queue_stats(date_from: str, date_to: str) -> dict:
    """Get merge queue failure rate by day. Triggers backfill if needed."""
    # Ensure data is populated (async after first load)
    import db
    conn = db.get_db()
    count = conn.execute('SELECT COUNT(*) as c FROM merge_queue_daily').fetchone()['c']
    if count == 0:
        ensure_merge_queue_data()  # block on first load
    else:
        threading.Thread(target=ensure_merge_queue_data, daemon=True).start()

    rows = db.query(
        'SELECT date, total, success, failure, cancelled, in_progress, avg_depth, peak_depth '
        'FROM merge_queue_daily WHERE date >= ? AND date <= ? ORDER BY date',
        (date_from, date_to))

    total_runs = sum(r['total'] for r in rows)
    total_fail = sum(r['failure'] for r in rows)
    total_success = sum(r['success'] for r in rows)

    return {
        'by_date': rows,
        'summary': {
            'total_runs': total_runs,
            'total_success': total_success,
            'total_failure': total_fail,
            'failure_rate': round(total_fail / max(total_runs, 1) * 100, 1),
            'days': len([r for r in rows if r['total'] > 0]),
        },
    }


import re as _re

_COMMIT_TYPE_RE = _re.compile(
    r'^(fix|feat|chore|refactor|docs|style|test|perf|ci|build|revert)(\([^)]+\))?(!)?: '
)
_PR_NUM_RE = _re.compile(r'\(#(\d+)\)\s*$')
_MERGE_TRAIN_RE = _re.compile(r'merge-train/([^\s]+)')


def _parse_commit(raw: dict) -> dict:
    """Normalise a GitHub REST commit object into a compact dict."""
    sha = raw.get('sha', '')
    msg = raw.get('commit', {}).get('message', '') or ''
    subject = msg.split('\n')[0]
    c_author = raw.get('commit', {}).get('author', {}) or {}
    # Prefer committer login if available (shows GitHub username not git display name)
    login = (raw.get('author') or {}).get('login', '')
    author = login or c_author.get('name', '')
    date = c_author.get('date', '')  # ISO-8601

    # Parse conventional commit type + scope
    m = _COMMIT_TYPE_RE.match(subject)
    commit_type = m.group(1) if m else 'other'
    breaking = bool(m and m.group(3))
    scope_raw = m.group(2) if m else ''
    scope = scope_raw[1:-1] if scope_raw else ''  # strip parens

    # Extract PR number from "(#NNNNN)" at end of subject
    pr_m = _PR_NUM_RE.search(subject)
    pr_number = int(pr_m.group(1)) if pr_m else None
    clean_subject = _PR_NUM_RE.sub('', subject).rstrip()

    # Detect merge-train commits
    mt_m = _MERGE_TRAIN_RE.search(subject)
    merge_train = mt_m.group(1) if mt_m else None
    is_merge = len(raw.get('parents', [])) > 1

    return {
        'sha': sha,
        'subject': clean_subject,
        'type': commit_type,
        'scope': scope,
        'breaking': breaking,
        'pr': pr_number,
        'author': author,
        'date': date,
        'merge_train': merge_train,
        'is_merge': is_merge,
        'dirs': None,  # populated by caller if Redis cache available
    }


_pr_dirs_cache: dict = {}  # {pr_number: [dirs]} in-memory cache (long TTL)
_pr_dirs_lock = threading.Lock()
_pr_dirs_fetch_queue: set = set()
_pr_dirs_worker_started = False


def _compute_pr_dirs(pr_number: int) -> list[str]:
    """Fetch changed files for a PR and return 2-level path buckets."""
    data = _github_get(f'repos/{REPO}/pulls/{pr_number}/files?per_page=100')
    if not data or not isinstance(data, list):
        return []
    dirs: set[str] = set()
    for f in data:
        filename = f.get('filename', '')
        if not filename:
            continue
        parts = filename.split('/')
        top = parts[0]
        dirs.add(top)
        # For yarn-project, include 2nd level for sub-project drill-down
        if top == 'yarn-project' and len(parts) > 1:
            dirs.add(f'yarn-project/{parts[1]}')
    return sorted(dirs)


def _pr_dirs_worker():
    """Background worker: drains the fetch queue, caches results."""
    while True:
        time.sleep(2)
        with _pr_dirs_lock:
            if not _pr_dirs_fetch_queue:
                continue
            pr_number = _pr_dirs_fetch_queue.pop()
        try:
            dirs = _compute_pr_dirs(pr_number)
            with _pr_dirs_lock:
                _pr_dirs_cache[pr_number] = dirs
        except Exception as e:
            print(f'[github_data] pr_dirs fetch error for #{pr_number}: {e}')


def start_pr_dirs_worker():
    """Start the background PR dirs fetcher (call once at startup)."""
    global _pr_dirs_worker_started
    if _pr_dirs_worker_started:
        return
    _pr_dirs_worker_started = True
    t = threading.Thread(target=_pr_dirs_worker, daemon=True, name='pr-dirs-fetcher')
    t.start()


def get_pr_dirs(pr_number: int) -> list[str] | None:
    """Return cached dirs for a PR, or None if not yet fetched (queues async fetch)."""
    with _pr_dirs_lock:
        if pr_number in _pr_dirs_cache:
            return _pr_dirs_cache[pr_number]
        _pr_dirs_fetch_queue.add(pr_number)
    return None


def get_recent_commits(branch: str = 'next', page: int = 1, per_page: int = 50) -> list[dict]:
    """Fetch a page of commits from GitHub API with 5-minute in-memory cache."""
    per_page = min(per_page, 100)
    cache_key = f'{branch}:{page}:{per_page}'
    now = time.time()
    with _commits_lock:
        cached = _commits_cache.get(cache_key)
        if cached and now - cached['ts'] < 300:
            return cached['data']

    data = _github_get(
        f'repos/{REPO}/commits?sha={branch}&per_page={per_page}&page={page}'
    )
    if not data or not isinstance(data, list):
        result = []
    else:
        result = [_parse_commit(raw) for raw in data]

    with _commits_lock:
        _commits_cache[cache_key] = {'data': result, 'ts': now}

    # Enrich with cached dirs (non-blocking)
    for c in result:
        if c.get('pr'):
            c['dirs'] = get_pr_dirs(c['pr'])

    return result
