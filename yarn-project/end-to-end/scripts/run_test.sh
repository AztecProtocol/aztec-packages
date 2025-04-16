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

# Needs exporting for resolving in docker-compose.yml.
export TEST=$2

[ -n "${3:-}" ] && NAME_POSTFIX=_$3

function cleanup {
  if [ -n "${cid:-}" ]; then
    docker rm -f $cid &>/dev/null
  fi
  exit
}
trap cleanup SIGINT SIGTERM

case "$type" in
  "simple")
    export ENV_VARS_TO_INJECT="FAKE_PROOFS BENCH_OUTPUT CAPTURE_IVC_FOLDER LOG_LEVEL COLLECT_METRICS"
    NAME=${TEST}_$NAME_POSTFIX docker_isolate "./test_simple.sh $TEST"
  ;;
  "compose")
    # Strip leading non alpha numerics and replace / and . with _.
    name=$(echo "${TEST}${NAME_POSTFIX:-}" | sed 's/^[^a-zA-Z0-9]*//; s/[\/\.]/_/g')
    name_arg="-p $name"
    trap 'docker compose $name_arg down --timeout 0' SIGTERM SIGINT EXIT
    docker compose $name_arg down --timeout 0 &> /dev/null
    docker compose $name_arg up --exit-code-from=end-to-end --abort-on-container-exit --force-recreate &
    wait $!
  ;;
esac
