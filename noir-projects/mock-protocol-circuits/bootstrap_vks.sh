#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace

cd "$(dirname "$0")"

export BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
mkdir -p "./target/keys"

parallel -v --line-buffer --tag --halt now,fail=1 node ../scripts/generate_vk_json.js {} ./target/keys ::: ./target/*.json