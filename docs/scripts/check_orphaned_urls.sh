#!/usr/bin/env bash
set -euo pipefail

# check_orphaned_urls - Catch previously-published URLs that no longer resolve.
#
# Fetches a baseline sitemap (defaults to https://docs.aztec.network/sitemap.xml)
# and, for every URL in it, confirms either:
#   (a) the path still resolves to a doc file in the current build, OR
#   (b) a [[redirects]] rule in netlify.toml matches it.
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

# Determine default versions for resolving /developers/* and /operate/*
DEVELOPER_VERSION=""
NETWORK_VERSION=""
if [[ -f "$DOCS_ROOT/developer_versions.json" ]]; then
  DEVELOPER_VERSION=$(jq -r '.[0]' "$DOCS_ROOT/developer_versions.json")
fi
if [[ -f "$DOCS_ROOT/network_versions.json" ]]; then
  NETWORK_VERSION=$(jq -r '.[0]' "$DOCS_ROOT/network_versions.json")
fi

if [[ -n "$DEVELOPER_VERSION" ]] && [[ -d "$DOCS_ROOT/developer_versioned_docs/version-$DEVELOPER_VERSION" ]]; then
  DEVELOPER_DOCS_DIR="$DOCS_ROOT/developer_versioned_docs/version-$DEVELOPER_VERSION"
else
  DEVELOPER_DOCS_DIR="$DOCS_ROOT/docs-developers"
fi

if [[ -n "$NETWORK_VERSION" ]] && [[ -d "$DOCS_ROOT/network_versioned_docs/version-$NETWORK_VERSION" ]]; then
  OPERATE_DOCS_DIR="$DOCS_ROOT/network_versioned_docs/version-$NETWORK_VERSION"
else
  OPERATE_DOCS_DIR="$DOCS_ROOT/docs-operate"
fi

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
  mapfile -t SITEMAP_URLS < <(echo "$SITEMAP_RAW" \
    | grep -oE "<loc>[^<]+</loc>" \
    | sed -E 's|<loc>https?://[^/]+||; s|</loc>||')
else
  # Plain list: strip blank/comment lines and any host prefix
  mapfile -t SITEMAP_URLS < <(echo "$SITEMAP_RAW" \
    | sed -E 's|^https?://[^/]+||' \
    | grep -E '^/' \
    | grep -v '^[[:space:]]*#')
fi

if [[ ${#SITEMAP_URLS[@]} -eq 0 ]]; then
  echo "WARNING: no URLs found in sitemap." >&2
  exit 0
fi

echo "  URLs in sitemap:  ${#SITEMAP_URLS[@]}"

# Parse netlify.toml redirect `from` patterns, in declaration order.
# (Netlify processes redirects top-to-bottom, first match wins.)
mapfile -t REDIRECT_FROMS < <(grep -E '^\s*from\s*=' "$NETLIFY_TOML" \
  | sed -E 's/^\s*from\s*=\s*"([^"]+)".*/\1/')

echo "  Redirect rules:   ${#REDIRECT_FROMS[@]}"

# Convert a netlify `from` pattern into an extended-regex.
# Netlify supports two path placeholders:
#   *        — splat, matches any remaining path (including slashes)
#   :name    — named segment, matches one path segment (no slashes)
from_to_regex() {
  local pattern="$1"
  # Replace :name placeholders with a sentinel that won't collide with regex metachars.
  pattern=$(echo "$pattern" | sed -E 's@:[A-Za-z_][A-Za-z0-9_]*@\x01@g')
  # Escape regex metachars except * and our sentinel
  pattern=$(echo "$pattern" | sed -E 's/[][\\.^$+?{}()|]/\\&/g')
  pattern="${pattern//\*/.*}"
  pattern="${pattern//$'\x01'/[^/]+}"
  # Anchor; permit absent leading slash since some entries omit it
  if [[ "$pattern" != /* && "$pattern" != \\.* ]]; then
    pattern="/?$pattern"
  fi
  echo "^${pattern}$"
}

# Pre-compute regexes once
REDIRECT_REGEXES=()
for from in "${REDIRECT_FROMS[@]}"; do
  REDIRECT_REGEXES+=("$(from_to_regex "$from")")
done

# Note: this only confirms a redirect *rule* matches; it does NOT verify the
# rule's substituted target itself resolves. A wildcard rule pointing to a
# missing page will appear as "redirected" here but actually 404 in production.
# validate_redirect_targets.sh is the complementary check for non-wildcard
# targets; wildcard targets are not currently validated by either script.
matches_any_redirect() {
  local url_path="$1"
  for re in "${REDIRECT_REGEXES[@]}"; do
    if [[ "$url_path" =~ $re ]]; then
      return 0
    fi
  done
  return 1
}

# Local-file resolution. Mirrors validate_redirect_targets.sh check_file_or_id
# but trimmed to the path families that appear in the sitemap.
check_file_or_id() {
  local base_dir="$1"
  local sub_path="$2"

  if [[ -z "$sub_path" ]]; then
    [[ -f "$base_dir/index.md" || -f "$base_dir/index.mdx" ]] && return 0
    return 1
  fi

  for ext in md mdx; do
    [[ -f "$base_dir/${sub_path}.${ext}" ]] && return 0
  done

  if [[ -d "$base_dir/${sub_path}" ]]; then
    for ext in md mdx; do
      [[ -f "$base_dir/${sub_path}/index.${ext}" ]] && return 0
    done
  fi

  # Docusaurus id frontmatter fallback
  local parent_dir slug search_dir
  if [[ "$sub_path" == */* ]]; then
    parent_dir="${sub_path%/*}"
    slug="${sub_path##*/}"
    search_dir="$base_dir/$parent_dir"
  else
    parent_dir=""
    slug="$sub_path"
    search_dir="$base_dir"
  fi

  if [[ -d "$search_dir" ]]; then
    local file file_id
    for file in "$search_dir"/*.md "$search_dir"/*.mdx; do
      [[ -f "$file" ]] || continue
      file_id=$(sed -n '/^---$/,/^---$/{s/^id:[[:space:]]*//p}' "$file" | head -1)
      [[ "$file_id" == "$slug" ]] && return 0
    done
  fi

  return 1
}

resolves_locally() {
  local url_path="$1"

  # Strip fragment / trailing slash
  url_path="${url_path%%#*}"
  url_path="${url_path%/}"
  [[ -z "$url_path" ]] && url_path="/"

  if [[ "$url_path" == "/" ]]; then
    [[ -f "$DOCS_ROOT/docs/index.mdx" || -f "$DOCS_ROOT/docs/index.md" ]] && return 0
    return 1
  fi

  local clean="${url_path#/}"

  if [[ "$clean" =~ ^developers/docs/(.*) ]]; then
    check_file_or_id "$DEVELOPER_DOCS_DIR/docs" "${BASH_REMATCH[1]}" && return 0
    return 1
  fi
  if [[ "$clean" =~ ^developers/?$ ]]; then
    check_file_or_id "$DEVELOPER_DOCS_DIR" "" && return 0
    return 1
  fi
  if [[ "$clean" =~ ^developers/(.*) ]]; then
    check_file_or_id "$DEVELOPER_DOCS_DIR" "${BASH_REMATCH[1]}" && return 0
    return 1
  fi
  if [[ "$clean" =~ ^operate/?$ ]]; then
    check_file_or_id "$OPERATE_DOCS_DIR" "" && return 0
    return 1
  fi
  if [[ "$clean" =~ ^operate/(.*) ]]; then
    check_file_or_id "$OPERATE_DOCS_DIR" "${BASH_REMATCH[1]}" && return 0
    return 1
  fi
  if [[ "$clean" == "participate" ]]; then
    check_file_or_id "$DOCS_ROOT/docs-participate" "" && return 0
    return 1
  fi
  if [[ "$clean" =~ ^participate/(.*) ]]; then
    check_file_or_id "$DOCS_ROOT/docs-participate" "${BASH_REMATCH[1]}" && return 0
    return 1
  fi

  # Root-level pages (e.g. /aztec_connect_sunset)
  check_file_or_id "$DOCS_ROOT/docs" "$clean"
}

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
  echo "Orphaned URLs (published previously but no current route and no redirect):"
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
