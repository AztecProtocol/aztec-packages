#!/bin/bash
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

case "$type" in
  "simple")
    # Strip leading non alpha numerics and replace / with _ for the container name.
    name="$(echo "${TEST}" | sed 's/^[^a-zA-Z0-9]*//' | tr '/' '_')${NAME_POSTFIX:-}"
    name_arg="--name $name"
    trap 'docker rm -f $name &>/dev/null' SIGINT SIGTERM EXIT
    docker rm -f $name &>/dev/null || true
    docker run --rm \
      $name_arg \
      --cpus=4 \
      --memory 8g \
      -v$(git rev-parse --show-toplevel):/root/aztec-packages \
      -v$HOME/.bb-crs:/root/.bb-crs \
      --mount type=tmpfs,target=/tmp,tmpfs-size=1g \
      --mount type=tmpfs,target=/tmp-jest,tmpfs-size=512m \
      -e JEST_CACHE_DIR=/tmp-jest \
      --workdir /root/aztec-packages/yarn-project/end-to-end \
      $ISOLATION_IMAGE ./scripts/test_simple.sh $TEST
  ;;
  "compose")
    name="${TEST//[\/\.]/_}${NAME_POSTFIX:-}"
    name_arg="-p $name"
    function cleanup {
      # Docker compose down doesn't work here. Something to do with us running within various nests.
      docker ps -q --filter "label=com.docker.compose.project=$name" | xargs -r docker kill &>/dev/null
    }
    trap 'cleanup' EXIT
    docker compose $name_arg down --timeout 0 &> /dev/null
    docker compose $name_arg up --exit-code-from=end-to-end --abort-on-container-exit --force-recreate
  ;;
esac
