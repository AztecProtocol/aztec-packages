#!/usr/bin/env bash
set -eu

cd $(dirname $0)/..

make -C src/barretenberg/dsl --no-print-directory
