#!/usr/bin/env bash
set -euo pipefail

# check_doc_references - Validate the 'references' frontmatter in documentation
#
# Extracts all 'references' fields from documentation markdown frontmatter and
# fails if any referenced path no longer exists in the repository.
#
# Usage: check_doc_references.sh [docs_dir]
#
# Arguments:
#   docs_dir - (Optional) Documentation directory. Default: docs
#
# Reference Format:
#   - Individual files: "yarn-project/stdlib/src/interfaces/aztec-node.ts"
#   - Directories (all files within): "noir-projects/aztec-nr/aztec/src/context/*"

# Compute SCRIPT_DIR before cd so relative BASH_SOURCE resolves correctly
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Source shared library for reference extraction
source "$SCRIPT_DIR/lib/extract_doc_references.sh"

DOCS_DIR="${1:-docs}"

# Extract all reference file paths from markdown frontmatter
# Expected format: references: ["path/from/repo/root/file.ts", "another/file.ts"]
# Paths should be absolute from repository root (not relative with ../)
# Note: We only scan the source docs folders, not versioned_docs/ — versioned
# docs are historical snapshots and may reference paths that no longer exist.
echo "Extracting references from markdown files in $DOCS_DIR..."

MAPPING_FILE=$(mktemp)
trap "rm -f $MAPPING_FILE" EXIT

extract_references_mapping "$DOCS_DIR" "$MAPPING_FILE"

REF_COUNT=$(cut -d'|' -f1 "$MAPPING_FILE" | sort -u | wc -l)
echo "Found $REF_COUNT unique referenced path(s)."

# Validate all referenced paths exist (can be files or directories)
# Directory references use /* suffix (e.g., "src/context/*" means all files in that directory)
echo "Validating referenced paths exist..."
MISSING_PATHS=""
while IFS='|' read -r ref_path doc_file; do
  # Strip /* suffix for directory references before checking existence
  check_path="${ref_path%/\*}"
  if [[ ! -e "$check_path" ]]; then
    MISSING_PATHS="${MISSING_PATHS}  - ${ref_path} (referenced in ${doc_file})\n"
  fi
done < "$MAPPING_FILE"

if [[ -n "$MISSING_PATHS" ]]; then
  echo ""
  echo "ERROR: The following referenced paths do not exist:"
  echo -e "$MISSING_PATHS"
  echo "Please update the 'references' frontmatter in the affected documentation files."
  exit 1
fi

echo "All referenced paths exist."
