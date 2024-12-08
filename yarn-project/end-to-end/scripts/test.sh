#!/bin/bash
# Used to launch a single e2e test.
# Called by bootstrap when it runs all the tests.
# A "simple" test is one that does not require docker-compose. They are still run within docker isolation however.
# A "compose" test uses docker-compose to launch actual services.
# A "skip" or "flake" test is simple skipped, the label is informational.
set -eu

TYPE=$1
export TEST=$2

case "$TYPE" in
  "simple")
    local container=$(docker run -d --rm \
      -v$PWD/../..:/root/aztec-packages \
      --workdir /root/aztec-packages/yarn-project/end-to-end \
      aztecprotocol/build:2.0 ./scripts/test_simple.sh $TEST)
    trap "docker kill $container &> /dev/null" SIGINT SIGTERM
    docker logs -f $container
  ;;
  "compose")
    docker compose -p "${TEST//[\/\.]/_}" -f ./scripts/docker-compose.yml up --exit-code-from=end-to-end --force-recreate
  ;;
  "flake"|"skip")
    echo "Skipping test: $TEST"
  ;;
esac