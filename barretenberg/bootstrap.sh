#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace

cd "$(dirname "$0")"

(cd cpp && ./bootstrap.sh $@)
(cd ts && ./bootstrap.sh $@)
(cd acir_tests && ./bootstrap.sh)
