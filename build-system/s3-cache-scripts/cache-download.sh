#!/bin/bash
set -eu

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <tar.gz_file_to_download_and_extract>"
    exit 1
fi

# Get the tar.gz file name from the argument
TAR_FILE="$1"
OUT_DIR="${2:-.}"

function on_exit() {
  # Cleanup the temporary tar.gz file
  rm -f "$TAR_FILE"
}
# Run on any exit
trap on_exit EXIT

# Attempt to download the cache file
aws ${S3_BUILD_CACHE_AWS_PARAMS:-} s3 cp "s3://aztec-ci-artifacts/build-cache/$TAR_FILE" "$TAR_FILE" --quiet --no-sign-request &>/dev/null || (echo "Cache download of $TAR_FILE failed." && exit 1)

# Extract the cache file
mkdir -p "$OUT_DIR"
tar -xzf "$TAR_FILE" -C "$OUT_DIR"

echo "Cache download and extraction of $TAR_FILE complete."
