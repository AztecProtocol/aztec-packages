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
    export ENV_VARS_TO_INJECT="FAKE_PROOFS BENCH_OUTPUT CAPTURE_IVC_FOLDER LOG_LEVEL COLLECT_METRICS"
    NAME=$test exec docker_isolate "./test_simple.sh $test"
  ;;
  "compose")
    # Strip leading non alpha numerics and replace / and . with _.
    name=$(echo "${test}${NAME_POSTFIX:-}" | sed 's/^[^a-zA-Z0-9]*//; s/[\/\.]/_/g')
    name_arg="-p $name"
    docker compose $name_arg down --timeout 0 &> /dev/null

    function cleanup {
      echo compose cleanup: $name_arg >/dev/tty
      SECONDS=0
      while [ $SECONDS -lt 15 ] && ! docker compose $name_arg ps --format '{{.Service}} {{.State}}' | grep -q "running"; do
          echo waiting for compose to be running: $name_arg >/dev/tty
          sleep 1
      done
      echo compose kill $name_arg >/dev/tty
      docker compose $name_arg down --timeout 0 &> /dev/null
    }
    trap cleanup EXIT

    TEST=$test docker compose $name_arg up --exit-code-from=end-to-end --abort-on-container-exit --force-recreate &
    pid=$!
    wait $pid
  ;;
esac
