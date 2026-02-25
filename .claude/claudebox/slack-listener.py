#!/usr/bin/env python3
"""
ClaudeBox Slack listener.

Runs via Socket Mode (persistent WebSocket, no public URL, no polling).
Supports two triggers:
  1. @ClaudeBox <prompt>  (app_mention — works in threads)
  2. /claudebox <prompt>  (slash command — works anywhere)

Routing:
  - /script prompt → run named script (e.g., /new-pr, /default)
  - /command prompt → if not a script, pass /command to Claude as a skill
  - ci.aztec-labs.com URL or bare hex hash → reply to that session
  - In a thread with a previous ClaudeBox session → resume that session
  - Otherwise → run the "default" script
"""

import glob as glob_mod
import json
import logging
import os
import re
import subprocess
import threading

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

logging.basicConfig(level=logging.INFO)

SLACK_BOT_TOKEN = os.environ["SLACK_BOT_TOKEN"]
SLACK_APP_TOKEN = os.environ["SLACK_APP_TOKEN"]
REPO_DIR = os.environ.get("CLAUDE_REPO_DIR", os.path.expanduser("~/aztec-packages"))
SCRIPTS_DIR = os.path.join(REPO_DIR, ".claude", "scripts")
SESSIONS_DIR = os.path.join(REPO_DIR, ".claude", "claudebox", "sessions")
DEFAULT_SCRIPT = "default"

app = App(token=SLACK_BOT_TOKEN, logger=logging.getLogger("bolt"))


# ── Session lookup ───────────────────────────────────────────────

def find_last_session_in_thread(slack_channel, slack_thread_ts):
    """Find the most recent ClaudeBox session for a Slack thread."""
    candidates = []
    for path in glob_mod.glob(os.path.join(SESSIONS_DIR, "*.json")):
        try:
            with open(path) as f:
                s = json.load(f)
            if s.get("slack_channel") == slack_channel and s.get("slack_thread_ts") == slack_thread_ts:
                s["_log_id"] = os.path.basename(path).replace(".json", "")
                candidates.append(s)
        except (json.JSONDecodeError, IOError):
            pass

    if not candidates:
        return None
    candidates.sort(key=lambda x: x.get("started", ""), reverse=True)
    return candidates[0]


def find_session_by_hash(log_hash):
    """Find a session by its log_id hash."""
    path = os.path.join(SESSIONS_DIR, f"{log_hash}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            s = json.load(f)
        s["_log_id"] = log_hash
        return s
    except (json.JSONDecodeError, IOError):
        return None


def extract_hash_from_url(text):
    """Extract log hash from a ci.aztec-labs.com URL, or return None."""
    m = re.match(r"<?https?://ci\.aztec-labs\.com/([a-f0-9]+)>?", text)
    return m.group(1) if m else None


# ── Command parsing ──────────────────────────────────────────────

def parse_command(text):
    """Parse text into a command type and data.

    Returns: (cmd_type, data) where cmd_type is one of:
      - "script": data = (script_name, prompt)  — /foo matched a script file
      - "command": data = (slash_cmd, prompt)    — /foo didn't match, pass to Claude
      - "reply-hash": data = (log_hash, prompt)  — reply to specific session
      - "freeform": data = prompt                — reply in thread or new default
    """
    parts = text.split(None, 1)
    if not parts:
        return "freeform", ""

    first = parts[0]
    rest = parts[1] if len(parts) > 1 else ""

    # Check for ci.aztec-labs.com URL → reply to that session
    log_hash = extract_hash_from_url(first)
    if log_hash:
        return "reply-hash", (log_hash, rest)

    # Check for bare hex hash (32 chars) matching a session → reply
    if re.match(r"^[a-f0-9]{32}$", first) and find_session_by_hash(first):
        return "reply-hash", (first, rest)

    # /foo → script if file exists, otherwise Claude command
    if first.startswith("/"):
        cmd_name = first[1:]  # strip leading /
        script_path = os.path.join(SCRIPTS_DIR, cmd_name)
        if os.path.isfile(script_path):
            return "script", (cmd_name, rest)
        return "command", (first, rest)

    # Everything else is freeform (reply in thread, or new default session)
    return "freeform", text


# ── Thread context ───────────────────────────────────────────────

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


# ── Run helpers ──────────────────────────────────────────────────

def truncate(text, max_len=80):
    """Truncate text for display."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def spawn_entrypoint(cmd, stdin_text):
    """Run entrypoint and log results."""
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


def start_new_session(client, channel, thread_ts, script_name, prompt, thread_context, user_name=""):
    """Post status and spawn a new ClaudeBox session."""
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
        print(f"[ERROR] Failed to post status: {e}", flush=True)
        return

    def _run():
        cmd = [
            os.path.expanduser("~/claudeentry.sh"),
            script_name,
            f"--slack-channel={channel}",
            f"--slack-thread-ts={thread_ts}",
            f"--slack-message-ts={message_ts}",
        ]
        if user_name:
            cmd.append(f"--user={user_name}")

        stdin_text = ""
        if thread_context:
            stdin_text += f"Slack thread context:\n{thread_context}\n\n"
        if prompt:
            stdin_text += prompt

        spawn_entrypoint(cmd, stdin_text)

    threading.Thread(target=_run, daemon=True).start()


def start_reply_session(client, channel, thread_ts, message, session, user_name=""):
    """Post status and spawn a reply (resume) session."""
    claude_session_id = session.get("claude_session_id")
    prev_log_url = session.get("log_url", "")
    prev_worktree = session.get("worktree", "")
    prev_script = session.get("script", DEFAULT_SCRIPT)

    status = "ClaudeBox running, treating your message as a reply"
    if message:
        status += f": _{truncate(message)}_"
    status += " ..."

    try:
        post_args = {"channel": channel, "text": status}
        if thread_ts:
            post_args["thread_ts"] = thread_ts
        result = client.chat_postMessage(**post_args)
        message_ts = result["ts"]
    except Exception as e:
        print(f"[ERROR] Failed to post reply status: {e}", flush=True)
        return

    def _run():
        cmd = [
            os.path.expanduser("~/claudeentry.sh"),
            prev_script,
            f"--slack-channel={channel}",
            f"--slack-thread-ts={thread_ts}",
            f"--slack-message-ts={message_ts}",
            f"--resume-session-id={claude_session_id}",
        ]
        if prev_log_url:
            cmd.append(f"--prev-log-url={prev_log_url}")
        if prev_worktree:
            cmd.append(f"--prev-worktree={prev_worktree}")
        if user_name:
            cmd.append(f"--user={user_name}")

        spawn_entrypoint(cmd, message)

    threading.Thread(target=_run, daemon=True).start()


# ── Resolve user ─────────────────────────────────────────────────

def resolve_user_name(client, user_id):
    """Resolve Slack user ID to real name."""
    try:
        info = client.users_info(user=user_id)
        return info["user"].get("real_name", user_id)
    except Exception:
        return user_id


# ── App mention handler (works in threads) ──────────────────────

@app.event("app_mention")
def handle_mention(event, client, say):
    channel = event["channel"]
    text = event.get("text", "")
    thread_ts = event.get("thread_ts", event["ts"])

    print(f"[MENTION] channel={channel} text={text[:100]}", flush=True)

    cmd = re.sub(r"<@[A-Z0-9]+>\s*", "", text).strip()
    if not cmd:
        say(text="Usage: `@ClaudeBox /script <prompt>` or `@ClaudeBox <message>`", thread_ts=thread_ts)
        return

    user_name = resolve_user_name(client, event.get("user", ""))
    cmd_type, data = parse_command(cmd)

    if cmd_type == "reply-hash":
        log_hash, message = data
        session = find_session_by_hash(log_hash)
        if not session:
            say(text=f"Session `{log_hash}` not found.", thread_ts=thread_ts)
            return
        if not session.get("claude_session_id"):
            say(text=f"Session `{log_hash}` has no Claude session ID (older session).", thread_ts=thread_ts)
            return
        print(f"[REPLY-HASH] Resuming session {log_hash}", flush=True)
        start_reply_session(client, channel, thread_ts, message, session, user_name)
        return

    if cmd_type == "script":
        script_name, prompt = data
        thread_context = get_thread_context(client, channel, thread_ts)
        start_new_session(client, channel, thread_ts, script_name, prompt, thread_context, user_name)
        return

    if cmd_type == "command":
        # /foo didn't match a script — pass it to Claude as a skill/command
        slash_cmd, prompt = data
        full_prompt = f"{slash_cmd} {prompt}".strip()
        thread_context = get_thread_context(client, channel, thread_ts)
        start_new_session(client, channel, thread_ts, DEFAULT_SCRIPT, full_prompt, thread_context, user_name)
        return

    # freeform: check if there's a previous session in this thread to resume
    prompt = data
    prev_session = find_last_session_in_thread(channel, thread_ts)
    if prev_session and prev_session.get("claude_session_id"):
        print(f"[REPLY] Resuming last session in thread: {prev_session.get('_log_id')}", flush=True)
        start_reply_session(client, channel, thread_ts, prompt, prev_session, user_name)
    else:
        # No previous session — start fresh with default script
        thread_context = get_thread_context(client, channel, thread_ts)
        start_new_session(client, channel, thread_ts, DEFAULT_SCRIPT, prompt, thread_context, user_name)


# ── Slash command handler ────────────────────────────────────────

@app.command("/claudebox")
def handle_claudebox(ack, command, client):
    text = command.get("text", "").strip()
    channel = command["channel_id"]
    user = command["user_id"]

    print(f"[CMD] /claudebox from user={user} channel={channel} text={text}", flush=True)

    if not text:
        ack(text="Usage: `/claudebox /script <prompt>` or `/claudebox <prompt>`")
        return

    user_name = resolve_user_name(client, user)
    cmd_type, data = parse_command(text)

    if cmd_type == "script":
        script_name, prompt = data
        ack(text=f"ClaudeBox starting `/{script_name}`: _{truncate(prompt)}_")
        start_new_session(client, channel, None, script_name, prompt, "", user_name)
    elif cmd_type == "command":
        slash_cmd, prompt = data
        full_prompt = f"{slash_cmd} {prompt}".strip()
        ack(text=f"ClaudeBox starting: _{truncate(full_prompt)}_")
        start_new_session(client, channel, None, DEFAULT_SCRIPT, full_prompt, "", user_name)
    else:
        prompt = data if cmd_type == "freeform" else f"{data[0]} {data[1]}"
        ack(text=f"ClaudeBox starting: _{truncate(prompt)}_")
        start_new_session(client, channel, None, DEFAULT_SCRIPT, prompt, "", user_name)


if __name__ == "__main__":
    print("ClaudeBox Slack listener starting (Socket Mode)...")
    handler = SocketModeHandler(app, SLACK_APP_TOKEN)
    handler.start()
