#!/usr/bin/env bash
# TODO eventually rename this docker.sh when we've moved to it entirely
set -eux

function start_minio() {
  if nc -z 127.0.0.1 12000 2>/dev/null >/dev/null ; then
    # Already started
    return
  fi
  docker run -d -p 12000:9000 -p 12001:12001 -v minio-data:/data \
    quay.io/minio/minio server /data --console-address ":12001"
  # Make our cache bucket
  AWS_ACCESS_KEY_ID="minioadmin" AWS_SECRET_ACCESS_KEY="minioadmin" aws --endpoint-url http://localhost:12000 s3 mb s3://aztec-ci-artifacts 2>/dev/null || true
}

S3_BUILD_CACHE_UPLOAD=${S3_BUILD_CACHE_UPLOAD:-false}
S3_BUILD_CACHE_MINIO_URL="http://$(hostname -I | awk '{print $1}'):12000"

# Start local file server for a quicker cache layer
start_minio

if ! git diff-index --quiet HEAD --; then
  echo "Warning: You have unstaged changes. Disabling S3 caching and local MinIO caching to avoid polluting cache (which uses Git data)." >&2
  S3_BUILD_CACHE_UPLOAD=false
  S3_BUILD_CACHE_DOWNLOAD=false
  S3_BUILD_CACHE_MINIO_URL=""
  echo "Fatal: For now, this is a fatal error as it would defeat the purpose of 'fast'." >&2
  exit 1
elif [ ! -z "${AWS_ACCESS_KEY_ID:-}" ] ; then
  S3_BUILD_CACHE_DOWNLOAD=true
elif [ -f ~/.aws/credentials ]; then
  # Retrieve credentials if available in AWS config

  # Do not trace this information
  set +x
  AWS_ACCESS_KEY_ID=$(aws configure get default.aws_access_key_id)
  AWS_SECRET_ACCESS_KEY=$(aws configure get default.aws_secret_access_key)

  # Resume tracing
  set -x
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
set +x
echo "${AWS_ACCESS_KEY_ID:-}" > "$TMP/aws_access_key_id.txt"
echo "${AWS_SECRET_ACCESS_KEY:-}" > "$TMP/aws_secret_access_key.txt"
set -x

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

for project in "${PROJECTS[@]}"; do
  # Archive Git-tracked files per project into a tar.gz file
  git archive --format=tar.gz -o "$TMP/$project.tar.gz" HEAD $project
done

# Run Docker build with secrets in the folder with our archive
DOCKER_BUILDKIT=1 docker build -t aztecprotocol/aztec -f Dockerfile.fast --progress=plain \
  --secret id=aws_access_key_id,src=$TMP/aws_access_key_id.txt \
  --secret id=aws_secret_access_key,src=$TMP/aws_secret_access_key.txt \
  --secret id=s3_build_cache_minio_url,src=$TMP/s3_build_cache_minio_url.txt \
  --secret id=s3_build_cache_upload,src=$TMP/s3_build_cache_upload.txt \
  --secret id=s3_build_cache_download,src=$TMP/s3_build_cache_download.txt \
  "$TMP"