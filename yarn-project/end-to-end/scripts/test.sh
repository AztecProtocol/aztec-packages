#!/bin/bash
set -eu

TYPE=$1
export TEST=$2

case "$TYPE" in
  "simple")
    CONTAINER=$(docker run -d --rm \
      -v$PWD/../..:/root/aztec-packages \
      --workdir /root/aztec-packages/yarn-project/end-to-end \
      aztecprotocol/build:2.0 ./scripts/test_simple.sh $TEST)
    trap "docker kill $CONTAINER &> /dev/null" SIGINT SIGTERM
    docker logs -f $CONTAINER
  ;;
  "compose")
    docker compose -p "${TEST//\//_}" -f ./scripts/docker-compose.yml up --exit-code-from=end-to-end --force-recreate
  ;;
  "flake"|"skip")
    echo "Skipping test: $TEST"
  ;;
esac