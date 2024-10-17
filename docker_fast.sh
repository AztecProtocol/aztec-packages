#!/usr/bin/env bash
# TODO eventually rename this docker.sh when we've moved to it entirely
set -eu

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

# Archive all Git-tracked files into a tar.gz file
git archive --format=tar.gz -o git_files.tar.gz HEAD

# Generate a Dockerfile that copies and extracts the tar archive
DOCKERFILE_PATH="$TMP/Dockerfile"
cat <<EOF > $DOCKERFILE_PATH
# Auto-generated Dockerfile

# Use an ARG to define the architecture, defaulting to amd64
ARG ARCH=amd64

# Conditionally set the FROM image based on the ARCH argument
FROM aztecprotocol/build:1.0-\${ARCH}

# Set working directory
WORKDIR /usr/src

# Copy the tar archive and extract it
COPY git_files.tar.gz /usr/src/
RUN tar -xzf git_files.tar.gz && rm git_files.tar.gz

RUN git init -b master
ENV USE_CACHE=1

# Mount secrets and execute bootstrap script
RUN --mount=type=secret,id=aws_access_key_id \\
    --mount=type=secret,id=aws_secret_access_key \\
    export AWS_ACCESS_KEY_ID=\$(cat /run/secrets/aws_access_key_id) && \\
    export AWS_SECRET_ACCESS_KEY=\$(cat /run/secrets/aws_secret_access_key) && \\
    cd barretenberg && ./bootstrap.sh
EOF

# Generate .dockerignore from .gitignore
npx gitignore-to-dockerignore
cd $(git rev-parse --show-toplevel)

# Run Docker build with secrets
DOCKER_BUILDKIT=1 docker build -t aztecprotocol/aztec -f $DOCKERFILE_PATH --progress=plain \
  --secret id=aws_access_key_id,src=$TMP/aws_access_key_id.txt \
  --secret id=aws_secret_access_key,src=$TMP/aws_secret_access_key.txt \
  --secret id=s3_build_cache_minio_url,src=$TMP/s3_build_cache_minio_url.txt \
  --secret id=s3_build_cache_upload,src=$TMP/s3_build_cache_upload.txt \
  --secret id=s3_build_cache_download,src=$TMP/s3_build_cache_download.txt \
  .
