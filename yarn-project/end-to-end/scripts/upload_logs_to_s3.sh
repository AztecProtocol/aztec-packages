#!/bin/bash
# Uploads to S3 the contents of the log file mounted on the end-to-end container,
# which contains log entries with an associated event and metrics for it.
# Logs are uploaded to aztec-ci-artifacts/commits/$COMMIT/$JOB.jsonl

[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

BUCKET_NAME="aztec-ci-artifacts"
LOG_FOLDER="${LOG_FOLDER:-log}"
COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse HEAD)}"

if [ ! -d "$LOG_FOLDER" ] || [ -z "$(ls -A "$LOG_FOLDER")" ]; then
  echo "No logs in folder $LOG_FOLDER to upload"
  exit 0
fi

aws s3 cp $LOG_FOLDER "s3://${BUCKET_NAME}/commits/${COMMIT_HASH}/"  --include "*.jsonl" --recursive
