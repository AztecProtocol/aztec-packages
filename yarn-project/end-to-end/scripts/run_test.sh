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

case "$type" in
  "simple")
    # Strip leading non alpha numerics and replace / with _ for the container name.
    name="$(echo "${TEST}" | sed 's/^[^a-zA-Z0-9]*//' | tr '/' '_')${NAME_POSTFIX:-}"
    [ -n "${CPU_LIST:-}" ] && cpuset_arg="--cpuset-cpus=$CPU_LIST"
    name_arg="--name $name"
    repo_dir=$(git rev-parse --show-toplevel)
    trap 'docker rm -f $name &>/dev/null' SIGINT SIGTERM EXIT
    docker rm -f $name &>/dev/null || true
    docker run --rm \
      $name_arg \
      --cpus=${CPUS:-4} \
      --memory=${MEM:-8g} \
      ${cpuset_arg:-} \
      --user $(id -u):$(id -g) \
      "-v$repo_dir:$repo_dir" \
      "-v$HOME/.bb-crs:$HOME/.bb-crs" \
      --mount type=tmpfs,target=/tmp,tmpfs-size=1g \
      --mount type=tmpfs,target=/tmp-jest,tmpfs-size=512m \
      -e HOME \
      -e JEST_CACHE_DIR=/tmp-jest \
      -e FAKE_PROOFS \
      -e BENCH_OUTPUT \
      -e CAPTURE_IVC_FOLDER \
      -e LOG_LEVEL \
      -e COLLECT_METRICS \
      --workdir "$repo_dir/yarn-project/end-to-end" \
      aztecprotocol/build:3.0 ./scripts/test_simple.sh $TEST &
    wait $!
  ;;
  "compose")
    # Strip leading non alpha numerics and replace / and . with _.
    name=$(echo "${TEST}${NAME_POSTFIX:-}" | sed 's/^[^a-zA-Z0-9]*//; s/[\/\.]/_/g')
    name_arg="-p $name"
    trap 'docker compose $name_arg down --timeout 0' SIGTERM SIGINT EXIT
    docker compose $name_arg down --timeout 0 &> /dev/null
    docker compose $name_arg up --exit-code-from=end-to-end --abort-on-container-exit --force-recreate
  ;;
esac
