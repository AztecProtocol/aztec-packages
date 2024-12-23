#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash ../cpp/.rebuild_patterns .rebuild_patterns)

function build {
  github_group "bb.js build"
  if ! cache_download bb.js $hash; then
    denoise yarn install
    find . -exec touch -d "@0" {} + 2>/dev/null || true

    denoise yarn build
    cache_upload bb.js $hash dest
  else
    denoise yarn install
  fi
  github_endgroup
}

function test {
  if test_should_run bb.js-tests-$hash; then
    github_group "bb.js test"
    denoise yarn test
    cache_upload_flag bb.js-tests-$hash
    github_endgroup
  fi
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "ci")
    build
    test
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac