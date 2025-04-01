#!/usr/bin/env bash
set -eu
# Takes a key and a list of YAML files to check for the key.
command -v yq > /dev/null || (echo "read_value.sh requires 'yq' to be installed" && exit 1)
key="$1"
shift 1
for file in "$@"; do
  value=$(yq -r ".$key" "$file")
  if [ -n "$value" ] && [ "$value" != "null" ]; then
    # We found our value, no need to keep looking.
    break
  fi
done
# Write out our first non-null/black value, or null/blank.
echo "$value"
