#!/usr/bin/env bash
# Run a jest e2e test using @aztec packages from a release image (same protocol artifacts as K8s nodes).
set -eu

root=$(git rev-parse --show-toplevel)
image="${BENCH_AZTEC_IMAGE:-spypsy/aztec:tps_metrics}"

cd "$(dirname "$0")/.."

test_file=$1
test_name=${2:-}

test_name_arg=()
if [[ -n "$test_name" ]]; then
  test_name_arg=(--testNamePattern="$test_name")
fi

export HARDWARE_CONCURRENCY=${CPUS:-16}
export RAYON_NUM_THREADS=1
export TOKIO_WORKER_THREADS=1
export LOG_LEVEL=${LOG_LEVEL:-verbose}
export NODE_NO_WARNINGS=1
export FORCE_COLOR=1

docker run --rm --network host \
  -v "$root:/usr/src" \
  -v "$HOME/.config/gcloud:$HOME/.config/gcloud:ro" \
  -v "$HOME/.kube:$HOME/.kube" \
  -e HOME \
  -e LOG_LEVEL \
  -e FORCE_COLOR \
  -e NODE_NO_WARNINGS \
  -e HARDWARE_CONCURRENCY \
  -e RAYON_NUM_THREADS \
  -e TOKIO_WORKER_THREADS \
  -e LOW_VALUE_TPS \
  -e HIGH_VALUE_TPS \
  -e TEST_DURATION_SECONDS \
  -e BENCH_SCENARIO \
  -e BENCH_OUTPUT \
  -e BENCH_RUN_ID \
  -e NAMESPACE \
  -e AZTEC_DOCKER_IMAGE \
  -w /usr/src/yarn-project/end-to-end \
  "$image" \
  /bin/bash -c "node --experimental-vm-modules ../node_modules/.bin/jest --testTimeout=300000 --no-cache ${test_name_arg[*]} --runInBand \"$test_file\""
