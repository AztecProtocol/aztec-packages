from flask import Flask, render_template_string, request, Response, redirect
from flask_compress import Compress
from flask_httpauth import HTTPBasicAuth
from datetime import datetime, timedelta
import gzip
import json
import os
import re
import requests
import shlex
import subprocess
import threading
import uuid
from ansi2html import Ansi2HTMLConverter
from pathlib import Path

# Import core rendering logic
from rk_core import (
    YELLOW, BLUE, GREEN, RED, PURPLE, BOLD, RESET,
    hyperlink, r, get_section_data, get_list_as_string
)
from rk_billing import (
    get_billing_files_in_range,
    aggregate_billing_weekly, aggregate_billing_monthly,
    serve_billing_dashboard,
)
import rk_db
import rk_metrics
import rk_aws_costs
import rk_github

LOGS_DISK_PATH = os.getenv('LOGS_DISK_PATH', '/logs-disk')
DASHBOARD_PASSWORD = os.getenv('DASHBOARD_PASSWORD', 'password')
app = Flask(__name__)
Compress(app)
auth = HTTPBasicAuth()

def _init_metrics():
    """Initialize SQLite for test events and start test listener."""
    try:
        rk_db.get_db()
        rk_metrics.start_test_listener(r)
        print("[rk.py] Test event listener started")
    except Exception as e:
        print(f"[rk.py] Warning: metrics startup failed: {e}")

# Start in background to avoid blocking Flask startup
threading.Thread(target=_init_metrics, daemon=True, name='metrics-init').start()

def read_from_disk(key):
    """Read log from disk as fallback when Redis key not found."""
    try:
        # Use first 4 chars as subdirectory
        prefix = key[:4]
        log_file = f"/logs-disk/{prefix}/{key}.log.gz"
        log_file = f"{LOGS_DISK_PATH}/{prefix}/{key}.log.gz"
        if os.path.exists(log_file):
            with gzip.open(log_file, 'rb') as f:
                return f.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"Error reading from disk: {e}")
    return None

def read_breakdown_from_disk(runtime, flow_name, sha):
    """Read benchmark breakdown JSON from disk."""
    try:
        # Breakdown files are stored in {LOGS_DISK_PATH}/bench/bb-breakdown/
        # Format: <runtime>-<flow_name>-<sha>.log.gz
        # SHA can be 7-40 chars (prefix or full)
        breakdown_dir = f"{LOGS_DISK_PATH}/bench/bb-breakdown"

        # First try exact match
        breakdown_file = f"{breakdown_dir}/{runtime}-{flow_name}-{sha}.log.gz"
        if os.path.exists(breakdown_file):
            with gzip.open(breakdown_file, 'rb') as f:
                return f.read().decode('utf-8', errors='replace')

        # If not found, search for files starting with the SHA prefix
        if os.path.exists(breakdown_dir):
            prefix = f"{runtime}-{flow_name}-{sha}"
            for filename in os.listdir(breakdown_dir):
                if filename.startswith(prefix) and filename.endswith('.log.gz'):
                    breakdown_file = os.path.join(breakdown_dir, filename)
                    with gzip.open(breakdown_file, 'rb') as f:
                        return f.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"Error reading breakdown from disk: {e}")
    return None

@auth.verify_password
def verify_password(username, password):
    if username == "aztec" and password == DASHBOARD_PASSWORD:
        return username
    return None

_github_status_cache = {"status": None, "ts": 0}
_github_status_lock = threading.Lock()

def convert_to_ocs8(text):
    # Replace URLs not already part of an OCS8 link using negative lookbehind.
    pattern = r'(?<!\x1b\]8;;)(https?://[\w_.\-/]+)'
    def replace_link(match):
        url = match.group(0)
        return hyperlink(url, url)
    return re.sub(pattern, replace_link, text)

def ansi_to_html(text):
    text = convert_to_ocs8(text)
    conv = Ansi2HTMLConverter(inline=True)
    html = conv.convert(text, full=False)
    return html

def update_status(offset: int, filter_str: str, filter_prop: str) -> None:
    ga_status = get_github_actions_status()
    return (
        f"{BOLD}{BLUE}{hyperlink('/', 'AZTEC LABS CI SYSTEM')}{RESET}: "
        f"(offset: {offset}) (filter: {filter_str or 'unset'}) (filter_prop: {filter_prop or 'unset'} [status,name,author,msg]) ({ga_status})\n"
    )

def get_github_actions_status():
    # Cache for 60 seconds
    import time
    now = time.time()
    ga_url='https://githubstatus.com'
    with _github_status_lock:
        if _github_status_cache["status"] and now - _github_status_cache["ts"] < 60:
            return _github_status_cache["status"]
        try:
            resp = requests.get("https://www.githubstatus.com/api/v2/components.json", timeout=2)
            resp.raise_for_status()
            data = resp.json()
            for comp in data.get("components", []):
                if comp.get("name", "").lower() == "actions":
                    status = comp.get("status", "")
                    if status in ("operational", "none"):
                        result = f"Github Actions: {GREEN}{hyperlink(ga_url, 'NOMINAL')}{RESET}"
                    else:
                        result = f"Github Actions: {RED}{hyperlink(ga_url, 'DEGRADED')}{RESET}"
                    _github_status_cache["status"] = result
                    _github_status_cache["ts"] = now
                    return result
        except Exception:
            result = f"Github Actions: {YELLOW}UNKNOWN{RESET}"
            _github_status_cache["status"] = result
            _github_status_cache["ts"] = now
            return result

def root() -> str:
    # Show the default (no section) view with updated links
    return (
        update_status(0, '', '') +
        f"\n"
        f"Select a filter:\n"
        f"\n{YELLOW}"
        f"{hyperlink('/section/next', 'next queue')}\n"
        f"{hyperlink('/section/prs', 'prs')}\n"
        f"{hyperlink('/section/releases', 'releases')}\n"
        f"{hyperlink('/section/nightly', 'nightly')}\n"
        f"{hyperlink('/section/network', 'network')}\n"
        f"{hyperlink('/section/deflake', 'deflake')}\n"
        f"{RESET}"
        f"\n"
        f"Benchmarks:\n"
        f"\n{YELLOW}"
        f"{hyperlink('https://aztecprotocol.github.io/benchmark-page-data/bench?branch=master', 'master')}\n"
        f"{hyperlink('https://aztecprotocol.github.io/benchmark-page-data/bench?branch=staging', 'staging')}\n"
        f"{hyperlink('https://aztecprotocol.github.io/benchmark-page-data/bench?branch=next', 'next')}\n"
        f"{hyperlink('/chonk-breakdowns', 'chonk breakdowns')}\n"
        f"{RESET}"
        f"\n"
        f"Billing:\n"
        f"\n{YELLOW}"
        f"{hyperlink('/cost-overview', 'cost overview (AWS + GCP)')}\n"
        f"{hyperlink('/namespace-billing', 'namespace billing')}\n"
        f"{RESET}"
    )

def section_view(section: str) -> str:
    offset = int(request.args.get('offset', 0))
    limit = int(request.args.get('limit', 50))
    filter_str = request.args.get('filter', default='', type=str)
    filter_prop = request.args.get('filter_prop', default='', type=str)

    lines = update_status(offset, filter_str, filter_prop)
    lines += "\n"
    lines += f"Last {limit} ci runs on {section}:\n\n"
    lines += get_section_data(section, offset, limit, filter_str, filter_prop)
    return lines

TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>ACI &#183; {{ filter_str|default('') }}</title>
    <style>
        body {
            background-color: black;
            color: #cccccc;
            font-family: monospace;
            padding: 10px;
        }
        .output {
            white-space: pre;
        }
        a { color: inherit; text-decoration: none; }
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: #000000;
        }
        ::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
        ::-webkit-scrollbar:horizontal {
            display: none;
        }
    </style>
    <script>
        var follow = "{{ follow|default('bottom') }}";
        if (location.pathname === '/') {
            setInterval(() => {
                if (document.visibilityState === 'visible' && window.getSelection().toString() === '') {
                    fetch(location.href)
                        .then(response => response.text())
                        .then(html => {
                            const parser = new DOMParser();
                            const newDoc = parser.parseFromString(html, 'text/html');
                            document.body.innerHTML = newDoc.body.innerHTML;
                        });
                }
            }, 5000);
        } else {
            if ('scrollRestoration' in history) {
                history.scrollRestoration = 'manual';
            }

            const key = "scrollPosition:" + window.location.href;

            window.addEventListener('beforeunload', () => {
                sessionStorage.setItem(key, window.scrollY);
            });

            window.addEventListener('load', () => {
                let navType = '';
                if (performance.getEntriesByType("navigation").length > 0) {
                    navType = performance.getEntriesByType("navigation")[0].type;
                } else {
                    navType = performance.navigation && performance.navigation.type === 1 ? 'reload' : 'navigate';
                }
                if (navType === 'navigate' || navType === 'reload') {
                    if (follow === 'bottom') {
                        window.scrollTo(0, document.body.scrollHeight);
                    }
                } else {
                    const pos = sessionStorage.getItem(key);
                    if (pos !== null) {
                        window.scrollTo(0, parseInt(pos, 10));
                    }
                }
            });

            const refresh_func = () => {
                if (follow === 'bottom') {
                    if (document.visibilityState === 'visible' && window.innerHeight + window.scrollY >= document.body.offsetHeight && window.getSelection().toString() === '') {
                        const startTime = Date.now();
                        fetch(location.href)
                            .then(response => response.text())
                            .then(html => {
                                const parser = new DOMParser();
                                const newDoc = parser.parseFromString(html, 'text/html');
                                const contentText = newDoc.body.textContent || '';
                                const isError = contentText.includes('Key not found') ||
                                               contentText.includes('Failed to decompress') ||
                                               contentText.includes('List is empty or key not found') ||
                                               contentText.includes('Error retrieving list');
                                document.body.innerHTML = newDoc.body.innerHTML;
                                window.scrollTo(window.scrollX, document.body.scrollHeight);
                                return isError;
                            })
                            .catch(() => false)
                            .then(isError => {
                                const responseTime = Date.now() - startTime;
                                if (document.body.scrollHeight < 500000 && responseTime <= 3000 && !isError) {
                                    setTimeout(refresh_func, 5000);
                                }
                            });
                    } else {
                        if (document.body.scrollHeight < 500000) {
                            setTimeout(refresh_func, 5000);
                        }
                    }
                } else {
                    if (document.visibilityState === 'visible' && window.scrollY === 0 && window.getSelection().toString() === '') {
                        const startTime = Date.now();
                        fetch(location.href)
                            .then(response => response.text())
                            .then(html => {
                                const parser = new DOMParser();
                                const newDoc = parser.parseFromString(html, 'text/html');
                                const contentText = newDoc.body.textContent || '';
                                const isError = contentText.includes('Key not found') ||
                                               contentText.includes('Failed to decompress') ||
                                               contentText.includes('List is empty or key not found') ||
                                               contentText.includes('Error retrieving list');
                                document.body.innerHTML = newDoc.body.innerHTML;
                                return isError;
                            })
                            .catch(() => false)
                            .then(isError => {
                                const responseTime = Date.now() - startTime;
                                if (document.body.scrollHeight < 500000 && responseTime <= 3000 && !isError) {
                                    setTimeout(refresh_func, 5000);
                                }
                            });
                    } else {
                        if (document.body.scrollHeight < 500000) {
                            setTimeout(refresh_func, 5000);
                        }
                    }
                }
            }
            setTimeout(refresh_func, 5000);
        }
    </script>
</head>
<body>
    <div class="output">{{ value|safe }}</div>
</body>
</html>
"""

@app.route('/')
@auth.login_required
def show_root():
    return render_template_string(
        TEMPLATE,
        value=ansi_to_html(root()),
        filter_str='',
        filter_prop=''
    )

@app.route('/section/<section>')
@auth.login_required
def show_section(section):
    return render_template_string(
        TEMPLATE,
        value=ansi_to_html(section_view(section)),
        filter_str=request.args.get('filter', default='', type=str),
        filter_prop=request.args.get('filter_prop', default='', type=str),
        follow='top'
    )

@app.route('/list/<key>')
@auth.login_required
def get_list(key):
    value = get_list_as_string(key)
    follow = request.args.get('follow', 'top')
    return render_template_string(TEMPLATE, value=ansi_to_html(value), follow=follow, filter_str='', filter_prop='')

@app.route('/chonk-breakdowns')
@auth.login_required
def chonk_breakdowns():
    """Serve the chonk breakdowns viewer page."""
    breakdown_html_path = Path('chonk-breakdowns/breakdown-viewer.html')
    if breakdown_html_path.exists():
        with breakdown_html_path.open('r') as f:
            return f.read()
    else:
        return "Breakdown viewer not found", 404

@app.route('/api/breakdown/flows')
@auth.login_required
def list_available_flows():
    """API endpoint to list available breakdown flows from disk, filtered by runtime and SHA."""
    runtime = request.args.get('runtime')
    sha = request.args.get('sha')
    flows = set()
    breakdown_dir = f"{LOGS_DISK_PATH}/bench/bb-breakdown"

    try:
        if os.path.exists(breakdown_dir):
            for filename in os.listdir(breakdown_dir):
                if filename.endswith('.log.gz'):
                    # Parse: runtime-flow_name-sha.log.gz
                    parts = filename.replace('.log.gz', '').split('-', 1)
                    if len(parts) == 2:
                        file_runtime = parts[0]
                        rest = parts[1]
                        # Split from end to get SHA (7-40 chars)
                        last_dash = rest.rfind('-')
                        if last_dash != -1:
                            flow_name = rest[:last_dash]
                            file_sha = rest[last_dash + 1:]

                            # Filter by runtime and SHA if provided
                            if runtime and file_runtime != runtime:
                                continue
                            if sha and not file_sha.startswith(sha):
                                continue

                            flows.add(flow_name)
    except Exception as e:
        print(f"Error listing flows: {e}")

    return Response(json.dumps(sorted(list(flows))), mimetype='application/json')

@app.route('/api/breakdown/<runtime>/<flow_name>/<sha>')
@auth.login_required
def get_breakdown(runtime, flow_name, sha):
    """API endpoint to fetch breakdown JSON from disk."""
    breakdown_data = read_breakdown_from_disk(runtime, flow_name, sha)
    if breakdown_data:
        return Response(breakdown_data, mimetype='application/json')

    return Response('{"error": "Breakdown not found"}', mimetype='application/json', status=404)


@app.route('/grind')
@auth.login_required
def trigger_grind():
    """Trigger a grind job for a flaky test."""
    from urllib.parse import urlencode as url_encode

    full_cmd = request.args.get('cmd')
    commit = request.args.get('commit', 'HEAD')
    run_id = request.args.get('run')  # Pre-generated run_id from selection page
    start = request.args.get('start')  # If set, start the grind

    # Configurable options with defaults
    grind_time = request.args.get('time', '20m')
    cpus = request.args.get('cpus', '192')
    jobs_pct = request.args.get('jobs', '200')
    memsuspend_pct = request.args.get('memsuspend', '50')

    if not full_cmd:
        return "Missing cmd parameter", 400

    # If run_id is provided and already has a log, redirect to it (back-button protection)
    if run_id and r.exists(run_id):
        return redirect(f'/{run_id}')

    # If start not requested, show configuration page
    if not start:
        # Generate one run_id for all links on this page load
        page_run_id = uuid.uuid4().hex[:16]

        # Helper to build option links
        def make_options(param_name, options, current_value, suffix=''):
            links = []
            for opt in options:
                is_selected = str(opt) == str(current_value)
                if is_selected:
                    links.append(f"{BOLD}{BLUE}{opt}{suffix}{RESET}")
                else:
                    params = {
                        'cmd': full_cmd, 'commit': commit, 'run': page_run_id,
                        'time': grind_time, 'cpus': cpus, 'jobs': jobs_pct, 'memsuspend': memsuspend_pct
                    }
                    params[param_name] = opt
                    url = f"/grind?{url_encode(params)}"
                    links.append(f"{YELLOW}{hyperlink(url, f'{opt}{suffix}')}{RESET}")
            return ' | '.join(links)

        time_options = make_options('time', ['5m', '10m', '20m', '30m', '1h'], grind_time)
        cpus_options = make_options('cpus', ['16', '32', '64', '128', '192'], cpus)
        jobs_options = make_options('jobs', ['10', '25', '50', '75', '100', '200', '400'], jobs_pct, '%')
        memsuspend_options = make_options('memsuspend', ['25', '50', '75'], memsuspend_pct, '%')

        # Start grind button
        start_params = {
            'cmd': full_cmd, 'commit': commit, 'run': page_run_id,
            'time': grind_time, 'cpus': cpus, 'jobs': jobs_pct, 'memsuspend': memsuspend_pct,
            'start': '1'
        }
        start_url = f"/grind?{url_encode(start_params)}"
        start_button = f"{BOLD}{GREEN}{hyperlink(start_url, '[ Start Grind ]')}{RESET}"

        page = (
            f"{BOLD}Grind Test{RESET}\n\n"
            f"Command: {full_cmd}\n"
            f"Commit: {commit}\n\n"
            f"Duration:   {time_options}\n"
            f"CPUs:       {cpus_options}\n"
            f"Jobs:       {jobs_options}\n"
            f"Memsuspend: {memsuspend_options}\n\n"
            f"{start_button}\n"
        )
        return render_template_string(TEMPLATE, value=ansi_to_html(page), filter_str='grind', follow='top')

    # Start requested - run the grind
    # Use run_id from URL, or generate new one if not provided
    if not run_id:
        run_id = uuid.uuid4().hex[:16]

    # Initialize the log key so redirect doesn't show "Key not found"
    r.setex(run_id, 86400, b'Starting grind...\n')

    # Start grind job in background
    # Dashboard server needs local repo checkout at REPO_PATH
    repo_path = os.environ.get('REPO_PATH')
    if repo_path:
        subprocess.Popen(
            ['bash', '-c', f'cd {repo_path} && RUN_ID={run_id} CPUS={cpus} ./ci.sh grind-test {shlex.quote(full_cmd)} {grind_time} {jobs_pct} {memsuspend_pct} {commit}'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )

    # Redirect to log view.
    return redirect(f'/{run_id}')


@app.route('/namespace-billing')
@auth.login_required
def namespace_billing():
    html = serve_billing_dashboard()
    if html:
        return html
    return "Billing dashboard not found", 404

@app.route('/api/billing/data')
@auth.login_required
def billing_data():
    date_from_str = request.args.get('from')
    date_to_str = request.args.get('to')
    granularity = request.args.get('granularity', 'daily')

    if not date_from_str or not date_to_str:
        return Response(json.dumps({'error': 'from and to date params required (YYYY-MM-DD)'}),
                        mimetype='application/json', status=400)
    try:
        date_from = datetime.strptime(date_from_str, '%Y-%m-%d')
        date_to = datetime.strptime(date_to_str, '%Y-%m-%d')
    except ValueError:
        return Response(json.dumps({'error': 'Invalid date format, use YYYY-MM-DD'}),
                        mimetype='application/json', status=400)

    daily_data = get_billing_files_in_range(date_from, date_to)

    # Filter out namespaces costing less than $1 total across the range
    ns_totals = {}
    for entry in daily_data:
        for ns, ns_data in entry.get('namespaces', {}).items():
            ns_totals[ns] = ns_totals.get(ns, 0) + ns_data.get('total', 0)
    cheap_ns = {ns for ns, total in ns_totals.items() if total < 1.0}
    if cheap_ns:
        for entry in daily_data:
            entry['namespaces'] = {ns: d for ns, d in entry.get('namespaces', {}).items()
                                   if ns not in cheap_ns}

    if granularity == 'weekly':
        result = aggregate_billing_weekly(daily_data)
    elif granularity == 'monthly':
        result = aggregate_billing_monthly(daily_data)
    else:
        result = daily_data

    return Response(json.dumps(result), mimetype='application/json')


def _aggregate_dates(by_date_list, granularity, sum_fields, avg_fields=None):
    """Aggregate a list of {date, ...} dicts by weekly/monthly granularity."""
    if granularity == 'daily' or not by_date_list:
        return by_date_list

    buckets = {}
    for entry in by_date_list:
        d = datetime.strptime(entry['date'], '%Y-%m-%d')
        if granularity == 'weekly':
            key = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        else:  # monthly
            key = d.strftime('%Y-%m') + '-01'

        if key not in buckets:
            buckets[key] = {'date': key}
            for f in sum_fields:
                buckets[key][f] = 0
            if avg_fields:
                for f in avg_fields:
                    buckets[key][f'_avg_sum_{f}'] = 0
                    buckets[key][f'_avg_cnt_{f}'] = 0

        for f in sum_fields:
            buckets[key][f] += entry.get(f) or 0
        if avg_fields:
            for f in avg_fields:
                val = entry.get(f)
                if val is not None:
                    buckets[key][f'_avg_sum_{f}'] += val
                    buckets[key][f'_avg_cnt_{f}'] += 1

    result = []
    for key in sorted(buckets):
        b = buckets[key]
        out = {'date': b['date']}
        for f in sum_fields:
            out[f] = round(b[f], 2) if isinstance(b[f], float) else b[f]
        if avg_fields:
            for f in avg_fields:
                cnt = b[f'_avg_cnt_{f}']
                out[f] = round(b[f'_avg_sum_{f}'] / cnt, 1) if cnt else None
        result.append(out)

    return result


@app.route('/api/ci/runs')
@auth.login_required
def api_ci_runs():
    """API endpoint: list CI runs from Redis with optional filters."""
    date_from = request.args.get('from', '')
    date_to = request.args.get('to', '')
    status_filter = request.args.get('status', '')
    author = request.args.get('author', '')
    dashboard = request.args.get('dashboard', '')
    limit = min(int(request.args.get('limit', 100)), 1000)
    offset = int(request.args.get('offset', 0))

    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000) if date_from else None
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000) if date_to else None

    runs = rk_metrics.get_ci_runs(r, ts_from, ts_to)

    if status_filter:
        runs = [run for run in runs if run.get('status') == status_filter]
    if author:
        runs = [run for run in runs if run.get('author') == author]
    if dashboard:
        runs = [run for run in runs if run.get('dashboard') == dashboard]

    runs.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    runs = runs[offset:offset + limit]

    return Response(json.dumps(runs), mimetype='application/json')


@app.route('/api/ci/stats')
@auth.login_required
def api_ci_stats():
    """API endpoint: CI run statistics summary (last 7 days)."""
    ts_from = int((datetime.now() - timedelta(days=7)).timestamp() * 1000)
    runs = rk_metrics.get_ci_runs(r, ts_from)

    total = len(runs)
    passed = sum(1 for run in runs if run.get('status') == 'PASSED')
    failed = sum(1 for run in runs if run.get('status') == 'FAILED')
    costs = [run['cost_usd'] for run in runs if run.get('cost_usd') is not None]
    durations = []
    for run in runs:
        complete = run.get('complete')
        ts = run.get('timestamp')
        if complete and ts:
            durations.append((complete - ts) / 60000.0)

    return Response(json.dumps({
        'total_runs': total,
        'passed': passed,
        'failed': failed,
        'total_cost': round(sum(costs), 2) if costs else None,
        'avg_duration_mins': round(sum(durations) / len(durations), 1) if durations else None,
    }), mimetype='application/json')


# ---- Cost endpoints ----

@app.route('/api/costs/overview')
@auth.login_required
def api_costs_overview():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    granularity = request.args.get('granularity', 'daily')
    result = rk_aws_costs.get_costs_overview(date_from, date_to)
    if granularity != 'daily' and result.get('by_date'):
        buckets = {}
        for entry in result['by_date']:
            d = datetime.strptime(entry['date'], '%Y-%m-%d')
            if granularity == 'weekly':
                key = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
            else:
                key = d.strftime('%Y-%m') + '-01'
            if key not in buckets:
                buckets[key] = {'date': key, 'aws': {}, 'gcp': {}, 'aws_total': 0, 'gcp_total': 0}
            for cat, amt in entry.get('aws', {}).items():
                buckets[key]['aws'][cat] = buckets[key]['aws'].get(cat, 0) + amt
            for cat, amt in entry.get('gcp', {}).items():
                buckets[key]['gcp'][cat] = buckets[key]['gcp'].get(cat, 0) + amt
            buckets[key]['aws_total'] += entry.get('aws_total', 0)
            buckets[key]['gcp_total'] += entry.get('gcp_total', 0)
        result['by_date'] = sorted(buckets.values(), key=lambda x: x['date'])
    return Response(json.dumps(result), mimetype='application/json')


@app.route('/api/costs/details')
@auth.login_required
def api_costs_details():
    """Per-resource (USAGE_TYPE) cost breakdown — shows individual instance types and RI fees."""
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))

    rows = rk_aws_costs.get_aws_cost_details(date_from, date_to)

    # Aggregate: usage_type -> { total, by_date: {date: amount}, is_ri }
    usage_map = {}
    for row in rows:
        ut = row['usage_type']
        if ut not in usage_map:
            usage_map[ut] = {
                'usage_type': ut,
                'service': row['service'],
                'category': row['category'],
                'total': 0,
                'by_date': {},
                'is_ri': 'HeavyUsage' in ut,
            }
        usage_map[ut]['total'] += row['amount_usd']
        d = row['date']
        usage_map[ut]['by_date'][d] = usage_map[ut]['by_date'].get(d, 0) + row['amount_usd']

    # Sort by total cost descending
    items = sorted(usage_map.values(), key=lambda x: -x['total'])

    # Round totals
    for item in items:
        item['total'] = round(item['total'], 2)
        item['by_date'] = {d: round(v, 4) for d, v in sorted(item['by_date'].items())}

    # Collect all dates for the table header
    all_dates = sorted({row['date'] for row in rows})

    # RI summary
    ri_items = [i for i in items if i['is_ri']]
    ri_total = round(sum(i['total'] for i in ri_items), 2)

    return Response(json.dumps({
        'items': items,
        'dates': all_dates,
        'ri_total': ri_total,
        'grand_total': round(sum(i['total'] for i in items), 2),
    }), mimetype='application/json')


@app.route('/api/costs/attribution')
@auth.login_required
def api_costs_attribution():
    """CI cost attribution by user, branch, instance — from Redis CI run data + GKE namespace billing."""
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)

    runs = rk_metrics.get_ci_runs(r, ts_from, ts_to)
    runs_with_cost = [run for run in runs if run.get('cost_usd') is not None]

    # Enrich merge queue runs with PR author from GitHub
    pr_numbers = {run.get('pr_number') for run in runs_with_cost if run.get('pr_number')}
    pr_authors = rk_github.batch_get_pr_authors(pr_numbers)

    # Build per-instance records with decoded branch info
    instances = []
    by_user = {}
    by_branch = {}
    by_type = {}  # merge-queue, pr, nightly, etc.

    for run in runs_with_cost:
        info = rk_aws_costs.decode_branch_info(run)
        cost = run['cost_usd']
        date = rk_metrics._ts_to_date(run.get('timestamp', 0))

        # Resolve author: for merge queue, prefer GitHub PR author over git commit author
        author = info['author']
        prn = info['pr_number']
        if prn and int(prn) in pr_authors:
            author = pr_authors[int(prn)]['author']

        instances.append({
            'instance_name': info['instance_name'],
            'date': date,
            'cost_usd': cost,
            'author': author,
            'branch': info['branch'],
            'pr_number': prn,
            'type': info['type'],
            'instance_type': run.get('instance_type', 'unknown'),
            'spot': run.get('spot', False),
            'job_id': run.get('job_id', ''),
            'duration_mins': round((run.get('complete', 0) - run.get('timestamp', 0)) / 60000, 1) if run.get('complete') else None,
        })

        # Aggregate by user
        if author not in by_user:
            by_user[author] = {'aws_cost': 0, 'gcp_cost': 0, 'runs': 0, 'by_date': {}}
        by_user[author]['aws_cost'] += cost
        by_user[author]['runs'] += 1
        by_user[author]['by_date'][date] = by_user[author]['by_date'].get(date, 0) + cost

        # Aggregate by branch
        branch_key = info['branch'] or info['type']
        if branch_key not in by_branch:
            by_branch[branch_key] = {'cost': 0, 'runs': 0, 'type': info['type'], 'author': author}
        by_branch[branch_key]['cost'] += cost
        by_branch[branch_key]['runs'] += 1

        # Aggregate by type
        rt = info['type']
        if rt not in by_type:
            by_type[rt] = {'cost': 0, 'runs': 0}
        by_type[rt]['cost'] += cost
        by_type[rt]['runs'] += 1

    # Add GKE namespace costs attributed to users.
    # Namespace naming: pr-$(echo "$branch" | sed 's/[^a-z0-9-]/-/g' | cut -c1-20 | sed 's/-*$//')
    # So we match namespaces to CI run branch names by reversing the sanitization.
    try:
        from rk_billing import get_billing_files_in_range
        gcp_data = get_billing_files_in_range(
            datetime.strptime(date_from, '%Y-%m-%d'),
            datetime.strptime(date_to, '%Y-%m-%d'),
        )

        # Build namespace -> author mapping from CI runs (branch name -> sanitized namespace prefix)
        import re
        def branch_to_ns_prefix(branch):
            """Replicate: echo "$branch" | sed 's/[^a-z0-9-]/-/g' | cut -c1-20 | sed 's/-*$//'"""
            sanitized = re.sub(r'[^a-z0-9-]', '-', branch.lower())[:20].rstrip('-')
            return f'pr-{sanitized}'

        # Map sanitized prefixes to authors from CI runs
        ns_prefix_to_author = {}
        for run in runs_with_cost:
            branch = run.get('name', '')
            if not branch or '(queue)' in branch:
                continue
            prefix = branch_to_ns_prefix(branch)
            author = run.get('author', 'unknown')
            prn = run.get('pr_number')
            if prn and int(prn) in pr_authors:
                author = pr_authors[int(prn)]['author']
            ns_prefix_to_author[prefix] = author

        for entry in gcp_data:
            for ns, ns_data in entry.get('namespaces', {}).items():
                ns_cost = ns_data.get('total', 0)
                if ns_cost < 0.01:
                    continue
                # Try to match namespace to a known branch
                ns_author = None
                if ns.startswith('pr-'):
                    # Strip scenario test suffix (-1, -2, etc.) for matching
                    ns_base = re.sub(r'-\d+$', '', ns)
                    ns_author = ns_prefix_to_author.get(ns) or ns_prefix_to_author.get(ns_base)
                if not ns_author:
                    ns_author = ns if not ns.startswith('pr-') else 'unknown-pr'

                if ns_author not in by_user:
                    by_user[ns_author] = {'aws_cost': 0, 'gcp_cost': 0, 'runs': 0, 'by_date': {}}
                by_user[ns_author]['gcp_cost'] += ns_cost
    except Exception as e:
        print(f"[attribution] GKE enrichment error: {e}")

    # Sort and format
    user_list = [{'author': a, 'aws_cost': round(v['aws_cost'], 2), 'gcp_cost': round(v['gcp_cost'], 2),
                  'total_cost': round(v['aws_cost'] + v['gcp_cost'], 2), 'runs': v['runs'],
                  'by_date': {d: round(c, 2) for d, c in sorted(v['by_date'].items())}}
                 for a, v in sorted(by_user.items(), key=lambda x: -(x[1]['aws_cost'] + x[1]['gcp_cost']))]

    branch_list = [{'branch': b, 'cost': round(v['cost'], 2), 'runs': v['runs'],
                     'type': v['type'], 'author': v['author']}
                    for b, v in sorted(by_branch.items(), key=lambda x: -x[1]['cost'])[:100]]

    type_list = [{'type': t, 'cost': round(v['cost'], 2), 'runs': v['runs']}
                 for t, v in sorted(by_type.items(), key=lambda x: -x[1]['cost'])]

    instances.sort(key=lambda x: -(x['cost_usd'] or 0))

    total_aws = sum(u['aws_cost'] for u in user_list)
    total_gcp = sum(u['gcp_cost'] for u in user_list)

    return Response(json.dumps({
        'by_user': user_list,
        'by_branch': branch_list,
        'by_type': type_list,
        'instances': instances[:500],  # cap to avoid huge payloads
        'totals': {'aws': round(total_aws, 2), 'gcp': round(total_gcp, 2),
                   'combined': round(total_aws + total_gcp, 2)},
    }), mimetype='application/json')


@app.route('/api/costs/runners')
@auth.login_required
def api_costs_runners():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    granularity = request.args.get('granularity', 'daily')
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)

    runs = rk_metrics.get_ci_runs(r, ts_from, ts_to)
    runs_with_cost = [run for run in runs if run.get('cost_usd') is not None]

    # By date
    by_date_map = {}
    for run in runs_with_cost:
        date = rk_metrics._ts_to_date(run.get('timestamp', 0))
        if date not in by_date_map:
            by_date_map[date] = {'spot_cost': 0, 'ondemand_cost': 0, 'total': 0}
        cost = run['cost_usd']
        if run.get('spot'):
            by_date_map[date]['spot_cost'] += cost
        else:
            by_date_map[date]['ondemand_cost'] += cost
        by_date_map[date]['total'] += cost

    by_date = [{'date': date, 'spot_cost': round(d['spot_cost'], 2),
                'ondemand_cost': round(d['ondemand_cost'], 2), 'total': round(d['total'], 2),
                'spot_pct': round(100.0 * d['spot_cost'] / max(d['total'], 0.01), 1)}
               for date, d in sorted(by_date_map.items())]

    by_date = _aggregate_dates(by_date, granularity,
                               sum_fields=['spot_cost', 'ondemand_cost', 'total'])
    for d in by_date:
        d['spot_pct'] = round(100.0 * d['spot_cost'] / max(d['total'], 0.01), 1)

    # By instance type
    by_instance_map = {}
    for run in runs_with_cost:
        inst = run.get('instance_type', 'unknown')
        if inst not in by_instance_map:
            by_instance_map[inst] = {'cost': 0, 'runs': 0}
        by_instance_map[inst]['cost'] += run['cost_usd']
        by_instance_map[inst]['runs'] += 1
    by_instance = [{'instance_type': k, 'cost': round(v['cost'], 2), 'runs': v['runs']}
                   for k, v in sorted(by_instance_map.items(), key=lambda x: -x[1]['cost'])]

    # By dashboard
    by_dash_map = {}
    for run in runs_with_cost:
        dash = run.get('dashboard', 'unknown')
        if dash not in by_dash_map:
            by_dash_map[dash] = {'cost': 0, 'runs': 0}
        by_dash_map[dash]['cost'] += run['cost_usd']
        by_dash_map[dash]['runs'] += 1
    by_dashboard = [{'dashboard': k, 'cost': round(v['cost'], 2), 'runs': v['runs']}
                    for k, v in sorted(by_dash_map.items(), key=lambda x: -x[1]['cost'])]

    # Summary
    total_cost = sum(run['cost_usd'] for run in runs_with_cost)
    spot_cost = sum(run['cost_usd'] for run in runs_with_cost if run.get('spot'))

    return Response(json.dumps({
        'by_date': by_date,
        'by_instance_type': by_instance,
        'by_dashboard': by_dashboard,
        'summary': {
            'total_cost': round(total_cost, 2),
            'spot_pct': round(100.0 * spot_cost / max(total_cost, 0.01), 1),
            'avg_cost_per_run': round(total_cost / max(len(runs_with_cost), 1), 2),
            'total_runs': len(runs_with_cost),
        },
    }), mimetype='application/json')


# ---- CI Performance endpoint ----

@app.route('/api/ci/performance')
@auth.login_required
def api_ci_performance():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    dashboard = request.args.get('dashboard', '')
    granularity = request.args.get('granularity', 'daily')
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)

    runs = rk_metrics.get_ci_runs(r, ts_from, ts_to)
    runs = [run for run in runs if run.get('status') in ('PASSED', 'FAILED')]
    if dashboard:
        runs = [run for run in runs if run.get('dashboard') == dashboard]

    # By date
    by_date_map = {}
    for run in runs:
        date = rk_metrics._ts_to_date(run.get('timestamp', 0))
        if date not in by_date_map:
            by_date_map[date] = {'total': 0, 'passed': 0, 'failed': 0, 'durations': []}
        by_date_map[date]['total'] += 1
        if run.get('status') == 'PASSED':
            by_date_map[date]['passed'] += 1
        else:
            by_date_map[date]['failed'] += 1
        complete = run.get('complete')
        ts = run.get('timestamp')
        if complete and ts:
            by_date_map[date]['durations'].append((complete - ts) / 60000.0)

    by_date = []
    for date in sorted(by_date_map):
        d = by_date_map[date]
        by_date.append({
            'date': date,
            'total': d['total'],
            'passed': d['passed'],
            'failed': d['failed'],
            'pass_rate': round(100.0 * d['passed'] / max(d['total'], 1), 1),
            'failure_rate': round(100.0 * d['failed'] / max(d['total'], 1), 1),
            'avg_duration_mins': round(sum(d['durations']) / len(d['durations']), 1) if d['durations'] else None,
        })

    by_date = _aggregate_dates(by_date, granularity,
                               sum_fields=['total', 'passed', 'failed'],
                               avg_fields=['avg_duration_mins'])
    for d in by_date:
        d['pass_rate'] = round(100.0 * d['passed'] / max(d['total'], 1), 1)
        d['failure_rate'] = round(100.0 * d['failed'] / max(d['total'], 1), 1)

    # Flake/failure data from test_events (the only SQLite data)
    top_flakes = rk_db.query('''
        SELECT test_cmd, COUNT(*) as count, ref_name
        FROM test_events WHERE status='flaked' AND timestamp >= ? AND timestamp <= ?
        GROUP BY test_cmd ORDER BY count DESC LIMIT 15
    ''', (date_from, date_to + 'T23:59:59'))

    top_failures = rk_db.query('''
        SELECT test_cmd, COUNT(*) as count
        FROM test_events WHERE status='failed' AND timestamp >= ? AND timestamp <= ?
        GROUP BY test_cmd ORDER BY count DESC LIMIT 15
    ''', (date_from, date_to + 'T23:59:59'))

    # Summary
    total = len(runs)
    passed = sum(1 for run in runs if run.get('status') == 'PASSED')
    failed = total - passed
    durations = []
    for run in runs:
        complete = run.get('complete')
        ts = run.get('timestamp')
        if complete and ts:
            durations.append((complete - ts) / 60000.0)

    flake_count = rk_db.query('''
        SELECT COUNT(*) as c FROM test_events WHERE status='flaked' AND timestamp >= ? AND timestamp <= ?
    ''', (date_from, date_to + 'T23:59:59'))
    total_tests = rk_db.query('''
        SELECT COUNT(*) as c FROM test_events WHERE status IN ('failed','flaked') AND timestamp >= ? AND timestamp <= ?
    ''', (date_from, date_to + 'T23:59:59'))

    fc = flake_count[0]['c'] if flake_count else 0
    tc = total_tests[0]['c'] if total_tests else 0

    return Response(json.dumps({
        'by_date': by_date,
        'top_flakes': top_flakes,
        'top_failures': top_failures,
        'summary': {
            'total_runs': total,
            'pass_rate': round(100.0 * passed / max(total, 1), 1),
            'failure_rate': round(100.0 * failed / max(total, 1), 1),
            'avg_duration_mins': round(sum(durations) / len(durations), 1) if durations else None,
            'flake_rate': round(100.0 * fc / max(tc, 1), 1) if tc else 0,
        },
    }), mimetype='application/json')


# ---- Deployment speed endpoint ----

@app.route('/api/deployments/speed')
@auth.login_required
def api_deploy_speed():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    workflow = request.args.get('workflow', '')
    granularity = request.args.get('granularity', 'daily')
    result = rk_github.get_deployment_speed(date_from, date_to, workflow)
    if granularity != 'daily' and result.get('by_date'):
        result['by_date'] = _aggregate_dates(
            result['by_date'], granularity,
            sum_fields=['count', 'success', 'failure'],
            avg_fields=['median_mins', 'p95_mins'])
    return Response(json.dumps(result), mimetype='application/json')


# ---- Branch lag endpoint ----

@app.route('/api/branches/lag')
@auth.login_required
def api_branch_lag():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    return Response(json.dumps(rk_github.get_branch_lag(date_from, date_to)), mimetype='application/json')


# ---- PR metrics endpoint ----

@app.route('/api/prs/metrics')
@auth.login_required
def api_pr_metrics():
    date_from = request.args.get('from', (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'))
    date_to = request.args.get('to', datetime.now().strftime('%Y-%m-%d'))
    author = request.args.get('author', '')
    # Read CI runs from Redis to compute per-PR costs
    ts_from = int(datetime.strptime(date_from, '%Y-%m-%d').timestamp() * 1000)
    ts_to = int((datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)).timestamp() * 1000)
    ci_runs = rk_metrics.get_ci_runs(r, ts_from, ts_to)
    return Response(json.dumps(rk_github.get_pr_metrics(date_from, date_to, author, ci_runs)), mimetype='application/json')


# ---- Dashboard view routes ----

@app.route('/cost-overview')
@auth.login_required
def cost_overview():
    path = Path('dashboard-views/cost-overview.html')
    if path.exists():
        return path.read_text()
    return "Dashboard not found", 404


@app.route('/<key>')
@auth.login_required
def get_value(key):
    # Check if raw text format is requested
    raw_text = key.endswith('.txt')
    if raw_text:
        key = key[:-4]  # Remove .txt extension

    value = r.get(key)
    if value is None:
        # Try disk fallback
        value = read_from_disk(key)
        if value is None:
            value = "Key not found"
    else:
        try:
            if value.startswith(b"\x1f\x8b"):
                value = gzip.decompress(value).decode()
            else:
                value = value.decode()
        except Exception:
            value = "Failed to decompress"

    # Return raw text if .txt extension was used
    if raw_text:
        return Response(value, mimetype='text/plain')

    return render_template_string(TEMPLATE, value=ansi_to_html(value), filter_str='', filter_prop='')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
