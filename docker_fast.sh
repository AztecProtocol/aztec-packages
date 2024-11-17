#!/usr/bin/env bash
# TODO eventually rename this docker.sh when we've moved to it entirely
set -eu

MAKE_END_TO_END=${1:-false}

S3_BUILD_CACHE_UPLOAD=${S3_BUILD_CACHE_UPLOAD:-false}
S3_BUILD_CACHE_MINIO_URL="http://$(hostname -I | awk '{print $1}'):12000"

if ! git diff-index --quiet HEAD --; then
  echo "Warning: You have unstaged changes. For now this is a fatal error as this script relies on git metadata." >&2
  S3_BUILD_CACHE_UPLOAD=false
  S3_BUILD_CACHE_DOWNLOAD=false
  S3_BUILD_CACHE_MINIO_URL=""A
  exit 1
elif [ ! -z "${AWS_ACCESS_KEY_ID:-}" ] ; then
  S3_BUILD_CACHE_DOWNLOAD=true
elif [ -f ~/.aws/credentials ]; then
  # Retrieve credentials if available in AWS config
  AWS_ACCESS_KEY_ID=$(aws configure get default.aws_access_key_id)
  AWS_SECRET_ACCESS_KEY=$(aws configure get default.aws_secret_access_key)
  S3_BUILD_CACHE_DOWNLOAD=true
else
  S3_BUILD_CACHE_UPLOAD=false
  S3_BUILD_CACHE_DOWNLOAD=false
fi

TMP=$(mktemp -d)

function on_exit() {
  rm -rf "$TMP"
}
trap on_exit EXIT

# Save each secret environment variable into a separate file in $TMP directory
echo "${AWS_ACCESS_KEY_ID:-}" > "$TMP/aws_access_key_id.txt"
echo "${AWS_SECRET_ACCESS_KEY:-}" > "$TMP/aws_secret_access_key.txt"
echo "${S3_BUILD_CACHE_MINIO_URL:-}" > "$TMP/s3_build_cache_minio_url.txt"
echo "${S3_BUILD_CACHE_UPLOAD:-}" > "$TMP/s3_build_cache_upload.txt"
echo "${S3_BUILD_CACHE_DOWNLOAD:-}" > "$TMP/s3_build_cache_download.txt"

cd $(git rev-parse --show-toplevel)

PROJECTS=(
  barretenberg
  build-system
  noir
  l1-contracts
  avm-transpiler
  noir-projects
  yarn-project
)

function copy() {
  local project=$1
  git archive --format=tar.gz --mtime='1970-01-01T00:00Z' -o "$TMP/$project.tar.gz" $(git rev-parse HEAD) $project
  cd "$TMP"
  tar -xzf $project.tar.gz
  rm $project.tar.gz
}
# Write the git archives in parallel
for project in "${PROJECTS[@]}"; do
  # Copy over JUST the git version of files over (bail if any fail)
  copy $project || kill $0 &
done
wait

# Run Docker build with secrets in the folder with our archive
DOCKER_BUILDKIT=1 docker build -t aztecprotocol/aztec -f Dockerfile.fast --progress=plain \
  --secret id=aws_access_key_id,src=$TMP/aws_access_key_id.txt \
  --secret id=aws_secret_access_key,src=$TMP/aws_secret_access_key.txt \
  --secret id=s3_build_cache_minio_url,src=$TMP/s3_build_cache_minio_url.txt \
  --secret id=s3_build_cache_upload,src=$TMP/s3_build_cache_upload.txt \
  --secret id=s3_build_cache_download,src=$TMP/s3_build_cache_download.txt \
  "$TMP"

if [ $MAKE_END_TO_END != "false" ] ; then
  DOCKER_BUILDKIT=1 docker build -t aztecprotocol/end-to-end -f Dockerfile.end-to-end.fast --progress=plain "$TMP"
fi
