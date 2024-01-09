# Uploads to S3 a recent barretenberg benchmark run. 
#!/usr/bin/env bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

extract_repo barretenberg-ultra-honk-bench /usr/src extracted-repo

BUCKET_NAME="aztec-ci-artifacts"
COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse HEAD)}"

if [ "${BRANCH:-}" = "master" ]; then
  TARGET_FOLDER="barretenberg-bench-v1/master/$COMMIT_HASH/"
elif [ -n "${PULL_REQUEST:-}" ]; then
  TARGET_FOLDER="barretenberg-bench-v1/pulls/${PULL_REQUEST##*/}"
else
  echo Skipping upload since no target folder was defined

echo "Uploading to s3://$BUCKET_NAME/$TARGET_FOLDER"
aws s3 cp extracted-repo/src/barretenberg/cpp/docs/build "s3://$BUCKET_NAME/$TARGET_FOLDER" --recursive