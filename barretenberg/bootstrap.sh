#!/usr/bin/env bash
script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
root=${root:-$(cd "$script_dir/.." && pwd)}
source "$root/ci3/source"

function bootstrap_all {
  # To run bb we need a crs.
  # Download ignition up front to ensure no race conditions at runtime.
  [ -n "${SKIP_BB_CRS:-}" ] || ./crs/bootstrap.sh
  ./bbup/bootstrap.sh $@
  ./cpp/bootstrap.sh $@
  ./ts/bootstrap.sh $@
  ./rust/bootstrap.sh $@
  ./acir_tests/bootstrap.sh $@
  ./docs/bootstrap.sh $@
  ./sol/bootstrap.sh $@
}

function hash {
  if [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
    echo disabled-cache
    return
  fi

  hash_str \
    $(cache_content_hash ^barretenberg) \
    $(./cpp/bootstrap.sh hash) # yes, cpp src gets hashed twice, but this second call also takes DISABLE_AVM into account
}

cmd=${1:-}
case "$cmd" in
  hash)
    hash
    ;;
  ""|clean|test|test_cmds|bench|bench_cmds|release)
    bootstrap_all $@
    ;;
  ci)
    bootstrap_all
    bootstrap_all test
    ;;
  "release-preview")
    ./docs/bootstrap.sh release-preview
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
