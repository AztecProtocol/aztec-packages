#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace

cd "$(dirname "$0")"

$ci3/github/group "noir-protocol-circuits vks"
export BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
mkdir -p "./target/keys"

parallel --line-buffer --tag node ../scripts/generate_vk_json.js {} "./target/keys" ::: ./target/*.json
$ci3/github/endgroup