#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash ../cpp/.rebuild_patterns .rebuild_patterns)

function build {
  github_group "bb.js build"
  if ! cache_download bb.js-$hash.tar.gz; then
    denoise yarn install
    find . -exec touch -d "@0" {} + 2>/dev/null || true

    denoise yarn build
    cache_upload bb.js-$hash.tar.gz dest
  else
    denoise yarn install
  fi
  github_endgroup
}

function test {
  test_should_run bb.js-tests-$hash || return 0

  github_group "bb.js test"
  denoise yarn test
  cache_upload_flag bb.js-tests-$hash
  github_endgroup
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
  "test-cmds")
    wd=$(realpath --relative-to=$root $PWD)
    ./node_modules/.bin/jest --listTests --testRegex '\.test\.js$' --rootDir ./dest/node | \
      sed "s|$(pwd)/||" | while read -r test; do
        echo "$wd/scripts/run_test.sh $test"
      done
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