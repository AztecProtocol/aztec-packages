#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

(cd cpp && ./bootstrap_cache.sh $@ &)
(cd ts && ./bootstrap_cache.sh $@ &)
wait
