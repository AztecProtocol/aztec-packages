#!/usr/bin/env bash
# Used to launch a single e2e test.
# Called by bootstrap when it runs all the tests.
# A "simple" test is one that does not require docker-compose. They are still run within docker isolation however.
# A "compose" test uses docker-compose to launch actual services.
#
# To avoid thrashing the disk, we mount /tmp as a 1gb tmpfs.
# We separate out jests temp dir for now, as it consumes a lot of space and we want to quota /tmp independently.
source $(git rev-parse --show-toplevel)/ci3/source

type=$1
test=$2
test_name=${3:-}

case "$type" in
  "simple")
    exec ./test_simple.sh "$test" "$test_name"
  ;;
  "compose")
    # TODO: Replace this file with test_simple.sh, and just emit the below as part of test_cmds.
    compose_log_name="$(echo "${test}${NAME_POSTFIX:-}" | sed 's/^[^a-zA-Z0-9]*//; s/[\/\.]/_/g')"
    export COMPOSE_LOG_DIR=${COMPOSE_LOG_DIR:-/tmp/aztec-compose-logs/$compose_log_name}
    TEST=$test exec run_compose_test $test end-to-end $PWD
  ;;
  "web3signer")
    TEST=$test exec run_compose_test $test end-to-end $PWD/web3signer
  ;;
  "ha")
    # Remove volumes on cleanup for HA tests to ensure clean database state on retries
    TEST=$test REMOVE_COMPOSE_VOLUMES=1 exec run_compose_test $test end-to-end $PWD/ha
  ;;
esac
