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

  # Not a bare `> file`: zsh runs that as `cat > file`, which blocks on an open stdin.
  : >"$output_file"

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

  find "$search_dir" -type f \( -name "*.md" -o -name "*.mdx" \) -print0 | while IFS= read -r -d '' doc_file; do
    # The references array may span lines (`references:` then `[`, one path per line, `]`).
    awk -v doc="$doc_file" '
      function emit(refs,   arr, i, n, path) {
        gsub(/[\[\]"'\''"]/, "", refs)
        n = split(refs, arr, /,/)
        for (i = 1; i <= n; i++) {
          path = arr[i]
          gsub(/^[ \t]+|[ \t]+$/, "", path)
          if (path != "") {
            print path "|" doc
          }
        }
      }
      BEGIN { in_frontmatter = 0; collecting = 0 }
      /^---$/ {
        if (NR == 1) {
          in_frontmatter = 1
        } else if (in_frontmatter) {
          in_frontmatter = 0
          collecting = 0
        }
        next
      }
      in_frontmatter && /^references:/ {
        collecting = 1
        buf = ""
      }
      in_frontmatter && collecting {
        buf = buf " " $0
        if (index($0, "]")) {
          if (match(buf, /\[.*\]/)) {
            emit(substr(buf, RSTART, RLENGTH))
          }
          collecting = 0
        }
      }
    ' "$doc_file"
  done >> "$output_file"
}

# Print `<reference> -> <doc>, <doc>` for each reference that names a changed path: the path itself,
# or a directory holding it (`<dir>/*` or `<dir>`). One line per reference, sorted.
# Arguments:
#   $1 - mapping_file: from extract_references_mapping ("ref_file|doc_file")
#   $2 - changed_file: changed paths from the repository root, one per line
changed_references() {
  local mapping_file="$1"
  local changed_file="$2"

  # FILENAME, not NR == FNR: an empty changed file would otherwise read the mapping as changes.
  awk -F'|' -v changed_file="$changed_file" '
    FILENAME == changed_file { changed[$0]; next }
    {
      dir = $1
      sub(/\/\*$/, "", dir)
      if (dir in changed) { print $1 "|" $2; next }
      for (path in changed) if (index(path, dir "/") == 1) { print $1 "|" $2; next }
    }
  ' "$changed_file" "$mapping_file" | LC_ALL=C sort -u | awk -F'|' '
    $1 != ref { if (NR > 1) print ""; ref = $1; printf "%s -> %s", ref, $2; next }
    { printf ", %s", $2 }
    END { if (NR) print "" }
  '
}
