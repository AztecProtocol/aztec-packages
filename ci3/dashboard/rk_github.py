"""GitHub API polling for PR lifecycle, workflow runs, and branch lag.

Uses `gh` CLI for GitHub API access. Stores results in SQLite.
"""
import json
import subprocess
import threading
import time
from datetime import datetime, timedelta, timezone

import rk_db

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


def _gh(args: list[str]) -> str | None:
    """Run a gh CLI command and return stdout."""
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


def fetch_recent_prs(limit: int = 100) -> list[dict]:
    """Fetch recently merged PRs."""
    out = _gh([
        'pr', 'list', '--repo', REPO, '--state', 'merged',
        '--limit', str(limit),
        '--json', 'number,author,title,createdAt,mergedAt,closedAt,baseRefName'
    ])
    if not out:
        return []
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return []


def store_prs(prs: list[dict]):
    """Upsert PR lifecycle data into SQLite."""
    for pr in prs:
        author = pr.get('author', {})
        if isinstance(author, dict):
            author = author.get('login', 'unknown')
        created = pr.get('createdAt', '')
        merged = pr.get('mergedAt')
        merge_time = None
        if created and merged:
            try:
                c = datetime.fromisoformat(created.replace('Z', '+00:00'))
                m = datetime.fromisoformat(merged.replace('Z', '+00:00'))
                merge_time = round((m - c).total_seconds() / 3600, 2)
            except (ValueError, TypeError):
                pass

        rk_db.execute('''
            INSERT INTO pr_lifecycle (pr_number, author, title, created_at, merged_at, closed_at, base_branch, merge_time_hrs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(pr_number) DO UPDATE SET
                merged_at = COALESCE(excluded.merged_at, pr_lifecycle.merged_at),
                closed_at = COALESCE(excluded.closed_at, pr_lifecycle.closed_at),
                merge_time_hrs = COALESCE(excluded.merge_time_hrs, pr_lifecycle.merge_time_hrs)
        ''', (
            pr.get('number'),
            author,
            pr.get('title'),
            created,
            merged,
            pr.get('closedAt'),
            pr.get('baseRefName'),
            merge_time,
        ))


def update_pr_costs():
    """Update ci_cost_usd and ci_runs_count for PRs from ci_runs table."""
    rk_db.execute('''
        UPDATE pr_lifecycle SET
            ci_cost_usd = COALESCE((
                SELECT SUM(cost_usd) FROM ci_runs WHERE ci_runs.pr_number = pr_lifecycle.pr_number
            ), 0),
            ci_runs_count = COALESCE((
                SELECT COUNT(*) FROM ci_runs WHERE ci_runs.pr_number = pr_lifecycle.pr_number
            ), 0)
        WHERE pr_number IN (SELECT DISTINCT pr_number FROM ci_runs WHERE pr_number IS NOT NULL)
    ''')


def fetch_deploy_runs(limit: int = 50):
    """Fetch recent deployment workflow runs."""
    for workflow in DEPLOY_WORKFLOWS:
        out = _gh([
            'run', 'list', '--repo', REPO,
            '--workflow', workflow, '--limit', str(limit),
            '--json', 'databaseId,status,conclusion,createdAt,updatedAt,headBranch,headSha,name'
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
            status = run.get('conclusion', run.get('status', 'unknown'))
            rk_db.execute('''
                INSERT OR REPLACE INTO deployments
                (run_id, workflow_name, ref_name, status, started_at, completed_at, duration_secs)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(run.get('databaseId', '')),
                workflow.replace('.yml', ''),
                run.get('headBranch', ''),
                status,
                started,
                completed,
                duration,
            ))


def compute_branch_lag():
    """Compute current branch lag and store daily snapshot."""
    today = datetime.now(timezone.utc).date().isoformat()
    for source, target in BRANCH_PAIRS:
        # Count commits in source not in target
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

        # Get oldest diverging commit date for days_behind
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

        rk_db.execute('''
            INSERT OR REPLACE INTO branch_lag (date, source_branch, target_branch, commits_behind, days_behind)
            VALUES (?, ?, ?, ?, ?)
        ''', (today, source, target, commits_behind, days_behind))


# ---- Query functions for API endpoints ----

def get_branch_lag(date_from: str, date_to: str) -> dict:
    """Get branch lag data for API response."""
    # Trigger fresh computation
    threading.Thread(target=compute_branch_lag, daemon=True).start()

    pairs = []
    for source, target in BRANCH_PAIRS:
        history = rk_db.query(
            "SELECT date, commits_behind, days_behind FROM branch_lag WHERE source_branch=? AND target_branch=? AND date>=? AND date<=? ORDER BY date",
            (source, target, date_from, date_to)
        )
        current = rk_db.query(
            "SELECT commits_behind, days_behind FROM branch_lag WHERE source_branch=? AND target_branch=? ORDER BY date DESC LIMIT 1",
            (source, target)
        )
        pairs.append({
            'source': source,
            'target': target,
            'current': current[0] if current else {'commits_behind': 0, 'days_behind': 0},
            'history': history,
        })
    return {'pairs': pairs}


def get_deployment_speed(date_from: str, date_to: str) -> dict:
    """Get deployment speed metrics."""
    threading.Thread(target=fetch_deploy_runs, daemon=True).start()

    rows = rk_db.query('''
        SELECT date(started_at) as date,
               AVG(duration_secs/60.0) as median_mins,
               MAX(duration_secs/60.0) as p95_mins,
               COUNT(*) as count,
               SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success,
               SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failure
        FROM deployments
        WHERE date(started_at) >= ? AND date(started_at) <= ?
        GROUP BY date(started_at)
        ORDER BY date(started_at)
    ''', (date_from, date_to))

    summary_row = rk_db.query('''
        SELECT AVG(duration_secs/60.0) as median_mins,
               MAX(duration_secs/60.0) as p95_mins,
               ROUND(100.0 * SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as success_rate,
               COUNT(*) as total
        FROM deployments
        WHERE date(started_at) >= ? AND date(started_at) <= ?
    ''', (date_from, date_to))

    recent = rk_db.query('''
        SELECT run_id, workflow_name, status, ROUND(duration_secs/60.0, 1) as duration_mins, started_at, ref_name
        FROM deployments
        WHERE date(started_at) >= ? AND date(started_at) <= ?
        ORDER BY started_at DESC LIMIT 50
    ''', (date_from, date_to))

    return {
        'by_date': rows,
        'summary': summary_row[0] if summary_row else {},
        'recent': recent,
    }


def get_pr_metrics(date_from: str, date_to: str, author: str = '') -> dict:
    """Get PR metrics for the date range."""
    threading.Thread(target=lambda: (store_prs(fetch_recent_prs()), update_pr_costs()), daemon=True).start()

    author_filter = "AND author = ?" if author else ""
    params_base = [date_from, date_to] + ([author] if author else [])

    by_date = rk_db.query(f'''
        SELECT date(merged_at) as date,
               AVG(ci_cost_usd) as avg_cost,
               AVG(merge_time_hrs) as avg_merge_time_hrs,
               COUNT(*) as pr_count
        FROM pr_lifecycle
        WHERE merged_at IS NOT NULL AND date(merged_at) >= ? AND date(merged_at) <= ? {author_filter}
        GROUP BY date(merged_at)
        ORDER BY date(merged_at)
    ''', params_base)

    by_author = rk_db.query(f'''
        SELECT author, SUM(ci_cost_usd) as total_cost, COUNT(*) as pr_count,
               AVG(merge_time_hrs) as avg_merge_time_hrs
        FROM pr_lifecycle
        WHERE merged_at IS NOT NULL AND date(merged_at) >= ? AND date(merged_at) <= ?
        GROUP BY author ORDER BY total_cost DESC LIMIT 20
    ''', (date_from, date_to))

    summary = rk_db.query(f'''
        SELECT AVG(ci_cost_usd) as avg_cost_per_pr,
               AVG(merge_time_hrs) as median_merge_time_hrs,
               COUNT(*) as total_prs,
               SUM(ci_cost_usd) as total_cost,
               AVG(ci_runs_count) as avg_ci_runs_per_pr
        FROM pr_lifecycle
        WHERE merged_at IS NOT NULL AND date(merged_at) >= ? AND date(merged_at) <= ? {author_filter}
    ''', params_base)

    return {
        'by_date': by_date,
        'by_author': by_author,
        'summary': summary[0] if summary else {},
    }


def start_daily_poll(interval_hours=6):
    """Start background thread for GitHub data polling."""
    def loop():
        time.sleep(60)  # initial delay
        while True:
            try:
                prs = fetch_recent_prs()
                if prs:
                    store_prs(prs)
                    update_pr_costs()
                fetch_deploy_runs()
                compute_branch_lag()
                print(f"[rk_github] Polled: {len(prs)} PRs, deployments, branch lag")
            except Exception as e:
                print(f"[rk_github] Poll error: {e}")
            time.sleep(interval_hours * 3600)

    t = threading.Thread(target=loop, daemon=True, name='github-poll')
    t.start()
    return t
