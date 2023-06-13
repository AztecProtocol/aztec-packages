#!/bin/bash
set -e

cd "$(git rev-parse --show-toplevel)" # cd to git root
git subtree push --prefix=circuits/cpp/barretenberg https://github.com/AztecProtocol/barretenberg $@
