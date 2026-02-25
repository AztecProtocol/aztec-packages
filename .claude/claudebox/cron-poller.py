#!/usr/bin/env python3
"""
ClaudeBox cron poller — runs every minute, checks .claude/scripts/cron/ for due jobs.

Each cron script has a comment like:
    # SCHEDULE: 60  (minutes between runs)

State is tracked in .claude/claudebox/cron-state.json.
"""

import json
import logging
import os
import re
import subprocess
import time
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="[cron] %(message)s")

REPO_DIR = os.environ.get("CLAUDE_REPO_DIR", os.path.expanduser("~/aztec-packages"))
CRON_DIR = os.path.join(REPO_DIR, ".claude", "scripts", "cron")
STATE_FILE = os.path.join(REPO_DIR, ".claude", "claudebox", "cron-state.json")
POLL_INTERVAL = 60  # seconds


def load_state():
    """Load last-run timestamps."""
    if not os.path.isfile(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_state(state):
    """Persist last-run timestamps."""
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def parse_schedule(script_path):
    """Read SCHEDULE comment from script. Returns interval in minutes, or None."""
    try:
        with open(script_path) as f:
            for line in f:
                m = re.match(r"#\s*SCHEDULE:\s*(\d+)", line)
                if m:
                    return int(m.group(1))
    except IOError:
        pass
    return None


def list_cron_scripts():
    """List executable cron scripts with their schedules."""
    if not os.path.isdir(CRON_DIR):
        return []

    scripts = []
    for name in sorted(os.listdir(CRON_DIR)):
        path = os.path.join(CRON_DIR, name)
        if not os.path.isfile(path) or not os.access(path, os.X_OK):
            continue
        if name.startswith(".") or name.endswith(".md"):
            continue
        interval = parse_schedule(path)
        if interval is not None:
            scripts.append((name, path, interval))

    return scripts


def is_due(name, interval_minutes, state):
    """Check if a cron job is due to run."""
    last_run = state.get(name)
    if last_run is None:
        return True
    try:
        last_dt = datetime.fromisoformat(last_run)
        elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds() / 60
        return elapsed >= interval_minutes
    except (ValueError, TypeError):
        return True


def run_script(name, path):
    """Spawn a cron script in the background."""
    logging.info(f"Running cron job: {name}")
    entrypoint = os.path.expanduser("~/claudeentry.sh")
    # Call via claudeentry.sh so env is set up; pass cron/ prefix as script name
    cmd = [entrypoint, f"cron/{name}"]
    try:
        subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env={**os.environ, "CLAUDECODE": ""},
        )
    except Exception as e:
        logging.error(f"Failed to start {name}: {e}")


def poll_once():
    """Check all cron scripts and run any that are due."""
    scripts = list_cron_scripts()
    if not scripts:
        return

    state = load_state()
    now = datetime.now(timezone.utc).isoformat()

    for name, path, interval in scripts:
        if is_due(name, interval, state):
            run_script(name, path)
            state[name] = now

    save_state(state)


def main():
    logging.info(f"Cron poller starting (checking every {POLL_INTERVAL}s)...")
    logging.info(f"Cron dir: {CRON_DIR}")

    while True:
        try:
            poll_once()
        except Exception as e:
            logging.error(f"Poll error: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
