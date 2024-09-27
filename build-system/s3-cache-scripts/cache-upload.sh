#!/bin/bash
set -eux

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <binary_paths_to_tar.gz_and_upload...> <name_without_tar.gz_extension>"
  exit 1
fi

# Name, intended to have .tar.gz ending
NAME="$1"

shift 1

# Extract the binary paths to tar.gz and upload
BIN_PATHS="$@"

TAR_DIR=$(mktemp -d)
TAR_FILE="$TAR_DIR/${NAME}"

function on_exit() {
  # Cleanup the temporary folder
  rm -rf "$TAR_DIR"
}
trap on_exit EXIT

# Create the tar.gz file
tar -czf "$TAR_FILE" "${BIN_PATHS[@]}"

aws ${S3_BUILD_CACHE_AWS_PARAMS:-} s3 cp "$TAR_FILE" "s3://aztec-ci-artifacts/build-cache/$NAME"