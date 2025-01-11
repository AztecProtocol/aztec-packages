#!/bin/bash
# Note, this should be edited in tandem with the Earthfile in this folder that uses it, it is coupled heavily with earthly's needs
# and uses these ARGs directly
# - $build_artifacts
# - $prefix
# - $command
# The rest of the env variables are injected as secrets (e.g. aws creds and s3 modes)
set -eu

# definitions
FILE="$prefix-$(cat .content-hash).tar.gz"
function s3_download() {
  if [ "${S3_BUILD_CACHE_DOWNLOAD:-true}" = "false" ] || [ "${AWS_ACCESS_KEY_ID}" == "" ] ; then
    return 1 # require a rebuild
  fi
  /usr/src/build-system/s3-cache-scripts/cache_download "$FILE"
}
function s3_upload() {
  if [ "${S3_BUILD_CACHE_UPLOAD:-true}" = "false" ] || [ "${AWS_ACCESS_KEY_ID}" == "" ] ; then
    return 0 # exit silently
  fi
  /usr/src/build-system/s3-cache-scripts/cache_upload "$FILE" $build_artifacts || echo "WARNING: S3 upload failed!" >&2
}
function minio_download() {
  if [ -z "$S3_BUILD_CACHE_MINIO_URL" ] ; then
    return 1 # require rebuild
  fi
  # minio is S3-compatible
  S3_BUILD_CACHE_AWS_PARAMS="--endpoint-url $S3_BUILD_CACHE_MINIO_URL" AWS_SECRET_ACCESS_KEY=minioadmin AWS_ACCESS_KEY_ID=minioadmin \
    /usr/src/build-system/s3-cache-scripts/cache_download "$FILE"
}
function minio_upload() {
  if [ -z "$S3_BUILD_CACHE_MINIO_URL" ] ; then
    return 0 # exit silently
  fi
  # minio is S3-compatible
  S3_BUILD_CACHE_AWS_PARAMS="--endpoint-url $S3_BUILD_CACHE_MINIO_URL" AWS_SECRET_ACCESS_KEY=minioadmin AWS_ACCESS_KEY_ID=minioadmin \
    /usr/src/build-system/s3-cache-scripts/cache_upload "$FILE" $build_artifacts || echo "WARNING Minio upload failed!" >&2
}

# commands
if minio_download ; then
  # got them from local file server cache, great
  exit
fi
if s3_download ; then
  # got them from S3, replicate to minio for faster cache next time (if configured, won't be in CI)
  minio_upload
  exit
fi

if ! bash -c "$command" ; then
  exit 1 # we have failed to build, don't continue
fi

minio_upload
s3_upload
