#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

BOX=$1
BROWSER=$2

export AZTEC=$(realpath ../../yarn-project/aztec/scripts/aztec.sh)
export BB=$(realpath ../../barretenberg/cpp/build/bin/bb)
export NARGO=$(realpath ../../noir/noir-repo/target/release/nargo)

function cleanup {
  set +e
  if [ -n "${sandbox_pid:-}" ]; then
    kill $sandbox_pid &>/dev/null
  fi
}
trap 'cleanup' EXIT

../../yarn-project/aztec/scripts/aztec.sh start --local-network &
sandbox_pid=$!

while ! nc -z 127.0.0.1 8080 &>/dev/null; do sleep 1; done

yarn workspace aztec-example-$BOX test --project=$BROWSER || bash
