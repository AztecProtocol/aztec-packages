# Uploads to S3 a recent barretenberg benchmark run. 
#!/usr/bin/env bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

REPO=$1

extract_repo $REPO /usr/src extracted-repo

BUCKET_NAME="aztec-ci-artifacts"
COMMIT_HASH="${COMMIT_HASH:-$(git rev-parse HEAD)}"

if [ "${BRANCH:-}" = "master" ]; then
  TARGET_FOLDER="$REPO/master/$COMMIT_HASH/"
elif [ -n "${PULL_REQUEST:-}" ]; then
  TARGET_FOLDER="$REPO/pulls/${PULL_REQUEST##*/}"
else
  echo Skipping upload since no target folder was defined
  exit
fi
echo "Uploading to s3://$BUCKET_NAME/$TARGET_FOLDER"
aws s3 cp extracted-repo/src/barretenberg/cpp/build/ultra_honk_bench.json "s3://$BUCKET_NAME/$TARGET_FOLDER/ultra_honk_bench.json"
aws s3 cp extracted-repo/src/barretenberg/cpp/build/goblin_ultra_honk_bench.json "s3://$BUCKET_NAME/$TARGET_FOLDER/goblin_ultra_honk_bench.json"
aws s3 cp extracted-repo/src/barretenberg/cpp/build/ivc_bench.json "s3://$BUCKET_NAME/$TARGET_FOLDER/ivc_bench.json"
