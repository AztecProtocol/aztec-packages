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

# Extract endpoint URL if S3_BUILD_CACHE_AWS_PARAMS is set
if [[ -n "${S3_BUILD_CACHE_AWS_PARAMS:-}" ]]; then
  # Extract URL from S3_BUILD_CACHE_AWS_PARAMS (assumes the format "--endpoint-url <URL>")
  # TODO stop passing with endpoint url
  S3_ENDPOINT=$(echo "$S3_BUILD_CACHE_AWS_PARAMS" | sed -n 's/--endpoint-url \([^ ]*\)/\1/p')
else
  # Default to AWS S3 URL if no custom endpoint is set
  S3_ENDPOINT="http://aztec-ci-artifacts.s3.amazonaws.com"
fi
# Attempt to download the cache file
curl -s -f -O "${S3_ENDPOINT}/build-cache/$TAR_FILE" || (echo "Cache download of $TAR_FILE failed." && exit 1)

# Extract the cache file
mkdir -p "$OUT_DIR"
tar -xzf "$TAR_FILE" -C "$OUT_DIR"

echo "Cache download and extraction of $TAR_FILE complete."
