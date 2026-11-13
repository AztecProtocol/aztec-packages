#!/usr/bin/env bash
# Types a tutorial page's commands and files, as the site renders it, in an empty folder, the way its
# spec in scripts/page_tests.mts says. It proves a reader who follows the page gets a working build
# with the versions the page names, on the page's own line.
#
# Usage: scripts/page_transcript_test.sh <page>, a path relative to the repository root.
# Needs NARGO, BB and AZTEC from the pinned toolchain of the page's line (`aztec_node.mts [--line <line>]
# env`), and network access to npm and GitHub.
set -euo pipefail

: "${NARGO:?}" "${BB:?}" "${AZTEC:?}"
page=${1:?usage: scripts/page_transcript_test.sh <page>}
repo_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
start=$(date +%s)

mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"
parent=$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/aztec-page-transcript.XXXXXX")
reader=
# The reader runs in a session of its own, so a timeout that signals this script's process group
# reaches it only through this trap, which stops the whole reader group, and anything a page left
# running in it, before removing its folder.
function cleanup {
  if [ -n "$reader" ]; then
    kill -TERM -- "-$reader" 2>/dev/null || true
    wait "$reader" 2>/dev/null || true
  fi
  rm -rf "$parent"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir "$parent/bin" "$parent/reader"
ln -s "$AZTEC" "$parent/bin/aztec"
ln -s "$NARGO" "$parent/bin/nargo"

(cd "$repo_root" && node docs/scripts/page_transcript.mts script "$page" "$parent/transcript.sh")

# Environment hygiene, not isolation: nothing from this shell (tokens, npm and yarn config, caches)
# reaches the reader's commands, and HOME in the parent starts git's, nargo's and yarn's caches empty.
# The downloaded tools still run with this machine's access. A background job of a non-interactive
# shell leads no process group, so setsid starts the new session in place and $! names its group.
(cd "$parent/reader" && exec setsid env -i PATH="$parent/bin:$PATH" HOME="$parent" NARGO="$NARGO" BB="$BB" AZTEC="$AZTEC" \
  TRANSCRIPT_DONE="$parent/done" YARN_ENABLE_IMMUTABLE_INSTALLS=false PUPPETEER_SKIP_DOWNLOAD=1 \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash "$parent/transcript.sh" </dev/null) &
reader=$!
status=0
wait "$reader" || status=$?
[ "$status" -eq 0 ] || exit "$status"
[ "$(cat "$parent/done" 2>/dev/null)" = "done" ] || { echo "$page: the transcript stopped before its last step" >&2; exit 1; }

echo "$page: the page's commands build from an empty folder ($(( $(date +%s) - start ))s)."
