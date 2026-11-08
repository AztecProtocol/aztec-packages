#!/usr/bin/env bash
set -euo pipefail

# check_orphaned_urls - Catch previously-published URLs that no longer resolve.
#
# Fetches a baseline sitemap (defaults to https://docs.aztec.network/sitemap.xml)
# and, for every URL in it, confirms either:
#   (a) the path still resolves to a doc file in the current build, OR
#   (b) a [[redirects]] rule in netlify.toml matches it.
#
# Each docs instance root, and each folder its sidebar autogenerates, serves no
# page and so is in no sitemap; it is checked the same way.
#
# Any URL that satisfies neither is reported as orphaned. This is the inverse
# of validate_redirect_targets.sh: that script confirms redirect *targets* are
# valid, this one confirms previously-published URLs are still reachable.
#
# Usage:
#   check_orphaned_urls.sh [baseline]
#
# Arguments:
#   baseline - URL or local path to the baseline. May be either an XML sitemap
#              or a plain text list of URLs/paths (one per line, # for
#              comments). Defaults to https://docs.aztec.network/sitemap.xml.
#
# Recommended workflows:
#   1. Commit a snapshot of a known-good sitemap (e.g. snapshots/sitemap-vN.xml)
#      and check against it on every PR.
#   2. In CI, fetch the previous deploy's sitemap and run this script before
#      promoting a new deploy.
#
# Environment:
#   FAIL_ON_ORPHAN  - if "1", exit 1 when orphans are found (default: "0", warn only)
#   IGNORE_PATTERNS - colon-separated extended regex patterns of URL paths to
#                     skip. Defaults skip tag pages and API reference pages,
#                     which are auto-generated and routinely churn.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(dirname "$SCRIPT_DIR")"
NETLIFY_TOML="$DOCS_ROOT/netlify.toml"
SITEMAP_SOURCE="${1:-https://docs.aztec.network/sitemap.xml}"

FAIL_ON_ORPHAN="${FAIL_ON_ORPHAN:-0}"
DEFAULT_IGNORE="^/developers/tags(/|$):^/operate/tags(/|$):^/aztec-nr-api/:^/typescript-api/:^/search/?$"
IGNORE_PATTERNS="${IGNORE_PATTERNS:-$DEFAULT_IGNORE}"

if [[ ! -f "$NETLIFY_TOML" ]]; then
  echo "ERROR: netlify.toml not found at $NETLIFY_TOML" >&2
  exit 1
fi

echo "Checking for orphaned URLs..."
echo "  Baseline sitemap: $SITEMAP_SOURCE"
echo "  netlify.toml:     $NETLIFY_TOML"

# shellcheck source-path=SCRIPTDIR source=lib/docs_routes.sh
source "$SCRIPT_DIR/lib/docs_routes.sh"
docs_routes_init

# Load baseline. Two supported formats:
#   - XML sitemap (starts with <?xml or contains <urlset)
#   - Plain text, one URL or path per line (committed snapshot)
SITEMAP_RAW=""
if [[ "$SITEMAP_SOURCE" =~ ^https?:// ]]; then
  SITEMAP_RAW=$(curl -fsSL "$SITEMAP_SOURCE")
else
  if [[ ! -f "$SITEMAP_SOURCE" ]]; then
    echo "ERROR: local baseline file not found at $SITEMAP_SOURCE" >&2
    exit 1
  fi
  SITEMAP_RAW=$(<"$SITEMAP_SOURCE")
fi

if [[ "${SITEMAP_RAW:0:200}" == *"<?xml"* || "${SITEMAP_RAW:0:200}" == *"<urlset"* ]]; then
  SITEMAP_URLS=()
  while IFS= read -r line; do SITEMAP_URLS+=("$line"); done < <(echo "$SITEMAP_RAW" \
    | grep -oE "<loc>[^<]+</loc>" \
    | sed -E 's|<loc>https?://[^/]+||; s|</loc>||')
else
  # Plain list: strip blank/comment lines and any host prefix
  SITEMAP_URLS=()
  while IFS= read -r line; do SITEMAP_URLS+=("$line"); done < <(echo "$SITEMAP_RAW" \
    | sed -E 's|^https?://[^/]+||' \
    | grep -E '^/' \
    | grep -v '^[[:space:]]*#')
fi

if [[ ${#SITEMAP_URLS[@]} -eq 0 ]]; then
  echo "WARNING: no URLs found in sitemap." >&2
  exit 0
fi

echo "  URLs in sitemap:  ${#SITEMAP_URLS[@]}"

# Read from the literal routeBasePath/sidebarPath of each instance in docusaurus.config.js; the dev
# lines (computed, preview-only) have neither. A cut version's root is left out:
# validate_redirect_targets.sh rejects its landing as a target.
INSTANCE_ROOTS=()
while read -r base sidebar; do
  prefix="${base#/}"
  if [[ -z "$sidebar" ]]; then
    INSTANCE_ROOTS+=("/$prefix")
    continue
  fi
  while IFS= read -r dir; do INSTANCE_ROOTS+=("/${prefix:+$prefix/}$dir"); done < <(
    sed -nE 's/^[[:space:]]*dirName:[[:space:]]*"([^"]+)".*/\1/p' "$DOCS_ROOT/$sidebar")
done < <(awk '
  match($0, /routeBasePath: "[^"]*"/) { base = substr($0, RSTART + 16, RLENGTH - 17); print base }
  base != "" && match($0, /sidebarPath: "[^"]*"/) { s = substr($0, RSTART + 14, RLENGTH - 15); sub(/^\.\//, "", s); print base, s; base = "" }
' "$DOCS_ROOT/docusaurus.config.js")
if [[ ${#INSTANCE_ROOTS[@]} -eq 0 ]]; then
  echo "ERROR: no docs instance routeBasePath found in docusaurus.config.js" >&2
  exit 1
fi
echo "  Instance roots:   ${#INSTANCE_ROOTS[@]}"
SITEMAP_URLS+=("${INSTANCE_ROOTS[@]}")

echo "  Redirect rules:   ${#REDIRECT_FROMS[@]}"

# Build ignore regex (alt-pattern)
IFS=':' read -ra IGNORE_ARR <<< "$IGNORE_PATTERNS"
IGNORE_REGEX=""
for p in "${IGNORE_ARR[@]}"; do
  [[ -z "$p" ]] && continue
  if [[ -z "$IGNORE_REGEX" ]]; then
    IGNORE_REGEX="$p"
  else
    IGNORE_REGEX="$IGNORE_REGEX|$p"
  fi
done

ORPHANS=()
RESOLVED=0
REDIRECTED=0
IGNORED=0

for url_path in "${SITEMAP_URLS[@]}"; do
  # Skip empties and ignored families
  [[ -z "$url_path" ]] && continue
  if [[ -n "$IGNORE_REGEX" ]] && [[ "$url_path" =~ $IGNORE_REGEX ]]; then
    IGNORED=$((IGNORED + 1))
    continue
  fi

  if resolves_locally "$url_path"; then
    RESOLVED=$((RESOLVED + 1))
    continue
  fi

  if matches_any_redirect "$url_path"; then
    REDIRECTED=$((REDIRECTED + 1))
    continue
  fi

  ORPHANS+=("$url_path")
done

echo ""
echo "Results:"
echo "  Resolved locally: $RESOLVED"
echo "  Matched redirect: $REDIRECTED"
echo "  Ignored:          $IGNORED"
echo "  Orphaned:         ${#ORPHANS[@]}"

if [[ ${#ORPHANS[@]} -gt 0 ]]; then
  echo ""
  echo "Orphaned URLs (published previously or an instance root, but no current route and no redirect):"
  for u in "${ORPHANS[@]}"; do
    echo "  - $u"
  done
  echo ""
  echo "Fix by either restoring the page or adding a [[redirects]] block in netlify.toml."
  if [[ "$FAIL_ON_ORPHAN" == "1" ]]; then
    exit 1
  fi
fi

exit 0
