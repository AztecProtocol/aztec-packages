#!/bin/bash
set -eu

# used by cache-update.sh, directly downloads a named tar file and extracts it

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <binary_paths_to_tar.gz_and_upload...> <name_without_tar.gz_extension>"
  exit 1
fi

if [ "${S3_BUILD_CACHE_UPLOAD:-true}" = "false" ] || [ "${AWS_ACCESS_KEY_ID}" == "" ] ; then
  # Silently do nothing
  exit
fi

# Extract the name without tar.gz extension
NAME="${@: -1}"

# Extract the binary paths to tar.gz and upload
BIN_PATHS=("${@:1:$#-1}")

TAR_DIR=$(mktemp -d)
TAR_FILE="$TAR_DIR/${NAME}.tar.gz"

function on_exit() {
  # Cleanup the temporary folder
  rm -rf "$TAR_DIR"
}
trap on_exit EXIT

# Create the tar.gz file
tar -czf "$TAR_FILE" "${BIN_PATHS[@]}"

# flag to disable uploads
S3_BUILD_CACHE_UPLOAD=${S3_BUILD_CACHE_UPLOAD:-false}

aws s3 cp "$TAR_FILE" "s3://aztec-ci-artifacts/build-cache/$TAR_FILE" --quiet