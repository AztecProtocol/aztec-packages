#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

(cd cpp && ./bootstrap.sh $@)
(cd ts && ./bootstrap.sh $@)
(cd acir_tests && ./bootstrap.sh)
