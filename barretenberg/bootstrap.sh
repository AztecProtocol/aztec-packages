#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

# To run bb we need a crs.
# Download ignition up front to ensure no race conditions at runtime.
./scripts/download_bb_crs.sh

./cpp/bootstrap.sh $@
./ts/bootstrap.sh $@
./acir_tests/bootstrap.sh $@
