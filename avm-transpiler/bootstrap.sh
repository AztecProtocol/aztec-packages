#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
cd "$(dirname "$0")"
ci3="$(git rev-parse --show-toplevel)/ci3"

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
if [ "${CI:-0}" -eq 1 ]; then
  export AZTEC_CACHE_REBUILD_PATTERNS="../noir/.rebuild_patterns_native .rebuild_patterns"
  $ci3/cache/upload avm-transpiler-$($ci3/cache/content_hash).tar.gz target
fi
$ci3/github/endgroup
