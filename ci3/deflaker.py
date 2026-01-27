#!/usr/bin/env python3
"""Deflaker: Dispatch flake detection jobs for merge queue failures."""

import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime

import redis.asyncio as redis

HANDLED_CACHE_PREFIX = "deflaker:handled:"
HANDLED_CACHE_TTL = 86400  # 24 hours

# ANSI colors
BLUE = "\033[34m"
RED = "\033[31m"
GREEN = "\033[32m"
RESET = "\033[0m"


def log(msg: str, color: str = BLUE) -> None:
    """Print a timestamped log message."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{timestamp}]{RESET} {msg}")


async def main() -> None:
    redis_host = os.environ.get("CI_REDIS", "localhost")

    log(f"Connecting to Redis at {redis_host}...")
    r = redis.Redis(host=redis_host, decode_responses=True)

    try:
        await r.ping()
        log("Redis connection established", GREEN)
    except redis.ConnectionError as e:
        log(f"Cannot connect to Redis at {redis_host}: {e}", RED)
        sys.exit(1)

    pubsub = r.pubsub()
    await pubsub.subscribe("ci:test:failed")

    log("Deflaker watching ci:test:failed...")
    log("Filtering for merge queue failures only (gh-readonly-queue/*)")
    print()

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            data = json.loads(message["data"])
            await handle_failure(data, r)
        except json.JSONDecodeError:
            log("Invalid JSON in message", RED)
        except Exception as e:
            log(f"Error handling message: {e}", RED)


async def handle_failure(data: dict, redis_client: redis.Redis) -> None:
    """Handle a test failure event."""
    ref_name = data.get("ref_name", "")
    test_cmd = data.get("test_cmd", "")
    commit_hash = data.get("commit_hash", "")

    # Only handle merge queue failures
    if not re.match(r"^gh-readonly-queue/", ref_name):
        return

    log(f"Merge queue failure detected: {test_cmd[:60]}...")

    # Check cache
    cache_key = get_cache_key(test_cmd, commit_hash)
    if await redis_client.exists(cache_key):
        log(f"Already handled: {test_cmd[:50]}... at {commit_hash[:8]}")
        return

    # Mark as handling
    await redis_client.setex(cache_key, HANDLED_CACHE_TTL, "processing")

    log(f"Dispatching deflake job for commit {commit_hash[:8]}...")

    # Fire and forget - ci.sh sets up dashboard/job_id and calls bootstrap_ec2
    subprocess.Popen(
        ["./ci.sh", "bisect-flake", test_cmd, commit_hash],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    log(f"Deflake job dispatched", GREEN)
    print()


def get_cache_key(test_cmd: str, commit_hash: str) -> str:
    """Generate cache key for deduplication."""
    test_hash = hashlib.sha256(test_cmd.encode()).hexdigest()[:16]
    return f"{HANDLED_CACHE_PREFIX}{test_hash}:{commit_hash[:12]}"


if __name__ == "__main__":
    asyncio.run(main())
