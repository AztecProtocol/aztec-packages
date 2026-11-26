#!/usr/bin/env bash
# Use ci3 script base.
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# The build is keyed and cached as the bb-ts make step, its tests by bb-ts-tests and its benchmark by bb-ts-benches.

# bb.js compiles against @aztec-foundation/bb.js-api, which the bb-ts-packages make target builds first.
function formatting {
  echo_header "bb.js formatting"
  yarn formatting
}

function build {
  echo_header "bb.js build"
  yarn formatting

  find . -exec touch -d "@0" {} + 2>/dev/null || true
  yarn clean
  parallel -v --line-buffered --tag 'denoise "yarn {}"' ::: build:esm build:cjs build:browser

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
  local prefix=${STEP_KEY:-disabled-cache}
  cd dest/node
  for test in **/*.test.js; do
    # Skip benchmarks here.
    [[ "$test" =~ \.bench\.test\.js$ ]] && continue
    [[ "$test" == "barretenberg/chonk_pinned_inputs.test.js" ]] && continue

    echo "$prefix barretenberg/ts/bb.js/scripts/run_test.sh $test"
  done
  echo "$prefix:CPUS=8:MEM=32g:TIMEOUT=20m barretenberg/cpp/scripts/chonk_inputs.sh download && barretenberg/ts/bb.js/scripts/run_test.sh barretenberg/chonk_pinned_inputs.test.js"
}

function bench_cmds {
  echo "${STEP_KEY:-disabled-cache}:CPUS=4 barretenberg/ts/bb.js/scripts/run_test.sh poseidon.bench.test.js"
}

function test {
  echo_header "bb.js test"
  test_cmds | filter_test_cmds | parallelize
}

function release {
  retry "deploy_npm ${REF_NAME#v}"
}

case "$cmd" in
  "")
    # Through make, so that it is restored from the cache when it can be.
    make -C "$root" bb-ts
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
