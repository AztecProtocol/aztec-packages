#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
hash=$(cache_content_hash "^noir-projects/aztec-nr")

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
  test_cmds | parallelise
}

case "$cmd" in
  "test"|"ci")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac