#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    cargo clean
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

# Attempt to just pull artefacts from CI and exit on success.
github_group "avm-transpiler build"
ARTIFACT=avm-transpiler-$(cache_content_hash ../noir/.rebuild_patterns_native .rebuild_patterns).tar.gz
if ! cache_download $ARTIFACT; then
  ./scripts/bootstrap_native.sh
  cache_upload $ARTIFACT target
fi
github_endgroup
