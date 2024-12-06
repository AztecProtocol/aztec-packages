#!/usr/bin/env bash
# note: sets CI and USE_CACHE for us
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(REBUILD_PATTERNS="^build-images/Earthfile" cache_content_hash)

function build {
  github_group "build-images build"
  export TEST=1 # for test_should_run
  if test_should_run build-images-$hash; then
    args=""
    if [ "${CI:-0}" = 1 ]; then
      args="--push"
    fi
    denoise ../scripts/earthly-ci $args +all-ci
    cache_upload_flag build-images-$hash
  fi
  github_endgroup
}

build