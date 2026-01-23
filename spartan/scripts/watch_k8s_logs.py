#!/usr/bin/env python3
"""
Watch for new pods/jobs in a Kubernetes namespace and print GCP Logs Explorer links.

Usage:
    ./watch_k8s_logs.py <namespace> [--project PROJECT] [--cluster CLUSTER] [--location LOCATION] [--start-time TIMESTAMP]

Run in background from deploy_network.sh:
    python3 watch_k8s_logs.py "$NAMESPACE" --project "$GCP_PROJECT_ID" --cluster spartan-gke --location "$GCP_REGION" --start-time "$(date -Iseconds)" &
"""

import argparse
import signal
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Optional, Set

# ANSI colors
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RESET = "\033[0m"


def get_time_range_param(start_time: Optional[str]) -> str:
    """Generate time range parameter for GCP Logs Explorer URL."""
    if start_time:
        # Use absolute start time, no end time (shows logs from start to now)
        return f";startTime={start_time}"
    else:
        # Default to last 1 hour
        return ";duration=PT1H"


def get_pod_logs_url(
    pod_name: str,
    namespace: str,
    project: str,
    cluster: str,
    location: str,
    start_time: Optional[str] = None,
) -> str:
    """Generate GCP Logs Explorer URL for a pod."""
    query = f'''resource.type="k8s_container"
resource.labels.project_id="{project}"
resource.labels.location="{location}"
resource.labels.cluster_name="{cluster}"
resource.labels.namespace_name="{namespace}"
resource.labels.pod_name="{pod_name}"'''

    encoded_query = urllib.parse.quote(query, safe="")
    time_range = get_time_range_param(start_time)
    return f"https://console.cloud.google.com/logs/query;query={encoded_query}{time_range}?project={project}"


def get_job_logs_url(
    job_name: str,
    namespace: str,
    project: str,
    cluster: str,
    location: str,
    start_time: Optional[str] = None,
) -> str:
    """Generate GCP Logs Explorer URL for a job (all pods matching job-name label)."""
    query = f'''resource.type="k8s_container"
resource.labels.project_id="{project}"
resource.labels.location="{location}"
resource.labels.cluster_name="{cluster}"
resource.labels.namespace_name="{namespace}"
labels."k8s-pod/job-name"="{job_name}"'''

    encoded_query = urllib.parse.quote(query, safe="")
    time_range = get_time_range_param(start_time)
    return f"https://console.cloud.google.com/logs/query;query={encoded_query}{time_range}?project={project}"


def print_log_link(resource_type: str, name: str, url: str, status: str = "") -> None:
    """Print a formatted log link."""
    status_str = f" ({status})" if status else ""
    print(f"{CYAN}[LOGS]{RESET} {GREEN}{resource_type}{RESET}: {name}{status_str}")
    print(f"       {YELLOW}{url}{RESET}")
    print()
    sys.stdout.flush()


def get_pods(namespace: str) -> list[tuple[str, str]]:
    """Get list of (pod_name, status) tuples in namespace."""
    try:
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", namespace, "--no-headers"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        pods = []
        for line in result.stdout.strip().split("\n"):
            if line:
                parts = line.split()
                if len(parts) >= 3:
                    pods.append((parts[0], parts[2]))
        return pods
    except (subprocess.TimeoutExpired, subprocess.SubprocessError):
        return []


def get_jobs(namespace: str) -> list[tuple[str, str]]:
    """Get list of (job_name, completions) tuples in namespace."""
    try:
        result = subprocess.run(
            ["kubectl", "get", "jobs", "-n", namespace, "--no-headers"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        jobs = []
        for line in result.stdout.strip().split("\n"):
            if line:
                parts = line.split()
                if len(parts) >= 2:
                    jobs.append((parts[0], parts[1]))
        return jobs
    except (subprocess.TimeoutExpired, subprocess.SubprocessError):
        return []


def main() -> None:
    parser = argparse.ArgumentParser(description="Watch K8s namespace for new pods/jobs and print GCP log links")
    parser.add_argument("namespace", help="Kubernetes namespace to watch")
    parser.add_argument("--project", default="testnet-440309", help="GCP project ID")
    parser.add_argument("--cluster", default="spartan-gke", help="GKE cluster name")
    parser.add_argument("--location", default="us-west1-a", help="GKE cluster location")
    parser.add_argument("--start-time", help="ISO format start time for log filtering (e.g., 2024-01-01T00:00:00Z)")
    args = parser.parse_args()

    # Convert start time to ISO format with Z suffix if provided
    start_time: Optional[str] = None
    if args.start_time:
        try:
            # Parse the input and convert to UTC ISO format
            dt = datetime.fromisoformat(args.start_time.replace("Z", "+00:00"))
            start_time = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            # If parsing fails, use as-is
            start_time = args.start_time

    seen_pods: Set[str] = set()
    seen_jobs: Set[str] = set()
    running = True

    def handle_signal(signum, frame):
        nonlocal running
        print("\nStopping K8s log watcher...")
        running = False

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    sys.stdout.flush()

    while running:
        # Check for new pods
        for pod_name, status in get_pods(args.namespace):
            if pod_name not in seen_pods:
                seen_pods.add(pod_name)
                url = get_pod_logs_url(
                    pod_name, args.namespace, args.project, args.cluster, args.location, start_time
                )
                print_log_link("Pod", pod_name, url, status)

        # Check for new jobs
        for job_name, completions in get_jobs(args.namespace):
            if job_name not in seen_jobs:
                seen_jobs.add(job_name)
                url = get_job_logs_url(
                    job_name, args.namespace, args.project, args.cluster, args.location, start_time
                )
                print_log_link("Job", job_name, url, completions)

        time.sleep(2)


if __name__ == "__main__":
    main()
