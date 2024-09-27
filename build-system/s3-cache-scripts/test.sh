#!/bin/bash
# test only minio caching
set -eux
function delete_test_cache() {
  WS_SECRET_ACCESS_KEY=minioadmin AWS_ACCESS_KEY_ID=minioadmin \
    aws --endpoint http://localhost:12000 \
      s3 rm s3://aztec-ci-artifacts --recursive --exclude "*" --include "build-cache/barretenberg-preset-release-world-state-*.tar.gz" 2>/dev/null || true
}
function minio_cache_only() {
  export S3_BUILD_CACHE_UPLOAD=true
  "$(git rev-parse --show-toplevel)/scripts/earthly-local" --no-cache $@
}

cd $(dirname $0)

# if we have minio already running make sure the cache is deleted
# otherwise it will be run by next earthly local command
nc -zv 127.0.0.1 12000 && delete_test_cache
# Our assertions (thanks to -e flag):
# expect file to not exist at first
if minio_cache_only ../../barretenberg/cpp/+test-cache-read 2>/dev/null ; then
  echo "Cache read without write should fail!"
  exit 1
fi
minio_cache_only ../../barretenberg/cpp/+test-cache-write 2>/dev/null
nc -zv 127.0.0.1 12000 # minio should be running now
[ -f ~/.minio/data/*/*/test-cache*.tar.gz ]
minio_cache_only ../../barretenberg/cpp/+test-cache-read 2>/dev/null
echo "Success!"

# NOTE: Could have S3 tests but not done for brevity