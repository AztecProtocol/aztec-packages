#!/usr/bin/env bash
# Regenerate docs/docs-operate/operators/reference/cli-reference.md from the
# `aztec start --help` output of the locally-installed aztec CLI.
#
# Unlike the developer-facing CLI references (aztec, aztec-wallet, aztec-up),
# this file is a flag-list dump rather than a recursive command tree, so it
# bypasses scan_cli.py. The hand-curated frontmatter + intro live in a
# preamble file; this script concatenates the preamble with a fenced
# `aztec start --help` capture.
#
# NOTE: `aztec start --help` runs through the dockerized aztec wrapper which
# can drop trailing stdout when captured via `$(...)` subshell (container
# stdout closes before the parent flushes). Redirect to a file instead.
#
# Usage:
#   ./generate_operator_cli_ref.sh                          # default target, no version check
#   ./generate_operator_cli_ref.sh /tmp/out.md              # custom target
#   ./generate_operator_cli_ref.sh -v v4.3.0                # warn if installed CLI != v4.3.0
#   ./generate_operator_cli_ref.sh -v v4.3.0 -f             # force past version mismatch
#
# Options:
#   -v, --version <ver>   Warn if installed `aztec --version` does not match
#                         this target. In non-interactive mode the mismatch is
#                         fatal unless --force is passed.
#   -f, --force           Skip the version-mismatch confirmation prompt.
#
# Run from any cwd — paths are resolved relative to the script location.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PREAMBLE="$SCRIPT_DIR/operator_cli_preamble.md"
DEFAULT_TARGET="$DOCS_ROOT/docs-operate/operators/reference/cli-reference.md"
MAX_ATTEMPTS=3

TARGET=""
TARGET_VERSION=""
FORCE_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version)
      TARGET_VERSION="$2"
      shift 2
      ;;
    -f|--force)
      FORCE_MODE=true
      shift
      ;;
    -h|--help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "ERROR: unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$1"
        shift
      else
        echo "ERROR: unexpected extra positional argument: $1" >&2
        exit 1
      fi
      ;;
  esac
done
TARGET="${TARGET:-$DEFAULT_TARGET}"

if [[ ! -f "$PREAMBLE" ]]; then
  echo "ERROR: preamble file not found at $PREAMBLE" >&2
  exit 1
fi

if ! command -v aztec >/dev/null 2>&1; then
  echo "ERROR: 'aztec' CLI not found on PATH. Install with aztec-up first." >&2
  exit 1
fi

# Optional version check — mirrors the pattern used by generate_cli_docs.sh.
# Advisory: warns and either prompts or fails non-interactively. Bypassable
# with --force, since CI flows build a wrapper around a freshly-built CLI
# whose `--version` may not equal the target tag.
if [[ -n "$TARGET_VERSION" ]]; then
  INSTALLED_VER="$(aztec --version 2>/dev/null | head -n1 \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?' | head -n1 || true)"
  TARGET_NORMALIZED="${TARGET_VERSION#v}"

  if [[ "$INSTALLED_VER" != "$TARGET_NORMALIZED" ]]; then
    echo "" >&2
    echo "WARNING: aztec CLI version mismatch" >&2
    echo "  Installed: ${INSTALLED_VER:-unknown}" >&2
    echo "  Target:    $TARGET_NORMALIZED" >&2
    echo "  To fix:    aztec-up $TARGET_NORMALIZED" >&2
    echo "" >&2

    if [[ "$FORCE_MODE" == true ]]; then
      echo "Force mode enabled, continuing with mismatched version..." >&2
    elif [[ -t 0 ]]; then
      read -p "Continue anyway? (y/N): " -n 1 -r
      echo ""
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Install the matching CLI version and retry." >&2
        exit 1
      fi
    else
      echo "ERROR: version mismatch in non-interactive mode. Use --force to bypass." >&2
      exit 1
    fi
  else
    echo "CLI version check passed: aztec v$INSTALLED_VER"
  fi
fi

HELP_FILE="$(mktemp)"
TMP="$(mktemp)"
trap 'rm -f "$HELP_FILE" "$TMP"' EXIT

# Capture into a file (not a shell variable) to avoid mid-line truncation when
# the dockerized CLI's stdout closes before the parent flushes. Detect a
# successful capture by checking for the tail sentinel — the truncation drops
# the trailing TXE section, so its presence means stdout fully flushed.
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  COLUMNS=200 aztec start --help >"$HELP_FILE" 2>&1

  if grep -qE '^[[:space:]]*TXE[[:space:]]*$' "$HELP_FILE"; then
    break
  fi

  LINES="$(wc -l < "$HELP_FILE")"
  if [[ "$attempt" -lt "$MAX_ATTEMPTS" ]]; then
    echo "WARN: 'aztec start --help' output missing trailing TXE section (attempt $attempt/$MAX_ATTEMPTS, $LINES lines), retrying..." >&2
    sleep 1
  else
    echo "ERROR: 'aztec start --help' kept producing truncated output after $MAX_ATTEMPTS attempts ($LINES lines)." >&2
    echo "       Last line: '$(tail -1 "$HELP_FILE" | cut -c1-80)...'" >&2
    exit 1
  fi
done

cat "$PREAMBLE" > "$TMP"
echo '```bash' >> "$TMP"
cat "$HELP_FILE" >> "$TMP"
echo '```' >> "$TMP"

mv "$TMP" "$TARGET"

echo "Wrote $TARGET ($(wc -l < "$TARGET") lines)"
