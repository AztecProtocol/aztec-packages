#!/usr/bin/env bash
cd "$(dirname "$0")"

(cd cpp && ./bootstrap.sh $@)
(cd ts && ./bootstrap.sh $@)
(cd acir_tests && ./bootstrap.sh $@)
