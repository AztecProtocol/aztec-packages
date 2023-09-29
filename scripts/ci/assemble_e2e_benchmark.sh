#!/bin/bash
# Grabs the log files uploaded in yarn-project/end-to-end/scripts/upload_logs_to_s3.sh
# that contain representative benchmarks, extracts whatever metrics are interesting,
# and assembles a single file that shows the current state of the repository.

[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

BUCKET_NAME="aztec-ci-artifacts"
LOG_FOLDER="${LOG_FOLDER:-log}"
COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse HEAD)}"
BENCHMARK_FILE_JSON="benchmark.json"

mkdir -p $LOG_FOLDER

aws s3 cp "s3://${BUCKET_NAME}/commits/${COMMIT_HASH}/" $LOG_FOLDER --exclude '*' --include 'bench*.jsonl' --recursive

node scripts/ci/aggregate_e2e_benchmark.js
echo "generated: $BENCHMARK_FILE_JSON"

aws s3 cp $BENCHMARK_FILE_JSON "s3://${BUCKET_NAME}/commits/${COMMIT_HASH}/${BENCHMARK_FILE_JSON}"

if [ "${CIRCLE_BRANCH:-}" = "master" ]; then
  aws s3 cp $BENCHMARK_FILE_JSON "s3://${BUCKET_NAME}/benchmarks-v1/${COMMIT_HASH}.json"
  aws s3 cp $BENCHMARK_FILE_JSON "s3://${BUCKET_NAME}/benchmarks-v1/master.json"
else
  node scripts/ci/comment_e2e_benchmark.js
  echo "commented on pr"
fi


