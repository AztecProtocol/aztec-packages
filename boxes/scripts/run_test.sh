#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

BOX=$1
BROWSER=$2

ROOT=$(git rev-parse --show-toplevel)
export AZTEC=$(realpath ../../yarn-project/aztec/scripts/aztec.sh)
export BB=${BB:-"$ROOT/labs-aztec-toolchain/bin/bb"}
export NARGO=${NARGO:-"$ROOT/labs-aztec-toolchain/bin/nargo"}

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
