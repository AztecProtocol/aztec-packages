#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

(cd cpp && ./bootstrap.sh $@)
(cd ts && ./bootstrap.sh $@)

if [ "${CI:-0}" -eq 1 ]; then
  (cd acir_tests && ./bootstrap.sh)
fi