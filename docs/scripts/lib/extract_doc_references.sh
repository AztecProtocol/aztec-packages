#!/usr/bin/env bash
# extract_doc_references.sh - Shared functions for extracting doc references
#
# This library provides reusable functions for extracting references from
# documentation frontmatter.
#
# Usage: source this file and call the functions

# Extract references from markdown frontmatter and build a mapping file
# Arguments:
#   $1 - docs_dir: The documentation directory (e.g., "docs")
#   $2 - output_file: Path to write the mapping (format: "ref_file|doc_file")
extract_references_mapping() {
  local docs_dir="$1"
  local output_file="$2"

  # Clear output file
  > "$output_file"

  # Scan docs-developers, docs-operate, and docs-participate subdirectories
  for docs_subdir in docs-developers docs-operate docs-participate; do
    if [[ -d "$docs_dir/$docs_subdir" ]]; then
      _extract_from_directory "$docs_dir/$docs_subdir" "$output_file"
    fi
  done

  # Also scan main docs folder if it exists
  if [[ -d "$docs_dir/docs" ]]; then
    _extract_from_directory "$docs_dir/docs" "$output_file"
  fi
}

# Internal function to extract references from a directory
_extract_from_directory() {
  local search_dir="$1"
  local output_file="$2"

  find "$search_dir" -type f -name "*.md" -print0 | while IFS= read -r -d '' doc_file; do
    awk -v doc="$doc_file" '
      BEGIN { in_frontmatter = 0 }
      /^---$/ {
        if (NR == 1) {
          in_frontmatter = 1
        } else if (in_frontmatter) {
          in_frontmatter = 0
        }
        next
      }
      in_frontmatter && /^references:/ {
        if (match($0, /\[.*\]/)) {
          refs = substr($0, RSTART, RLENGTH)
          gsub(/[\[\]"'\''"]/, "", refs)
          split(refs, arr, /,[ ]*/)
          for (i in arr) {
            if (arr[i] != "") {
              print arr[i] "|" doc
            }
          }
        }
      }
    ' "$doc_file"
  done >> "$output_file"
}

# Get unique reference files from a mapping file
# Arguments:
#   $1 - mapping_file: Path to the mapping file
get_unique_references() {
  local mapping_file="$1"
  cut -d'|' -f1 "$mapping_file" | sort -u
}

# Find which docs reference a given file pattern
# Arguments:
#   $1 - mapping_file: Path to the mapping file
#   $2 - pattern: The file pattern to search for
find_docs_for_reference() {
  local mapping_file="$1"
  local pattern="$2"
  grep -F "$pattern" "$mapping_file" | cut -d'|' -f2 | sort -u
}

# Build associative arrays for file-to-docs and docs-to-files mappings
# Arguments:
#   $1 - mapping_file: Path to the mapping file
#   $2 - changed_files: Newline-separated list of changed files
# Sets global variables:
#   FILE_TO_DOCS_MAP - associative array
#   DOC_TO_FILES_MAP - associative array
#   CHANGED_REFERENCES - newline-separated list of changed reference files
build_change_mappings() {
  local mapping_file="$1"
  local changed_files="$2"

  # Initialize global associative arrays
  declare -gA FILE_TO_DOCS_MAP
  declare -gA DOC_TO_FILES_MAP
  CHANGED_REFERENCES=""

  local reference_files=$(get_unique_references "$mapping_file")

  while IFS= read -r ref_file; do
    [[ -z "$ref_file" ]] && continue
    local match_pattern="${ref_file%/\*}"

    if echo "$changed_files" | grep -qF "$match_pattern"; then
      CHANGED_REFERENCES="${CHANGED_REFERENCES}${ref_file}\n"

      while IFS='|' read -r src_file doc_file; do
        if [[ "$src_file" == "$ref_file" ]]; then
          if [[ -n "${FILE_TO_DOCS_MAP[$ref_file]:-}" ]]; then
            FILE_TO_DOCS_MAP[$ref_file]="${FILE_TO_DOCS_MAP[$ref_file]}|${doc_file}"
          else
            FILE_TO_DOCS_MAP[$ref_file]="$doc_file"
          fi

          if [[ -n "${DOC_TO_FILES_MAP[$doc_file]:-}" ]]; then
            DOC_TO_FILES_MAP[$doc_file]="${DOC_TO_FILES_MAP[$doc_file]}|${ref_file}"
          else
            DOC_TO_FILES_MAP[$doc_file]="$ref_file"
          fi
        fi
      done < "$mapping_file"
    fi
  done <<< "$reference_files"
}
