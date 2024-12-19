#!/bin/bash
# Used to launch a single e2e test.
# Called by bootstrap when it runs all the tests.
# A "simple" test is one that does not require docker-compose. They are still run within docker isolation however.
# A "compose" test uses docker-compose to launch actual services.
# A "skip" or "flake" test is simple skipped, the label is informational.
#
# To avoid thrashing the disk, we mount /tmp as a 1gb tmpfs.
# We separate out jests temp dir for now, as it consumes a lot of space and we want to quota /tmp independently.
set -eu

TYPE=$1
export TEST=$2

case "$TYPE" in
  "simple"|"simple-flake")
    # Strip leading non alpha numerics and replace / with _ for the container name.
    name=$(echo "${TEST}" | sed 's/^[^a-zA-Z0-9]*//' | tr '/' '_')
    trap 'docker kill $name &> /dev/null' SIGINT SIGTERM
    docker run --rm \
      --name $name \
      -v$PWD/../..:/root/aztec-packages \
      -v$HOME/.bb-crs:/root/.bb-crs \
      --mount type=tmpfs,target=/tmp,tmpfs-size=1g \
      --mount type=tmpfs,target=/tmp-jest,tmpfs-size=512m \
      -e JEST_CACHE_DIR=/tmp-jest \
      --workdir /root/aztec-packages/yarn-project/end-to-end \
      aztecprotocol/build:2.0 ./scripts/test_simple.sh $TEST
  ;;
  "compose"|"compose-flake")
    docker compose -p "${TEST//[\/\.]/_}" -f ./scripts/docker-compose.yml up --exit-code-from=end-to-end --force-recreate
  ;;
  "skip")
    echo "Skipping test: $TEST"
  ;;
esac