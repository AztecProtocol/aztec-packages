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
$ci3/github/group "avm-transpiler build"
ARTIFACT=avm-transpiler-$($ci3/cache/content_hash ../noir/.rebuild_patterns_native .rebuild_patterns).tar.gz
if [[ "$OSTYPE" = "darwin"* ]] || !$ci3/cache/download $ARTIFACT; then
  ./scripts/bootstrap_native.sh
  [[ "$OSTYPE" != "darwin"* ]] && $ci3/cache/upload $ARTIFACT target
fi
$ci3/github/endgroup
