#!/bin/bash
set -e

cd "$(git rev-parse --show-toplevel)" # cd to git root
git subtree pull --prefix=circuits/cpp/barretenberg https://github.com/AztecProtocol/barretenberg $@
