#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

function check_node_floor {
  # The wasm test harness depends on Node >= 22 for stable worker_threads
  # semantics under Emscripten. Fail clean here rather than deep in cpp/ts.
  if command -v node >/dev/null 2>&1; then
    local v
    v=$(node --version | cut -d 'v' -f 2)
    local major=${v%%.*}
    if [ "$major" -lt 22 ]; then
      echo "Error: Node $v detected; barretenberg requires Node >= 22 (wasm test harness)." >&2
      exit 1
    fi
  fi
}

function ensure_emsdk_active {
  # Activate the pinned emsdk if it's installed but not yet on PATH. The
  # version pin lives in /.emsdk-version at the repo root.
  if command -v emcc >/dev/null 2>&1; then
    return
  fi
  local emsdk_dir=${EMSDK:-/opt/emsdk}
  if [ -f "$emsdk_dir/emsdk_env.sh" ]; then
    # shellcheck disable=SC1090,SC1091
    . "$emsdk_dir/emsdk_env.sh" >/dev/null 2>&1 || true
    export EMSDK="$emsdk_dir"
  fi
}

function bootstrap_all {
  check_node_floor
  ensure_emsdk_active
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
