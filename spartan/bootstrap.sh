#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

if [ "$cmd" = "hash" ]; then
  echo $(hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash))
fi
