#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

function bootstrap_all {
  # To run bb we need a crs.
  # Download ignition up front to ensure no race conditions at runtime.
  [ -n "${SKIP_BB_CRS:-}" ] || ./scripts/download_bb_crs.sh
  ./bbup/bootstrap.sh $@
  ./cpp/bootstrap.sh $@
  ./ts/bootstrap.sh $@
  ./acir_tests/bootstrap.sh $@
  ./docs/bootstrap.sh $@
  ./sol/bootstrap.sh $@
}

function hash {
  hash_str \
    $(cache_content_hash ^barretenberg) \
    $(./cpp/bootstrap.sh hash) # yes, cpp src gets hashed twice, but this second call also takes DISABLE_AVM into account
}

cmd=${1:-}

case "$cmd" in
  hash)
    hash
    ;;
  ""|clean|ci|fast|test|test_cmds|bench|bench_cmds|release)
    bootstrap_all $@
    ;;
  "release-preview")
    ./docs/bootstrap.sh release-preview
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac

