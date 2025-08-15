#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

../noir-protocol-circuits/bootstrap.sh "${1:-}" $(pwd)
