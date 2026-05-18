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
#   ./generate_operator_cli_ref.sh                # write to default target
#   ./generate_operator_cli_ref.sh /tmp/out.md    # write to custom target
#
# Run from any cwd — paths are resolved relative to the script location.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PREAMBLE="$SCRIPT_DIR/operator_cli_preamble.md"
DEFAULT_TARGET="$DOCS_ROOT/docs-operate/operators/reference/cli-reference.md"
TARGET="${1:-$DEFAULT_TARGET}"
MIN_LINES=900
MAX_ATTEMPTS=3

if [[ ! -f "$PREAMBLE" ]]; then
  echo "ERROR: preamble file not found at $PREAMBLE" >&2
  exit 1
fi

if ! command -v aztec >/dev/null 2>&1; then
  echo "ERROR: 'aztec' CLI not found on PATH. Install with aztec-up first." >&2
  exit 1
fi

HELP_FILE="$(mktemp)"
trap 'rm -f "$HELP_FILE"' EXIT

# Capture into a file (not a shell variable) to avoid mid-line truncation when
# the dockerized CLI's stdout closes before the parent flushes.
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  COLUMNS=200 aztec start --help >"$HELP_FILE" 2>&1
  LINES="$(wc -l < "$HELP_FILE")"
  LAST_LINE="$(tail -1 "$HELP_FILE")"

  # Full output is ~950 lines. Truncated output cuts mid-section at ~813
  # lines. A line count below the threshold is the reliable signal.
  if [[ "$LINES" -ge "$MIN_LINES" ]]; then
    break
  fi

  if [[ "$attempt" -lt "$MAX_ATTEMPTS" ]]; then
    echo "WARN: 'aztec start --help' returned $LINES lines (attempt $attempt/$MAX_ATTEMPTS), retrying..." >&2
    sleep 1
  else
    echo "ERROR: 'aztec start --help' kept producing truncated output after $MAX_ATTEMPTS attempts ($LINES lines)." >&2
    echo "       Last line: '${LAST_LINE:0:80}...'" >&2
    exit 1
  fi
done

TMP="$(mktemp)"
trap 'rm -f "$HELP_FILE" "$TMP"' EXIT

cat "$PREAMBLE" > "$TMP"
echo '```bash' >> "$TMP"
cat "$HELP_FILE" >> "$TMP"
echo '```' >> "$TMP"

mv "$TMP" "$TARGET"
trap 'rm -f "$HELP_FILE"' EXIT

echo "Wrote $TARGET ($(wc -l < "$TARGET") lines)"
