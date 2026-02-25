#!/usr/bin/env bash
# stream-session.sh - Parse and pretty-print Claude session JSONL for CI output
#
# Usage: stream-session.sh <worktree-name>
#
# Finds the session file for the given worktree in ~/.claude/projects/,
# parses JSONL line-by-line, and pretty-prints to stdout.
# Polls for new session files and switches to them automatically.
# Runs until killed by the parent process.

set -uo pipefail

WORKTREE_NAME="${1:?Usage: stream-session.sh <worktree-name>}"
REPO_DIR="${CLAUDE_REPO_DIR:-$HOME/aztec-packages}"

# Compute the encoded project path for the worktree
WORKTREE_PATH="$REPO_DIR/.claude/worktrees/$WORKTREE_NAME"
# Claude encodes paths: / and . become -, leading - is kept
ENCODED_PATH=$(echo "$WORKTREE_PATH" | tr '/.' '-')
PROJECT_DIR="$HOME/.claude/projects/$ENCODED_PATH"

# ANSI colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RED='\033[0;31m'
RESET='\033[0m'

log_info() { echo -e "${CYAN}[stream]${RESET} $*"; }

# Wait for the project directory to appear
log_info "Waiting for session directory..."
WAIT_COUNT=0
while [ ! -d "$PROJECT_DIR" ]; do
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    if [ "$WAIT_COUNT" -ge 120 ]; then
        echo -e "${RED}ERROR: Session directory never appeared after 120s${RESET}" >&2
        exit 1
    fi
done
log_info "Session directory found."

# Inline Python pretty-printer
PRETTY_PRINTER=$(cat <<'PYEOF'
import json, sys
from datetime import datetime

C = "\033[0;36m"; G = "\033[0;32m"; Y = "\033[0;33m"; R = "\033[0;31m"
GR = "\033[0;90m"; B = "\033[1m"; D = "\033[2m"; X = "\033[0m"

def trunc(s, n=500):
    return s if len(s) <= n else s[:n] + f" ...({len(s)-n} more)"

def ts(t):
    try: return datetime.fromisoformat(t.replace("Z","+00:00")).strftime("%H:%M:%S")
    except: return ""

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
    except:
        continue

    t = d.get("type","")
    stamp = ts(d.get("timestamp",""))
    p = f"{GR}[{stamp}]{X} " if stamp else ""

    if t in ("progress","queue-operation","file-history-snapshot"):
        continue

    if t == "user":
        msg = d.get("message",{})
        content = msg.get("content","")
        if isinstance(content, str):
            print(f"\n{p}{B}{C}USER:{X} {trunc(content,300)}")
        elif isinstance(content, list):
            for item in content:
                if item.get("type") == "tool_result":
                    tid = item.get("tool_use_id","")[:12]
                    res = item.get("content","")
                    err = item.get("is_error", False)
                    if isinstance(res, list):
                        res = "\n".join(r.get("text","") for r in res if r.get("type")=="text")
                    elif not isinstance(res, str):
                        res = str(res)
                    color = R if err else G
                    label = "ERROR" if err else "RESULT"
                    disp = trunc(res, 800).replace("\n","\n    ")
                    print(f"{p}  {color}{label}{X} {GR}({tid}){X}")
                    if disp.strip():
                        print(f"    {disp}")
                elif item.get("type") == "text":
                    txt = item.get("text","")
                    if txt.strip():
                        print(f"{p}{B}{C}USER:{X} {trunc(txt,300)}")

    elif t == "assistant":
        msg = d.get("message",{})
        content = msg.get("content",[])
        usage = msg.get("usage",{})
        itok = usage.get("input_tokens",0)
        otok = usage.get("output_tokens",0)
        if not isinstance(content, list):
            continue
        for item in content:
            it = item.get("type","")
            if it == "text":
                txt = item.get("text","")
                if txt.strip():
                    print(f"\n{p}{B}{G}CLAUDE:{X}")
                    for ln in txt.split("\n"):
                        print(f"  {ln}")
            elif it == "tool_use":
                name = item.get("name","?")
                inp = item.get("input",{})
                if name == "Bash":
                    cmd = inp.get("command","")
                    desc = inp.get("description","")
                    print(f"\n{p}{Y}TOOL:{X} {B}{name}{X} {GR}{desc}{X}")
                    print(f"  {D}$ {trunc(cmd,400)}{X}")
                elif name in ("Edit","Write"):
                    print(f"\n{p}{Y}TOOL:{X} {B}{name}{X} {inp.get('file_path','')}")
                elif name in ("Read","Glob","Grep"):
                    fp = inp.get("file_path", inp.get("path", inp.get("pattern","")))
                    extra = f" pattern={inp.get('pattern','')}" if name == "Grep" else ""
                    print(f"\n{p}{Y}TOOL:{X} {B}{name}{X} {fp}{extra}")
                elif name == "Task":
                    print(f"\n{p}{Y}TOOL:{X} {B}Task({inp.get('subagent_type','')}){X} {inp.get('description','')}")
                else:
                    print(f"\n{p}{Y}TOOL:{X} {B}{name}{X} {GR}{trunc(json.dumps(inp),200)}{X}")
        if itok or otok:
            print(f"  {D}tokens: in={itok} out={otok}{X}")

    elif t == "summary":
        print(f"\n{p}{GR}[session summary]{X}")

    sys.stdout.flush()
PYEOF
)

# Poll and stream session files
CURRENT_FILE=""
CURRENT_LINE=0

log_info "Streaming session output..."
echo -e "\n${BOLD}${GREEN}━━━ Claude Session Output ━━━${RESET}"

while true; do
    # Find newest .jsonl in project dir
    NEWEST_FILE=$(find "$PROJECT_DIR" -maxdepth 1 -name "*.jsonl" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

    if [ -z "$NEWEST_FILE" ]; then
        sleep 1
        continue
    fi

    if [ "$NEWEST_FILE" != "$CURRENT_FILE" ]; then
        if [ -n "$CURRENT_FILE" ]; then
            log_info "New session file detected, switching..."
        fi
        CURRENT_FILE="$NEWEST_FILE"
        CURRENT_LINE=0
        log_info "Streaming: $(basename "$CURRENT_FILE")"
    fi

    TOTAL_LINES=$(wc -l < "$CURRENT_FILE" 2>/dev/null || echo 0)

    if [ "$TOTAL_LINES" -gt "$CURRENT_LINE" ]; then
        tail -n +"$((CURRENT_LINE + 1))" "$CURRENT_FILE" | head -n "$((TOTAL_LINES - CURRENT_LINE))" | python3 -c "$PRETTY_PRINTER"
        CURRENT_LINE=$TOTAL_LINES
    fi

    sleep 0.5
done
