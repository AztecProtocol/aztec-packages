#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash ../cpp/.rebuild_patterns .rebuild_patterns)

function build {
  github_group "bb.js build"
  if ! cache_download bb.js-$hash.tar.gz; then
    denoise "yarn install"
    find . -exec touch -d "@0" {} + 2>/dev/null || true

    denoise "yarn build"
    cache_upload bb.js-$hash.tar.gz dest
  else
    denoise "yarn install"
  fi

  # We copy snapshot dirs to dest so we can run tests from dest.
  for snapshot_dir in src/**/__snapshots__; do
    dest_dir="${snapshot_dir/src\//dest\/node\/}"
    rm -rf "$dest_dir"
    cp -r "$snapshot_dir" "$dest_dir"
    for file in $dest_dir/*.test.ts.snap; do
      mv "$file" "${file/.test.ts.snap/.test.js.snap}"
    done
  done

  github_endgroup
}

function test_cmds {
  cd dest/node
  for test in **/*.test.js; do
    echo "$hash barretenberg/ts/scripts/run_test.sh $test"
  done
}

function test {
  github_group "bb.js test"
  test_cmds | parallelise
  github_endgroup
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac