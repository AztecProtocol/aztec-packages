#!/usr/bin/env python3
"""
ClaudeBox Slack listener.

Runs via Socket Mode (persistent WebSocket, no public URL, no polling).
When someone @mentions the bot, it:
1. Fetches the full thread for context
2. Posts a "working on it" reply
3. Spawns claudeentry.sh with the thread context and request
"""

import os
import re
import subprocess
import threading

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

SLACK_BOT_TOKEN = os.environ["SLACK_BOT_TOKEN"]
SLACK_APP_TOKEN = os.environ["SLACK_APP_TOKEN"]

app = App(token=SLACK_BOT_TOKEN)


def get_thread_context(client, channel, thread_ts):
    """Fetch all messages in a thread and format as context."""
    if not thread_ts:
        return ""

    result = client.conversations_replies(channel=channel, ts=thread_ts, limit=50)
    messages = result.get("messages", [])

    # Look up user names for readability
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
        # Strip bot mention from text for cleaner context
        text = re.sub(r"<@[A-Z0-9]+>", "", text).strip()
        if text:
            lines.append(f"{user}: {text}")

    return "\n".join(lines)


def run_claudebox(channel, thread_ts, message_ts, script_name, prompt, thread_context):
    """Spawn claudeentry.sh in a subprocess."""
    cmd = [
        os.path.expanduser("~/claudeentry.sh"),
        script_name,
        f"--slack-channel={channel}",
        f"--slack-thread-ts={thread_ts}",
        f"--slack-message-ts={message_ts}",
    ]

    # Build stdin: thread context + user prompt
    stdin_text = ""
    if thread_context:
        stdin_text += f"Slack thread context:\n{thread_context}\n\n"
    if prompt:
        stdin_text += prompt

    subprocess.run(
        cmd,
        input=stdin_text,
        text=True,
        env={**os.environ, "CLAUDECODE": ""},
    )


@app.event("app_mention")
def handle_mention(event, client, say):
    channel = event["channel"]
    text = event.get("text", "")
    user = event.get("user", "")
    # Thread ts: if this is in a thread, use the thread; otherwise this message starts one
    thread_ts = event.get("thread_ts", event["ts"])

    # Strip the bot mention to get the command
    cmd = re.sub(r"<@[A-Z0-9]+>\s*", "", text).strip()
    if not cmd:
        say(text="Usage: `@ClaudeBox <script> <prompt>`", thread_ts=thread_ts)
        return

    # Parse: first word = script name, rest = prompt
    parts = cmd.split(None, 1)
    script_name = parts[0]
    prompt = parts[1] if len(parts) > 1 else ""

    # Validate script exists
    repo_dir = os.environ.get("CLAUDE_REPO_DIR", os.path.expanduser("~/aztec-packages"))
    script_path = os.path.join(repo_dir, ".claude", "scripts", script_name)
    if not os.path.isfile(script_path):
        scripts = [
            f
            for f in os.listdir(os.path.join(repo_dir, ".claude", "scripts"))
            if not f.endswith(".py")
        ]
        say(
            text=f"Unknown script `{script_name}`. Available: {', '.join(f'`{s}`' for s in scripts)}",
            thread_ts=thread_ts,
        )
        return

    # Fetch thread context
    thread_context = get_thread_context(client, channel, thread_ts)

    # Post "working on it" reply
    result = say(text=f"ClaudeBox is running `{script_name}`...", thread_ts=thread_ts)
    message_ts = result["ts"]

    # Run in background thread so we don't block the listener
    t = threading.Thread(
        target=run_claudebox,
        args=(channel, thread_ts, message_ts, script_name, prompt, thread_context),
        daemon=True,
    )
    t.start()


if __name__ == "__main__":
    print("ClaudeBox Slack listener starting (Socket Mode)...")
    handler = SocketModeHandler(app, SLACK_APP_TOKEN)
    handler.start()
