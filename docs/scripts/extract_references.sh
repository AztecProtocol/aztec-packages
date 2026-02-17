#!/usr/bin/env bash
# Extract references from #include_code macros in a doc file
#
# Outputs individual file paths. To reference entire directories, manually
# consolidate paths and use the /* suffix (e.g., "path/to/dir/*").
#
# Usage: extract_references.sh <doc_file.md>

DOC_FILE="$1"

if [[ ! -f "$DOC_FILE" ]]; then
  echo "Usage: $0 <doc_file.md>"
  exit 1
fi

echo "references:"
grep "#include_code" "$DOC_FILE" | while read -r line; do
  path=$(echo "$line" | awk '{print $3}')
  path="${path#/}"  # Remove leading slash
  echo "  - \"$path\""
done | sort -u
