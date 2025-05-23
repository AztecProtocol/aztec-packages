#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash ../cpp/.rebuild_patterns .rebuild_patterns)

function build {
  echo_header "bb.js build"
  npm_install_deps

  if ! cache_download bb.js-$hash.tar.gz; then
    find . -exec touch -d "@0" {} + 2>/dev/null || true
    yarn clean
    yarn build:wasm
    parallel -v --line-buffered --tag 'denoise "yarn {}"' ::: build:esm build:cjs build:browser
    cache_upload bb.js-$hash.tar.gz dest
  fi

  # We copy snapshot dirs to dest so we can run tests from dest.
  # This is because web-workers run into issues with transpilation.
  for snapshot_dir in src/**/__snapshots__; do
    dest_dir="${snapshot_dir/src\//dest\/node\/}"
    rm -rf "$dest_dir"
    cp -r "$snapshot_dir" "$dest_dir"
    for file in $dest_dir/*.test.ts.snap; do
      mv "$file" "${file/.test.ts.snap/.test.js.snap}"
    done
  done
}

function test_cmds {
  cd dest/node
  for test in **/*.test.js; do
    local prefix=$hash
    # Extra resource.
    if [[ "$test" =~ ^examples/ ]]; then
      prefix="$prefix:CPUS=16"
    fi
    echo "$prefix barretenberg/ts/scripts/run_test.sh $test"
  done
}

function test {
  echo_header "bb.js test"
  test_cmds | filter_test_cmds | parallelise
}

function release {
  retry "deploy_npm $(dist_tag) ${REF_NAME#v}"
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
  "hash")
    echo "$hash"
    ;;
  bench|bench_cmds)
    # Empty handling just to make this command valid.
    ;;
  test|test_cmds|release)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
