#!/usr/bin/env bash
set -euo pipefail

# refresh_url_snapshot - Regenerate docs/snapshots/published-urls.txt from the
# live sitemap, preserving the header comment.
#
# CI reads the baseline from the BASE branch (see docs/bootstrap.sh), so a PR
# cannot shrink the protected set by editing this file. That means you do NOT
# need to touch the snapshot when retiring a page — just add the redirect and
# the gate passes against the base-branch baseline. Run this only to register
# newly published pages into the protected set (e.g. periodically, or after
# adding a section), so future PRs can't silently delete them.
#
# Usage: scripts/refresh_url_snapshot.sh [sitemap_url]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(dirname "$SCRIPT_DIR")"
SNAPSHOT="$DOCS_ROOT/snapshots/published-urls.txt"
SITEMAP_URL="${1:-https://docs.aztec.network/sitemap.xml}"

urls=$(curl -fsSL "$SITEMAP_URL" \
  | grep -oE "<loc>[^<]+</loc>" \
  | sed -E 's|<loc>https?://[^/]+||; s|</loc>||' \
  | grep -vE '^/(aztec-nr-api|typescript-api|search)(/|$)' \
  | grep -vE '^/(developers|operate)/tags(/|$)' \
  | sort -u)

if [[ -z "$urls" ]]; then
  echo "ERROR: no URLs extracted from $SITEMAP_URL" >&2
  exit 1
fi

{
  echo "# Snapshot of URLs published on docs.aztec.network as of $(date -u +%Y-%m-%d)."
  echo "# Used by scripts/check_orphaned_urls.sh in CI to detect pages removed without redirects."
  echo "#"
  echo "# Only narrative/authored pages are tracked here. Auto-generated rustdoc"
  echo "# (/aztec-nr-api/*), typescript API (/typescript-api/*), tag pages, and"
  echo "# /search are excluded — they regenerate from source and aren't subject"
  echo "# to the 'delete-without-redirect' failure mode this guard exists to catch."
  echo "#"
  echo "# Regenerate with scripts/refresh_url_snapshot.sh (do not hand-edit)."
  echo "#"
  echo "# Lines starting with # are ignored by the checker."
  echo "$urls"
} > "$SNAPSHOT"

echo "Wrote $(echo "$urls" | wc -l | tr -d ' ') URLs to $SNAPSHOT"
