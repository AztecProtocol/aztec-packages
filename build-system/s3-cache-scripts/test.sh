#!/bin/bash
# test only minio caching
set -eux
function delete_test_cache() {
  WS_SECRET_ACCESS_KEY=minioadmin AWS_ACCESS_KEY_ID=minioadmin \
    aws --endpoint http://localhost:12000 \
      s3 rm s3://aztec-ci-artifacts --recursive --exclude "*" --include "build-cache/barretenberg-preset-release-world-state-*.tar.gz"
}
function minio_cache_only() {
  AWS_ACCESS_KEY_ID="" "$(git rev-parse --show-toplevel)/scripts/earthly-local" --no-cache $@
}
# if we have minio already running make sure the cache is deleted
# otherwise it will be run by next earthly local command
nc -zv 127.0.0.1 12000 && delete_test_cache
# Our assertions (thanks to -e flag):
# expect file to not exist at first
! minio_cache_only ../../barretenberg/cpp/+test-cache-read 2>/dev/null
minio_cache_only ../../barretenberg/cpp/+test-cache-write 2>/dev/null
[ -f ~/.minio/data/*/*/test-cache*.tar.gz ]
minio_cache_only ../../barretenberg/cpp/+test-cache-read 2>/dev/null
echo "Success!"

# NOTE: Could have S3 tests but not done for brevity