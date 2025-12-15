#!/usr/bin/env bash
set -euo pipefail

# validate_redirect_targets - Validate that all redirect 'to' paths in netlify.toml point to valid docs
#
# This script:
# 1. Extracts all 'to' paths from [[redirects]] blocks in netlify.toml
# 2. Skips wildcard patterns (:splat, *) and external URLs
# 3. Maps URL paths to filesystem paths (using versioned docs for default versions)
# 4. Validates that each target file exists
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
  NETWORK_DOCS_DIR="$DOCS_ROOT/network_versioned_docs/version-$NETWORK_DEFAULT_VERSION"
else
  NETWORK_DOCS_DIR="$DOCS_ROOT/docs-network"
fi

echo "Developer docs dir: $DEVELOPER_DOCS_DIR"
echo "Network docs dir: $NETWORK_DOCS_DIR"

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
    local sub_path="${BASH_REMATCH[1]}"
    # Check in versioned docs/
    for ext in md mdx; do
      if [[ -f "$DEVELOPER_DOCS_DIR/docs/${sub_path}.${ext}" ]]; then
        return 0
      fi
      # Also check for index files in directories
      if [[ -d "$DEVELOPER_DOCS_DIR/docs/${sub_path}" ]]; then
        if [[ -f "$DEVELOPER_DOCS_DIR/docs/${sub_path}/index.${ext}" ]]; then
          return 0
        fi
      fi
    done
    return 1
  fi

  # Handle /developers/* paths (not /developers/docs/*)
  if [[ "$clean_path" =~ ^developers/(.*) ]]; then
    local sub_path="${BASH_REMATCH[1]}"
    # Check in versioned developer docs root
    for ext in md mdx; do
      if [[ -f "$DEVELOPER_DOCS_DIR/${sub_path}.${ext}" ]]; then
        return 0
      fi
      # Also check for index files in directories
      if [[ -d "$DEVELOPER_DOCS_DIR/${sub_path}" ]]; then
        if [[ -f "$DEVELOPER_DOCS_DIR/${sub_path}/index.${ext}" ]]; then
          return 0
        fi
      fi
    done
    return 1
  fi

  # Handle /network/* paths
  if [[ "$clean_path" =~ ^network/(.*) ]]; then
    local sub_path="${BASH_REMATCH[1]}"
    # Check in versioned network docs
    for ext in md mdx; do
      if [[ -f "$NETWORK_DOCS_DIR/${sub_path}.${ext}" ]]; then
        return 0
      fi
      # Also check for index files in directories
      if [[ -d "$NETWORK_DOCS_DIR/${sub_path}" ]]; then
        if [[ -f "$NETWORK_DOCS_DIR/${sub_path}/index.${ext}" ]]; then
          return 0
        fi
      fi
    done
    return 1
  fi

  # Handle other root-level paths (e.g., /ignition_info, /aztec_connect_sunset)
  for ext in md mdx; do
    if [[ -f "$DOCS_ROOT/docs/${clean_path}.${ext}" ]]; then
      return 0
    fi
    # Also check for index files in directories
    if [[ -d "$DOCS_ROOT/docs/${clean_path}" ]]; then
      if [[ -f "$DOCS_ROOT/docs/${clean_path}/index.${ext}" ]]; then
        return 0
      fi
    fi
  done

  return 1
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
  echo "ERROR: The following redirect targets do not point to valid documentation paths:"
  echo -e "$INVALID_PATHS"
  echo "Please update netlify.toml to use valid documentation paths."
  exit 1
fi

echo ""
echo "All redirect targets are valid."
exit 0
