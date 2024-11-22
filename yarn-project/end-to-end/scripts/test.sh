#!/bin/bash
set -eu

TYPE=$1
export TEST=$2

case "$TYPE" in
  "simple")
    docker run -t --rm \
      -v$PWD/../..:/root/aztec-packages \
      --workdir /root/aztec-packages/yarn-project/end-to-end \
      aztecprotocol/build:1.0 ./scripts/test_simple.sh $TEST
  ;;
  "compose")
    docker compose -p "${TEST//\//_}" -f ./scripts/docker-compose.yml up --exit-code-from=end-to-end --force-recreate
  ;;
esac