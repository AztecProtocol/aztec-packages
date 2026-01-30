from flask import Flask, render_template_string, request, Response, redirect
from flask_compress import Compress
from flask_httpauth import HTTPBasicAuth
import gzip
import json
import os
import re
import requests
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

LOGS_DISK_PATH = os.getenv('LOGS_DISK_PATH', '/logs-disk')
DASHBOARD_PASSWORD = os.getenv('DASHBOARD_PASSWORD', 'password')
app = Flask(__name__)
Compress(app)
auth = HTTPBasicAuth()

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
        f"{hyperlink('/section/next?fail_list=failed_tests_next', 'next queue')}\n"
        f"{hyperlink('/section/prs', 'prs')}\n"
        f"{hyperlink('/section/releases', 'releases')}\n"
        f"{hyperlink('/section/nightly', 'nightly')}\n"
        f"{hyperlink('/section/network', 'network')}\n"
        f"{hyperlink('/section/deflake', 'deflake')}\n"
        f"{RESET}"
        f"\n"
        f"Benchmarks:\n"
        f"\n{YELLOW}"
        f"{hyperlink('https://aztecprotocol.github.io/aztec-packages/bench?branch=master', 'master')}\n"
        f"{hyperlink('https://aztecprotocol.github.io/aztec-packages/bench?branch=staging', 'staging')}\n"
        f"{hyperlink('https://aztecprotocol.github.io/aztec-packages/bench?branch=next', 'next')}\n"
        f"{hyperlink('/chonk-breakdowns', 'chonk breakdowns')}\n"
        f"{RESET}"
    )

def section_view(section: str) -> str:
    offset = int(request.args.get('offset', 0))
    limit = int(request.args.get('limit', 50))
    filter_str = request.args.get('filter', default='', type=str)
    filter_prop = request.args.get('filter_prop', default='', type=str)
    fail_list = request.args.get('fail_list', default='', type=str)

    lines = update_status(offset, filter_str, filter_prop)
    lines += "\n"
    lines += f"Last {limit} ci runs on {section}:\n\n"
    lines += get_section_data(section, offset, limit, filter_str, filter_prop, fail_list)
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
    import hashlib
    full_cmd = request.args.get('cmd')
    commit = request.args.get('commit', 'HEAD')
    confirmed = request.args.get('confirmed')

    if not full_cmd:
        return "Missing cmd parameter", 400

    # Check if this grind was already requested in the last 24 hours
    cache_key = f"grind:{hashlib.sha256(f'{full_cmd}:{commit}'.encode()).hexdigest()[:16]}"
    existing_run_id = r.get(cache_key)
    if existing_run_id:
        existing_run_id = existing_run_id.decode() if isinstance(existing_run_id, bytes) else existing_run_id
        return redirect(f'/{existing_run_id}')

    # Show confirmation page first
    if not confirmed:
        from urllib.parse import urlencode as url_encode
        confirm_url = f"/grind?{url_encode({'cmd': full_cmd, 'commit': commit, 'confirmed': '1'})}"
        confirm_page = (
            f"{BOLD}Grind Test{RESET}\n\n"
            f"This will start a grind run for 10 minutes.\n\n"
            f"Command:\n{PURPLE}{full_cmd}{RESET}\n\n"
            f"Commit: {commit}\n\n"
            f"{YELLOW}{hyperlink(confirm_url, 'Click here to proceed.')}{RESET}\n"
        )
        return render_template_string(TEMPLATE, value=ansi_to_html(confirm_page), filter_str='grind', follow='top')

    # Generate unique run ID (16 hex chars)
    run_id = uuid.uuid4().hex[:16]

    # Initialize the log key so redirect doesn't show "Key not found"
    r.setex(run_id, 86400, b'Starting grind...\n')

    # Cache this grind request for 24 hours
    r.setex(cache_key, 86400, run_id)

    # Start grind job in background
    # Dashboard server needs local repo checkout at REPO_PATH
    repo_path = os.environ.get('REPO_PATH')
    if repo_path:
        subprocess.Popen(
            ['bash', '-c', f'cd {repo_path} && RUN_ID={run_id} ./ci.sh grind-test "{full_cmd}" {commit}'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )

    # Redirect to log view.
    return redirect(f'/{run_id}')

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
