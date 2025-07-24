#!/usr/bin/env bash
set -eu

TARGET=${1:-"bb_cli_bench"}
FLOW=${2:-"deploy_ecdsar1+sponsored_fpc"}
BUILD_DIR="build-op-count-time"

# Move above script dir.
cd $(dirname $0)/..

scp $BB_SSH_KEY ../../yarn-project/end-to-end/example-app-ivc-inputs-out/$FLOW/ivc-inputs.msgpack $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/

# Measure the benchmarks with ops time counting
./scripts/benchmark_remote.sh "$TARGET"\
                              "MAIN_ARGS='prove -o output --ivc_inputs_path ivc-inputs.msgpack --scheme client_ivc'\
                              ./$TARGET --benchmark_out=$TARGET.json\
                                        --benchmark_out_format=json"\
                              op-count-time\
                              "$BUILD_DIR"

# Retrieve output from benching instance
cd $BUILD_DIR
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/$TARGET.json .

# Analyze the results
cd ../
python3 ./scripts/analyze_client_ivc_bench.py --json "$TARGET.json" --benchmark "" --prefix "$BUILD_DIR"
