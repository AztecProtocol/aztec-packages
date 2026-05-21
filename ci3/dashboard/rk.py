from flask import Flask, render_template_string, request, Response, redirect
from flask_compress import Compress
from flask_httpauth import HTTPBasicAuth
import boto3
from botocore.exceptions import ClientError
import gzip
import json
import mimetypes
import os
import re
import requests
import shlex
import subprocess
import threading
import time as _time
import uuid
from ansi2html import Ansi2HTMLConverter
from pathlib import Path

# Import core rendering logic
from rk_core import (
    YELLOW, BLUE, GREEN, RED, PURPLE, BOLD, RESET,
    hyperlink, r, get_section_data, get_list_as_string
)
S3_LOGS_BUCKET = os.getenv('S3_LOGS_BUCKET', 'aztec-ci-artifacts')
S3_LOGS_PREFIX = os.getenv('S3_LOGS_PREFIX', 'logs')
LOGS_DISK_PATH = os.getenv('LOGS_DISK_PATH', '/logs-disk')

_s3 = boto3.client('s3', region_name='us-east-2')
DASHBOARD_PASSWORD = os.getenv('DASHBOARD_PASSWORD', '')
CI_METRICS_PORT = int(os.getenv('CI_METRICS_PORT', '8081'))
CI_METRICS_URL = os.getenv('CI_METRICS_URL', f'http://localhost:{CI_METRICS_PORT}')

app = Flask(__name__)
Compress(app)
auth = HTTPBasicAuth()

# Start the ci-metrics server as a subprocess (once across all workers).
# Uses a file lock so only the first gunicorn worker to import this module
# actually spawns the process; the rest skip silently.
import fcntl
import signal

_ci_metrics_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ci-metrics')
if os.path.isdir(_ci_metrics_dir):
    _lock_path = f'/tmp/ci-metrics-{CI_METRICS_PORT}.lock'
    try:
        _lock_fd = open(_lock_path, 'w')
        fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # We hold the lock — kill stale process and spawn fresh one
        try:
            out = subprocess.check_output(
                ['lsof', '-ti', f':{CI_METRICS_PORT}'], stderr=subprocess.DEVNULL, text=True)
            for pid in out.strip().split('\n'):
                if pid:
                    os.kill(int(pid), signal.SIGTERM)
            _time.sleep(0.5)
        except (subprocess.CalledProcessError, OSError):
            pass
        _ci_metrics_env = {**os.environ, 'CI_METRICS_PORT': str(CI_METRICS_PORT)}
        subprocess.Popen(
            ['gunicorn', '-w', '1', '-b', f'0.0.0.0:{CI_METRICS_PORT}',
             '--timeout', '120', 'app:app'],
            cwd=_ci_metrics_dir,
            env=_ci_metrics_env,
        )
        print(f"[rk.py] ci-metrics server started on port {CI_METRICS_PORT}")
        # Hold the lock until this process exits so other workers skip
    except OSError:
        # Another worker already holds the lock — nothing to do
        pass

# Conditional auth decorator - only require auth if password is set
def optional_auth(f):
    if DASHBOARD_PASSWORD:
        return auth.login_required(f)
    return f


def read_from_s3(key):
    """Read log from S3 (fallback when Redis and disk both miss)."""
    try:
        prefix = key[:4]
        s3_key = f"{S3_LOGS_PREFIX}/{prefix}/{key}.log.gz"
        obj = _s3.get_object(Bucket=S3_LOGS_BUCKET, Key=s3_key)
        return gzip.decompress(obj['Body'].read()).decode('utf-8', errors='replace')
    except ClientError as e:
        if e.response['Error']['Code'] != 'NoSuchKey':
            print(f"S3 error reading {key}: {e}")
    except Exception as e:
        print(f"Error reading from S3: {e}")
    return None

def read_breakdown_from_s3(runtime, flow_name, sha):
    """Read benchmark breakdown from S3."""
    breakdown_name = f"{runtime}-{flow_name}-{sha}"
    s3_prefix = f"{S3_LOGS_PREFIX}/bench/bb-breakdown"

    # Exact match
    try:
        s3_key = f"{s3_prefix}/{breakdown_name}.log.gz"
        obj = _s3.get_object(Bucket=S3_LOGS_BUCKET, Key=s3_key)
        return gzip.decompress(obj['Body'].read()).decode('utf-8', errors='replace')
    except ClientError as e:
        if e.response['Error']['Code'] != 'NoSuchKey':
            print(f"S3 error reading breakdown {breakdown_name}: {e}")
    except Exception as e:
        print(f"Error reading breakdown from S3: {e}")

    # Prefix search (SHA may be a prefix)
    try:
        list_prefix = f"{s3_prefix}/{breakdown_name}"
        paginator = _s3.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=S3_LOGS_BUCKET, Prefix=list_prefix):
            for obj in page.get('Contents', []):
                key = obj['Key']
                if key.endswith('.log.gz'):
                    try:
                        resp = _s3.get_object(Bucket=S3_LOGS_BUCKET, Key=key)
                        return gzip.decompress(resp['Body'].read()).decode('utf-8', errors='replace')
                    except Exception:
                        pass
    except Exception as e:
        print(f"S3 prefix search failed for breakdown {breakdown_name}: {e}")

    return None

def wasm_bench_disk_root():
    return Path(os.getenv('WASM_BENCH_DISK_ROOT', os.path.join(LOGS_DISK_PATH, 'bench', 'wasm-bench')))

WASM_BENCH_TARGETS = {
    'galaxy-s25-ultra': {
        'label': 'Samsung Galaxy S25 Ultra',
        'hardware': 'Snapdragon 8 Elite (2 Phoenix-L + 6 Phoenix-M)',
        'browser': 'Android 15 Chrome',
        'platform': 'Android 15 real device',
    },
    'iphone-15-pro': {
        'label': 'iPhone 15 Pro',
        'hardware': 'Apple A17 Pro (2P+4E)',
        'browser': 'iOS Safari',
        'platform': 'iOS real device',
    },
    'iphone-16': {
        'label': 'iPhone 16',
        'hardware': 'Apple A18 (2P+4E)',
        'browser': 'iOS Safari',
        'platform': 'iOS real device',
    },
    'macos': {
        'label': 'macOS Sequoia Chrome',
        'hardware': 'Apple M2 Mac mini (4P+4E)',
        'browser': 'Chrome on macOS',
        'platform': 'macOS Sequoia desktop',
    },
    'windows-chrome': {
        'label': 'Windows 11 Chrome',
        'hardware': 'CPU model not exposed by BrowserStack',
        'browser': 'Chrome on Win64 x64',
        'platform': 'Windows 11 desktop VM',
    },
    'windows-edge': {
        'label': 'Windows 11 Edge',
        'hardware': 'CPU model not exposed by BrowserStack',
        'browser': 'Edge on Win64 x64',
        'platform': 'Windows 11 desktop VM',
    },
    'pixel-9-pro-xl': {
        'label': 'Google Pixel 9 Pro XL',
        'hardware': 'Google Tensor G4 (1+3+4)',
        'browser': 'Android 15 Chrome',
        'platform': 'Android 15 real device',
    },
    'galaxy-s25': {
        'label': 'Samsung Galaxy S25',
        'hardware': 'Snapdragon 8 Elite',
        'browser': 'Android 15 Chrome',
        'platform': 'Android 15 real device',
    },
}

def _ua_version(ua, token):
    match = re.search(rf'{token}/([0-9.]+)', ua or '')
    if not match:
        return None
    return match.group(1)

def _ios_version(ua):
    match = re.search(r'iPhone OS ([0-9_]+)', ua or '')
    if not match:
        return None
    return match.group(1).replace('_', '.')

def _runtime_browser(target, target_info, features):
    ua = (features or {}).get('userAgent') or ''
    if target == 'windows-edge':
        version = _ua_version(ua, 'Edg')
        return f"Edge {version} on Win64 x64" if version else target_info.get('browser')
    if target == 'windows-chrome':
        version = _ua_version(ua, 'Chrome')
        return f"Chrome {version} on Win64 x64" if version else target_info.get('browser')
    if target == 'macos':
        version = _ua_version(ua, 'Chrome')
        return f"Chrome {version} on macOS" if version else target_info.get('browser')
    if target.startswith('iphone-'):
        ios = _ios_version(ua)
        safari = _ua_version(ua, 'Version')
        if ios and safari:
            return f"Safari {safari} on iOS {ios}"
        return target_info.get('browser')
    if target.startswith('galaxy-') or target.startswith('pixel-'):
        version = _ua_version(ua, 'Chrome')
        return f"Chrome {version} on Android 15" if version else target_info.get('browser')
    return target_info.get('browser')

def _runtime_spec(target_info, features):
    spec = target_info.get('platform') or ''
    hc = (features or {}).get('hardwareConcurrency')
    if hc:
        thread_spec = f"{hc} logical threads observed"
        return f"{spec}; {thread_spec}" if spec else thread_spec
    return spec

def _runtime_hardware(target_info, features):
    hardware = target_info.get('hardware') or target_info.get('chip') or ''
    hc = (features or {}).get('hardwareConcurrency')
    if 'not exposed' in hardware and hc:
        return f"{hardware}; {hc} logical threads observed"
    return hardware

def _json_response(value, status=200):
    return Response(json.dumps(value), mimetype='application/json', status=status)

def _read_jsonl(text):
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as e:
            rows.append({'error': f'invalid jsonl row: {e}'})
    return rows

def _wasm_bench_s3_prefix():
    return f"{S3_LOGS_PREFIX}/bench/wasm-bench"

def _read_wasm_bench_s3_bytes(run_id, relpath):
    relpath = relpath.strip('/')
    for key in (
        f"{_wasm_bench_s3_prefix()}/{run_id}/{relpath}",
        f"{_wasm_bench_s3_prefix()}/{run_id}/{relpath}.log.gz",
    ):
        try:
            obj = _s3.get_object(Bucket=S3_LOGS_BUCKET, Key=key)
            data = obj['Body'].read()
            if key.endswith('.gz'):
                data = gzip.decompress(data)
            return data
        except ClientError as e:
            if e.response['Error']['Code'] != 'NoSuchKey':
                print(f"S3 error reading wasm bench artifact {key}: {e}")
        except Exception as e:
            print(f"Error reading wasm bench artifact from S3: {e}")
    return None

def _read_wasm_bench_text(run_id, relpath, base_dir=None):
    rel = Path(relpath)
    if rel.is_absolute() or '..' in rel.parts:
        return None

    local_base = base_dir or wasm_bench_disk_root() / run_id
    local_path = local_base / rel
    if local_path.exists() and local_path.is_file():
        return local_path.read_text(errors='replace')

    data = _read_wasm_bench_s3_bytes(run_id, relpath)
    if data is not None:
        return data.decode('utf-8', errors='replace')
    return None

def _wasm_bench_run_id_from_manifest(manifest, fallback):
    for key in ('runId', 'sourceCommit'):
        value = manifest.get(key)
        if value:
            return value
    artifact_name = manifest.get('artifactName', '')
    match = re.search(r'wasm-bench-artifacts-([0-9a-f]{40})', artifact_name)
    if match:
        return match.group(1)
    return fallback

def _load_wasm_bench_manifest(path, root=None):
    try:
        manifest = json.loads(path.read_text())
        if root and path.parent == root:
            run_id = _wasm_bench_run_id_from_manifest(manifest, path.parent.name)
        else:
            run_id = path.parent.name
        return run_id, manifest
    except Exception as e:
        print(f"Error loading wasm bench manifest {path}: {e}")
        return path.parent.name, None

def _list_wasm_bench_disk_runs():
    root = wasm_bench_disk_root()
    paths = []
    if (root / 'trace-manifest.json').exists():
        paths.append(root / 'trace-manifest.json')
    paths.extend(root.glob('*/trace-manifest.json'))

    runs = {}
    for path in paths:
        run_id, manifest = _load_wasm_bench_manifest(path, root)
        if not manifest:
            continue
        traces = manifest.get('traces', [])
        runs[run_id] = {
            'id': run_id,
            'source': 'disk',
            'generatedAt': manifest.get('generatedAt'),
            'artifactName': manifest.get('artifactName'),
            'traceCount': manifest.get('traceCount', len(traces)),
            'targets': sorted({trace.get('target') for trace in traces if trace.get('target')}),
            'flows': sorted({trace.get('flow') for trace in traces if trace.get('flow')}),
        }
    return runs

def _list_wasm_bench_s3_run_ids():
    run_ids = set()
    try:
        prefix = f"{_wasm_bench_s3_prefix()}/"
        paginator = _s3.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=S3_LOGS_BUCKET, Prefix=prefix):
            for obj in page.get('Contents', []):
                key = obj['Key']
                rest = key[len(prefix):]
                parts = rest.split('/', 1)
                if len(parts) == 2 and parts[1] in ('trace-manifest.json', 'trace-manifest.json.log.gz'):
                    run_ids.add(parts[0])
    except Exception as e:
        print(f"Error listing wasm bench S3 runs: {e}")
    return sorted(run_ids)

def _list_wasm_bench_runs():
    runs = _list_wasm_bench_disk_runs()
    for run_id in _list_wasm_bench_s3_run_ids():
        if run_id in runs:
            continue
        manifest_text = _read_wasm_bench_text(run_id, 'trace-manifest.json')
        if not manifest_text:
            continue
        try:
            manifest = json.loads(manifest_text)
        except json.JSONDecodeError:
            continue
        traces = manifest.get('traces', [])
        runs[run_id] = {
            'id': run_id,
            'source': 's3',
            'generatedAt': manifest.get('generatedAt'),
            'artifactName': manifest.get('artifactName'),
            'traceCount': manifest.get('traceCount', len(traces)),
            'targets': sorted({trace.get('target') for trace in traces if trace.get('target')}),
            'flows': sorted({trace.get('flow') for trace in traces if trace.get('flow')}),
        }
    return sorted(runs.values(), key=lambda run: run.get('generatedAt') or '', reverse=True)

def _resolve_wasm_bench_run(run_id):
    disk_runs = _list_wasm_bench_disk_runs()
    for candidate_id in disk_runs:
        if candidate_id == run_id or candidate_id.startswith(run_id):
            base_dir = wasm_bench_disk_root() / candidate_id
            if (wasm_bench_disk_root() / 'trace-manifest.json').exists() and not base_dir.exists():
                base_dir = wasm_bench_disk_root()
            manifest_text = _read_wasm_bench_text(candidate_id, 'trace-manifest.json', base_dir)
            if manifest_text:
                return candidate_id, 'disk', base_dir, json.loads(manifest_text)

    for candidate_id in _list_wasm_bench_s3_run_ids():
        if candidate_id == run_id or candidate_id.startswith(run_id):
            manifest_text = _read_wasm_bench_text(candidate_id, 'trace-manifest.json')
            if manifest_text:
                return candidate_id, 's3', None, json.loads(manifest_text)
    return None, None, None, None

def _select_result_data(result_rows):
    last_error = None
    selected = None
    for row in result_rows:
        payload = row.get('payload') or {}
        if payload.get('ok') and payload.get('data'):
            selected = payload['data']
        elif payload:
            last_error = payload.get('error') or payload
    return selected, last_error

def _select_run_data(result_data, run_number):
    runs = result_data.get('runs', []) if result_data else []
    for run in runs:
        if run.get('run') == run_number:
            return run
    return runs[0] if runs else {}

def _summarize_bench_dump(bench_dump, limit=18):
    if not bench_dump:
        return {'top': [], 'roots': []}

    components = []
    for name, values in bench_dump.items():
        entries = values if isinstance(values, list) else [values]
        worker_ns = sum(float(entry.get('time') or 0) for entry in entries)
        wall_ns = sum(
            float(entry.get('time_max') or 0)
            if int(entry.get('num_threads') or 1) > 1 and float(entry.get('time_max') or 0) > 0
            else float(entry.get('time') or 0)
            for entry in entries
        )
        if wall_ns <= 0:
            continue
        parents = sorted({entry.get('parent') for entry in entries if entry.get('parent')})
        max_threads = max((int(entry.get('num_threads') or 1) for entry in entries), default=1)
        calls = sum(int(entry.get('count') or 0) for entry in entries)
        components.append({
            'name': name,
            'wallMs': wall_ns / 1_000_000,
            'workerMs': worker_ns / 1_000_000,
            'totalMs': wall_ns / 1_000_000,
            'calls': calls,
            'count': calls,
            'parents': parents[:4],
            'numThreads': max_threads,
            'threaded': max_threads > 1,
            'threadAmplification': worker_ns / wall_ns if wall_ns > 0 else None,
            'isRoot': '_root' in parents,
        })

    components.sort(key=lambda item: item['wallMs'], reverse=True)
    roots = [item for item in components if item['isRoot']]
    roots.sort(key=lambda item: item['wallMs'], reverse=True)
    return {'top': components[:limit], 'roots': roots}

def _progress_timeline(progress_rows):
    timeline = []
    for row in progress_rows:
        if row.get('kind') != 'progress':
            continue
        elapsed_ms = float(row.get('elapsedMs') or 0)
        phase_ms = max(float(row.get('phaseMs') or 0), 0)
        timeline.append({
            'phase': row.get('phase'),
            'prevPhase': row.get('prevPhase'),
            'source': row.get('source'),
            'phaseMs': phase_ms,
            'elapsedMs': elapsed_ms,
            'startMs': max(elapsed_ms - phase_ms, 0),
            'endMs': elapsed_ms,
            'timestamp': row.get('timestamp'),
            'details': row.get('details') or {},
        })
    return sorted(timeline, key=lambda row: row['elapsedMs'])

def _load_wasm_bench_run(run_id):
    resolved_id, source, base_dir, manifest = _resolve_wasm_bench_run(run_id)
    if not manifest:
        return None

    targets = []
    for trace in manifest.get('traces', []):
        target = trace.get('target', 'unknown')
        result_text = _read_wasm_bench_text(resolved_id, trace.get('resultsPath', f'{target}/results.jsonl'), base_dir)
        progress_text = _read_wasm_bench_text(resolved_id, trace.get('progressPath', f'{target}/progress.jsonl'), base_dir)
        result_rows = _read_jsonl(result_text or '')
        progress_rows = _read_jsonl(progress_text or '')
        result_data, result_error = _select_result_data(result_rows)
        run_data = _select_run_data(result_data, trace.get('run'))
        phases = run_data.get('phases') or {}
        cold_start = result_data.get('coldStart') if result_data else {}
        features = result_data.get('features') if result_data else {}
        target_info = WASM_BENCH_TARGETS.get(target, {
            'label': target,
            'hardware': 'unknown',
            'browser': 'unknown',
            'platform': 'unknown',
        })
        runtime_browser = _runtime_browser(target, target_info, features)
        runtime_hardware = _runtime_hardware(target_info, features)
        runtime_spec = _runtime_spec(target_info, features)
        trace_path = trace.get('tracePath')
        trace_url = f"/api/wasm-bench/artifact/{resolved_id}/{trace_path}" if trace_path else None

        setup_ms = trace.get('setupMs', run_data.get('setupMs'))
        prove_ms = trace.get('proveMs', run_data.get('proveMs'))
        prove_total_ms = trace.get('proveTotalMs')
        if prove_total_ms is None and setup_ms is not None and prove_ms is not None:
            prove_total_ms = setup_ms + prove_ms
        wall_ms = trace.get('wallMs', run_data.get('wallMs'))

        targets.append({
            **target_info,
            'target': target,
            'browser': runtime_browser,
            'hardware': runtime_hardware,
            'chip': runtime_hardware,
            'spec': runtime_spec,
            'platform': target_info.get('platform'),
            'benchmark': trace.get('benchmark') or (result_data or {}).get('benchmark'),
            'flow': trace.get('flow') or (result_data or {}).get('flow'),
            'run': trace.get('run'),
            'configuredThreads': trace.get('configuredThreads') or run_data.get('configuredThreads'),
            'setupMs': setup_ms,
            'proveMs': prove_ms,
            'proveTotalMs': prove_total_ms,
            'wallMs': wall_ms,
            'overheadMs': wall_ms - prove_total_ms if wall_ms is not None and prove_total_ms is not None else None,
            'phases': phases,
            'coldStart': cold_start or {},
            'preamble': (result_data or {}).get('preamble') or {},
            'features': features or {},
            'pageTimings': (result_data or {}).get('pageTimings') or {},
            'threadsConfig': (result_data or {}).get('threadsConfig') or {},
            'inputBytes': run_data.get('inputBytes'),
            'decodedInputBytes': run_data.get('decodedInputBytes'),
            'proofFieldCount': run_data.get('proofFieldCount'),
            'hadTrace': run_data.get('hadTrace') if 'hadTrace' in run_data else bool(trace_path),
            'traceBytes': trace.get('traceBytes') or run_data.get('traceBytes'),
            'tracePath': trace_path,
            'traceUrl': trace_url,
            'posted': trace.get('posted') if 'posted' in trace else bool(result_data) or any(row.get('phase') == 'result_posted' for row in progress_rows),
            'lastProgressPhase': trace.get('lastProgressPhase'),
            'lastProgressAtMs': trace.get('lastProgressAtMs'),
            'runnerError': trace.get('runnerError'),
            'completedAt': trace.get('completedAt'),
            'resultError': result_error,
            'timeline': _progress_timeline(progress_rows),
            'bench': _summarize_bench_dump(run_data.get('benchDump')),
        })

    targets.sort(key=lambda item: item.get('proveTotalMs') or float('inf'))
    return {
        'id': resolved_id,
        'source': source,
        'generatedAt': manifest.get('generatedAt'),
        'artifactName': manifest.get('artifactName'),
        'benchOut': manifest.get('benchOut'),
        'traceCount': manifest.get('traceCount', len(targets)),
        'flows': sorted({target.get('flow') for target in targets if target.get('flow')}),
        'targets': targets,
    }

@auth.verify_password
def verify_password(username, password):
    if username == "aztec" and password == DASHBOARD_PASSWORD:
        return username
    return None

_github_status_cache = {"status": None, "ts": 0}
_github_status_lock = threading.Lock()

def convert_to_ocs8(text):
    # Replace URLs not already part of an OCS8 link using negative lookbehind.
    pattern = r'(?<!\x1b\]8;;)(https?://[\w_.\-/:?=&%#+@~]+)'
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
        f"{hyperlink('/wasm-bench', 'wasm bench browserstack')}\n"
        f"{RESET}"
        f"\n"
        f"CI Metrics:\n"
        f"\n{YELLOW}"
        f"{hyperlink('/cost-overview', 'cost overview (AWS + GCP)')}\n"
        f"{hyperlink('/namespace-billing', 'namespace billing')}\n"
        f"{hyperlink('/ci-insights', 'ci insights')}\n"
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
                        .then(response => {
                            if (!response.ok) throw new Error(response.status);
                            return response.text();
                        })
                        .then(html => {
                            const parser = new DOMParser();
                            const newDoc = parser.parseFromString(html, 'text/html');
                            document.body.innerHTML = newDoc.body.innerHTML;
                        })
                        .catch(() => {});
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
                            .then(response => {
                                if (!response.ok) throw new Error(response.status);
                                return response.text();
                            })
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
                            .then(response => {
                                if (!response.ok) throw new Error(response.status);
                                return response.text();
                            })
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
@optional_auth
def show_root():
    return render_template_string(
        TEMPLATE,
        value=ansi_to_html(root()),
        filter_str='',
        filter_prop=''
    )

@app.route('/section/<section>')
@optional_auth
def show_section(section):
    return render_template_string(
        TEMPLATE,
        value=ansi_to_html(section_view(section)),
        filter_str=request.args.get('filter', default='', type=str),
        filter_prop=request.args.get('filter_prop', default='', type=str),
        follow='top'
    )

# <path:key> (not <key>) so branch-qualified history keys like
# `history_<hash>_merge-train/spartan` route correctly. WSGI decodes %2F to /
# in PATH_INFO before Flask routes, so percent-encoding can't rescue a plain
# <key> converter — only <path:key> matches segments containing /.
@app.route('/list/<path:key>')
@optional_auth
def get_list(key):
    value = get_list_as_string(key)
    follow = request.args.get('follow', 'top')
    return render_template_string(TEMPLATE, value=ansi_to_html(value), follow=follow, filter_str='', filter_prop='')

@app.route('/chonk-breakdowns')
@optional_auth
def chonk_breakdowns():
    """Serve the chonk breakdowns viewer page."""
    breakdown_html_path = Path('chonk-breakdowns/breakdown-viewer.html')
    if breakdown_html_path.exists():
        with breakdown_html_path.open('r') as f:
            return f.read()
    else:
        return "Breakdown viewer not found", 404

@app.route('/api/breakdown/flows')
@optional_auth
def list_available_flows():
    """API endpoint to list available breakdown flows from S3, filtered by runtime and SHA."""
    runtime = request.args.get('runtime')
    sha = request.args.get('sha')
    flows = set()
    s3_prefix = f"{S3_LOGS_PREFIX}/bench/bb-breakdown/"

    try:
        paginator = _s3.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=S3_LOGS_BUCKET, Prefix=s3_prefix):
            for obj in page.get('Contents', []):
                filename = obj['Key'][len(s3_prefix):]
                if not filename.endswith('.log.gz'):
                    continue
                parts = filename.replace('.log.gz', '').split('-', 1)
                if len(parts) == 2:
                    file_runtime = parts[0]
                    rest = parts[1]
                    last_dash = rest.rfind('-')
                    if last_dash != -1:
                        flow_name = rest[:last_dash]
                        file_sha = rest[last_dash + 1:]

                        if runtime and file_runtime != runtime:
                            continue
                        if sha and not file_sha.startswith(sha):
                            continue

                        flows.add(flow_name)
    except Exception as e:
        print(f"Error listing flows from S3: {e}")

    return Response(json.dumps(sorted(list(flows))), mimetype='application/json')

@app.route('/api/breakdown/<runtime>/<flow_name>/<sha>')
@optional_auth
def get_breakdown(runtime, flow_name, sha):
    """API endpoint to fetch breakdown JSON."""
    breakdown_data = read_breakdown_from_s3(runtime, flow_name, sha)
    if breakdown_data:
        return Response(breakdown_data, mimetype='application/json')

    return Response('{"error": "Breakdown not found"}', mimetype='application/json', status=404)

@app.route('/wasm-bench')
@optional_auth
def wasm_bench():
    html_path = Path(__file__).parent / 'wasm-bench' / 'wasm-bench-viewer.html'
    if html_path.exists():
        return html_path.read_text()
    return "Wasm bench viewer not found", 404

@app.route('/api/wasm-bench/runs')
@optional_auth
def list_wasm_bench_runs():
    return _json_response({'runs': _list_wasm_bench_runs()})

@app.route('/api/wasm-bench/run/<run_id>')
@optional_auth
def get_wasm_bench_run(run_id):
    run = _load_wasm_bench_run(run_id)
    if run:
        return _json_response(run)
    return _json_response({'error': 'Wasm bench run not found'}, status=404)

@app.route('/api/wasm-bench/artifact/<run_id>/<path:artifact_path>')
@optional_auth
def get_wasm_bench_artifact(run_id, artifact_path):
    rel = Path(artifact_path)
    if rel.is_absolute() or '..' in rel.parts:
        return _json_response({'error': 'Invalid artifact path'}, status=400)

    resolved_id, _, base_dir, _ = _resolve_wasm_bench_run(run_id)
    if not resolved_id:
        return _json_response({'error': 'Wasm bench run not found'}, status=404)

    data = None
    if base_dir:
        local_path = base_dir / rel
        if local_path.exists() and local_path.is_file():
            data = local_path.read_bytes()
    if data is None:
        data = _read_wasm_bench_s3_bytes(resolved_id, artifact_path)
    if data is None:
        return _json_response({'error': 'Artifact not found'}, status=404)

    mimetype = mimetypes.guess_type(artifact_path)[0] or 'application/octet-stream'
    response = Response(data, mimetype=mimetype)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
    return response


@app.route('/grind')
@optional_auth
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


# ---- Reverse proxy to ci-metrics server ----

_proxy_session = requests.Session()
_HOP_BY_HOP = frozenset([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade',
])
_STRIP_REQUEST_HEADERS = frozenset(['host'])

def _proxy(path):
    """Forward request to ci-metrics, streaming the response back.

    Passes the browser's Accept-Encoding through to ci-metrics so it
    compresses directly for the browser.  We stream the raw (still
    compressed) bytes back without decompression.
    """
    url = f'{CI_METRICS_URL}/{path.lstrip("/")}'
    try:
        fwd_headers = {k: v for k, v in request.headers if k.lower() not in _STRIP_REQUEST_HEADERS}
        resp = _proxy_session.request(
            method=request.method,
            url=url,
            params=request.args,
            data=request.get_data(),
            headers=fwd_headers,
            stream=True,
            timeout=180,
        )
        # Stream raw bytes (skip requests auto-decompression)
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in _HOP_BY_HOP}
        return Response(resp.raw.stream(8192),
                        status=resp.status_code, headers=headers)
    except Exception as e:
        return Response(json.dumps({'error': f'ci-metrics unavailable: {e}'}),
                        mimetype='application/json', status=502)

@app.route('/namespace-billing')
@app.route('/ci-health')
@app.route('/ci-insights')
@app.route('/cost-overview')
@app.route('/test-timings')
@app.route('/ci-health-report')
@app.route('/flake-prs')
@auth.login_required
def proxy_dashboard():
    return _proxy(request.path)


@app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@auth.login_required
def proxy_api(path):
    return _proxy(f'/api/{path}')

@app.route('/<key>')
@optional_auth
def get_value(key):
    # Check if raw text format is requested
    raw_text = key.endswith('.txt')
    if raw_text:
        key = key[:-4]  # Remove .txt extension

    try:
        value = r.get(key)
    except Exception:
        value = None
    if value is None:
        value = read_from_s3(key)
    if value is None:
        value = "Key not found"
    elif isinstance(value, bytes):
        # Redis returns raw bytes — decompress if gzip.
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
