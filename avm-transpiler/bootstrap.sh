#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

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
if [[ "$OSTYPE" != "darwin"* ]] && [ -n "${USE_CACHE:-}" ]; then
  ./bootstrap_cache.sh && exit
fi

$ci3/github/group "avm-transpiler build"
./scripts/bootstrap_native.sh
export AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native .rebuild_patterns"
$ci3/cache/upload avm-transpiler-$($ci3/cache/content_hash).tar.gz target
$ci3/github/endgroup
