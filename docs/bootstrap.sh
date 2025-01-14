#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
# combine yarn project hash
hash=$(hash_str "$(../yarn-project/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns)")
# TODO(ci3): build command
case "$cmd" in
  "hash")
    echo "$hash"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
