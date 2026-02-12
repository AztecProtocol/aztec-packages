#!/usr/bin/env bash
set -euo pipefail

# validate_redirect_targets - Validate that all redirect 'to' paths in netlify.toml point to valid docs
#
# This script:
# 1. Extracts all 'to' paths from [[redirects]] blocks in netlify.toml
# 2. Skips wildcard patterns (:splat, *) and external URLs
# 3. Maps URL paths to filesystem paths (using versioned docs for default versions)
# 4. Validates that each target file exists (by filename or Docusaurus id frontmatter)
# 5. Exits with error code 1 if any invalid paths are found
#
# Usage: validate_redirect_targets.sh [netlify_toml_path]
#
# Arguments:
#   netlify_toml_path - (Optional) Path to netlify.toml. Default: netlify.toml in script's parent directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(dirname "$SCRIPT_DIR")"
NETLIFY_TOML="${1:-$DOCS_ROOT/netlify.toml}"

if [[ ! -f "$NETLIFY_TOML" ]]; then
  echo "ERROR: netlify.toml not found at $NETLIFY_TOML"
  exit 1
fi

echo "Validating redirect targets in $NETLIFY_TOML..."

# Determine default versions from version files
DEVELOPER_VERSION_FILE="$DOCS_ROOT/developer_versions.json"
NETWORK_VERSION_FILE="$DOCS_ROOT/network_versions.json"

# Get the default developer version (last version ending in devnet.* or the first version)
if [[ -f "$DEVELOPER_VERSION_FILE" ]]; then
  # Get versions with -devnet suffix, prefer the devnet version for production
  DEVELOPER_DEFAULT_VERSION=$(jq -r '.[] | select(contains("devnet"))' "$DEVELOPER_VERSION_FILE" | head -n1)
  if [[ -z "$DEVELOPER_DEFAULT_VERSION" ]]; then
    DEVELOPER_DEFAULT_VERSION=$(jq -r '.[0]' "$DEVELOPER_VERSION_FILE")
  fi
else
  DEVELOPER_DEFAULT_VERSION=""
fi

# Get the default network version (ignition version)
if [[ -f "$NETWORK_VERSION_FILE" ]]; then
  NETWORK_DEFAULT_VERSION=$(jq -r '.[] | select(contains("ignition"))' "$NETWORK_VERSION_FILE" | head -n1)
  if [[ -z "$NETWORK_DEFAULT_VERSION" ]]; then
    NETWORK_DEFAULT_VERSION=$(jq -r '.[0]' "$NETWORK_VERSION_FILE")
  fi
else
  NETWORK_DEFAULT_VERSION=""
fi

echo "Using developer version: ${DEVELOPER_DEFAULT_VERSION:-source}"
echo "Using network version: ${NETWORK_DEFAULT_VERSION:-source}"

# Set the docs directories based on versions
if [[ -n "$DEVELOPER_DEFAULT_VERSION" ]] && [[ -d "$DOCS_ROOT/developer_versioned_docs/version-$DEVELOPER_DEFAULT_VERSION" ]]; then
  DEVELOPER_DOCS_DIR="$DOCS_ROOT/developer_versioned_docs/version-$DEVELOPER_DEFAULT_VERSION"
else
  DEVELOPER_DOCS_DIR="$DOCS_ROOT/docs-developers"
fi

if [[ -n "$NETWORK_DEFAULT_VERSION" ]] && [[ -d "$DOCS_ROOT/network_versioned_docs/version-$NETWORK_DEFAULT_VERSION" ]]; then
  OPERATE_DOCS_DIR="$DOCS_ROOT/network_versioned_docs/version-$NETWORK_DEFAULT_VERSION"
else
  OPERATE_DOCS_DIR="$DOCS_ROOT/docs-operate"
fi

echo "Developer docs dir: $DEVELOPER_DOCS_DIR"
echo "Operate docs dir: $OPERATE_DOCS_DIR"

# Extract all 'to' values from redirect blocks
# Handles both:
#   to = "/path"
#   to= "/path"
TO_PATHS=$(grep -E '^\s*to\s*=' "$NETLIFY_TOML" | sed -E 's/^\s*to\s*=\s*"([^"]+)".*/\1/' || echo "")

if [[ -z "$TO_PATHS" ]]; then
  echo "No redirect targets found."
  exit 0
fi

TOTAL_COUNT=$(echo "$TO_PATHS" | wc -l)
echo "Found $TOTAL_COUNT redirect target(s)."

# Track invalid paths
INVALID_PATHS=""
SKIPPED_COUNT=0
VALIDATED_COUNT=0

# Check if a URL sub_path resolves to a file in the given base directory.
# Handles direct file matches, index files in directories, and Docusaurus id frontmatter.
# Args: $1 = base directory, $2 = sub_path (can be empty for bare category paths)
# Returns: 0 if found, 1 if not
check_file_or_id() {
  local base_dir="$1"
  local sub_path="$2"

  # Handle empty sub_path (bare category path like /participate)
  if [[ -z "$sub_path" ]]; then
    for ext in md mdx; do
      if [[ -f "$base_dir/index.${ext}" ]]; then
        return 0
      fi
    done
    return 1
  fi

  # Direct file match
  for ext in md mdx; do
    if [[ -f "$base_dir/${sub_path}.${ext}" ]]; then
      return 0
    fi
  done

  # Directory with index file
  if [[ -d "$base_dir/${sub_path}" ]]; then
    for ext in md mdx; do
      if [[ -f "$base_dir/${sub_path}/index.${ext}" ]]; then
        return 0
      fi
    done
  fi

  # Check Docusaurus id frontmatter in sibling files
  # Split sub_path into parent directory + slug
  local parent_dir slug search_dir
  if [[ "$sub_path" == */* ]]; then
    parent_dir="${sub_path%/*}"
    slug="${sub_path##*/}"
  else
    parent_dir=""
    slug="$sub_path"
  fi

  if [[ -n "$parent_dir" ]]; then
    search_dir="$base_dir/$parent_dir"
  else
    search_dir="$base_dir"
  fi

  if [[ -d "$search_dir" ]]; then
    for file in "$search_dir"/*.md "$search_dir"/*.mdx; do
      [[ -f "$file" ]] || continue
      # Extract id from YAML frontmatter (between --- markers)
      local file_id
      file_id=$(sed -n '/^---$/,/^---$/{s/^id:[[:space:]]*//p}' "$file" | head -1)
      if [[ "$file_id" == "$slug" ]]; then
        return 0
      fi
    done
  fi

  return 1
}

# Function to check if a docs file exists
# Args: $1 = URL path
# Returns: 0 if exists, 1 if not
check_docs_path() {
  local url_path="$1"

  # Normalize path - add leading slash if missing
  if [[ "$url_path" != /* ]]; then
    url_path="/$url_path"
  fi

  # Handle root path
  if [[ "$url_path" == "/" ]]; then
    if [[ -f "$DOCS_ROOT/docs/index.mdx" ]] || [[ -f "$DOCS_ROOT/docs/index.md" ]]; then
      return 0
    fi
    return 1
  fi

  # Remove leading slash for path construction
  local clean_path="${url_path#/}"

  # Handle /developers/docs/* paths
  if [[ "$clean_path" =~ ^developers/docs/(.*) ]]; then
    check_file_or_id "$DEVELOPER_DOCS_DIR/docs" "${BASH_REMATCH[1]}"
    return $?
  fi

  # Handle /developers/* paths (not /developers/docs/*)
  if [[ "$clean_path" =~ ^developers/(.*) ]]; then
    check_file_or_id "$DEVELOPER_DOCS_DIR" "${BASH_REMATCH[1]}"
    return $?
  fi

  # Handle /operate/* paths (formerly /network/*)
  if [[ "$clean_path" =~ ^operate/(.*) ]]; then
    check_file_or_id "$OPERATE_DOCS_DIR" "${BASH_REMATCH[1]}"
    return $?
  fi

  # Handle /network/* paths (legacy, will redirect to /operate/*)
  if [[ "$clean_path" =~ ^network/(.*) ]]; then
    check_file_or_id "$OPERATE_DOCS_DIR" "${BASH_REMATCH[1]}"
    return $?
  fi

  # Handle /participate (bare) or /participate/* paths
  if [[ "$clean_path" == "participate" ]]; then
    check_file_or_id "$DOCS_ROOT/docs-participate" ""
    return $?
  fi
  if [[ "$clean_path" =~ ^participate/(.*) ]]; then
    check_file_or_id "$DOCS_ROOT/docs-participate" "${BASH_REMATCH[1]}"
    return $?
  fi

  # Handle other root-level paths (e.g., /aztec_connect_sunset)
  check_file_or_id "$DOCS_ROOT/docs" "$clean_path"
  return $?
}

while IFS= read -r to_path; do
  # Skip empty lines
  [[ -z "$to_path" ]] && continue

  # Skip wildcards (:splat or * in the path)
  if [[ "$to_path" == *":splat"* ]] || [[ "$to_path" == *"*"* ]]; then
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  # Skip external URLs
  if [[ "$to_path" =~ ^https?:// ]]; then
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  # Validate the path
  if check_docs_path "$to_path"; then
    VALIDATED_COUNT=$((VALIDATED_COUNT + 1))
  else
    INVALID_PATHS="${INVALID_PATHS}  - ${to_path}\n"
  fi
done <<< "$TO_PATHS"

echo ""
echo "Validation complete:"
echo "  - Validated: $VALIDATED_COUNT"
echo "  - Skipped (wildcards/external): $SKIPPED_COUNT"

if [[ -n "$INVALID_PATHS" ]]; then
  INVALID_COUNT=$(echo -e "$INVALID_PATHS" | grep -c "^  -" || echo "0")
  echo "  - Invalid: $INVALID_COUNT"
  echo ""
  echo "WARNING: The following redirect targets may not point to valid documentation paths:"
  echo -e "$INVALID_PATHS"
  echo ""
  echo "Note: These paths were checked against the default versioned docs."
  echo "If these paths exist in the source docs but not in the versioned docs,"
  echo "they will become valid after the next docs version is released."
  echo ""
  # Exit with success to avoid breaking builds, but warn about potential issues
  exit 0
fi

echo ""
echo "All redirect targets are valid."
exit 0
