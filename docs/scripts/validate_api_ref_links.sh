#!/usr/bin/env bash
set -euo pipefail

# validate_api_ref_links - Validate that markdown links to aztec-nr API reference resolve to actual files
#
# Scans processed-docs/ (current build content) and developer_versioned_docs/ (pinned snapshots)
# for pathname:///aztec-nr-api/ links (and JSX href variants) and checks that the target files
# exist in static/aztec-nr-api/. Uses case-insensitive matching since Netlify's CDN is
# case-insensitive, but warns about case mismatches.
#
# Usage: validate_api_ref_links.sh
#
# Exit code: Always 0 (warnings only) to avoid breaking builds initially.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(dirname "$SCRIPT_DIR")"
STATIC_API_DIR="$DOCS_ROOT/static/aztec-nr-api"

if [[ ! -d "$STATIC_API_DIR" ]]; then
  echo "WARNING: static/aztec-nr-api/ directory not found. Skipping API ref link validation."
  exit 0
fi

echo "Validating API reference links..."

# Collect directories to scan.
# 1. processed-docs/ — current docs with macros resolved (available during build after preprocess:move)
# 2. developer_versioned_docs/ — pinned version snapshots (macros already resolved at version time)
# We skip docs-developers/ source files because they contain unresolved #api_ref_version macros.
SEARCH_DIRS=()

# Processed docs (current build content — most important for catching regressions)
if [[ -d "$DOCS_ROOT/processed-docs" ]]; then
  SEARCH_DIRS+=("$DOCS_ROOT/processed-docs")
fi

# Versioned docs snapshots
for dir in "$DOCS_ROOT"/developer_versioned_docs/version-*; do
  [[ -d "$dir" ]] && SEARCH_DIRS+=("$dir")
done

if [[ ${#SEARCH_DIRS[@]} -eq 0 ]]; then
  echo "No docs directories found (no processed-docs/ or versioned docs). Skipping."
  exit 0
fi

echo "Scanning ${#SEARCH_DIRS[@]} docs directory(ies)..."

BROKEN_COUNT=0
CASE_MISMATCH_COUNT=0
TOTAL_COUNT=0

# Resolve a link path to a file in static/, case-insensitively.
# Args: $1 = path relative to static/ (e.g., aztec-nr-api/devnet/noir_aztec/state_vars/struct.publicmutable)
# Outputs: the matched filesystem path (if found), empty string if not
# Returns: 0 if found, 1 if not
resolve_static_path() {
  local rel_path="$1"

  # Try exact match first (fastest path)
  if [[ -f "$DOCS_ROOT/static/$rel_path" ]]; then
    echo "$DOCS_ROOT/static/$rel_path"
    return 0
  fi
  if [[ -f "$DOCS_ROOT/static/${rel_path}.html" ]]; then
    echo "$DOCS_ROOT/static/${rel_path}.html"
    return 0
  fi
  if [[ -f "$DOCS_ROOT/static/${rel_path}/index.html" ]]; then
    echo "$DOCS_ROOT/static/${rel_path}/index.html"
    return 0
  fi
  # Also try as-is if it's a directory with trailing slash
  if [[ -d "$DOCS_ROOT/static/$rel_path" ]] && [[ -f "$DOCS_ROOT/static/$rel_path/index.html" ]]; then
    echo "$DOCS_ROOT/static/$rel_path/index.html"
    return 0
  fi

  # Case-insensitive search: walk the path components
  local current_dir="$DOCS_ROOT/static"
  local IFS='/'
  # Split the path, trying .html on the last component
  local components
  read -ra components <<< "$rel_path"
  local last_idx=$(( ${#components[@]} - 1 ))

  for i in "${!components[@]}"; do
    local component="${components[$i]}"
    [[ -z "$component" ]] && continue

    local found=""
    # On the last component, also try with .html extension
    if [[ $i -eq $last_idx ]]; then
      # Try: exact, exact.html, exact/index.html (case-insensitive)
      for candidate in "$current_dir"/*; do
        [[ -e "$candidate" ]] || continue
        local basename
        basename=$(basename "$candidate")
        if [[ "${basename,,}" == "${component,,}" ]]; then
          if [[ -f "$candidate" ]]; then
            found="$candidate"
            break
          elif [[ -d "$candidate" ]] && [[ -f "$candidate/index.html" ]]; then
            found="$candidate/index.html"
            break
          fi
        fi
        if [[ "${basename,,}" == "${component,,}.html" ]] && [[ -f "$candidate" ]]; then
          found="$candidate"
          break
        fi
      done
    else
      # Intermediate component: must be a directory
      for candidate in "$current_dir"/*/; do
        [[ -d "$candidate" ]] || continue
        local basename
        basename=$(basename "$candidate")
        if [[ "${basename,,}" == "${component,,}" ]]; then
          found="${candidate%/}"
          break
        fi
      done
    fi

    if [[ -z "$found" ]]; then
      return 1
    fi
    current_dir="$found"
  done

  echo "$current_dir"
  return 0
}

# Check if the resolved path differs in case from the link path
# Args: $1 = expected path (from link), $2 = actual path (from filesystem)
# Returns: 0 if exact match, 1 if case mismatch
check_case_match() {
  local expected="$1"
  local actual="$2"

  # Normalize: strip the static/ prefix from actual to compare with link path
  local actual_rel="${actual#$DOCS_ROOT/static/}"

  # Strip .html and /index.html suffixes from actual for comparison
  local actual_clean="$actual_rel"
  actual_clean="${actual_clean%.html}"
  actual_clean="${actual_clean%/index}"

  if [[ "$expected" == "$actual_clean" ]]; then
    return 0
  fi
  return 1
}

# Process a single link
# Args: $1 = source file, $2 = line number, $3 = link path (after stripping pathname:// prefix)
process_link() {
  local source_file="$1"
  local line_num="$2"
  local link_path="$3"

  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  # Strip leading slash
  link_path="${link_path#/}"
  # Strip fragment identifier
  link_path="${link_path%%#*}"
  # Strip trailing slash
  link_path="${link_path%/}"

  # Skip empty paths (just the root)
  if [[ -z "$link_path" ]] || [[ "$link_path" == "aztec-nr-api" ]]; then
    return
  fi

  local resolved
  if resolved=$(resolve_static_path "$link_path"); then
    # Found - check case
    if ! check_case_match "$link_path" "$resolved"; then
      CASE_MISMATCH_COUNT=$((CASE_MISMATCH_COUNT + 1))
      local rel_source="${source_file#$DOCS_ROOT/}"
      local actual_rel="${resolved#$DOCS_ROOT/static/}"
      echo "  CASE MISMATCH: $rel_source:$line_num"
      echo "    Link:   $link_path"
      echo "    Actual: $actual_rel"
    fi
  else
    BROKEN_COUNT=$((BROKEN_COUNT + 1))
    local rel_source="${source_file#$DOCS_ROOT/}"
    echo "  BROKEN: $rel_source:$line_num"
    echo "    Link: $link_path"
  fi
}

# Regex patterns stored in variables to avoid bash parsing issues with special chars
MD_LINK_PATTERN='][(]pathname:///aztec-nr-api/([^)]*)[)]'
JSX_HREF_PATTERN='href="/aztec-nr-api/([^"]*)"'

# Scan files for links
for search_dir in "${SEARCH_DIRS[@]}"; do
  # Find all .md and .mdx files
  while IFS= read -r -d '' file; do
    local_line_num=0
    while IFS= read -r line; do
      local_line_num=$((local_line_num + 1))

      # Match markdown links: ](pathname:///aztec-nr-api/...)
      remaining="$line"
      while [[ "$remaining" =~ $MD_LINK_PATTERN ]]; do
        link_path="/aztec-nr-api/${BASH_REMATCH[1]}"
        process_link "$file" "$local_line_num" "$link_path"
        remaining="${remaining#*"${BASH_REMATCH[0]}"}"
      done

      # Match JSX href attributes: href="/aztec-nr-api/..."
      remaining="$line"
      while [[ "$remaining" =~ $JSX_HREF_PATTERN ]]; do
        link_path="/aztec-nr-api/${BASH_REMATCH[1]}"
        process_link "$file" "$local_line_num" "$link_path"
        remaining="${remaining#*"${BASH_REMATCH[0]}"}"
      done

    done < "$file"
  done < <(find "$search_dir" -type f \( -name "*.md" -o -name "*.mdx" \) -print0)
done

echo ""
echo "API reference link validation complete:"
echo "  - Total links checked: $TOTAL_COUNT"
echo "  - Broken links: $BROKEN_COUNT"
echo "  - Case mismatches: $CASE_MISMATCH_COUNT"

if [[ $BROKEN_COUNT -gt 0 ]]; then
  echo ""
  echo "WARNING: $BROKEN_COUNT broken API reference link(s) found."
  echo "These links point to files that don't exist in static/aztec-nr-api/."
  echo "Run 'yarn generate:aztec-nr-api' to regenerate the API docs."
fi

if [[ $CASE_MISMATCH_COUNT -gt 0 ]]; then
  echo ""
  echo "WARNING: $CASE_MISMATCH_COUNT case mismatch(es) found."
  echo "These links work on Netlify (case-insensitive) but may break in other environments."
fi

# Exit 0 with warnings to avoid breaking builds initially
exit 0
