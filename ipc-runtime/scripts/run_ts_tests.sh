#!/usr/bin/env bash
# Run the TS package tests (UDS transport, in-process server + client).
dir="$(cd "$(dirname "$0")/.." && pwd)"
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source
cd "$dir/ts"
yarn install --immutable
yarn test
