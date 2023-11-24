#!/bin/bash
set -eu

cd $(dirname "$0")

./scripts/bootstrap_native.sh
./scripts/bootstrap_packages.sh