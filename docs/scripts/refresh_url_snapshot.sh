#!/usr/bin/env bash
set -euo pipefail

# refresh_url_snapshot - Add the live sitemap's URLs to
# docs/snapshots/published-urls.txt. Every URL already listed is kept: a retired
# page stays protected, so its redirect stays required.
#
# CI reads the baseline from the BASE branch (see docs/bootstrap.sh), so a PR
# cannot shrink the protected set by editing this file. That means you do NOT
# need to touch the snapshot when retiring a page — just add the redirect and
# the gate passes against the base-branch baseline. Run this to register newly
# published pages into the protected set, so future PRs can't silently delete
# them; the release skills run it once a release is live in production.
#
# Usage: scripts/refresh_url_snapshot.sh [sitemap_url]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(dirname "$SCRIPT_DIR")"
SNAPSHOT="$DOCS_ROOT/snapshots/published-urls.txt"
SITEMAP_URL="${1:-https://docs.aztec.network/sitemap.xml}"

live=$(curl -fsSL "$SITEMAP_URL" \
  | grep -oE "<loc>[^<]+</loc>" \
  | sed -E 's|<loc>https?://[^/]+||; s|</loc>||' \
  | grep -vE '^/(aztec-nr-api|typescript-api|search)(/|$)' \
  | grep -vE '/tags(/|$)' \
  | sort -u)

if [[ -z "$live" ]]; then
  echo "ERROR: no URLs extracted from $SITEMAP_URL" >&2
  exit 1
fi

kept=""
[[ ! -f "$SNAPSHOT" ]] || kept=$(grep -vE '^[[:space:]]*(#|$)' "$SNAPSHOT" || true)
urls=$(printf '%s\n%s\n' "$kept" "$live" | grep -v '^$' | sort -u)

{
  echo "# URLs published on docs.aztec.network, last merged with the live sitemap on $(date -u +%Y-%m-%d)."
  echo "# Used by scripts/check_orphaned_urls.sh in CI to detect pages removed without redirects."
  echo "#"
  echo "# Only narrative/authored pages are tracked here. Auto-generated rustdoc"
  echo "# (/aztec-nr-api/*), typescript API (/typescript-api/*), tag pages, and"
  echo "# /search are excluded — they regenerate from source and aren't subject"
  echo "# to the 'delete-without-redirect' failure mode this guard exists to catch."
  echo "#"
  echo "# Refresh with scripts/refresh_url_snapshot.sh (do not hand-edit). A refresh"
  echo "# keeps every URL listed here, so a retired page stays protected."
  echo "#"
  echo "# Lines starting with # are ignored by the checker."
  echo "$urls"
} > "$SNAPSHOT"

total=$(wc -l <<<"$urls" | tr -d ' ')
before=$(grep -c . <<<"$kept" || true)
echo "Wrote $total URLs ($((total - before)) new) to $SNAPSHOT"
