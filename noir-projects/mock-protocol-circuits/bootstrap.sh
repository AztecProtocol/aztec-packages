#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
export NOIR_PROTOCOL_CIRCUITS_WORKING_DIR="$(pwd)"
../noir-protocol-circuits/bootstrap.sh "$@"
