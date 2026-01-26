#!/usr/bin/env python3
"""
Unified watcher for CI events via Redis pub/sub.

Watches for specific events on Redis channels and spawns Claude agents to handle them.

Usage:
    # Watch for test starts matching a pattern
    ./ci3/watcher.py --channel ci:test:started --pattern "e2e_prover" --skill ./ci3/skills/detect_hung_test.md

    # Watch for CI failures
    ./ci3/watcher.py --channel ci:run:failed --skill ./ci3/skills/ci_failure_first_responder.md --slack-user U12345678

Environment:
    CI_REDIS - Redis host (default: localhost)
"""

import asyncio
import argparse
import json
import os
import re
import signal
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import redis.asyncio as redis
from claude_agent_sdk import query, ClaudeAgentOptions


# ANSI colors for terminal output
BLUE = "\033[34m"
RED = "\033[31m"
RESET = "\033[0m"

# Track active agent tasks for cleanup
active_tasks: set[asyncio.Task] = set()


async def spawn_agent(skill_content: str, env: dict[str, str], prefix: str) -> None:
    """Spawn a Claude agent with the given skill and environment variables.

    Args:
        skill_content: The skill file content to use as the prompt
        env: Environment variables to pass to the agent
        prefix: Prefix for output lines (e.g., test name or branch name)
    """
    # Build environment context to prepend to the skill
    env_lines = [f"{k}={v}" for k, v in env.items() if v]
    env_context = "Environment variables:\n" + "\n".join(env_lines) + "\n\n"
    prompt = env_context + skill_content

    options = ClaudeAgentOptions(permission_mode="bypassPermissions")

    try:
        async for message in query(prompt=prompt, options=options):
            # Prefix each line of output
            for line in str(message).splitlines():
                timestamp = datetime.now().strftime("%H:%M:%S")
                print(f"{BLUE}[{timestamp}][{prefix}]{RESET} {line}")
    except asyncio.CancelledError:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"{RED}[{timestamp}][{prefix}]{RESET} Agent cancelled")
        raise  # Re-raise to properly mark task as cancelled
    except Exception as e:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"{RED}[{timestamp}][{prefix}]{RESET} Agent error: {e}", file=sys.stderr)


def parse_test_event(data: dict[str, Any]) -> dict[str, str]:
    """Parse a test started event into environment variables."""
    return {
        "TEST_CMD": data.get("test_cmd", ""),
        "LOG_ID": data.get("log_id", ""),
        "LOG_URL": data.get("log_url", ""),
        "REF_NAME": data.get("ref_name", ""),
        "COMMIT_HASH": data.get("commit_hash", ""),
        "COMMIT_AUTHOR": data.get("commit_author", ""),
        "COMMIT_MSG": data.get("commit_msg", ""),
        "IS_SCENARIO_TEST": str(data.get("is_scenario_test", False)).lower(),
    }


def parse_run_failed_event(data: dict[str, Any]) -> dict[str, str]:
    """Parse a CI run failed event into environment variables."""
    return {
        "LOG_ID": data.get("log_id", ""),
        "LOG_URL": data.get("log_url", ""),
        "REF_NAME": data.get("ref_name", ""),
        "COMMIT_HASH": data.get("commit_hash", ""),
        "COMMIT_AUTHOR": data.get("commit_author", ""),
        "COMMIT_MSG": data.get("commit_msg", ""),
        "EXIT_CODE": str(data.get("exit_code", "")),
    }


def get_prefix(data: dict[str, Any], channel: str) -> str:
    """Generate a short prefix for output lines."""
    if "test_cmd" in data:
        # Extract last component of test command path
        cmd = data["test_cmd"]
        if "/" in cmd:
            cmd = cmd.split("/")[-1]
        return cmd[:20]
    elif "ref_name" in data:
        # Extract last component of branch name
        ref = data["ref_name"]
        if "/" in ref:
            ref = ref.split("/")[-1]
        return ref[:20]
    return "unknown"


async def watch_channel(
    redis_host: str,
    channel: str,
    skill_path: Path,
    pattern: str | None = None,
    slack_user: str | None = None,
    ci3_root: str | None = None,
) -> None:
    """Subscribe to a Redis channel and spawn agents for matching events.

    Args:
        redis_host: Redis server hostname
        channel: Redis channel to subscribe to
        skill_path: Path to the skill file
        pattern: Optional regex pattern to filter events (for test events)
        slack_user: Optional Slack user ID to pass to agents
        ci3_root: Path to ci3 directory
    """
    skill_content = skill_path.read_text()

    print(f"Connecting to Redis at {redis_host}...")
    r = redis.Redis(host=redis_host, decode_responses=True)

    # Test connection
    try:
        await r.ping()
        print("Redis connection established")
    except redis.ConnectionError as e:
        print(f"Error: Cannot connect to Redis at {redis_host}: {e}", file=sys.stderr)
        sys.exit(1)

    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    print(f"Watching channel: {channel}")
    if pattern:
        print(f"Filtering events matching: {pattern}")
    print(f"Using skill file: {skill_path}")
    if slack_user:
        print(f"Will notify: {slack_user}")
    print()

    # Compile pattern if provided
    pattern_re = re.compile(pattern) if pattern else None

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue

        # Parse JSON data
        try:
            data = json.loads(message["data"])
        except json.JSONDecodeError:
            continue

        # For test events, filter by pattern
        if pattern_re:
            test_cmd = data.get("test_cmd", "")
            if not test_cmd or not pattern_re.search(test_cmd):
                continue

        # Parse event based on channel type
        if channel == "ci:test:started":
            env = parse_test_event(data)
            color = BLUE
            event_desc = f"Test started: {data.get('test_cmd', 'unknown')}"
        elif channel == "ci:run:failed":
            env = parse_run_failed_event(data)
            color = RED
            event_desc = f"CI run failed: {data.get('ref_name', 'unknown')}"
        else:
            # Generic handling for other channels
            env = {k.upper(): str(v) for k, v in data.items()}
            color = BLUE
            event_desc = f"Event on {channel}"

        # Add common environment variables
        if slack_user:
            env["SLACK_USER_ID"] = slack_user
        if ci3_root:
            env["CI3_ROOT"] = ci3_root

        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = get_prefix(data, channel)

        print(f"{color}[{timestamp}]{RESET} {event_desc}")
        print(f"{color}Event data:{RESET}")
        print(json.dumps(data, indent=2))
        print()

        # Spawn agent in background and track it
        task = asyncio.create_task(spawn_agent(skill_content, env, prefix))
        active_tasks.add(task)
        task.add_done_callback(active_tasks.discard)
        print(f"Spawned agent for: {prefix} (task: {id(task)}, active: {len(active_tasks)})")
        print()


async def shutdown() -> None:
    """Cancel all active agent tasks and wait for them to complete."""
    if not active_tasks:
        return

    print(f"\nCancelling {len(active_tasks)} active agent(s)...")
    for task in active_tasks:
        task.cancel()

    # Wait for all tasks to complete (they should handle CancelledError)
    results = await asyncio.gather(*active_tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception) and not isinstance(result, asyncio.CancelledError):
            print(f"Task error during shutdown: {result}", file=sys.stderr)

    print("All agents stopped")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Watch Redis channels for CI events and spawn Claude agents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Watch for specific tests
  %(prog)s --channel ci:test:started --pattern "e2e_prover" --skill ./ci3/skills/detect_hung_test.md

  # Watch for all CI failures
  %(prog)s --channel ci:run:failed --skill ./ci3/skills/ci_failure_first_responder.md --slack-user U12345
        """,
    )
    parser.add_argument(
        "--channel",
        required=True,
        help="Redis channel to subscribe to (e.g., ci:test:started, ci:run:failed)",
    )
    parser.add_argument(
        "--skill",
        required=True,
        type=Path,
        help="Path to the Claude skill file to use",
    )
    parser.add_argument(
        "--pattern",
        default=None,
        help="Regex pattern to filter events (applies to test_cmd for test events)",
    )
    parser.add_argument(
        "--slack-user",
        default=None,
        help="Slack user ID to pass to agents for notifications",
    )
    args = parser.parse_args()

    # Validate skill file exists
    if not args.skill.exists():
        print(f"Error: Skill file not found: {args.skill}", file=sys.stderr)
        sys.exit(1)

    # Get Redis host from environment
    redis_host = os.environ.get("CI_REDIS", "localhost")

    # Get ci3 root directory
    ci3_root = os.environ.get("CI3_ROOT")
    if not ci3_root:
        # Try to determine from script location
        script_dir = Path(__file__).parent.resolve()
        if script_dir.name == "ci3":
            ci3_root = str(script_dir)

    async def run_with_shutdown() -> None:
        """Run the watcher with proper signal handling for cleanup."""
        loop = asyncio.get_running_loop()
        shutdown_event = asyncio.Event()

        def signal_handler() -> None:
            print("\nReceived shutdown signal...")
            shutdown_event.set()

        # Register signal handlers
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, signal_handler)

        # Run watcher until shutdown signal
        watcher_task = asyncio.create_task(
            watch_channel(
                redis_host=redis_host,
                channel=args.channel,
                skill_path=args.skill,
                pattern=args.pattern,
                slack_user=args.slack_user,
                ci3_root=ci3_root,
            )
        )

        # Wait for either watcher to finish or shutdown signal
        done, pending = await asyncio.wait(
            [watcher_task, asyncio.create_task(shutdown_event.wait())],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Cancel the watcher if it's still running
        if not watcher_task.done():
            watcher_task.cancel()
            try:
                await watcher_task
            except asyncio.CancelledError:
                pass

        # Clean up all spawned agents
        await shutdown()

    asyncio.run(run_with_shutdown())


if __name__ == "__main__":
    main()
