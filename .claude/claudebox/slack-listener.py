#!/usr/bin/env python3
"""
ClaudeBox Slack listener.

Runs via Socket Mode (persistent WebSocket, no public URL, no polling).
Supports two triggers:
  1. @ClaudeBox <script> <prompt>  (app_mention — works in threads)
  2. /claudebox <script> <prompt>  (slash command — works anywhere)

If the first word isn't a known script, the entire text is treated as a
free-form prompt and the "default" script is used.
"""

import logging
import os
import re
import subprocess
import threading

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

logging.basicConfig(level=logging.DEBUG)

SLACK_BOT_TOKEN = os.environ["SLACK_BOT_TOKEN"]
SLACK_APP_TOKEN = os.environ["SLACK_APP_TOKEN"]
REPO_DIR = os.environ.get("CLAUDE_REPO_DIR", os.path.expanduser("~/aztec-packages"))
SCRIPTS_DIR = os.path.join(REPO_DIR, ".claude", "scripts")
DEFAULT_SCRIPT = "default"

app = App(token=SLACK_BOT_TOKEN, logger=logging.getLogger("bolt"))


def get_thread_context(client, channel, thread_ts):
    """Fetch all messages in a thread and format as context."""
    if not thread_ts:
        return ""

    try:
        result = client.conversations_replies(channel=channel, ts=thread_ts, limit=50)
    except Exception as e:
        print(f"[WARN] Could not fetch thread context: {e}")
        return ""
    messages = result.get("messages", [])

    user_cache = {}

    def get_username(user_id):
        if user_id not in user_cache:
            try:
                info = client.users_info(user=user_id)
                user_cache[user_id] = info["user"].get("real_name", user_id)
            except Exception:
                user_cache[user_id] = user_id
        return user_cache[user_id]

    lines = []
    for msg in messages:
        user = get_username(msg.get("user", "unknown"))
        text = msg.get("text", "")
        text = re.sub(r"<@[A-Z0-9]+>", "", text).strip()
        if text:
            lines.append(f"{user}: {text}")

    return "\n".join(lines)


def parse_command(text):
    """Parse text into (script_name, prompt).

    If the first word matches a known script, use it.
    Otherwise treat the entire text as a prompt and use the default script.
    """
    parts = text.split(None, 1)
    if not parts:
        return DEFAULT_SCRIPT, ""

    candidate = parts[0]
    script_path = os.path.join(SCRIPTS_DIR, candidate)
    if os.path.isfile(script_path):
        return candidate, parts[1] if len(parts) > 1 else ""

    # First word isn't a script — use the whole text as prompt with default script
    return DEFAULT_SCRIPT, text


def run_claudebox(channel, thread_ts, message_ts, script_name, prompt, thread_context):
    """Spawn claudeentry.sh in a subprocess."""
    cmd = [
        os.path.expanduser("~/claudeentry.sh"),
        script_name,
        f"--slack-channel={channel}",
        f"--slack-thread-ts={thread_ts}",
        f"--slack-message-ts={message_ts}",
    ]

    stdin_text = ""
    if thread_context:
        stdin_text += f"Slack thread context:\n{thread_context}\n\n"
    if prompt:
        stdin_text += prompt

    print(f"[RUN] Spawning: {' '.join(cmd)}", flush=True)
    result = subprocess.run(
        cmd,
        input=stdin_text,
        text=True,
        capture_output=True,
        env={**os.environ, "CLAUDECODE": ""},
    )
    print(f"[RUN] Exit code: {result.returncode}", flush=True)
    if result.stdout:
        print(f"[RUN] stdout (last 500): {result.stdout[-500:]}", flush=True)
    if result.stderr:
        print(f"[RUN] stderr (last 500): {result.stderr[-500:]}", flush=True)


def truncate(text, max_len=80):
    """Truncate text for display."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def start_run(client, channel, thread_ts, script_name, prompt, thread_context):
    """Post status message and spawn ClaudeBox in a background thread."""
    # Build status with quoted prompt
    status = f"ClaudeBox `{script_name}`"
    if prompt:
        status += f": _{truncate(prompt)}_"
    status += " ..."

    try:
        post_args = {"channel": channel, "text": status}
        if thread_ts:
            post_args["thread_ts"] = thread_ts
        result = client.chat_postMessage(**post_args)
        message_ts = result["ts"]
        if not thread_ts:
            thread_ts = message_ts
    except Exception as e:
        print(f"[ERROR] Failed to post status message: {e}", flush=True)
        return

    t = threading.Thread(
        target=run_claudebox,
        args=(channel, thread_ts, message_ts, script_name, prompt, thread_context),
        daemon=True,
    )
    t.start()


# ── App mention handler (works in threads) ──────────────────────
@app.event("app_mention")
def handle_mention(event, client, say):
    channel = event["channel"]
    text = event.get("text", "")
    thread_ts = event.get("thread_ts", event["ts"])

    print(f"[MENTION] channel={channel} text={text[:100]}", flush=True)

    cmd = re.sub(r"<@[A-Z0-9]+>\s*", "", text).strip()
    if not cmd:
        say(text="Usage: `@ClaudeBox <script> <prompt>` or `@ClaudeBox <prompt>`", thread_ts=thread_ts)
        return

    script_name, prompt = parse_command(cmd)
    thread_context = get_thread_context(client, channel, thread_ts)
    start_run(client, channel, thread_ts, script_name, prompt, thread_context)


# ── Slash command handler ────────────────────────────────────────
@app.command("/claudebox")
def handle_claudebox(ack, command, client):
    text = command.get("text", "").strip()
    channel = command["channel_id"]
    user = command["user_id"]

    print(f"[CMD] /claudebox from user={user} channel={channel} text={text}", flush=True)

    if not text:
        ack(text="Usage: `/claudebox <script> <prompt>` or `/claudebox <prompt>`")
        return

    script_name, prompt = parse_command(text)
    ack(text=f"ClaudeBox is starting `{script_name}`: _{truncate(prompt)}_")
    start_run(client, channel, None, script_name, prompt, "")


if __name__ == "__main__":
    print("ClaudeBox Slack listener starting (Socket Mode)...")
    handler = SocketModeHandler(app, SLACK_APP_TOKEN)
    handler.start()
