#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

./cpp/bootstrap.sh $@
./ts/bootstrap.sh $@
./acir_tests/bootstrap.sh $@
