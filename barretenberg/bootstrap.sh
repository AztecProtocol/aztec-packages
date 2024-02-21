#!/usr/bin/env bash
set -eu

# Attempt to just pull artefacts from CI and exit on success.
./bootstrap_cache.sh && exit

cd "$(dirname "$0")"

(cd cpp && ./bootstrap.sh $@)
(cd ts && ./bootstrap.sh $@)
