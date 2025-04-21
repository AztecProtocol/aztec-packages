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

case "$type" in
  "simple")
    exec ./test_simple.sh $test
  ;;
  "compose")
    # TODO: Replace this file with test_simple.sh, and just emit the below as part of test_cmds.
    TEST=$test exec run_compose_test $test end-to-end $PWD
  ;;
esac
