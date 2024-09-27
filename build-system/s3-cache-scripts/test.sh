#!/bin/bash
# test only minio caching
set -eu
function delete_test_cache() {
  AWS_SECRET_ACCESS_KEY=minioadmin AWS_ACCESS_KEY_ID=minioadmin \
    aws --endpoint http://localhost:12000 \
      s3 rm s3://aztec-ci-artifacts --recursive --exclude "*" --include "build-cache/barretenberg-test-cache-*.tar.gz" 2>&1 || true
}
function minio_cache_only() {
  "$(git rev-parse --show-toplevel)/scripts/earthly-local" --no-cache $@
}

cd $(dirname $0)

# if we have minio already running make sure the cache is deleted
# otherwise it will be run by next earthly local command
nc -z 127.0.0.1 12000 2>/dev/null >/dev/null && delete_test_cache
# Our assertions (thanks to -e flag):
# expect file to not exist at first
if minio_cache_only ../../barretenberg/cpp/+test-cache-read 2>/dev/null ; then
  echo "Cache read without write should fail!"
  exit 1
fi
minio_cache_only ../../barretenberg/cpp/+test-cache-write 2>/dev/null
[ -d ~/.minio/data/*/*/barretenberg-test-cache*.tar.gz ] # minio cache files should be written
minio_cache_only ../../barretenberg/cpp/+test-cache-read 2>/dev/null # we should be able to read now
echo "Success!"
