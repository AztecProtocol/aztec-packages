#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
# combine yarn project hash
hash=$(echo $(../yarn-project/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns) | git hash-object --stdin)
# TODO(ci3): build command
case "$cmd" in
  "hash")
    echo "$hash"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac