#!/bin/bash
# Executes the bb binary test script.
set -eu

$(aws ecr get-login --region us-east-2 --no-include-email) 2> /dev/null

# use the image rebuild patterns to compute a content hash, use this to get a URI
IMAGE_URI=$($(git rev-parse --show-toplevel)/build-system/scripts/calculate_image_uri barretenberg-x86_64-linux-clang-assert)
docker pull $IMAGE_URI

docker run --rm -t $IMAGE_URI /bin/sh -c "\
  set -e; \
  cd /usr/src/barretenberg/cpp/bin-test; \
  ./bin-test.sh"
