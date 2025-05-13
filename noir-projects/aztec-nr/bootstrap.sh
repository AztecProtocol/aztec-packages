#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export NOIR_HASH=${NOIR_HASH:- $(../../noir/bootstrap.sh hash)}
hash=$(hash_str "$NOIR_HASH" $(cache_content_hash  "^noir-projects/aztec-nr"))

function build {
  # Being a library, aztec-nr does not technically need to be built. But we can still run nargo check to find any type
  # errors and prevent warnings
  echo_stderr "Checking aztec-nr for warnings..."
  $NARGO check --deny-warnings
}

function test_cmds {
  i=0
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    # We assume there are 8 txe's running.
    port=$((45730 + (i++ % ${NUM_TXES:-1})))
    echo "$hash noir-projects/scripts/run_test.sh aztec-nr $package $test $port"
  done
}

function test {
  # Start txe server.
  trap 'kill $(jobs -p)' EXIT
  (cd $root/yarn-project/txe && LOG_LEVEL=error TXE_PORT=45730 yarn start) &
  echo "Waiting for TXE to start..."
  while ! nc -z 127.0.0.1 45730 &>/dev/null; do sleep 1; done

  export NARGO_FOREIGN_CALL_TIMEOUT=300000
  test_cmds | filter_test_cmds | parallelise

  # Run the macro compilation failure tests
  ./macro_compilation_failure_tests/assert_macro_compilation_failure.sh
}

function format {
  $NARGO fmt
}

case "$cmd" in
  ""|"fast"|"full")
    build
    ;;
  "ci")
    build
    test
    ;;
  test|test_cmds|format)
    $cmd
    ;;
  "test-macro-compilation-failure")
    ./macro_compilation_failure_tests/assert_macro_compilation_failure.sh
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac
